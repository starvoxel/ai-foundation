/**
 * pr-watch — GitHub reads, only ever through `ai-git gh-api`.
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * The one place that talks to GitHub. It never calls `gh` or `git` directly
 * and never touches the token: `ai-git` holds the credentials (ADR 0005).
 * Everything fetched here is re-read fresh on every pass; a wake payload is
 * never an input.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFeedback } from './feedback.js';
import { evaluateChecks } from './checks.js';

const AI_GIT_SCRIPT = resolve(fileURLToPath(import.meta.url), '../../../bin/ai-git.js');
const MAX_PAGES = 10;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;

/**
 * @param {string} repo
 * @returns {boolean}
 */
export function isValidRepo(repo) {
  return typeof repo === 'string' && REPO_RE.test(repo);
}

/**
 * @param {string} branch
 * @returns {boolean}
 */
export function isValidBranch(branch) {
  return typeof branch === 'string' && BRANCH_RE.test(branch) && !branch.includes('..');
}

/**
 * @typedef {(path: string) => unknown} GhApi
 * Reads one REST path (`repos/{owner}/{repo}/...`) and returns the parsed JSON; throws on failure.
 */

/**
 * @typedef {(args: string[]) => {status: number|null, stdout: string, stderr: string}} RunAiGit
 */

/**
 * Real runner: spawns `ai-git` through the Node binary that is running us
 * (so no PATH or `.cmd` shim issues on Windows). `AIF_PR_WATCH_AI_GIT_SCRIPT`
 * points tests at a fake; it only chooses which program runs, and `ai-git`
 * remains the only credential holder either way.
 * @param {string[]} args
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
export function runAiGit(args) {
  const script = process.env.AIF_PR_WATCH_AI_GIT_SCRIPT || AI_GIT_SCRIPT;
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * @param {RunAiGit} run
 * @returns {GhApi}
 */
export function makeGhApi(run) {
  return (path) => {
    if (!/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./?&=%:-]+$/.test(path)) {
      throw new Error(`refusing non-repository API path: ${path}`);
    }
    const r = run(['gh-api', path]);
    if (r.status !== 0) {
      const detail = (r.stderr || r.stdout || 'no output').trim().slice(0, 300);
      throw new Error(`ai-git gh-api ${path} failed (exit ${r.status}): ${detail}`);
    }
    try {
      return JSON.parse(r.stdout);
    } catch {
      throw new Error(`ai-git gh-api ${path} returned non-JSON output`);
    }
  };
}

/**
 * Read every page of a list endpoint (capped).
 * @param {GhApi} ghApi
 * @param {string} base - Path without a query string
 * @param {(page: any) => any[]} [pick] - Extracts the array from a page (default: the page itself)
 * @returns {any[]}
 */
function readAll(ghApi, base, pick = (p) => p) {
  /** @type {any[]} */
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const items = pick(ghApi(`${base}?per_page=100&page=${page}`));
    if (!Array.isArray(items)) break;
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

/**
 * @param {GhApi} ghApi
 * @param {string} repo
 * @param {string} sha
 * @param {string|null} baseRef - When set and any check is red, the base branch's checks are read to flag failures already red there
 * @returns {import('./checks.js').CheckSummary}
 */
function readChecks(ghApi, repo, sha, baseRef) {
  if (!SHA_RE.test(sha)) throw new Error('unexpected head SHA format from the API');
  const runs = readAll(ghApi, `repos/${repo}/commits/${sha}/check-runs`, (p) => p?.check_runs);
  const statuses = readAll(ghApi, `repos/${repo}/commits/${sha}/status`, (p) => p?.statuses);
  let summary = evaluateChecks(runs, statuses, null);
  if (summary.state === 'red' && baseRef) {
    // Best effort: the base comparison is optional context, so a failed read leaves base_red false.
    try {
      const baseRuns = readAll(
        ghApi,
        `repos/${repo}/commits/${encodeURIComponent(baseRef)}/check-runs`,
        (p) => p?.check_runs,
      );
      summary = evaluateChecks(runs, statuses, baseRuns);
    } catch {
      /* keep the summary without base information */
    }
  }
  return summary;
}

/**
 * Fetch a fresh observation of a PR.
 * @param {GhApi} ghApi
 * @param {string} repo - `owner/name`
 * @param {number} pr
 * @returns {import('./digest.js').Observation}
 */
export function fetchPrObservation(ghApi, repo, pr) {
  const p = /** @type {any} */ (ghApi(`repos/${repo}/pulls/${pr}`));
  const headSha = String(p?.head?.sha ?? '');
  const checks = readChecks(
    ghApi,
    repo,
    headSha,
    typeof p?.base?.ref === 'string' ? p.base.ref : null,
  );
  const kinds = /** @type {const} */ ([
    ['review', `repos/${repo}/pulls/${pr}/reviews`],
    ['review_comment', `repos/${repo}/pulls/${pr}/comments`],
    ['issue_comment', `repos/${repo}/issues/${pr}/comments`],
  ]);
  const feedbackItems = kinds.flatMap(([kind, path]) =>
    readAll(ghApi, path)
      .map((o) => normalizeFeedback(kind, o))
      .filter((i) => i !== null),
  );
  return {
    kind: 'pr',
    headSha,
    merged: Boolean(p?.merged),
    state: p?.state === 'closed' ? 'closed' : 'open',
    draft: Boolean(p?.draft),
    mergeable: typeof p?.mergeable === 'boolean' ? p.mergeable : null,
    mergeableState: typeof p?.mergeable_state === 'string' ? p.mergeable_state : null,
    author: typeof p?.user?.login === 'string' ? p.user.login : null,
    checks,
    feedbackItems,
  };
}

/**
 * Fetch a fresh observation of a branch that has no PR (a `push-check/**`
 * branch): its checks, and whether the base branch already contains its tip.
 * A branch that no longer exists counts as landed (it is deleted after).
 * @param {GhApi} ghApi
 * @param {string} repo
 * @param {string} branch
 * @param {string} base
 * @returns {import('./digest.js').Observation}
 */
export function fetchBranchObservation(ghApi, repo, branch, base) {
  /** @type {any} */
  let b;
  try {
    b = ghApi(`repos/${repo}/branches/${encodeURIComponent(branch)}`);
  } catch (err) {
    if (/HTTP 404|Not Found/i.test(String(err instanceof Error ? err.message : err))) {
      return {
        kind: 'branch',
        headSha: '(deleted)',
        landed: true,
        checks: evaluateChecks([], [], null),
        feedbackItems: [],
      };
    }
    throw err;
  }
  const headSha = String(b?.commit?.sha ?? '');
  const cmp = /** @type {any} */ (
    ghApi(`repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(headSha)}`)
  );
  const landed = cmp?.status === 'identical' || cmp?.status === 'behind';
  return {
    kind: 'branch',
    headSha,
    landed,
    checks: readChecks(ghApi, repo, headSha, base),
    feedbackItems: [],
  };
}
