/**
 * pr-watch — GitHub reads, only ever through `ai-git gh-api`.
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * The one place that talks to GitHub. It never calls `gh` or `git` directly
 * and never touches the token: `ai-git` holds the credentials (ADR 0005).
 * Everything fetched here is re-read fresh on every pass; a wake payload is
 * never an input. Reads fail closed: a truncated, malformed, rate-limited or
 * otherwise unexpected response throws, so no digest (and no "green") is ever
 * produced from partial data.
 *
 * Limit: list endpoints are read oldest first up to MAX_PAGES pages; a PR
 * with more items than that fails the pass loudly instead of being read
 * partially.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFeedback } from './feedback.js';
import { evaluateChecks } from './checks.js';
import { sanitizeText } from './sanitize.js';

const AI_GIT_SCRIPT = resolve(fileURLToPath(import.meta.url), '../../../bin/ai-git.js');
/** Pages of 100 read per list before failing closed. */
export const MAX_PAGES = 10;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;
const MAX_REPO = 140;
const MAX_BRANCH = 200;

/** A failed `ai-git gh-api` call. */
export class GhApiError extends Error {
  /**
   * @param {string} message
   * @param {number|null} httpStatus - HTTP status parsed from gh's message, when present
   */
  constructor(message, httpStatus) {
    super(message);
    this.name = 'GhApiError';
    this.httpStatus = httpStatus;
  }
}

/** Raised when a list or response cannot be read completely. */
export class IncompleteReadError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'IncompleteReadError';
  }
}

/**
 * @param {string} repo
 * @returns {boolean}
 */
export function isValidRepo(repo) {
  if (typeof repo !== 'string' || repo.length > MAX_REPO || !REPO_RE.test(repo)) return false;
  return repo.split('/').every((part) => part !== '.' && part !== '..');
}

/**
 * @param {string} branch
 * @returns {boolean}
 */
export function isValidBranch(branch) {
  return (
    typeof branch === 'string' &&
    branch.length > 0 &&
    branch.length <= MAX_BRANCH &&
    BRANCH_RE.test(branch) &&
    !branch.includes('..')
  );
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
 * (so no PATH or `.cmd` shim issues on Windows). Tests may point
 * `AIF_PR_WATCH_AI_GIT_SCRIPT` at a fake, honored only when `NODE_ENV` is
 * `test`; production never lets the environment choose the program.
 * @param {string[]} args
 * @returns {{status: number|null, stdout: string, stderr: string}}
 */
export function runAiGit(args) {
  const override =
    process.env.NODE_ENV === 'test' ? process.env.AIF_PR_WATCH_AI_GIT_SCRIPT : undefined;
  const r = spawnSync(process.execPath, [override || AI_GIT_SCRIPT, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60_000,
    windowsHide: true,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * Pure: is `path` a repository-scoped REST path with no dot segments?
 * @param {string} path
 * @returns {boolean}
 */
export function isRepoApiPath(path) {
  if (!/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./?&=%:-]+$/.test(path)) return false;
  return path
    .split('?')[0]
    .split('/')
    .every((seg) => seg !== '.' && seg !== '..');
}

/**
 * @param {RunAiGit} run
 * @returns {GhApi}
 */
export function makeGhApi(run) {
  return (path) => {
    if (!isRepoApiPath(path)) throw new Error(`refusing non-repository API path: ${path}`);
    const r = run(['gh-api', path]);
    if (r.status !== 0) {
      const raw = r.stderr || r.stdout || 'no output';
      // gh ends a stderr line with "(HTTP nnn)": the pattern is anchored to a line end and
      // stdout is never parsed for a status.
      const status = /\(HTTP (\d{3})\)\s*$/m.exec(r.stderr);
      throw new GhApiError(
        `ai-git gh-api ${path} failed (exit ${r.status}): ${sanitizeText(raw, 300)}`,
        status ? Number(status[1]) : null,
      );
    }
    try {
      return JSON.parse(r.stdout);
    } catch {
      throw new IncompleteReadError(`ai-git gh-api ${path} returned non-JSON or truncated output`);
    }
  };
}

/**
 * Read every page of a list endpoint; fail closed on a non-array page or on
 * hitting the page cap with a still-full page.
 * @param {GhApi} ghApi
 * @param {string} base - Path without a query string
 * @returns {any[]}
 */
function readAll(ghApi, base) {
  /** @type {any[]} */
  const all = [];
  // One page past the cap is read so a list of exactly the cap size is complete, not truncated.
  for (let page = 1; page <= MAX_PAGES + 1; page++) {
    const items = ghApi(`${base}?per_page=100&page=${page}`);
    if (!Array.isArray(items))
      throw new IncompleteReadError(`unexpected response shape from ${base}`);
    if (page > MAX_PAGES) {
      if (items.length === 0) return all;
      break;
    }
    all.push(...items);
    if (items.length < 100) return all;
  }
  throw new IncompleteReadError(
    `${base} has more than ${MAX_PAGES * 100} items; cannot read it completely`,
  );
}

/**
 * Read a wrapped list (`{ total_count, <key>: [...] }`), using `total_count`
 * to know when it is complete; fail closed when it cannot be.
 * @param {GhApi} ghApi
 * @param {string} base
 * @param {'check_runs'|'statuses'} key
 * @returns {any[]}
 */
function readWrapped(ghApi, base, key) {
  /** @type {any[]} */
  const all = [];
  for (let page = 1; page <= MAX_PAGES + 1; page++) {
    const raw = /** @type {any} */ (ghApi(`${base}?per_page=100&page=${page}`));
    const items = raw?.[key];
    if (!Array.isArray(items))
      throw new IncompleteReadError(`unexpected response shape from ${base}`);
    if (page > MAX_PAGES) {
      if (items.length === 0 && !Number.isInteger(raw.total_count)) return all;
      break;
    }
    all.push(...items);
    const total = raw.total_count;
    if (Number.isInteger(total)) {
      if (all.length >= total) return all;
      if (items.length === 0)
        throw new IncompleteReadError(`${base} reported ${total} items but returned ${all.length}`);
    } else if (items.length < 100) {
      return all;
    }
  }
  throw new IncompleteReadError(
    `${base} has more than ${MAX_PAGES * 100} items; cannot read it completely`,
  );
}

/**
 * @param {GhApi} ghApi
 * @param {string} repo
 * @param {string} sha
 * @param {string|null} baseRef - When set and any check is red, the base branch's checks are read to flag failures already red there
 * @returns {import('./checks.js').CheckSummary}
 */
function readChecks(ghApi, repo, sha, baseRef) {
  if (!SHA_RE.test(sha)) throw new IncompleteReadError('unexpected head SHA format from the API');
  const runs = readWrapped(ghApi, `repos/${repo}/commits/${sha}/check-runs`, 'check_runs');
  const statuses = readWrapped(ghApi, `repos/${repo}/commits/${sha}/status`, 'statuses');
  let summary = evaluateChecks(runs, statuses, null);
  if (summary.state === 'red' && baseRef) {
    // Best effort: the base comparison is optional context, so a failed read leaves base_red false.
    try {
      const baseRuns = readWrapped(
        ghApi,
        `repos/${repo}/commits/${encodeURIComponent(baseRef)}/check-runs`,
        'check_runs',
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
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    throw new IncompleteReadError('unexpected pull request response shape');
  }
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
  let malformedFeedback = 0;
  const feedbackItems = kinds.flatMap(([kind, path]) =>
    readAll(ghApi, path).flatMap((o) => {
      const item = normalizeFeedback(kind, o);
      if (item === null) malformedFeedback++;
      return item === null ? [] : [item];
    }),
  );
  const login = typeof p?.user?.login === 'string' ? p.user.login : null;
  return {
    kind: 'pr',
    headSha,
    merged: Boolean(p?.merged),
    state: p?.state === 'closed' ? 'closed' : 'open',
    draft: Boolean(p?.draft),
    mergeable: typeof p?.mergeable === 'boolean' ? p.mergeable : null,
    mergeableState: typeof p?.mergeable_state === 'string' ? p.mergeable_state : null,
    author: login !== null && /^[A-Za-z0-9-]+(\[bot\])?$/.test(login) ? login : null,
    checks,
    feedbackItems,
    malformedFeedback,
  };
}

/**
 * @param {unknown} cmp - A compare API response
 * @returns {boolean} True when the base already contains the compared tip
 */
function isContained(cmp) {
  const status = /** @type {any} */ (cmp)?.status;
  return status === 'identical' || status === 'behind';
}

/**
 * Fetch a fresh observation of a branch that has no PR (a `push-check/**`
 * branch): its checks, and whether the base branch already contains its tip.
 *
 * A missing branch counts as landed only when this watch has seen the branch
 * before (`lastHeadSha`) and the base now contains that last-known tip. A
 * branch that was never seen, an unreadable repository, or a missing branch
 * whose tip is not in the base throws: a mistyped name or a lost token must
 * never read as "landed".
 * @param {GhApi} ghApi
 * @param {string} repo
 * @param {string} branch
 * @param {string} base
 * @param {string|null} [lastHeadSha] - The tip recorded on an earlier pass, if any
 * @returns {import('./digest.js').Observation}
 */
export function fetchBranchObservation(ghApi, repo, branch, base, lastHeadSha = null) {
  /** @type {any} */
  let b;
  try {
    b = ghApi(`repos/${repo}/branches/${encodeURIComponent(branch)}`);
  } catch (err) {
    if (!(err instanceof GhApiError) || err.httpStatus !== 404) throw err;
    if (lastHeadSha === null || !SHA_RE.test(lastHeadSha)) {
      throw new Error(`branch ${branch} was not found (never seen by this watch: check the name)`, {
        cause: err,
      });
    }
    // Confirm the repository itself is readable, then that the base holds the last known tip.
    ghApi(`repos/${repo}/commits/${encodeURIComponent(base)}`);
    const cmp = ghApi(`repos/${repo}/compare/${encodeURIComponent(base)}...${lastHeadSha}`);
    if (!isContained(cmp)) {
      throw new Error(`branch ${branch} is gone but its last known tip is not in ${base}`, {
        cause: err,
      });
    }
    return {
      kind: 'branch',
      headSha: lastHeadSha,
      landed: true,
      checks: evaluateChecks([], [], null),
      feedbackItems: [],
    };
  }
  const headSha = String(b?.commit?.sha ?? '');
  if (!SHA_RE.test(headSha)) throw new IncompleteReadError('unexpected branch response shape');
  const cmp = ghApi(`repos/${repo}/compare/${encodeURIComponent(base)}...${headSha}`);
  return {
    kind: 'branch',
    headSha,
    landed: isContained(cmp),
    checks: readChecks(ghApi, repo, headSha, base),
    feedbackItems: [],
  };
}
