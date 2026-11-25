// ------------------------------
// project-root.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Guard for project-scope commands. Project scope writes into the current
 * directory, so running it where there is no project (a home directory, say)
 * would scatter `.claude/` or `.kiro/` into the wrong place. A directory counts
 * as a project when it holds `.aiconfig.json` or `.git` (a directory, or a file
 * in a worktree).
 *
 * `projectRootProblem` is pure; `checkProjectRoot` is the thin filesystem wrapper.
 * Plan: aif-project-integrations (Milestone 2).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Names whose presence marks a directory as a project root. */
export const PROJECT_MARKERS = ['.aiconfig.json', '.git'];

/**
 * Describe why a directory cannot take a project-scope install, if it cannot.
 * @param {'global'|'project'} scope
 * @param {string} projectRoot - Directory the command would write into
 * @param {(name: string) => boolean} hasEntry - Whether the directory holds an entry of that name
 * @returns {string|null} Error message, or null when the command may proceed
 */
export function projectRootProblem(scope, projectRoot, hasEntry) {
  if (scope !== 'project') return null;
  if (PROJECT_MARKERS.some((name) => hasEntry(name))) return null;
  return (
    `No project found in ${projectRoot} (no ${PROJECT_MARKERS.join(' or ')}). ` +
    'Run this from your project root, or pass --scope global to install for your user.'
  );
}

/**
 * Check the real directory.
 * @param {'global'|'project'} scope
 * @param {string} projectRoot
 * @returns {string|null} Error message, or null when the command may proceed
 */
export function checkProjectRoot(scope, projectRoot) {
  return projectRootProblem(scope, projectRoot, (name) => existsSync(join(projectRoot, name)));
}
