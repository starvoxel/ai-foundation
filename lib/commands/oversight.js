/**
 * oversight command — prints the effective oversight level for a project.
 *
 * Usage:
 *   aif oversight                    — print the configured oversight.default
 *   aif oversight --request <level>  — apply a level the human asked for in their
 *                                      prompt, honoring oversight.enforced
 *
 * Prints the level on stdout; any note (e.g. a request ignored because the
 * level is enforced) goes to stderr so scripts can read stdout directly.
 */

import { getConfigValue, findProjectRoot } from '../aiconfig.js';
import { resolveOversight } from '../oversight.js';

/**
 * Run the oversight command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} cwd
 * @returns {number} exit code
 */
export function runOversight(parsed, cwd) {
  const projectRoot = findProjectRoot(cwd) ?? cwd;
  const requested = parsed.args.request;

  if (requested === true) {
    console.error('Usage: aif oversight [--request <none|by-size|always>]');
    return 1;
  }

  try {
    const result = resolveOversight({
      configured: getConfigValue(projectRoot, 'oversight.default'),
      enforced: getConfigValue(projectRoot, 'oversight.enforced'),
      requested,
    });
    if (result.note) console.error(result.note);
    console.log(result.level);
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}
