/**
 * `Arch-Unaffected` commit waivers: when a commit changes a file an arc42
 * section lists in `key_files` but the section is still accurate, the commit
 * message says so instead of forcing a no-op edit to the doc.
 *
 * Form, on any line of the message: `Arch-Unaffected: <section> — <reason>`
 * (an em dash or ` - ` before a non-empty reason). Whether the reason is true
 * is the reviewer's call; this only checks the line is present and well formed.
 */

const WAIVER =
  /^[ \t]*(?:[*+-][ \t]+)?Arch-Unaffected:[ \t]*(\d+(?:\.\d+)*)[ \t]*(?:—|--?)[ \t]*\S/m;

/**
 * Normalize a section token so `05.04`, `5.4` and `5.04` compare equal.
 * @param {string} section
 * @returns {string}
 */
function normalizeSection(section) {
  return section
    .split('.')
    .map((part) => String(Number.parseInt(part, 10)))
    .join('.');
}

/**
 * Whether a commit message waives an arc42 section.
 * @param {string} message
 * @param {string} section - The section's frontmatter `section` value
 * @returns {boolean}
 */
export function messageWaivesSection(message, section) {
  const lines = String(message ?? '').split(/\r?\n/);
  return lines.some((line) => {
    const m = WAIVER.exec(line);
    return m !== null && normalizeSection(m[1]) === normalizeSection(String(section));
  });
}

/**
 * Sections a commit-in-progress touches without recording that it checked
 * them: a staged file is in the section's `key_files`, the doc itself is not
 * staged, and the message does not waive the section. Used by the `commit-msg`
 * hook to warn at the moment the miss is still cheap to fix.
 * @param {{ path: string, section: string, key_files: string[] }[]} records
 * @param {string} architectureRel - paths.architecture relative to the repo root, `/`-separated
 * @param {string[]} stagedFiles - Repo-relative, `/`-separated staged paths
 * @param {string} message
 * @returns {{ section: string, files: string[] }[]}
 */
export function findUnwaivedSections(records, architectureRel, stagedFiles, message) {
  const staged = new Set(stagedFiles);
  const result = [];
  for (const record of records) {
    const docPath = architectureRel ? `${architectureRel}/${record.path}` : record.path;
    if (staged.has(docPath)) continue;
    const files = record.key_files.filter((file) => staged.has(file));
    if (files.length === 0 || messageWaivesSection(message, record.section)) continue;
    result.push({ section: record.section, files });
  }
  return result;
}
