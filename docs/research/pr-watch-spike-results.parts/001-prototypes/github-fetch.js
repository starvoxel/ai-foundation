// ------------------------------
// github-fetch.js
//
// Author: Starvoxel AI Agent - 2026-10-06
// Plan: AIF-012
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * SPIKE PROTOTYPE (AIF-012 Task 001). Throwaway, NOT production. Thin I/O
 * wrapper: reads PR state through `ai-git gh-api` (read-only GET/GraphQL query,
 * repo-scoped endpoints only). No shell is spawned; arguments are an array.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AI_GIT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../bin/ai-git.js',
);
const THREADS_QUERY =
  'query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){' +
  'pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved isOutdated}}}}}';

/**
 * Run `ai-git gh-api` with args, returning parsed JSON.
 * @param {string[]} args
 * @param {{calls: number}} meter - mutated: counts process invocations
 * @returns {any}
 */
function ghApi(args, meter) {
  meter.calls += 1;
  const out = execFileSync(process.execPath, [AI_GIT, 'gh-api', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

/**
 * Fetch every payload needed by normalize() for one PR.
 * @param {number} n - PR number
 * @param {{calls: number}} meter
 * @returns {object} raw payload bundle
 */
export function fetchRaw(n, meter) {
  const base = `repos/{owner}/{repo}`;
  const pr = ghApi([`${base}/pulls/${n}`], meter);
  const sha = pr.head.sha;
  const list = (ep) => ghApi([ep, '--paginate', '--slurp'], meter).flat();
  const runPages = ghApi(
    [`${base}/commits/${sha}/check-runs?per_page=100`, '--paginate', '--slurp'],
    meter,
  );
  const gql = ghApi(
    [
      'graphql',
      '-f',
      `query=${THREADS_QUERY}`,
      '-F',
      'owner={owner}',
      '-F',
      'repo={repo}',
      '-F',
      `number=${n}`,
    ],
    meter,
  );
  return {
    pr,
    checkRuns: runPages.flatMap((p) => p.check_runs),
    combined: ghApi([`${base}/commits/${sha}/status`], meter),
    reviews: list(`${base}/pulls/${n}/reviews?per_page=100`),
    reviewComments: list(`${base}/pulls/${n}/comments?per_page=100`),
    issueComments: list(`${base}/issues/${n}/comments?per_page=100`),
    threads: gql.data.repository.pullRequest.reviewThreads.nodes,
  };
}

/**
 * Read the REST core and GraphQL rate-limit counters (this call is free).
 * @returns {{core: number, graphql: number}} remaining
 */
export function rateRemaining() {
  const r = ghApi(['rate_limit'], { calls: 0 }).resources;
  return { core: r.core.remaining, graphql: r.graphql.remaining };
}
