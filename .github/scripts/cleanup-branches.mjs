#!/usr/bin/env node

/**
 * Branch cleanup, run by .github/workflows/cleanup-branches.yml.
 *
 * Cloud sessions can't delete remote branches, so GitHub does it. Every branch
 * other than the default branch and the protected list is sorted into exactly
 * one category, checked in this order (first match wins):
 *
 *   Mandatory  default branch, protected branches, branches not forked from
 *              the default branch (unrelated history) unless their name marks
 *              them as throwaway tests (project short code + test/valid/verif).
 *                                                                      -> keep
 *   Archive    merged by a PR whose head was exactly this tip; or a
 *              `push-check/` branch the default branch already contains;
 *              or last activity older than ARCHIVE_DAYS and outside the
 *              ARCHIVE_BRANCHES most recently active, with no open PR.   -> delete
 *   Active     last activity within ACTIVE_DAYS, or among the ACTIVE_BRANCHES
 *              most recently active, or an open PR younger than ACTIVE_DAYS
 *              (or one reopened after being marked stale).               -> keep
 *   Stale      an open PR ACTIVE_DAYS or older, or last activity between
 *              ACTIVE_DAYS and ARCHIVE_DAYS old, or among the ARCHIVE_BRANCHES
 *              most recently active.  -> close the PR, label it `stale`; the
 *              branch is kept until it reaches Archive.
 *
 * Time is forgiving by design: a branch ages out only once it is both old in
 * days and pushed down the recency ranking by newer branches, so a quiet repo
 * keeps its latest branches however long ago they were touched.
 *
 * "Last activity" is the date of the branch's last commit. An empty branch (no
 * commits of its own) is kept as Mandatory, with two exceptions: AI session
 * branches (AI_BRANCH_PREFIXES, e.g. `claude/`), which are often created and
 * never used, and throwaway test branches. For those, last activity is when the
 * branch was created, from the repository activity log (falling back to the
 * date of the commit it points at), so an unused one goes Active, Stale,
 * Archive like any other.
 *
 * A branch with an open PR is never deleted: the PR is closed first, and the
 * branch only reaches Archive on a later run.
 *
 * Environment:
 *   GH_TOKEN / GITHUB_TOKEN  token (needs contents: write, pull-requests: write)
 *   REPO                     owner/name
 *   ENFORCE                  "true" to act; anything else only reports
 *   DRY_RUN                  "true" forces report-only, overriding ENFORCE
 *   BRANCHES                 optional space/comma list: delete exactly these
 *                            instead of running the sweep (see runList)
 *   PROTECTED_BRANCHES       space-separated names that are never touched
 *   AI_BRANCH_PREFIXES       space-separated prefixes of AI session branches
 *                            (default: "copilot/ kiro/ claude/ ai/")
 *   PROJECT_SHORTCODE        e.g. AIF; defaults to .aiconfig.json's
 *                            project_shortname (else project_name). Without
 *                            one, no branch counts as a throwaway test, so
 *                            every unrelated-history branch is kept.
 *   ACTIVE_DAYS (14), ARCHIVE_DAYS (30)
 *   ACTIVE_BRANCHES (5), ARCHIVE_BRANCHES (15)
 *   GITHUB_STEP_SUMMARY      file the Markdown report is appended to
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DAY_MS = 86_400_000;
export const STALE_LABEL = 'stale';

/**
 * @typedef {object} OpenPr
 * @property {number} number
 * @property {Date} createdAt
 * @property {string[]} labels
 *
 * @typedef {object} BranchFacts
 * @property {string} name
 * @property {Date|null} lastCommit
 * @property {number|null} ahead  Commits not on the default branch; null when the history is unrelated.
 * @property {OpenPr|null} openPr
 * @property {boolean} merged  A merged PR whose head was exactly this tip.
 * @property {Date|null} [createdAt]  When the branch was created; read only for empty branches, null if GitHub has no record.
 * @property {number} [rank]  0-based recency rank among the branches that age out (0 = most recently active); unset counts as last.
 *
 * @typedef {object} Config
 * @property {string} defaultBranch
 * @property {string[]} protectedBranches
 * @property {string} shortcode  Project short code; '' when unknown.
 * @property {string[]} aiPrefixes  Branch name prefixes used by AI sessions, e.g. 'claude/'.
 * @property {number} activeDays
 * @property {number} archiveDays
 * @property {number} [activeBranches]  The most recently active branches are Active whatever their age.
 * @property {number} [archiveBranches]  The most recently active branches are never archived.
 *
 * @typedef {{category: 'Mandatory'|'Archive'|'Active'|'Stale', reason: string}} Verdict
 */

/**
 * A throwaway test branch is named with the project short code and a test,
 * validation or verification word (`AIF-test/ping`, `AIF-010-verification`).
 * Unrelated-history branches named like this are not exempt from cleanup;
 * long-lived ones (`docs`, `agent-testing`) carry no short code.
 *
 * @param {string} name
 * @param {string} shortcode
 */
export function isThrowawayTestName(name, shortcode) {
  if (!shortcode) return false;
  const escaped = shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hasShortcode = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(name);
  return hasShortcode && /test|valid|verif/i.test(name);
}

/**
 * Whether an empty branch (no commits of its own) goes through the age-out
 * flow instead of being kept: AI session branches (`claude/…`, `copilot/…`,
 * `kiro/…`, `ai/…`), which are created and then often never used, and
 * throwaway test branches. Any other empty branch is kept.
 *
 * @param {string} name
 * @param {Pick<Config, 'aiPrefixes' | 'shortcode'>} cfg
 */
export function agesWhenEmpty(name, cfg) {
  return (
    cfg.aiPrefixes.some((prefix) => name.startsWith(prefix)) ||
    isThrowawayTestName(name, cfg.shortcode)
  );
}

/**
 * The date a branch's age is measured from. An empty session or test branch
 * has no commits of its own: its last commit is just the default branch's tip,
 * which says nothing about the branch, so it ages from creation when GitHub has
 * the record; the tip's date is the fallback, which can only make it look
 * older, and deleting an empty branch loses no commits.
 *
 * @param {BranchFacts} f
 */
const activityDate = (f) => (f.ahead === 0 ? (f.createdAt ?? f.lastCommit) : f.lastCommit);

/**
 * Recency ranks (0 = most recently active) for the branches that go through
 * the age-out flow. Branches that are kept or archived outright (default,
 * protected, merged, unrelated history, kept-empty) take no rank, so they
 * cannot push a live branch down the list. Pure.
 *
 * @param {Array<BranchFacts & {error?: string}>} facts
 * @param {Config} cfg
 * @returns {Map<string, number>}
 */
export function rankBranches(facts, cfg) {
  const eligible = facts.filter((f) => {
    if (f.error || f.merged || !f.lastCommit) return false;
    if (f.name === cfg.defaultBranch || cfg.protectedBranches.includes(f.name)) return false;
    if (f.ahead === null) return isThrowawayTestName(f.name, cfg.shortcode);
    if (f.ahead === 0) return !f.name.startsWith('push-check/') && agesWhenEmpty(f.name, cfg);
    return true;
  });
  eligible.sort(
    (a, b) => activityDate(b).getTime() - activityDate(a).getTime() || a.name.localeCompare(b.name),
  );
  return new Map(eligible.map((f, i) => [f.name, i]));
}

/** @param {Date} later @param {Date} earlier */
const wholeDays = (later, earlier) => Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);

/**
 * Sorts one branch into its category. Pure: no I/O, so every rule is unit
 * tested.
 *
 * @param {BranchFacts} f
 * @param {Config} cfg
 * @param {Date} now
 * @returns {Verdict}
 */
export function classify(f, cfg, now) {
  if (f.name === cfg.defaultBranch) return { category: 'Mandatory', reason: 'default branch' };
  if (cfg.protectedBranches.includes(f.name)) {
    return { category: 'Mandatory', reason: 'protected branch' };
  }
  if (f.merged) return { category: 'Archive', reason: 'merged by a PR' };
  if (f.ahead === null && !isThrowawayTestName(f.name, cfg.shortcode)) {
    return {
      category: 'Mandatory',
      reason: 'not forked from the default branch (unrelated history)',
    };
  }
  const empty = f.ahead === 0;
  if (empty && f.name.startsWith('push-check/')) {
    return {
      category: 'Archive',
      reason: 'push-check branch already contained in the default branch',
    };
  }

  if (empty && !agesWhenEmpty(f.name, cfg)) {
    return { category: 'Mandatory', reason: 'empty branch (no commits of its own)' };
  }

  const pr = f.openPr;
  if (pr && pr.labels.includes(STALE_LABEL)) {
    return { category: 'Active', reason: `PR #${pr.number} was reopened after being marked stale` };
  }
  // Then the usual Active -> Stale -> Archive flow, by days and by recency rank.
  const days = wholeDays(now, activityDate(f));
  const rank = f.rank ?? Infinity;
  const what = !empty
    ? `last commit ${days}d ago`
    : f.createdAt
      ? `empty branch, created ${days}d ago`
      : `empty branch, creation date unknown, tip ${days}d old`;
  const prDays = pr ? wholeDays(now, pr.createdAt) : null;
  if (days < cfg.activeDays) return { category: 'Active', reason: what };
  if (rank < (cfg.activeBranches ?? 0)) {
    return {
      category: 'Active',
      reason: `${what}, but among the ${cfg.activeBranches} most recent branches`,
    };
  }
  if (pr && prDays < cfg.activeDays) {
    return { category: 'Active', reason: `PR #${pr.number} open ${prDays}d` };
  }
  if (pr) return { category: 'Stale', reason: `PR #${pr.number} open ${prDays}d` };
  if (days <= cfg.archiveDays) return { category: 'Stale', reason: what };
  if (rank < (cfg.archiveBranches ?? 0)) {
    return {
      category: 'Stale',
      reason: `${what}, but among the ${cfg.archiveBranches} most recent branches`,
    };
  }
  return { category: 'Archive', reason: what };
}

/**
 * A name that is safe to put in an API path and is a valid branch name by
 * git's own rules (no `..`, `//`, leading dot or dash, trailing `/`, `.` or
 * `.lock`).
 *
 * @param {string} name
 */
export function isPlainBranchName(name) {
  return (
    /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(name) &&
    !name.includes('..') &&
    !name.includes('//') &&
    !name.endsWith('/') &&
    !name.endsWith('.') &&
    !name.endsWith('.lock')
  );
}

/**
 * Splits a space/comma separated branch list, dropping a `refs/heads/` prefix.
 *
 * @param {string|undefined} text
 * @returns {string[]}
 */
export function parseBranchList(text) {
  return (text ?? '')
    .split(/[\s,]+/)
    .map((n) => n.replace(/^refs\/heads\//, ''))
    .filter(Boolean);
}

/**
 * Parses a response body; a non-JSON body (an HTML error page, say) becomes a
 * `{message}` so the caller can still report it.
 *
 * @param {string} text
 */
function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

/**
 * Minimal GitHub REST client over fetch.
 *
 * @param {{token: string, fetchImpl?: typeof fetch, base?: string}} opts
 */
export function createApi({ token, fetchImpl = fetch, base = 'https://api.github.com' }) {
  /**
   * @param {string} method
   * @param {string} path
   * @param {object} [body]
   * @returns {Promise<{data: any, headers: Headers}>}
   */
  async function request(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'cleanup-branches',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = parseJson(await res.text());
    if (!res.ok) {
      const err = new Error(`${method} ${path} -> ${res.status} ${data?.message ?? ''}`.trim());
      err.status = res.status;
      throw err;
    }
    return { data, headers: res.headers };
  }

  /**
   * Collects every page of a list endpoint, following `Link: rel="next"`.
   *
   * @param {string} path
   * @param {number} [maxPages]
   * @returns {Promise<any[]>}
   */
  async function paginate(path, maxPages = 20) {
    const out = [];
    let next = path;
    for (let page = 0; next && page < maxPages; page++) {
      const { data, headers } = await request('GET', next);
      out.push(...data);
      const link = headers.get('link') ?? '';
      const match = link.match(/<([^>]+)>;\s*rel="next"/);
      next = match ? match[1].replace(base, '') : null;
    }
    return out;
  }

  return { request, paginate };
}

/** @param {string} name */
const refPath = (name) => name.split('/').map(encodeURIComponent).join('/');

/**
 * Reads the open PRs whose head is a branch of this repo, keyed by branch.
 *
 * @param {ReturnType<typeof createApi>} api
 * @param {string} repo
 * @returns {Promise<Map<string, OpenPr>>}
 */
async function readOpenPrs(api, repo) {
  const prs = await api.paginate(`/repos/${repo}/pulls?state=open&per_page=100`);
  const byBranch = new Map();
  for (const pr of prs) {
    if (pr.head?.repo?.full_name !== repo || byBranch.has(pr.head.ref)) continue;
    byBranch.set(pr.head.ref, {
      number: pr.number,
      createdAt: new Date(pr.created_at),
      labels: (pr.labels ?? []).map((l) => l.name),
    });
  }
  return byBranch;
}

/**
 * When a branch was created, from the repository activity log (its earliest
 * `branch_creation` event). Null when there is no record or the lookup fails.
 *
 * @param {ReturnType<typeof createApi>} api
 * @param {string} repo
 * @param {string} name
 * @returns {Promise<Date|null>}
 */
async function readCreatedAt(api, repo, name) {
  try {
    const ref = encodeURIComponent(`refs/heads/${name}`);
    const { data } = await api.request(
      'GET',
      `/repos/${repo}/activity?ref=${ref}&activity_type=branch_creation&direction=asc&per_page=1`,
    );
    return data?.[0]?.timestamp ? new Date(data[0].timestamp) : null;
  } catch {
    return null;
  }
}

/**
 * Reads what GitHub knows about every branch except the default and protected
 * ones. A branch whose lookup fails is returned with `error` and kept.
 *
 * @param {ReturnType<typeof createApi>} api
 * @param {string} repo
 * @param {Config} cfg
 * @returns {Promise<Array<BranchFacts & {error?: string}>>}
 */
export async function gatherFacts(api, repo, cfg) {
  const branches = await api.paginate(`/repos/${repo}/branches?per_page=100`);
  const openPrs = await readOpenPrs(api, repo);
  const closed = await api.paginate(
    `/repos/${repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
  );
  // Name + exact head SHA: a branch reused after its PR merged has a new tip,
  // so the old merge must not condemn it.
  const merged = new Set(
    closed
      .filter((pr) => pr.merged_at && pr.head?.repo?.full_name === repo)
      .map((pr) => `${pr.head.ref}@${pr.head.sha}`),
  );

  const facts = [];
  for (const b of branches) {
    const name = b.name;
    const base = { name, lastCommit: null, ahead: null, openPr: openPrs.get(name) ?? null };
    const isMerged = merged.has(`${name}@${b.commit.sha}`);
    if (name === cfg.defaultBranch || cfg.protectedBranches.includes(name) || isMerged) {
      facts.push({ ...base, merged: isMerged });
      continue;
    }
    try {
      const { data: commit } = await api.request('GET', `/repos/${repo}/commits/${b.commit.sha}`);
      let ahead = null;
      try {
        const { data: cmp } = await api.request(
          'GET',
          `/repos/${repo}/compare/${refPath(cfg.defaultBranch)}...${b.commit.sha}?per_page=1`,
        );
        ahead = cmp.ahead_by;
      } catch (err) {
        // Only GitHub's "No common ancestor" 404 means unrelated history; any
        // other failure leaves the branch uninspected, and so kept.
        if (!(err.status === 404 && /common ancestor/i.test(err.message))) throw err;
      }
      const createdAt =
        ahead === 0 && agesWhenEmpty(name, cfg) ? await readCreatedAt(api, repo, name) : null;
      facts.push({
        ...base,
        merged: false,
        lastCommit: new Date(commit.commit.committer.date),
        ahead,
        createdAt,
      });
    } catch (err) {
      facts.push({ ...base, merged: false, error: err.message });
    }
  }
  return facts;
}

/**
 * @typedef {object} Row
 * @property {string} name
 * @property {string} category
 * @property {string} reason
 * @property {string} action
 * @property {boolean} [stale]
 * @property {boolean} [failed]
 */

/**
 * Report-only unless `enforce`: Archive branches are deleted, and a Stale
 * branch's open PR is labelled, commented on and closed. Branches classified
 * Mandatory or Active, and Stale branches with no PR, need no action.
 *
 * @param {{api: ReturnType<typeof createApi>, repo: string, cfg: Config, enforce: boolean, now: Date, log?: (s: string) => void}} o
 * @returns {Promise<Row[]>}
 */
export async function runSweep({ api, repo, cfg, enforce, now, log = () => {} }) {
  const facts = await gatherFacts(api, repo, cfg);
  const ranks = rankBranches(facts, cfg);
  for (const f of facts) f.rank = ranks.get(f.name);
  /** @type {Row[]} */
  const rows = [];
  let labelReady = false;

  for (const f of facts) {
    if (f.error) {
      rows.push({
        name: f.name,
        category: 'Mandatory',
        reason: `could not inspect, kept (${f.error})`,
        action: 'none',
      });
      continue;
    }
    const { category, reason } = classify(f, cfg, now);
    /** @type {Row} */
    const row = { name: f.name, category, reason, action: 'none', stale: category === 'Stale' };

    try {
      if (category === 'Archive') {
        if (enforce) {
          await api.request('DELETE', `/repos/${repo}/git/refs/heads/${refPath(f.name)}`);
          row.action = 'deleted';
        } else {
          row.action = 'would delete';
        }
      } else if (category === 'Stale' && f.openPr) {
        const n = f.openPr.number;
        if (enforce) {
          if (!labelReady) {
            await ensureStaleLabel(api, repo);
            labelReady = true;
          }
          await api.request('POST', `/repos/${repo}/issues/${n}/labels`, { labels: [STALE_LABEL] });
          await api.request('POST', `/repos/${repo}/issues/${n}/comments`, {
            body: staleComment(f.name, cfg),
          });
          await api.request('PATCH', `/repos/${repo}/pulls/${n}`, { state: 'closed' });
          row.action = `closed PR #${n}, labelled \`${STALE_LABEL}\``;
        } else {
          row.action = `would close PR #${n} and label it \`${STALE_LABEL}\``;
        }
      }
    } catch (err) {
      row.action = `FAILED: ${err.message}`;
      row.failed = true;
    }
    log(`${row.category.padEnd(9)} ${row.name} — ${row.reason} → ${row.action}`);
    rows.push(row);
  }
  return rows;
}

/**
 * Deletes exactly the named branches, no classification. Refuses the default
 * branch, protected branches, branches with an open PR (deleting the head
 * would close it) and names that aren't plain branch names.
 *
 * @param {{api: ReturnType<typeof createApi>, repo: string, cfg: Config, names: string[], dryRun: boolean, log?: (s: string) => void}} o
 * @returns {Promise<Row[]>}
 */
export async function runList({ api, repo, cfg, names, dryRun, log = () => {} }) {
  const openPrs = await readOpenPrs(api, repo);
  /** @type {Row[]} */
  const rows = [];
  for (const name of names) {
    /** @type {Row} */
    const row = { name, category: 'Listed', reason: 'named in the branches input', action: '' };
    if (!isPlainBranchName(name)) {
      Object.assign(row, { action: 'REFUSED: not a plain branch name', failed: true });
    } else if (name === cfg.defaultBranch || cfg.protectedBranches.includes(name)) {
      Object.assign(row, { action: 'REFUSED: default or protected branch', failed: true });
    } else if (openPrs.has(name)) {
      Object.assign(row, {
        action: `REFUSED: open PR #${openPrs.get(name).number} (deleting the branch would close it)`,
        failed: true,
      });
    } else {
      try {
        await api.request('GET', `/repos/${repo}/git/ref/heads/${refPath(name)}`);
        if (dryRun) {
          row.action = 'would delete';
        } else {
          await api.request('DELETE', `/repos/${repo}/git/refs/heads/${refPath(name)}`);
          row.action = 'deleted';
        }
      } catch (err) {
        if (err.status === 404) row.action = 'skipped: branch does not exist';
        else Object.assign(row, { action: `FAILED: ${err.message}`, failed: true });
      }
    }
    log(`${row.name} → ${row.action}`);
    rows.push(row);
  }
  return rows;
}

/**
 * @param {ReturnType<typeof createApi>} api
 * @param {string} repo
 */
async function ensureStaleLabel(api, repo) {
  try {
    await api.request('POST', `/repos/${repo}/labels`, {
      name: STALE_LABEL,
      color: 'ededed',
      description: 'Closed by branch cleanup as inactive',
    });
  } catch (err) {
    if (err.status !== 422) throw err; // 422: the label already exists
  }
}

/**
 * @param {string} branch
 * @param {Config} cfg
 */
function staleComment(branch, cfg) {
  return [
    `This PR has been open for ${cfg.activeDays} days or more without recent activity, so the scheduled branch cleanup is closing it and labelling it \`${STALE_LABEL}\`.`,
    '',
    `The branch \`${branch}\` is kept for now. Reopen this PR to keep the work active; otherwise the branch is deleted once its last commit is more than ${cfg.archiveDays} days old and it is no longer among the ${cfg.archiveBranches} most recently active branches.`,
  ].join('\n');
}

/**
 * Markdown report for the job summary.
 *
 * @param {Row[]} rows
 * @param {{mode: string, enforce: boolean}} o
 */
export function renderSummary(rows, { mode, enforce }) {
  const order = ['Stale', 'Archive', 'Active', 'Mandatory', 'Listed'];
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name),
  );
  const counts = order
    .map((c) => [c, rows.filter((r) => r.category === c).length])
    .filter(([, n]) => n > 0);
  const stale = sorted.filter((r) => r.stale);
  const lines = [
    `## Branch cleanup — ${mode}${enforce ? '' : ' (report only, nothing changed)'}`,
    '',
    counts.map(([c, n]) => `**${c}** ${n}`).join(' · ') || 'No branches to report.',
    '',
  ];
  if (stale.length > 0) {
    lines.push('### Stale branches', '');
    for (const r of stale) lines.push(`- \`${r.name}\` — ${r.reason}`);
    lines.push('');
  }
  lines.push(
    '### All branches',
    '',
    '| Branch | Category | Why | Action |',
    '| --- | --- | --- | --- |',
  );
  for (const r of sorted) {
    lines.push(`| \`${r.name}\` | ${r.category} | ${r.reason} | ${r.action} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** The repo's own convention: project_shortname, falling back to project_name. */
function shortcodeFrom(aiconfig) {
  return aiconfig?.project_shortname ?? aiconfig?.project_name ?? '';
}

/** @returns {any} the parsed .aiconfig.json, or null if there isn't a readable one. */
function readAiconfigFile() {
  try {
    return JSON.parse(readFileSync('.aiconfig.json', 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {ReturnType<typeof createApi>} api
 * @param {{now?: Date, log?: (s: string) => void, readAiconfig?: () => any}} [opts]
 * @returns {Promise<{rows: Row[], summary: string, failed: boolean}>}
 */
export async function run(
  env,
  api,
  { now = new Date(), log = () => {}, readAiconfig = readAiconfigFile } = {},
) {
  const repo = env.REPO;
  if (!repo) throw new Error('REPO is required');
  const { data } = await api.request('GET', `/repos/${repo}`);
  const cfg = {
    defaultBranch: data.default_branch,
    protectedBranches: (env.PROTECTED_BRANCHES ?? '').split(/\s+/).filter(Boolean),
    shortcode: env.PROJECT_SHORTCODE ?? shortcodeFrom(readAiconfig()),
    aiPrefixes: (env.AI_BRANCH_PREFIXES ?? 'copilot/ kiro/ claude/ ai/')
      .split(/\s+/)
      .filter(Boolean),
    activeDays: Number(env.ACTIVE_DAYS ?? 14),
    archiveDays: Number(env.ARCHIVE_DAYS ?? 30),
    activeBranches: Number(env.ACTIVE_BRANCHES ?? 5),
    archiveBranches: Number(env.ARCHIVE_BRANCHES ?? 15),
  };
  const dryRun = env.DRY_RUN === 'true';
  const names = parseBranchList(env.BRANCHES);

  if (names.length > 0) {
    const rows = await runList({ api, repo, cfg, names, dryRun, log });
    const summary = renderSummary(rows, { mode: 'listed branches', enforce: !dryRun });
    return { rows, summary, failed: rows.some((r) => r.failed) };
  }
  const enforce = env.ENFORCE === 'true' && !dryRun;
  const rows = await runSweep({ api, repo, cfg, enforce, now, log });
  return {
    rows,
    summary: renderSummary(rows, { mode: 'sweep', enforce }),
    failed: rows.some((r) => r.failed),
  };
}

async function main() {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GH_TOKEN is required');
  const api = createApi({ token });
  const { summary, failed } = await run(process.env, api, { log: console.log });
  console.log(`\n${summary}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
