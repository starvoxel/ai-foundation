// ------------------------------
// scope.js
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Install scope — where `aif install` writes a harness's files.
 *
 * - `global` (default): the user's home directory (`~/.claude/`, `~/.kiro/`),
 *   with the manifest at the ai-foundation root.
 * - `project`: the current project (`<project>/.claude/`, `<project>/.kiro/`),
 *   committed with the project so the files exist the moment it is cloned. The
 *   manifest lives in the harness directory with project-relative paths.
 *
 * Pure: no I/O. See docs/architecture/06_runtime.md
 */

import { join } from 'node:path';

export const SCOPES = /** @type {const} */ (['global', 'project']);
export const DEFAULT_SCOPE = 'global';

/** Harness directory (relative to the project root) holding a project-scope install. */
export const PROJECT_HARNESS_DIRS = {
  claude: '.claude',
  kiro: '.kiro',
};

/** Thrown for a `--scope` value that is not a known scope. */
export class ScopeError extends Error {
  /** @param {unknown} value */
  constructor(value) {
    super(`Unknown scope: ${String(value)}. Supported: ${SCOPES.join(', ')}`);
    this.name = 'ScopeError';
    this.code = 'UNKNOWN_SCOPE';
  }
}

/**
 * Resolve a `--scope` argument. Absent means the default (`global`).
 * @param {string|boolean|undefined} value
 * @returns {'global'|'project'}
 * @throws {ScopeError}
 */
export function parseScope(value) {
  if (value === undefined) return DEFAULT_SCOPE;
  if (typeof value === 'string' && SCOPES.includes(/** @type {any} */ (value))) {
    return /** @type {'global'|'project'} */ (value);
  }
  throw new ScopeError(value);
}

/**
 * @typedef {object} ManifestLocation
 * @property {string} dir - Directory holding `.installs.yaml`
 * @property {string|null} base - Directory paths are stored relative to, or null to store them absolute
 */

/**
 * Where a scope's manifest lives and how its paths are stored.
 * @param {'global'|'project'} scope
 * @param {string} harness
 * @param {string} repoRoot - ai-foundation root (holds the global manifest)
 * @param {string} projectRoot - Project root (holds a project-scope install)
 * @returns {ManifestLocation}
 */
export function manifestLocation(scope, harness, repoRoot, projectRoot) {
  if (scope === 'project') {
    return { dir: join(projectRoot, PROJECT_HARNESS_DIRS[harness]), base: projectRoot };
  }
  return { dir: repoRoot, base: null };
}
