/**
 * .aiconfig.json resolver — the single deterministic place that merges a
 * project's .aiconfig.json with its documented defaults (lib/aiconfig-defaults.js).
 *
 * Nothing here ever writes a resolved default back into .aiconfig.json, or
 * into any snapshot of it — an absent key must stay absent. Determinism
 * comes from the merge being code instead of an agent eyeballing
 * AGENTS.md's defaults table, not from precomputing values into a file.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { DEFAULTS } from './aiconfig-defaults.js';

/**
 * Read and parse .aiconfig.json from a project root. Returns {} if the
 * file does not exist (per AGENTS.md's resolution order: fall back to
 * defaults). Throws if the file exists but is not valid JSON.
 * @param {string} projectRoot
 * @returns {object}
 */
export function loadAiConfig(projectRoot) {
  const configPath = join(projectRoot, '.aiconfig.json');
  if (!existsSync(configPath)) return {};

  const content = readFileSync(configPath, 'utf8');
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`.aiconfig.json is not valid JSON (${configPath}): ${err.message}`, {
      cause: err,
    });
  }
}

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
 * @param {string} projectRoot - Absolute path to the project repo root
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

/**
 * Load .aiconfig.json from projectRoot and resolve a single field.
 * The one entry point most callers need.
 * @param {string} projectRoot
 * @param {string} keyPath - Dotted field path, e.g. "paths.decisions"
 * @returns {*}
 */
export function getConfigValue(projectRoot, keyPath) {
  const config = loadAiConfig(projectRoot);
  return resolveConfigValue(config, keyPath, projectRoot);
}

/**
 * Resolve a `paths.*` field to an absolute path under projectRoot.
 * @param {string} projectRoot
 * @param {string} keyPath - Dotted field path, e.g. "paths.decisions"
 * @returns {string} Absolute path
 */
export function getConfigPath(projectRoot, keyPath) {
  return resolve(projectRoot, getConfigValue(projectRoot, keyPath));
}

/**
 * Walk up from startDir to find the nearest ancestor (inclusive) containing
 * .aiconfig.json. Mirrors bin/ai-git.js's own config discovery so agents can
 * invoke config-reading tools from any subdirectory of a project.
 * @param {string} startDir
 * @returns {string|null} Absolute directory path, or null if none found
 */
export function findProjectRoot(startDir) {
  let dir = resolve(startDir);

  while (true) {
    const configPath = join(dir, '.aiconfig.json');
    if (existsSync(configPath) && statSync(configPath).isFile()) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
