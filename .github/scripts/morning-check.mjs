#!/usr/bin/env node

/**
 * Morning check, run by .github/workflows/morning-check.yml.
 *
 * Each check looks for something that needs a human and is not worth blocking
 * a PR over, because a blocking check would make every PR that touches the same
 * shared file conflict. A check that finds something opens one labelled GitHub
 * issue, updates it only when the findings change, and closes it once the
 * findings are gone. Nothing is stored in the repo.
 *
 * Two modes, so the cheap decision costs no `npm ci`:
 *
 *   guard  Needs only Node and git. Writes `run=true|false` to GITHUB_OUTPUT.
 *          Runs when forced (manual dispatch, or Monday as a weekly backstop),
 *          when a check already has an open issue to re-check, or when `main`
 *          changed a path some check watches within the last WINDOW_HOURS.
 *   run    Runs every check, then opens, updates or closes its issue.
 *
 * To add a check, append an entry to CHECKS: its watched paths, a one-line fix,
 * and a function returning the findings. An empty list means clean, and a check
 * that cannot verify must throw, never return clean.
 *
 * Environment:
 *   GH_TOKEN / GITHUB_TOKEN  token (needs issues: write); without one, or with
 *                            DRY_RUN=true, the plan is only printed
 *   REPO                     owner/name
 *   FORCE                    "true" to run regardless of what changed
 *   DRY_RUN                  "true" to print the plan and change nothing
 *   RUN_URL                  link to this run, added to the closing comment
 *   GITHUB_OUTPUT            file the guard result is appended to
 *   GITHUB_STEP_SUMMARY      file the Markdown report is appended to
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createApi } from './cleanup-branches.mjs';

export const LABEL = 'morning-check';
/** Longer than the daily gap, so one slow or skipped run does not hide a change. */
export const WINDOW_HOURS = 26;
/** 0 = Sunday. A forced weekly run catches anything the change guard missed. */
export const FORCE_WEEKDAY = 1;

/**
 * @typedef {object} Check
 * @property {string} id  Stable key; it is also the marker that ties an issue to its check.
 * @property {string} title
 * @property {string[]} paths  Repo path prefixes whose change can introduce a finding.
 * @property {string} fix  One line telling the human what to do about a finding.
 * @property {(repoRoot: string) => string[]} run  The findings; empty means clean. Throws when it cannot verify.
 *
 * @typedef {object} Issue
 * @property {number} number
 * @property {string} body
 *
 * @typedef {{action: 'none'|'create'|'update'|'close', title: string, body: string}} IssuePlan
 * @typedef {ReturnType<typeof createApi>} ApiClient
 */

/**
 * Reads the drift lines out of `aif install --scope project --check`. The
 * check always exits 0 and only prints, so the text is the interface. Output it
 * does not recognise is an error: "could not read it" must not look like
 * "nothing drifted".
 *
 * @param {string} stdout
 * @returns {string[]} Lines like `changed: .claude/agents/engineer.md`; empty when current.
 * @throws {Error} When the output is neither a clean nor a drift report.
 */
export function parseDriftOutput(stdout) {
  const findings = [...stdout.matchAll(/^\s+((?:changed|missing|retired): \S.*)$/gm)].map((m) =>
    m[1].trim(),
  );
  if (findings.length > 0) return findings;
  if (/project install is current|No project-scope install found/.test(stdout)) return [];
  throw new Error(`Unrecognised install check output: ${stdout.trim().slice(0, 200)}`);
}

/**
 * Runs the committed-install drift check (the same command CI runs as a
 * warning). A bundle that fails to reinstall means the comparison is
 * incomplete, so that throws instead of reporting a partial result.
 *
 * @param {string} repoRoot
 * @returns {string[]}
 */
function runInstallDrift(repoRoot) {
  const res = spawnSync(
    process.execPath,
    ['bin/aif.js', 'install', '--scope', 'project', '--check'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`install check exited ${res.status}: ${res.stderr.trim().slice(0, 200)}`);
  }
  if (/failed to reinstall/.test(res.stderr)) {
    throw new Error(`install check could not reinstall every bundle: ${res.stderr.trim()}`);
  }
  return parseDriftOutput(res.stdout);
}

/** @type {Check[]} */
export const CHECKS = [
  {
    id: 'install-drift',
    title: 'Committed project-scope install has drifted',
    // The install is built from these and committed under .claude/; adapters in
    // lib/ decide how, so a change to any of them can leave it out of date.
    paths: [
      '.claude/',
      'agents/',
      'skills/',
      'steering/',
      'standards/',
      'servers/',
      'bundles/',
      'lib/',
      'bin/',
    ],
    fix: 'Run `aif install --scope project --update` and commit the result in its own PR. Feature PRs should not refresh it: `.claude/.installs.yaml` is one shared file, so doing it per PR makes them conflict.',
    run: runInstallDrift,
  },
];

/**
 * Whether anything a check watches changed. Pure.
 *
 * @param {string[]} changedFiles
 * @param {Check[]} checks
 * @returns {Check[]} The checks with at least one watched path in `changedFiles`.
 */
export function checksTouched(changedFiles, checks) {
  return checks.filter((c) => changedFiles.some((f) => c.paths.some((p) => f.startsWith(p))));
}

/**
 * Decides whether the expensive part needs to run. Pure.
 *
 * @param {{force: boolean, openIssues: number, changedFiles: string[]|null, checks: Check[]}} input
 *   `changedFiles` is null when the window start is unknown (a young or shallow history).
 * @returns {{run: boolean, reason: string}}
 */
export function decideGuard({ force, openIssues, changedFiles, checks }) {
  if (force) return { run: true, reason: 'forced' };
  if (openIssues > 0) return { run: true, reason: `${openIssues} open issue(s) to re-check` };
  if (changedFiles === null) return { run: true, reason: 'cannot tell what changed' };
  const touched = checksTouched(changedFiles, checks);
  if (touched.length > 0) {
    return { run: true, reason: `changed paths watched by ${touched.map((c) => c.id).join(', ')}` };
  }
  return { run: false, reason: `nothing watched changed in the last ${WINDOW_HOURS}h` };
}

/**
 * The hidden marker tying an issue to a check.
 *
 * @param {string} id
 */
export const markerFor = (id) => `<!-- morning-check:${id} -->`;

/**
 * Issue body for a check's findings. It holds nothing that changes from run to
 * run, so an unchanged finding list never edits the issue. Pure.
 *
 * @param {Check} check
 * @param {string[]} findings
 * @returns {string}
 */
export function renderBody(check, findings) {
  return [
    markerFor(check.id),
    `The morning check found ${findings.length} item(s):`,
    '',
    ...findings.map((f) => `- \`${f}\``),
    '',
    `**What to do:** ${check.fix}`,
    '',
    'This issue is maintained by `.github/workflows/morning-check.yml`. It closes by itself once the check passes.',
  ].join('\n');
}

/**
 * What to do with a check's issue given its findings and any open issue. Pure.
 *
 * @param {{check: Check, findings: string[], existing: Issue|null}} input
 * @returns {IssuePlan}
 */
export function planIssue({ check, findings, existing }) {
  const title = `Morning check: ${check.title}`;
  const body = renderBody(check, findings);
  if (findings.length === 0) return { action: existing ? 'close' : 'none', title, body };
  if (!existing) return { action: 'create', title, body };
  return { action: existing.body === body ? 'none' : 'update', title, body };
}

/**
 * Open issues for this check, found by marker among the labelled ones.
 *
 * @param {Issue[]} openIssues
 * @param {string} id
 * @returns {Issue|null}
 */
export function findExisting(openIssues, id) {
  return openIssues.find((i) => (i.body ?? '').includes(markerFor(id))) ?? null;
}

/**
 * Markdown report for the job summary. Pure.
 *
 * @param {{check: Check, findings: string[]|null, error: string|null, action: string}[]} results
 * @returns {string}
 */
export function renderSummary(results) {
  const rows = results.map(({ check, findings, error, action }) => {
    const status = error ? `could not verify: ${error}` : `${findings?.length ?? 0} finding(s)`;
    return `| ${check.id} | ${status.replace(/\|/g, '\\|')} | ${action} |`;
  });
  return [
    '## Morning check',
    '',
    '| Check | Result | Issue |',
    '| --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

/**
 * Files changed on the default branch over the last `hours`, from the first
 * parent history. A PR's own commits can be older than the window, so this
 * compares the tip with the last commit before the window instead of reading
 * commit dates.
 *
 * @param {string} repoRoot
 * @param {number} hours
 * @returns {string[]|null} Null when no commit precedes the window.
 */
export function changedFilesSince(repoRoot, hours) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  const base = git(['rev-list', '-1', '--first-parent', `--before=${hours} hours ago`, 'HEAD']);
  if (!base) return null;
  return git(['diff', '--name-only', `${base}..HEAD`])
    .split('\n')
    .filter(Boolean);
}

/**
 * @param {ApiClient} api
 * @param {string} repo
 * @returns {Promise<Issue[]>}
 */
async function listOpenIssues(api, repo) {
  const issues = await api.paginate(
    `/repos/${repo}/issues?state=open&labels=${LABEL}&per_page=100`,
  );
  // The issues endpoint also lists pull requests.
  return issues.filter((i) => !i.pull_request);
}

/**
 * Applies one plan through the API.
 *
 * @param {ApiClient} api
 * @param {string} repo
 * @param {IssuePlan} plan
 * @param {Issue|null} existing
 * @param {string} runUrl
 */
async function applyPlan(api, repo, plan, existing, runUrl) {
  if (plan.action === 'create') {
    try {
      await api.request('POST', `/repos/${repo}/labels`, {
        name: LABEL,
        color: 'fbca04',
        description: 'Raised by the scheduled morning check',
      });
    } catch (err) {
      // 422: the label already exists.
      if (/** @type {any} */ (err).status !== 422) throw err;
    }
    await api.request('POST', `/repos/${repo}/issues`, {
      title: plan.title,
      body: plan.body,
      labels: [LABEL],
    });
  } else if (plan.action === 'update' && existing) {
    await api.request('PATCH', `/repos/${repo}/issues/${existing.number}`, { body: plan.body });
  } else if (plan.action === 'close' && existing) {
    await api.request('POST', `/repos/${repo}/issues/${existing.number}/comments`, {
      body: `The check passes again${runUrl ? ` (${runUrl})` : ''}. Closing.`,
    });
    await api.request('PATCH', `/repos/${repo}/issues/${existing.number}`, {
      state: 'closed',
      state_reason: 'completed',
    });
  }
}

/**
 * The GitHub client for this environment, or null for a dry run (no token or
 * repo, or DRY_RUN=true).
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {ApiClient|null}
 */
function clientFromEnv(env) {
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  if (!token || !env.REPO || env.DRY_RUN === 'true') return null;
  return createApi({ token });
}

/**
 * Whether today is the weekly forced run.
 *
 * @param {Date} now
 */
export const isForcedDay = (now) => now.getUTCDay() === FORCE_WEEKDAY;

/**
 * Guard mode: decide, report, and write the output the workflow reads.
 *
 * @param {{env: NodeJS.ProcessEnv, repoRoot: string, now?: Date, api?: ApiClient|null, log?: (line: string) => void}} input
 *   `api` replaces the client built from the environment; null forces a dry run.
 * @returns {Promise<{run: boolean, reason: string}>}
 */
export async function runGuard({ env, repoRoot, now = new Date(), api, log = console.log }) {
  const client = api === undefined ? clientFromEnv(env) : api;
  const openIssues = client ? (await listOpenIssues(client, env.REPO ?? '')).length : 0;
  const decision = decideGuard({
    force: env.FORCE === 'true' || isForcedDay(now),
    openIssues,
    changedFiles: changedFilesSince(repoRoot, WINDOW_HOURS),
    checks: CHECKS,
  });
  log(`Guard: run=${decision.run} (${decision.reason})`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `run=${decision.run}\n`);
  return decision;
}

/**
 * Run mode: every check, then its issue. A check that throws is recorded and
 * fails the run at the end, after the other checks have been reported.
 *
 * @param {{env: NodeJS.ProcessEnv, repoRoot: string, checks?: Check[], api?: ApiClient|null, log?: (line: string) => void}} input
 *   `api` replaces the client built from the environment; null forces a dry run.
 * @returns {Promise<{failed: number}>}
 */
export async function runChecks({
  env,
  repoRoot,
  checks = CHECKS,
  api: injected,
  log = console.log,
}) {
  const repo = env.REPO ?? '';
  const api = injected === undefined ? clientFromEnv(env) : injected;
  const openIssues = api ? await listOpenIssues(api, repo) : [];

  const results = [];
  for (const check of checks) {
    /** @type {string[]|null} */
    let findings = null;
    let error = null;
    let action = 'none';
    try {
      findings = check.run(repoRoot);
    } catch (err) {
      error = /** @type {Error} */ (err).message;
    }
    if (findings) {
      const existing = findExisting(openIssues, check.id);
      const plan = planIssue({ check, findings, existing });
      action = plan.action;
      if (api) await applyPlan(api, repo, plan, existing, env.RUN_URL ?? '');
      else log(`Dry run: ${plan.action} issue "${plan.title}"`);
    }
    log(
      error
        ? `${check.id}: could not verify: ${error}`
        : `${check.id}: ${findings?.length} finding(s), issue ${action}`,
    );
    results.push({ check, findings, error, action });
  }
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, renderSummary(results));
  return { failed: results.filter((r) => r.error).length };
}

async function main() {
  const repoRoot = resolve(import.meta.dirname, '../..');
  const mode = process.argv[2];
  if (mode === 'guard') {
    await runGuard({ env: process.env, repoRoot });
  } else if (mode === 'run') {
    const { failed } = await runChecks({ env: process.env, repoRoot });
    if (failed > 0) process.exitCode = 1;
  } else {
    console.error('Usage: morning-check.mjs guard|run');
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
