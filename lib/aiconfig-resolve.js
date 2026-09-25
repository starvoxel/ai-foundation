/**
 * Pure .aiconfig.json field resolution — merges an already-parsed config
 * object with its documented defaults (lib/aiconfig-defaults.js).
 *
 * No filesystem access anywhere in this module: it operates entirely on
 * the plain object handed to it. Reading .aiconfig.json off disk is
 * lib/aiconfig.js's job (loadAiConfig) — kept separate so this merge
 * logic, the actual "config value, else default" behavior, can be unit
 * tested with plain objects and fake path strings, with nothing to create
 * or clean up on disk.
 */

import { DEFAULTS } from './aiconfig-defaults.js';

/**
 * Read a dotted key path out of a plain object, e.g. "paths.decisions".
 * @param {object} config
 * @param {string} keyPath
 * @returns {*} undefined if any segment is missing
 */
function readKeyPath(config, keyPath) {
  let value = config;
  for (const part of keyPath.split('.')) {
    if (value === null || typeof value !== 'object' || !(part in value)) {
      return undefined;
    }
    value = value[part];
  }
  return value;
}

/**
 * Resolve one .aiconfig.json field: the configured value if set, else its
 * documented default (which may itself derive from another field's
 * resolved value — see lib/aiconfig-defaults.js).
 * @param {object} config - Parsed .aiconfig.json content (from loadAiConfig)
 * @param {string} keyPath - Dotted field path, e.g. "paths.decisions"
 * @param {string} projectRoot - Project repo root. Only used as a plain
 *   string (e.g. basename() for the project_name default) — never read
 *   from disk here.
 * @returns {*}
 */
export function resolveConfigValue(config, keyPath, projectRoot) {
  const configured = readKeyPath(config, keyPath);
  if (configured !== undefined) return configured;

  if (!(keyPath in DEFAULTS)) {
    throw new Error(`Unknown .aiconfig.json field: "${keyPath}"`);
  }

  const def = DEFAULTS[keyPath];
  if (typeof def !== 'function') return def;

  const ctx = {
    projectRoot,
    get: (dep) => resolveConfigValue(config, dep, projectRoot),
  };
  return def(ctx);
}
