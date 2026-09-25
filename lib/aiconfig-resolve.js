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

// Matches a {dotted.key.path} reference inside a resolved string value, e.g.
// the "{paths.plans}" in a user-authored "{paths.plans}/features".
const PLACEHOLDER_RE = /\{([a-zA-Z_][\w.]*)\}/g;

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
 * Replace every {keyPath} placeholder in a resolved string value with that
 * field's own resolved value. Lets .aiconfig.json values reference each
 * other, e.g. "paths.features": "{paths.plans}/features".
 * @param {string} value
 * @param {object} config
 * @param {string} projectRoot
 * @param {string[]} stack - Key paths currently being resolved, for cycle
 *   detection (see resolveConfigValue).
 * @returns {string}
 */
function interpolate(value, config, projectRoot, stack) {
  return value.replace(PLACEHOLDER_RE, (_match, ref) =>
    String(resolveConfigValue(config, ref, projectRoot, stack)),
  );
}

/**
 * Resolve one .aiconfig.json field: the configured value if set, else its
 * documented default (which may itself derive from another field's
 * resolved value — see lib/aiconfig-defaults.js). Any {other.key} reference
 * inside the resolved string is itself resolved recursively; a reference
 * cycle (directly or through a derived default) throws rather than
 * recursing forever.
 * @param {object} config - Parsed .aiconfig.json content (from loadAiConfig)
 * @param {string} keyPath - Dotted field path, e.g. "paths.decisions"
 * @param {string} projectRoot - Project repo root. Only used as a plain
 *   string (e.g. basename() for the project_name default) — never read
 *   from disk here.
 * @param {string[]} [_stack] - Internal: key paths currently being
 *   resolved, in order, for cycle detection. Callers omit this.
 * @returns {*}
 */
export function resolveConfigValue(config, keyPath, projectRoot, _stack = []) {
  if (_stack.includes(keyPath)) {
    throw new Error(`Circular .aiconfig.json reference: ${[..._stack, keyPath].join(' -> ')}`);
  }
  const stack = [..._stack, keyPath];

  let raw;
  const configured = readKeyPath(config, keyPath);
  if (configured !== undefined) {
    raw = configured;
  } else {
    if (!(keyPath in DEFAULTS)) {
      throw new Error(`Unknown .aiconfig.json field: "${keyPath}"`);
    }

    const def = DEFAULTS[keyPath];
    if (typeof def !== 'function') {
      raw = def;
    } else {
      const ctx = {
        projectRoot,
        get: (dep) => resolveConfigValue(config, dep, projectRoot, stack),
      };
      raw = def(ctx);
    }
  }

  return typeof raw === 'string' ? interpolate(raw, config, projectRoot, stack) : raw;
}
