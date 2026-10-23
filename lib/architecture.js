/**
 * arc42 architecture-section metadata parsing, deterministic index building,
 * and staleness detection for the `aif index architecture` command.
 *
 * The pure/io split: parsing and index assembly are
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
import { messageWaivesSection } from './arch-waivers.js';

const REQUIRED_FIELDS = ['section', 'title', 'lifecycle'];

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
    },
  };
}

/**
 * Invert key_files across every record: source path -> [doc paths].
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

const COMMIT_SEP = '\x1e';

/**
 * Split `git log --format=%B%x1e` output into commit messages.
 * @param {string} output
 * @returns {string[]}
 */
export function splitCommitMessages(output) {
  return output
    .split(COMMIT_SEP)
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Determine whether a doc is stale: a key_files entry changed in a commit
 * after the doc's own last commit (`git log <docCommit>..HEAD -- <file>`),
 * and that commit does not carry a valid `Arch-Unaffected: <section> — <reason>`
 * waiver for this doc's section (lib/arch-waivers.js). Nothing is stored in
 * the doc, so parallel branches have nothing to conflict on; either touching
 * the doc or waiving in the commit message records that it was checked, and
 * a refactor or comment-only change needs no no-op edit to the doc.
 *
 * - A key_file missing from disk is stale unconditionally, checked first.
 * - A doc with no commit yet, or with uncommitted changes, is not stale: it is
 *   being authored right now.
 * - Any git failure is treated as stale, since "can't verify" must never
 *   silently read as "verified current".
 * @param {ArchitectureRecord} record
 * @param {string} repoRoot
 * @param {string} docPath - The doc's path relative to repoRoot
 * @returns {boolean}
 */
export function isStaleAgainstGit(record, repoRoot, docPath) {
  for (const file of record.key_files) {
    if (!existsSync(join(repoRoot, file))) return true;
  }

  try {
    const run = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

    if (run(['status', '--porcelain', '--', docPath])) return false;
    const docCommit = run(['log', '-1', '--format=%H', '--', docPath]);
    if (!docCommit) return false;

    for (const file of record.key_files) {
      const messages = splitCommitMessages(
        run(['log', `--format=%B${COMMIT_SEP}`, `${docCommit}..HEAD`, '--', file]),
      );
      if (messages.some((m) => !messageWaivesSection(m, record.section))) return true;
    }
  } catch {
    return true;
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
 * (io wrapper over `isStaleAgainstGit`).
 * @param {ArchitectureRecord[]} records
 * @param {string} repoRoot
 * @param {string} architectureDir - Absolute path to paths.architecture
 * @returns {string[]}
 */
export function findStaleDocs(records, repoRoot, architectureDir) {
  return records
    .filter((r) =>
      isStaleAgainstGit(r, repoRoot, relative(repoRoot, join(architectureDir, r.path))),
    )
    .map((r) => r.path);
}
