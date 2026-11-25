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
  UNSUPPORTED_REPLY,
  applyVersion,
  classifyComment,
  decideAuthorization,
  decideMerge,
  describeRefusal,
  firstParentIs,
  formatAudit,
  isBotCommenter,
  isVersionOnlyPaths,
  nextVersion,
  renderDryRun,
  requiredChecksFromRules,
  toGateInput,
  updateCommitMessage,
  verifyVersionOnly,
  versionCommitMessage,
} from './merge-logic.mjs';

const API = 'https://api.github.com';
const PAGE_SIZE = 100;
const MERGEABLE_TRIES = 3;
const MERGEABLE_WAIT_MS = 2000;

/** The longest part of GitHub's error message that is kept, so a comment stays short. */
const MAX_ERROR_DETAIL = 300;

/**
 * A GitHub REST call. `fetch` is global in Node 22. The token is sent only as a header and never logged.
 * A failed call's error carries GitHub's own `message`, since the status text alone (for example a bare
 * `405 Method Not Allowed` on a merge) does not say what blocked it.
 * @param {string} token
 * @param {typeof fetch} [fetchImpl] - Injectable for tests
 * @returns {(method: string, path: string, body?: unknown) => Promise<any>}
 * @throws {Error} From the returned function, on a non-2xx response
 */
export function createApi(token, fetchImpl = fetch) {
  return async (method, path, body) => {
    const response = await fetchImpl(`${API}${path}`, {
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
      /** @type {{ message?: unknown } | null} */
      const data = await response.json().catch(() => null);
      const detail =
        typeof data?.message === 'string' ? data.message.slice(0, MAX_ERROR_DETAIL) : '';
      /** @type {Error & { status?: number }} */
      const err = new Error(
        `GitHub ${method} ${path} failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`,
      );
      err.status = response.status;
      throw err;
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

/** The version files the bot may rewrite, in the order it reads them. */
const VERSION_FILES = ['package.json', 'package-lock.json'];

/**
 * Encode a branch name for a ref path, keeping its `/` separators.
 * @param {string} branch
 * @returns {string}
 */
function refPath(branch) {
  return branch.split('/').map(encodeURIComponent).join('/');
}

/**
 * Read a file's text at a commit through the blob API, which has no size limit, or null if the file
 * does not exist there.
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} api
 * @param {string} repo
 * @param {string} path
 * @param {string} ref
 * @returns {Promise<{ sha: string, text: string }|null>}
 */
async function readFileAt(api, repo, path, ref) {
  let file;
  try {
    file = await api('GET', `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
  const blob = await api('GET', `/repos/${repo}/git/blobs/${file.sha}`);
  return { sha: file.sha, text: Buffer.from(blob.content, 'base64').toString('utf8') };
}

/**
 * Commit the new version on top of `headSha` through the Git Data API, never checking out PR code.
 * Each file is rewritten by `applyVersion` and verified to differ only in its version fields, and the
 * branch ref moves forward without force, so a push made since `headSha` makes it fail.
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} api
 * @param {string} repo
 * @param {string} branch - The PR branch
 * @param {string} headSha - The head the commit is built on
 * @param {string} version - Plain `x.y.z`
 * @returns {Promise<string>} The new head SHA
 * @throws {Error} When a rewritten file differs by more than its version, or the ref cannot advance
 */
async function commitVersion(api, repo, branch, headSha, version) {
  const parent = await api('GET', `/repos/${repo}/git/commits/${headSha}`);
  const entries = [];
  for (const path of VERSION_FILES) {
    const before = await readFileAt(api, repo, path, headSha);
    if (before === null) continue;
    const after = applyVersion(before.text, version);
    const check = verifyVersionOnly(before.text, after, version);
    if ('reason' in check) throw new Error(`${path}: ${check.reason}`);
    if (after === before.text) continue;
    const blob = await api('POST', `/repos/${repo}/git/blobs`, {
      content: after,
      encoding: 'utf-8',
    });
    entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  if (entries.length === 0) return headSha;
  if (!isVersionOnlyPaths(entries.map((entry) => entry.path))) {
    throw new Error('The version commit would touch a file other than the version files');
  }
  const tree = await api('POST', `/repos/${repo}/git/trees`, {
    base_tree: parent.tree.sha,
    tree: entries,
  });
  const commit = await api('POST', `/repos/${repo}/git/commits`, {
    message: versionCommitMessage(version),
    tree: tree.sha,
    parents: [headSha],
  });
  await api('PATCH', `/repos/${repo}/git/refs/heads/${refPath(branch)}`, {
    sha: commit.sha,
    force: false,
  });
  return commit.sha;
}

/**
 * The live half of `/merge`: re-check the head, merge `main` into the branch when behind, commit the
 * version, and merge. The workflow's `merge` concurrency group serialises runs, and `main`'s version
 * is read again here so the number is assigned against `main` as it is now.
 * @param {{ api: (method: string, path: string, body?: unknown) => Promise<any>, repo: string,
 *   number: number, pull: any, defaultBranch: string, decision: { bump: { level: string, from: string, to: string } | null,
 *   updateBranch: boolean }, headSha: string, login: string, checks: string[], log: (line: string) => void,
 *   comment: (text: string) => Promise<any> }} input
 * @returns {Promise<'merged'|'refused'>}
 * @throws {Error} When an API call fails; the caller reports it
 */
async function mergeLive({
  api,
  repo,
  number,
  pull,
  defaultBranch,
  decision,
  headSha,
  login,
  checks,
  log,
  comment,
}) {
  const branch = pull.head.ref;
  const fresh = await api('GET', `/repos/${repo}/pulls/${number}`);
  if (fresh.head.sha !== headSha) {
    log(`refused: #${number} head moved from ${headSha} to ${fresh.head.sha}`);
    await comment(`/merge refused:\n${describeRefusal(['head-moved'])}`);
    return 'refused';
  }

  let head = headSha;
  let updated = false;
  if (decision.updateBranch) {
    let merged;
    try {
      merged = await api('POST', `/repos/${repo}/merges`, {
        base: branch,
        head: defaultBranch,
        commit_message: updateCommitMessage(branch, defaultBranch),
      });
    } catch (err) {
      if (err.status !== 409) throw err;
      log(`refused: merging ${defaultBranch} into ${branch} conflicts`);
      await comment(`/merge refused:\n${describeRefusal(['update-conflict'])}`);
      return 'refused';
    }
    if (merged !== null) {
      if (!firstParentIs(merged.parents, headSha)) {
        throw new Error(
          'The branch moved while merging the default branch into it; nothing else was changed',
        );
      }
      head = merged.sha;
      updated = true;
      log(`updated ${branch} from ${defaultBranch}: ${head}`);
    }
  }

  let bump = decision.bump;
  if (bump) {
    const mainFile = await readFileAt(api, repo, 'package.json', defaultBranch);
    const mainVersion = JSON.parse(mainFile?.text ?? '{}').version ?? '';
    bump = { level: bump.level, from: mainVersion, to: nextVersion(mainVersion, bump.level) };
    head = await commitVersion(api, repo, branch, head, bump.to);
    log(`version ${bump.from} -> ${bump.to}: ${head}`);
  }

  await api('PUT', `/repos/${repo}/pulls/${number}/merge`, { sha: head, merge_method: 'merge' });
  log(`merged: #${number} at ${head} requested by @${login}`);
  await comment(
    formatAudit({
      commenter: login,
      bump,
      headSha,
      checks,
      updatedBranch: updated,
    }),
  );
  return 'merged';
}

/**
 * Handle one `/merge` comment: authorize, gather, decide, then report (dry run) or merge (live).
 * @param {{ env: Record<string, string|undefined>,
 *   api: (method: string, path: string, body?: unknown) => Promise<any>,
 *   log?: (line: string) => void, sleep?: (ms: number) => Promise<void> }} io - Injectable I/O
 * @returns {Promise<'ignored'|'unsupported'|'refused'|'would-merge'|'merged'>} What happened, for the caller and tests
 * @throws {Error} When DRY_RUN is neither `true` nor `false`, or on an API failure
 */
export async function run({
  env,
  api,
  log = console.log,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  if (env.DRY_RUN !== 'true' && env.DRY_RUN !== 'false') {
    throw new Error(`DRY_RUN must be 'true' or 'false', not '${env.DRY_RUN}'`);
  }
  const repo = env.GITHUB_REPOSITORY ?? '';
  const number = Number(env.PR_NUMBER);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isInteger(number) || number < 1) {
    throw new Error(`Bad repository '${repo}' or PR number '${env.PR_NUMBER}'`);
  }
  const comment = (/** @type {string} */ text) =>
    api('POST', `/repos/${repo}/issues/${number}/comments`, { body: text });

  const login = env.COMMENTER_LOGIN ?? '';
  if (isBotCommenter(login, env.COMMENTER_TYPE ?? '')) {
    log(`ignored: comment on #${number} is from a bot`);
    return 'ignored';
  }
  const kind = classifyComment(env.COMMENT_BODY);
  if (kind === 'none') {
    log(`ignored: comment on #${number} is not a /merge command`);
    return 'ignored';
  }

  const access = await api(
    'GET',
    `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
  );
  const auth = decideAuthorization({
    commenterType: env.COMMENTER_TYPE ?? '',
    permission: access?.permission ?? 'none',
  });
  if ('reason' in auth && kind === 'unsupported') {
    log(`ignored: @${login} may not merge #${number} and sent an unsupported command`);
    return 'ignored';
  }
  if ('reason' in auth) {
    log(`refused: @${login} may not merge #${number} (${auth.reason})`);
    await comment(`/merge refused:\n${describeRefusal([auth.reason])}`);
    return 'refused';
  }

  if (kind === 'unsupported') {
    log(`unsupported: @${login} sent an unsupported command on #${number}`);
    await comment(UNSUPPORTED_REPLY);
    return 'unsupported';
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
  if (decision.action === 'refuse') {
    await comment(renderDryRun(decision, { pullNumber: number, headSha }));
    return 'refused';
  }
  if (env.DRY_RUN === 'true') {
    await comment(renderDryRun(decision, { pullNumber: number, headSha }));
    return 'would-merge';
  }
  try {
    return await mergeLive({
      api,
      repo,
      number,
      pull,
      defaultBranch,
      decision,
      headSha,
      login,
      checks: input.requiredChecks,
      log,
      comment,
    });
  } catch (err) {
    await comment(
      `/merge failed: ${err.message}\n\nCheck the workflow run, then comment \`/merge\` again.`,
    );
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await run({ env: process.env, api: createApi(process.env.GITHUB_TOKEN ?? '') });
  } catch (err) {
    console.error(`merge.mjs failed: ${err.message}`);
    process.exitCode = 1;
  }
}
