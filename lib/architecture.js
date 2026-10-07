/**
 * arc42 architecture-section metadata parsing, deterministic index building,
 * and staleness detection for the `aif index architecture` command.
 *
 * Plan: docs/process-model.md check 5, AIF-013 (on-demand index; Task 003
 * added the PR-range gate: a changed key_file needs a doc change or waiver).
 *
 * Mirrors lib/decisions.js's pure/io split: parsing and index assembly are
 * pure (same records in, byte-identical index out: no timestamp, no
 * per-entry staleness, entries sorted by path), so they stay testable against
 * synthetic fixtures with no real git repo. The io wrappers at the bottom
 * compose the pure functions with real filesystem + git access. The index is
 * generated on demand and never diffed against a stored copy.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

import { parseFrontmatter, nonFencedLines } from './file-utils.js';
import { assertSafeRef, evaluateWaivers, readCommits } from './arch-waivers.js';

const REQUIRED_FIELDS = ['section', 'title', 'lifecycle', 'last_verified'];

/**
 * Extract the one-sentence summary blockquote after the H1. A blockquote may
 * wrap across multiple consecutive `>`-prefixed lines (most of this repo's
 * own arc42 docs do) — join them into one string rather than only the first
 * line, which would silently truncate mid-sentence.
 * @param {string} body - Section content after frontmatter
 * @returns {string} The joined summary, or '' if no blockquote is found
 */
function extractSummary(body) {
  const lines = body.split(/\r?\n/);
  const parts = [];
  let inQuote = false;

  for (const line of lines) {
    const match = line.match(/^>\s?(.*)$/);
    if (match) {
      inQuote = true;
      parts.push(match[1]);
    } else if (inQuote) {
      break;
    }
  }

  return parts.join(' ').trim();
}

/**
 * @typedef {object} ArchitectureRecord
 * @property {string} path
 * @property {string} section
 * @property {string} title
 * @property {string} summary
 * @property {string} lifecycle
 * @property {string[]} tags
 * @property {string[]} key_files
 * @property {string} last_verified
 */

/**
 * @typedef {object} ArchitectureIndexEntry
 * @property {string} path
 * @property {string} section
 * @property {string} title
 * @property {string} summary
 * @property {string} lifecycle
 * @property {string[]} tags
 * @property {string[]} key_files
 * @property {string} last_verified
 */

/**
 * Parse an arc42 section file's frontmatter (+ one-line blockquote summary)
 * into a structured record.
 * @param {string} content - Raw file content
 * @param {string} relPath - Path relative to paths.architecture
 * @returns {{ record: ArchitectureRecord } | { error: string }}
 */
export function parseArchitectureSection(content, relPath) {
  const { frontmatter, body } = parseFrontmatter(content);
  if (!frontmatter) {
    return { error: `${relPath}: missing YAML frontmatter` };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!frontmatter[field]) {
      return { error: `${relPath}: missing required frontmatter field "${field}"` };
    }
  }

  return {
    record: {
      path: relPath,
      section: String(frontmatter.section),
      title: frontmatter.title,
      summary: extractSummary(body),
      lifecycle: frontmatter.lifecycle,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      key_files: Array.isArray(frontmatter.key_files) ? frontmatter.key_files : [],
      last_verified: String(frontmatter.last_verified),
    },
  };
}

/**
 * Invert key_files across every record: source path -> [doc paths].
 * Same inversion pattern as decisions.js's supersedes -> superseded_by.
 * @param {ArchitectureRecord[]} records
 * @returns {Record<string, string[]>}
 */
export function buildReverseIndex(records) {
  /** @type {Record<string, string[]>} */
  const reverse = {};

  for (const record of records) {
    for (const file of record.key_files) {
      if (!reverse[file]) reverse[file] = [];
      reverse[file].push(record.path);
    }
  }

  for (const file of Object.keys(reverse)) {
    reverse[file].sort();
  }

  return reverse;
}

/**
 * Build the full architecture index from parsed records. Deterministic:
 * entries are sorted by `path`, `reverse_index` keys are sorted, and nothing
 * time- or git-dependent is included, so identical records always serialize
 * to identical bytes.
 * @param {ArchitectureRecord[]} records
 * @returns {{ entries: ArchitectureIndexEntry[], reverse_index: Record<string, string[]> }}
 */
export function buildArchitectureIndex(records) {
  const entries = records
    .map((record) => ({
      path: record.path,
      section: record.section,
      title: record.title,
      summary: record.summary,
      lifecycle: record.lifecycle,
      tags: record.tags,
      key_files: record.key_files,
      last_verified: record.last_verified,
    }))
    .sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));

  const reverse = buildReverseIndex(records);
  /** @type {Record<string, string[]>} */
  const reverse_index = {};
  for (const file of Object.keys(reverse).sort()) reverse_index[file] = reverse[file];

  return { entries, reverse_index };
}

// --- io wrappers ---

/**
 * Recursively collect all arc42 section .md files under a directory
 * (io wrapper). Excludes `_`-prefixed files (e.g. `_template.md`), matching
 * the same convention lib/commands/index.js's knowledge scanner uses.
 * @param {string} architectureDir - Absolute path to paths.architecture
 * @returns {string[]} Relative paths
 */
export function collectArchitectureFiles(architectureDir) {
  if (!existsSync(architectureDir)) return [];

  const results = [];

  const walk = (dir, basePath) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relPath);
      } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
        results.push(relPath);
      }
    }
  };

  walk(architectureDir, '');
  return results;
}

/**
 * Determine whether any of a record's key_files have changed since
 * last_verified, via `git log <sha>..HEAD -- <path>` per file. A file with
 * any commit in that range is stale; an unreadable/missing SHA (e.g. a
 * typo, or history that no longer contains it) is treated as stale too,
 * since "can't verify" must never silently read as "verified current".
 *
 * A key_file missing from disk right now is stale unconditionally, checked
 * before the git-log range: a deletion inside the range already surfaces via
 * the git-log check below, but a `last_verified` bumped to (or past) a SHA
 * where the file was already gone would put that deletion outside the range
 * and go undetected by git-log alone — the file simply doesn't exist, which
 * no amount of correct-looking history should be able to paper over.
 * @param {ArchitectureRecord} record
 * @param {string} repoRoot
 * @returns {boolean}
 */
export function isStaleAgainstGit(record, repoRoot) {
  for (const file of record.key_files) {
    if (!existsSync(join(repoRoot, file))) return true;

    try {
      const out = execFileSync(
        'git',
        ['log', '--format=%H', `${record.last_verified}..HEAD`, '--', file],
        { cwd: repoRoot, encoding: 'utf8' },
      );
      if (out.trim().length > 0) return true;
    } catch {
      return true;
    }
  }
  return false;
}

const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const URI_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Extract relative markdown links from a section's raw content — inline
 * `[text](target)` links whose target is neither an absolute URL (has a
 * URI scheme, e.g. `https://`/`mailto:`) nor a pure same-page anchor
 * (`#foo`). Fenced code blocks are skipped via the shared `nonFencedLines()`
 * helper (`lib/file-utils.js`) — they hold illustrative example syntax, not
 * real links.
 * @param {string} content - Raw file content (frontmatter + body)
 * @returns {{ text: string, target: string }[]}
 */
export function extractRelativeLinks(content) {
  const links = [];

  for (const { line } of nonFencedLines(content)) {
    MD_LINK_RE.lastIndex = 0;
    let m;
    while ((m = MD_LINK_RE.exec(line))) {
      const [, text, rawTarget] = m;
      const target = rawTarget.split(/\s+"/)[0].trim();
      if (!target || target.startsWith('#') || target.startsWith('/')) continue;
      if (URI_SCHEME_RE.test(target)) continue;
      links.push({ text, target });
    }
  }

  return links;
}

/**
 * Read every arc42 section file in a directory (io wrapper). Shared by
 * `findBrokenLinks()` and `buildArchitectureIndexForDir()` — both need every
 * file's raw content, just for a different purpose.
 * @param {string} architectureDir - Absolute path to paths.architecture
 * @returns {{ relPath: string, content: string }[]}
 */
function readArchitectureFiles(architectureDir) {
  return collectArchitectureFiles(architectureDir).map((relPath) => ({
    relPath,
    content: readFileSync(join(architectureDir, relPath), 'utf8'),
  }));
}

/**
 * Find every relative markdown link across an arc42 directory's section
 * files that doesn't resolve to a real file on disk (io wrapper — the only
 * part of link-checking that touches the filesystem beyond reading the
 * files themselves). Each target is resolved relative to its *own* file's
 * directory, not the architecture root, so this stays correct even if a
 * later doc set stops being flat (see collectArchitectureFiles).
 * @param {string} architectureDir - Absolute path to paths.architecture
 * @returns {string[]} One message per broken link
 */
export function findBrokenLinks(architectureDir) {
  const errors = [];

  for (const { relPath, content } of readArchitectureFiles(architectureDir)) {
    for (const { text, target } of extractRelativeLinks(content)) {
      const targetPath = target.split('#')[0];
      if (!targetPath) continue;

      const resolved = join(architectureDir, dirname(relPath), targetPath);
      if (!existsSync(resolved)) {
        errors.push(`${relPath}: link "${text}" -> "${target}" does not resolve`);
      }
    }
  }

  return errors;
}

/**
 * Read and parse every arc42 section in a directory (io wrapper).
 * @param {string} architectureDir - Absolute path to paths.architecture
 * @returns {ArchitectureRecord[]}
 * @throws {Error} When a section file fails to parse
 */
export function loadArchitectureRecords(architectureDir) {
  /** @type {ArchitectureRecord[]} */
  const records = [];

  for (const { relPath, content } of readArchitectureFiles(architectureDir)) {
    const result = parseArchitectureSection(content, relPath);
    if ('error' in result) {
      throw new Error(`Failed to parse architecture section — ${result.error}`);
    }
    records.push(result.record);
  }

  return records;
}

/**
 * Read, parse, and build the full architecture index for a directory (io
 * wrapper). Needs no git access: staleness is computed separately by
 * `findStaleDocs()`.
 * @param {string} architectureDir - Absolute path to paths.architecture
 * @returns {{ entries: ArchitectureIndexEntry[], reverse_index: Record<string, string[]> }}
 * @throws {Error} When a section file fails to parse
 */
export function buildArchitectureIndexForDir(architectureDir) {
  return buildArchitectureIndex(loadArchitectureRecords(architectureDir));
}

/**
 * Paths of every record whose key_files are stale against git history
 * (io wrapper over `isStaleAgainstGit`). Kept until the last_verified
 * mechanism is removed (AIF-013 Task 005).
 * @param {ArchitectureRecord[]} records
 * @param {string} repoRoot
 * @returns {string[]}
 */
export function findStaleDocs(records, repoRoot) {
  return records.filter((r) => isStaleAgainstGit(r, repoRoot)).map((r) => r.path);
}

// --- PR-range gate (AIF-013 Task 003) ---

/**
 * @param {string} p
 * @returns {string} path with forward slashes and no leading `./`
 */
function normalizeRepoPath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Map each section token to the union of key_files its docs list (pure).
 * @param {ArchitectureRecord[]} records
 * @returns {Map<string, string[]>} section -> sorted, de-duplicated key_files
 */
export function buildSectionKeyFiles(records) {
  /** @type {Map<string, Set<string>>} */
  const bySection = new Map();
  for (const record of records) {
    if (!bySection.has(record.section)) bySection.set(record.section, new Set());
    for (const f of record.key_files) bySection.get(record.section).add(normalizeRepoPath(f));
  }
  return new Map([...bySection].map(([section, files]) => [section, [...files].sort()]));
}

/**
 * @typedef {object} RangeViolation
 * @property {string} file - changed key_file with no doc change and no waiver
 * @property {string[]} docs - repo-relative paths of the docs listing it
 */

/**
 * @typedef {object} RangeGateResult
 * @property {RangeViolation[]} violations
 * @property {import('./arch-waivers.js').EvaluatedWaiver[]} acceptedWaivers
 * @property {import('./arch-waivers.js').EvaluatedWaiver[]} rejectedWaivers
 * @property {string[]} coveredFiles - changed key_files satisfied by a doc change or waiver
 */

/**
 * Evaluate the PR-range gate (pure). Every changed file listed in any doc's
 * key_files must be covered by (a) a change to a doc listing it in the same
 * range, or (b) an accepted `Arch-Unaffected` waiver whose section lists it.
 * @param {object} input
 * @param {ArchitectureRecord[]} input.records
 * @param {string} input.docDir - architecture dir relative to the repo root ('' if the root)
 * @param {string[]} input.changedFiles - repo-relative paths changed in the range
 *   (deletions and both sides of renames included)
 * @param {import('./arch-waivers.js').CommitRecord[]} input.commits - commits in the range
 * @returns {RangeGateResult}
 */
export function evaluateRangeGate({ records, docDir, changedFiles, commits }) {
  const changed = [...new Set(changedFiles.map(normalizeRepoPath))].sort();
  const changedSet = new Set(changed);
  const prefix = normalizeRepoPath(docDir).replace(/\/+$/, '');
  const docRepoPath = (record) => (prefix ? `${prefix}/${record.path}` : record.path);

  /** @type {Map<string, string[]>} */
  const listedBy = new Map();
  for (const record of records) {
    for (const f of record.key_files) {
      const key = normalizeRepoPath(f);
      if (!listedBy.has(key)) listedBy.set(key, []);
      listedBy.get(key).push(docRepoPath(record));
    }
  }

  const waivers = evaluateWaivers({
    commits,
    sectionKeyFiles: buildSectionKeyFiles(records),
    changedFiles: changed,
  });
  const waived = new Set(waivers.coveredFiles);

  const violations = [];
  const coveredFiles = [];
  for (const file of changed) {
    const docs = listedBy.get(file);
    if (!docs) continue;
    const uniqueDocs = [...new Set(docs)].sort();
    if (uniqueDocs.some((d) => changedSet.has(d)) || waived.has(file)) {
      coveredFiles.push(file);
    } else {
      violations.push({ file, docs: uniqueDocs });
    }
  }

  return {
    violations,
    acceptedWaivers: waivers.accepted,
    rejectedWaivers: waivers.rejected,
    coveredFiles,
  };
}

/**
 * Parse NUL-separated `git diff --name-only -z` output (pure).
 * @param {string} output
 * @returns {string[]}
 */
export function parseNameOnlyOutput(output) {
  return output.split('\0').filter((f) => f !== '');
}

/**
 * Run git with an argument array (never a shell) and return stdout.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Resolve a ref to a full commit SHA (io wrapper).
 * @param {string} cwd
 * @param {string} ref
 * @returns {string}
 * @throws {Error} when the ref is unsafe or does not resolve to a commit
 */
export function resolveCommit(cwd, ref) {
  assertSafeRef(ref);
  try {
    return runGit(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`git ref does not resolve to a commit: ${ref}`);
  }
}

/**
 * Find a default base for local use: the merge-base of `head` with
 * `origin/main`, else with `main` (io wrapper).
 * @param {string} cwd
 * @param {string} [head='HEAD']
 * @returns {string|null} base commit SHA, or null when neither candidate resolves
 */
export function findDefaultBase(cwd, head = 'HEAD') {
  const headSha = resolveCommit(cwd, head);
  for (const candidate of ['origin/main', 'main']) {
    try {
      const sha = runGit(cwd, ['merge-base', candidate, headSha]).trim();
      if (sha) return sha;
    } catch {
      // candidate missing or unrelated history; try the next one
    }
  }
  return null;
}

/**
 * Read the changed files and commits of `base..head` (io wrapper). Changed
 * files are paths since the merge-base (`base...head`), relative to `cwd`,
 * with renames split into a delete plus an add so both sides are listed.
 * @param {object} options
 * @param {string} options.cwd
 * @param {string} options.base - ref or SHA
 * @param {string} [options.head='HEAD']
 * @returns {{ base: string, head: string, changedFiles: string[], commits: import('./arch-waivers.js').CommitRecord[] }}
 * @throws {Error} on unsafe or unresolvable refs, or a git failure
 */
export function readRange({ cwd, base, head = 'HEAD' }) {
  const baseSha = resolveCommit(cwd, base);
  const headSha = resolveCommit(cwd, head);
  const changedFiles = parseNameOnlyOutput(
    runGit(cwd, [
      'diff',
      '--name-only',
      '--no-renames',
      '--relative',
      '-z',
      `${baseSha}...${headSha}`,
      '--',
    ]),
  );
  const commits = readCommits({ cwd, range: `${baseSha}..${headSha}` });
  return { base: baseSha, head: headSha, changedFiles, commits };
}

/**
 * Run the PR-range gate for a git range (io wrapper over `evaluateRangeGate`).
 * @param {object} options
 * @param {ArchitectureRecord[]} options.records
 * @param {string} options.architectureDir - absolute path to paths.architecture
 * @param {string} options.repoRoot
 * @param {string} options.base
 * @param {string} [options.head='HEAD']
 * @returns {RangeGateResult & { base: string, head: string }}
 * @throws {Error} on unsafe or unresolvable refs, or a git failure
 */
export function checkRangeGate({ records, architectureDir, repoRoot, base, head = 'HEAD' }) {
  const range = readRange({ cwd: repoRoot, base, head });
  const result = evaluateRangeGate({
    records,
    docDir: relative(repoRoot, architectureDir),
    changedFiles: range.changedFiles,
    commits: range.commits,
  });
  return { ...result, base: range.base, head: range.head };
}
