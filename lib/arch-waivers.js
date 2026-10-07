/**
 * `Arch-Unaffected` commit-trailer waivers: parsing, mechanical validation,
 * section-level coverage evaluation, and a thin `git log` wrapper.
 *
 * Plan: AIF-013 (Task 002).
 *
 * Pure/io split: everything above the "io wrapper" marker takes data in and
 * returns data out (no git, no filesystem). Commit messages and refs are
 * untrusted input: git is only ever run via execFileSync with an argument
 * array (never a shell), refs starting with `-` are rejected, and
 * `escapeTableCell` makes any waiver text safe for markdown/HTML table cells
 * (e.g. a CI job summary).
 *
 * Waiver form: `Arch-Unaffected: <section> — <reason>`. The line may appear
 * anywhere in a message (squash merges with COMMIT_MESSAGES carry PR commit
 * messages into the body as bullet text, not a final trailer block).
 */

import { execFileSync } from 'node:child_process';

/** Minimum number of non-whitespace characters a waiver reason must have. */
export const MIN_REASON_CHARS = 10;

/**
 * Normalized (lowercased, alphanumerics only) reasons rejected as placeholders.
 * An empty normalization (e.g. `-`, `...`) is also a placeholder.
 */
const PLACEHOLDER_REASONS = new Set([
  'na',
  'none',
  'nothing',
  'ok',
  'okay',
  'unaffected',
  'notaffected',
  'notapplicable',
  'noimpact',
  'nochange',
  'unchanged',
  'tbd',
  'todo',
  'wip',
  'skip',
  'fine',
  'same',
  'x',
]);

/**
 * Optional leading indent/bullet (`* `, `- `, `+ `), then the key at the
 * start of the remaining text. Case-sensitive on purpose.
 */
const WAIVER_LINE = /^[ \t]*(?:[*+-][ \t]+)?Arch-Unaffected:[ \t]*(.*)$/;

/**
 * After the key: a numeric section token, then a separator. An em dash may
 * have optional surrounding whitespace; the ASCII fallbacks (` -- `, ` - `)
 * require whitespace on both sides. The section token is digits and dots
 * only, so no separator is ambiguous with it.
 */
const WAIVER_BODY = /^(\d+(?:\.\d+)*)(?:[ \t]*—[ \t]*|[ \t]+--?[ \t]+)(.*)$/;

/**
 * @typedef {object} ParsedWaiver
 * @property {string} section - arc42 `section` token, kept as a string ('' if malformed)
 * @property {string} reason - trimmed reason ('' if malformed)
 * @property {boolean} valid - passed mechanical validation
 * @property {string} [rejection] - why it was rejected when `valid` is false
 */

/**
 * Mechanically validate a waiver reason: at least {@link MIN_REASON_CHARS}
 * non-space characters and not a placeholder.
 * @param {string} reason
 * @returns {{valid: boolean, rejection?: string}}
 */
export function validateReason(reason) {
  const trimmed = String(reason ?? '').trim();
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === '' || PLACEHOLDER_REASONS.has(normalized)) {
    return { valid: false, rejection: 'reason is a placeholder' };
  }
  const nonSpace = trimmed.replace(/\s/g, '').length;
  if (nonSpace < MIN_REASON_CHARS) {
    return {
      valid: false,
      rejection: `reason too short (${nonSpace} non-space characters, minimum ${MIN_REASON_CHARS})`,
    };
  }
  return { valid: true };
}

/**
 * Parse every `Arch-Unaffected:` line in a commit message. Lines that carry
 * the key but do not match the waiver form yield a rejected entry rather than
 * being silently dropped.
 * @param {string} message
 * @returns {ParsedWaiver[]} in message order
 */
export function parseWaivers(message) {
  const waivers = [];
  for (const line of String(message ?? '').split(/\r?\n/)) {
    const lineMatch = WAIVER_LINE.exec(line);
    if (!lineMatch) continue;
    const bodyMatch = WAIVER_BODY.exec(lineMatch[1].trim());
    if (!bodyMatch) {
      waivers.push({
        section: '',
        reason: '',
        valid: false,
        rejection: 'malformed waiver (expected "Arch-Unaffected: <section> — <reason>")',
      });
      continue;
    }
    const section = bodyMatch[1];
    const reason = bodyMatch[2].trim();
    waivers.push({ section, reason, ...validateReason(reason) });
  }
  return waivers;
}

/**
 * @param {string} p
 * @returns {string} path with forward slashes and no leading `./`
 */
function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * @typedef {object} CommitRecord
 * @property {string} sha
 * @property {string} date
 * @property {string} message
 */

/**
 * @typedef {object} EvaluatedWaiver
 * @property {string} sha
 * @property {string} date
 * @property {string} section
 * @property {string} reason
 * @property {string[]} [coveredFiles] - changed files the section lists (accepted only)
 * @property {string} [rejection] - why it was rejected (rejected only)
 */

/**
 * Evaluate waivers across a commit range. A waiver is section-level: once
 * accepted, it covers every changed file the named section lists. A waiver is
 * rejected when it is mechanically invalid, names an unknown section, or names
 * a section that lists none of the changed files.
 * @param {object} input
 * @param {CommitRecord[]} input.commits
 * @param {Map<string, string[]>|Record<string, string[]>} input.sectionKeyFiles - section -> key_files
 * @param {string[]} input.changedFiles
 * @returns {{accepted: EvaluatedWaiver[], rejected: EvaluatedWaiver[], coveredFiles: string[]}}
 *   `coveredFiles` is the sorted union of files covered by accepted waivers
 */
export function evaluateWaivers({ commits, sectionKeyFiles, changedFiles }) {
  const sections =
    sectionKeyFiles instanceof Map ? sectionKeyFiles : new Map(Object.entries(sectionKeyFiles));
  const changed = new Set(changedFiles.map(normalizePath));
  const accepted = [];
  const rejected = [];
  const covered = new Set();

  for (const commit of commits) {
    for (const waiver of parseWaivers(commit.message)) {
      const base = {
        sha: commit.sha,
        date: commit.date,
        section: waiver.section,
        reason: waiver.reason,
      };
      if (!waiver.valid) {
        rejected.push({ ...base, rejection: waiver.rejection });
        continue;
      }
      if (!sections.has(waiver.section)) {
        rejected.push({ ...base, rejection: `unknown section ${waiver.section}` });
        continue;
      }
      const coveredFiles = sections
        .get(waiver.section)
        .map(normalizePath)
        .filter((f) => changed.has(f))
        .sort();
      if (coveredFiles.length === 0) {
        rejected.push({
          ...base,
          rejection: `section ${waiver.section} lists none of the changed files`,
        });
        continue;
      }
      for (const f of coveredFiles) covered.add(f);
      accepted.push({ ...base, coveredFiles });
    }
  }

  return { accepted, rejected, coveredFiles: [...covered].sort() };
}

/**
 * Escape text for a markdown/HTML table cell (e.g. a CI job summary). Control
 * characters and newlines become spaces; HTML-significant, table-significant,
 * backtick, and link-forming characters become numeric/named entities.
 * @param {string} text
 * @returns {string}
 */
export function escapeTableCell(text) {
  return (
    String(text ?? '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\|/g, '&#124;')
      .replace(/`/g, '&#96;')
      .replace(/\[/g, '&#91;')
      .replace(/\]/g, '&#93;')
      .replace(/\\/g, '&#92;')
  );
}

/**
 * Parse NUL-terminated `git log -z --format=%H%n%cI%n%B` output. NUL cannot
 * appear in a commit message, so records cannot be forged by message content.
 * @param {string} output
 * @returns {CommitRecord[]}
 */
export function parseGitLogOutput(output) {
  const commits = [];
  for (const record of output.split('\0')) {
    const trimmed = record.replace(/^\n+/, '');
    if (trimmed === '') continue;
    const first = trimmed.indexOf('\n');
    const second = first === -1 ? -1 : trimmed.indexOf('\n', first + 1);
    if (second === -1) continue;
    commits.push({
      sha: trimmed.slice(0, first),
      date: trimmed.slice(first + 1, second),
      message: trimmed.slice(second + 1).replace(/\n+$/, ''),
    });
  }
  return commits;
}

/**
 * Reject refs/ranges that could be parsed by git as options or that contain
 * control/whitespace characters.
 * @param {string} ref
 * @returns {string} the ref, unchanged
 * @throws {Error} if the ref is unsafe
 */
export function assertSafeRef(ref) {
  if (typeof ref !== 'string' || ref === '') throw new Error('git ref must be a non-empty string');
  if (ref.startsWith('-')) throw new Error(`unsafe git ref (starts with "-"): ${ref}`);
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(ref)) {
    throw new Error('unsafe git ref (whitespace or control characters)');
  }
  return ref;
}

// ---------------------------------------------------------------------------
// io wrapper
// ---------------------------------------------------------------------------

/**
 * Read commit {sha, date, message} records via `git log`. Exactly one of
 * `range` (e.g. `base..head`) or `since` (a ref; reads `since..HEAD`) is required.
 * @param {object} options
 * @param {string} options.cwd - repository directory
 * @param {string} [options.range]
 * @param {string} [options.since]
 * @returns {CommitRecord[]}
 * @throws {Error} on unsafe/missing refs or a git failure
 */
export function readCommits({ cwd, range, since }) {
  if ((range === undefined) === (since === undefined)) {
    throw new Error('readCommits requires exactly one of `range` or `since`');
  }
  const revision = range !== undefined ? assertSafeRef(range) : `${assertSafeRef(since)}..HEAD`;
  const output = execFileSync('git', ['log', '-z', '--format=%H%n%cI%n%B', revision, '--'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return parseGitLogOutput(output);
}
