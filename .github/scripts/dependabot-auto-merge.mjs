#!/usr/bin/env node

// ------------------------------
// dependabot-auto-merge.mjs
//
// Author: Starvoxel AI Agent - 2026-11-04
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Decides whether a Dependabot PR may have auto-merge enabled, for
 * .github/workflows/dependabot-auto-merge.yml.
 *
 * A PR is eligible only when every dependency it updates is a patch update and
 * is either a direct npm dev dependency or a GitHub Action. Anything else,
 * including an empty, unparsable or unexpectedly shaped input, is not eligible:
 * the default is a human review. GitHub then merges an eligible PR only after
 * the required checks pass.
 *
 * Input: the JSON of `dependabot/fetch-metadata`'s `updated-dependencies-json`
 * output, in the UPDATES_JSON environment variable. Output: `eligible=true` or
 * `eligible=false` appended to the file named by GITHUB_OUTPUT.
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PATCH = 'version-update:semver-patch';
const NPM = 'npm_and_yarn';
const NPM_DEV = 'direct:development';
const ACTIONS = 'github_actions';

/**
 * @typedef {{ eligible: boolean, reason: string }} Decision
 */

/**
 * Whether one updated dependency is a patch update of a kind we auto-merge.
 * @param {unknown} update - One entry of `updated-dependencies-json`
 * @returns {boolean}
 */
function isSafeUpdate(update) {
  if (typeof update !== 'object' || update === null) return false;
  const { updateType, packageEcosystem, dependencyType } = /** @type {Record<string, unknown>} */ (
    update
  );
  if (updateType !== PATCH) return false;
  if (packageEcosystem === ACTIONS) return true;
  return packageEcosystem === NPM && dependencyType === NPM_DEV;
}

/**
 * Decide eligibility from the raw JSON string. Pure.
 * @param {string | undefined} json - Value of `updated-dependencies-json`
 * @returns {Decision}
 */
export function decide(json) {
  let updates;
  try {
    updates = JSON.parse(json ?? '');
  } catch {
    return { eligible: false, reason: 'dependency metadata is missing or not valid JSON' };
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    return { eligible: false, reason: 'dependency metadata lists no updates' };
  }
  const blocked = updates.filter((update) => !isSafeUpdate(update));
  if (blocked.length > 0) {
    return {
      eligible: false,
      reason: `${blocked.length} of ${updates.length} updates are not patch-level dev dependencies or Actions`,
    };
  }
  return { eligible: true, reason: `all ${updates.length} updates are safe patch updates` };
}

/**
 * Read the metadata from the environment, log the decision, publish it.
 * @param {NodeJS.ProcessEnv} env - Process environment
 * @param {(line: string) => void} [log] - Sink for the human-readable decision
 * @returns {Decision}
 */
export function run(env, log = console.log) {
  const decision = decide(env.UPDATES_JSON);
  log(`auto-merge ${decision.eligible ? 'eligible' : 'not eligible'}: ${decision.reason}`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `eligible=${decision.eligible}\n`);
  return decision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.env);
}
