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
