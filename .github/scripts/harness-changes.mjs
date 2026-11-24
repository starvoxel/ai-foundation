#!/usr/bin/env node

// ------------------------------
// harness-changes.mjs
//
// Author: Starvoxel AI Agent - 2026-11-23
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Reports whether a project's harness directories (`.claude/`, `.kiro/`) have
 * uncommitted changes, for .github/actions/bundles. `aif install --update`
 * cannot say: at project scope it always reports "1 updated", changed or not.
 * `git status --porcelain` on the directories is the reliable signal.
 *
 * Runs in the caller's working directory (the project). Output: `changed=true`
 * or `changed=false` appended to the file named by GITHUB_OUTPUT.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { PROJECT_HARNESS_DIRS } from '../../lib/scope.js';

/**
 * Whether `git status --porcelain` output lists any path. Pure.
 * @param {string} porcelain - Output of `git status --porcelain`
 * @returns {boolean}
 */
export function hasChanges(porcelain) {
  return porcelain.trim() !== '';
}

/**
 * Project-relative harness directories a project-scope install writes into.
 * @returns {string[]}
 */
export function harnessDirs() {
  return Object.values(PROJECT_HARNESS_DIRS);
}

/**
 * Run `git status --porcelain` limited to the harness directories.
 * @param {string[]} dirs - Pathspecs, relative to the current directory
 * @returns {string}
 */
function gitStatus(dirs) {
  return execFileSync('git', ['status', '--porcelain', '--', ...dirs], { encoding: 'utf8' });
}

/**
 * Detect harness changes, log the verdict, publish it.
 * @param {NodeJS.ProcessEnv} env - Process environment
 * @param {{ status?: (dirs: string[]) => string, log?: (line: string) => void }} [io] - Injectable I/O
 * @returns {boolean} true when any harness directory has changes
 */
export function run(env, { status = gitStatus, log = console.log } = {}) {
  const dirs = harnessDirs();
  const changed = hasChanges(status(dirs));
  log(`bundles: ${dirs.join(', ')} ${changed ? 'have changes' : 'are unchanged'}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `changed=${changed}\n`);
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.env);
}
