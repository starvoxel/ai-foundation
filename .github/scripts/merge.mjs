#!/usr/bin/env node

// ------------------------------
// merge.mjs
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * The `/merge` bot's I/O wrapper, for .github/workflows/merge.yml (docs/plans/merge-bot.md).
 * It gathers the PR's state from the GitHub API, hands it to the pure decisions in
 * merge-logic.mjs, and reports the result as a PR comment. This milestone is dry-run only:
 * it pushes nothing and merges nothing, and refuses to run with DRY_RUN other than `true`.
 *
 * Input (environment): GITHUB_TOKEN, GITHUB_REPOSITORY (`owner/repo`), PR_NUMBER, COMMENT_BODY,
 * COMMENTER_LOGIN, COMMENTER_TYPE, DRY_RUN.
 *
 * The comment body reaches this script only through the environment and is matched exactly; the
 * script never runs PR code.
 */

import { pathToFileURL } from 'node:url';

import {
  decideAuthorization,
  decideMerge,
  describeRefusal,
  parseCommand,
  renderDryRun,
  requiredChecksFromRules,
  toGateInput,
} from './merge-logic.mjs';

const API = 'https://api.github.com';
const PAGE_SIZE = 100;
const MERGEABLE_TRIES = 3;
const MERGEABLE_WAIT_MS = 2000;

/**
 * A GitHub REST call. `fetch` is global in Node 22. The token is sent only as a header and never logged.
 * @param {string} token
 * @returns {(method: string, path: string, body?: unknown) => Promise<any>}
 * @throws {Error} From the returned function, on a non-2xx response
 */
export function createApi(token) {
  return async (method, path, body) => {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`GitHub ${method} ${path} failed: ${response.status} ${response.statusText}`);
    }
    return response.status === 204 ? null : response.json();
  };
}

/**
 * Collect every page of a list endpoint.
 * @param {(method: string, path: string) => Promise<any>} api
 * @param {string} path - Path without `per_page`/`page`
 * @param {string} [key] - Property holding the list when the response is an object
 * @returns {Promise<any[]>}
 */
export async function paginate(api, path, key) {
  const items = [];
  for (let page = 1; ; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await api('GET', `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`);
    const list = key ? (response?.[key] ?? []) : (response ?? []);
    items.push(...list);
    if (list.length < PAGE_SIZE) return items;
  }
}

/**
 * The text of `package.json` at a ref, or null when it is absent there.
 * @param {(method: string, path: string) => Promise<any>} api
 * @param {string} repo - `owner/repo`
 * @param {string} ref - Commit SHA or branch
 * @returns {Promise<string|null>}
 */
async function readPackageJson(api, repo, ref) {
  try {
    const file = await api(
      'GET',
      `/repos/${repo}/contents/package.json?ref=${encodeURIComponent(ref)}`,
    );
    return Buffer.from(file.content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Fetch the PR, retrying while GitHub is still computing `mergeable`.
 * @param {(method: string, path: string) => Promise<any>} api
 * @param {string} repo
 * @param {number} number
 * @param {(ms: number) => Promise<void>} sleep
 * @returns {Promise<any>}
 */
async function fetchPull(api, repo, number, sleep) {
  let pull = await api('GET', `/repos/${repo}/pulls/${number}`);
  for (let attempt = 1; pull.mergeable === null && attempt < MERGEABLE_TRIES; attempt++) {
    await sleep(MERGEABLE_WAIT_MS);
    pull = await api('GET', `/repos/${repo}/pulls/${number}`);
  }
  return pull;
}

/**
 * Handle one `/merge` comment: authorize, gather, decide, report. Dry run only.
 * @param {{ env: Record<string, string|undefined>,
 *   api: (method: string, path: string, body?: unknown) => Promise<any>,
 *   log?: (line: string) => void, sleep?: (ms: number) => Promise<void> }} io - Injectable I/O
 * @returns {Promise<'ignored'|'refused'|'would-merge'>} What happened, for the caller and tests
 * @throws {Error} When DRY_RUN is not `true` (live mode is not built), or on an API failure
 */
export async function run({
  env,
  api,
  log = console.log,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  if (env.DRY_RUN !== 'true') {
    throw new Error('merge.mjs is dry-run only in this version: set DRY_RUN=true');
  }
  const repo = env.GITHUB_REPOSITORY ?? '';
  const number = Number(env.PR_NUMBER);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(number) || number < 1) {
    throw new Error(`Bad repository '${repo}' or PR number '${env.PR_NUMBER}'`);
  }
  const comment = (/** @type {string} */ text) =>
    api('POST', `/repos/${repo}/issues/${number}/comments`, { body: text });

  if (!parseCommand(env.COMMENT_BODY)) {
    log(`ignored: comment on #${number} is not exactly /merge`);
    return 'ignored';
  }

  const login = env.COMMENTER_LOGIN ?? '';
  const access = await api(
    'GET',
    `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
  );
  const auth = decideAuthorization({
    commenterType: env.COMMENTER_TYPE ?? '',
    permission: access?.permission ?? 'none',
  });
  if ('reason' in auth) {
    log(`refused: @${login} may not merge #${number} (${auth.reason})`);
    await comment(`/merge refused:\n${describeRefusal([auth.reason])}`);
    return 'refused';
  }

  const pull = await fetchPull(api, repo, number, sleep);
  const defaultBranch = pull.base?.repo?.default_branch ?? 'main';
  const headSha = pull.head.sha;
  const [files, checkRuns, rules, comparison, mainJson] = await Promise.all([
    paginate(api, `/repos/${repo}/pulls/${number}/files`),
    paginate(api, `/repos/${repo}/commits/${headSha}/check-runs`, 'check_runs'),
    api('GET', `/repos/${repo}/rules/branches/${encodeURIComponent(defaultBranch)}`),
    api('GET', `/repos/${repo}/compare/${encodeURIComponent(defaultBranch)}...${headSha}`),
    readPackageJson(api, repo, defaultBranch),
  ]);
  const [mergeBaseJson, headJson] = await Promise.all([
    readPackageJson(api, repo, comparison.merge_base_commit.sha),
    readPackageJson(api, repo, headSha),
  ]);

  const input = toGateInput({
    pull,
    files,
    checkRuns,
    requiredChecks: requiredChecksFromRules(rules),
    mergeBaseJson,
    headJson,
    defaultBranch,
  });
  const mainVersion = JSON.parse(mainJson ?? '{}').version ?? '';
  const decision = decideMerge({ ...input, mainVersion, behind: comparison.behind_by > 0 });

  log(`${decision.action}: #${number} at ${headSha} requested by @${login}`);
  await comment(renderDryRun(decision, { pullNumber: number, headSha }));
  return decision.action === 'refuse' ? 'refused' : 'would-merge';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await run({ env: process.env, api: createApi(process.env.GITHUB_TOKEN ?? '') });
  } catch (err) {
    console.error(`merge.mjs failed: ${err.message}`);
    process.exitCode = 1;
  }
}
