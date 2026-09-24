/**
 * get-config command — deterministic .aiconfig.json field resolution.
 *
 * This runs in a project directory (not the ai-foundation repo). It reads
 * .aiconfig.json (if present) and resolves a dotted field path against it,
 * falling back to the field's documented default (lib/aiconfig-defaults.js)
 * when unset. Nothing is ever written back to .aiconfig.json — an absent
 * key stays absent; this command only makes that fallback logic real,
 * testable code instead of prose an agent has to interpret.
 *
 * Usage:
 *   aif get-config <key>          — print the resolved value (config value,
 *                                    else its documented default)
 *   aif get-config <key> --abs    — print an absolute path (for paths.* keys)
 */

import { getConfigValue, getConfigPath, findProjectRoot } from '../aiconfig.js';

/**
 * Run the get-config command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} cwd
 * @returns {number} exit code
 */
export function runGetConfig(parsed, cwd) {
  const key = parsed.positional[0];
  if (!key) {
    console.error('Usage: aif get-config <key>');
    return 1;
  }

  const projectRoot = findProjectRoot(cwd) ?? cwd;

  try {
    const value = parsed.args.abs
      ? getConfigPath(projectRoot, key)
      : getConfigValue(projectRoot, key);
    console.log(value);
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}
