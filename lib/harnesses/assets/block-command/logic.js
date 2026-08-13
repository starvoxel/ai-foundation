/**
 * Pure logic for matching shell commands against blocked_commands glob patterns.
 * No I/O — shared by the PreToolUse hook CLI (cli.js) and unit tests.
 */

/**
 * Convert a glob pattern (using `*` as a wildcard matching any sequence of
 * characters, including none) into a RegExp anchored to the full string.
 * All other regex-special characters in the pattern are escaped literally.
 * @param {string} pattern
 * @returns {RegExp}
 */
export function globToRegex(pattern) {
  const specials = /[.+^${}()|[\]\\]/g;
  const escaped = pattern.replace(specials, '\\$&');
  const regexStr = escaped.split('*').join('.*');
  return new RegExp(`^${regexStr}$`);
}

/**
 * Check a shell command string against a list of blocked glob patterns.
 * Matching is case-sensitive and anchored to the full command string.
 * @param {string} command - The shell command to check (e.g. "git status")
 * @param {string[]} patterns - Glob patterns using `*` as wildcard (e.g. ["git *", "gh *"])
 * @returns {string|null} The first matching pattern, or null if no pattern matches
 */
export function matchesBlockedCommand(command, patterns) {
  if (typeof command !== 'string' || !command) return null;
  if (!Array.isArray(patterns)) return null;

  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || !pattern) continue;
    if (globToRegex(pattern).test(command)) {
      return pattern;
    }
  }

  return null;
}
