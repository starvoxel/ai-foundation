#!/usr/bin/env node

// ------------------------------
// release-tag.mjs
//
// Author: Starvoxel AI Agent - 2026-11-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Decides whether a push to `main` needs a release, for
 * .github/workflows/release.yml. A release is needed when `package.json`'s
 * version has no `v<version>` tag yet, so a re-run of the same commit, or a
 * later commit that leaves the version alone, never tags twice.
 *
 * Output: `release=true|false` and `tag=v<version>` appended to the file named
 * by GITHUB_OUTPUT. A version that is not plain semver is refused (nothing is
 * released), so the value that reaches the workflow's shell is always safe.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * @typedef {{ release: boolean, tag: string, reason: string }} ReleaseDecision
 */

/**
 * Decide whether `version` needs a new release tag. Pure.
 * @param {unknown} version - `package.json`'s `version`
 * @param {string[]} existingTags - Tags already in the repository
 * @returns {ReleaseDecision}
 */
export function decideRelease(version, existingTags) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    return {
      release: false,
      tag: '',
      reason: `package.json version is not plain semver: ${JSON.stringify(version)}`,
    };
  }
  const tag = `v${version}`;
  if (existingTags.includes(tag)) {
    return { release: false, tag, reason: `tag ${tag} already exists` };
  }
  return { release: true, tag, reason: `tag ${tag} does not exist yet` };
}

/**
 * Read the version and the existing tags, log the decision, publish it.
 * @param {NodeJS.ProcessEnv} env - Process environment
 * @param {{ readVersion?: () => unknown, listTags?: () => string[], log?: (line: string) => void }} [io] - Injectable I/O
 * @returns {ReleaseDecision}
 */
export function run(
  env,
  {
    readVersion = () => JSON.parse(readFileSync('package.json', 'utf8')).version,
    listTags = () =>
      execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
        .split('\n')
        .map((tag) => tag.trim())
        .filter(Boolean),
    log = console.log,
  } = {},
) {
  const decision = decideRelease(readVersion(), listTags());
  log(
    `release: ${decision.release ? `creating ${decision.tag}` : 'no release needed'} (${decision.reason})`,
  );
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `release=${decision.release}\ntag=${decision.tag}\n`);
  }
  return decision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.env);
}
