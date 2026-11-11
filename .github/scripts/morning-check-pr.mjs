/**
 * Opens the pull request for a morning check whose findings have a mechanical
 * fix, as the bot account whose token the workflow fetched from the secrets
 * manager (see morning-check.mjs and .github/workflows/morning-check.yml).
 *
 * Each check has one branch, `bot/<check id>`, and at most one open PR on it. A
 * run whose fixed tree equals the branch's changes nothing; one whose fix differs
 * adds a commit to the branch (a fast-forward, never a force-push) and edits the
 * PR in place. PRs on the older `bot/<check id>-<hash>` branches are closed as
 * superseded.
 *
 * The token is used for the push and the PR calls only. It reaches git through
 * environment variables, never the command line, where it would show in a
 * process list.
 */

import { execFileSync } from 'node:child_process';

/**
 * @typedef {import('./morning-check.mjs').Check} Check
 * @typedef {import('./morning-check.mjs').ApiClient} ApiClient
 * @typedef {{number: number, head: {ref: string}, labels?: {name: string}[], title?: string, body?: string}} PrRef
 * @typedef {{action: 'none'|'create'|'update'|'close', supersede: PrRef[]}} PrPlan
 */

/** The label on every issue and PR the morning check opens. */
export const LABEL = 'morning-check';

/** Prefix of the retired per-tree branches, `bot/<check id>-<hash>`. */
export const branchPrefix = (checkId) => `bot/${checkId}-`;

/**
 * The check's one branch. Pure.
 *
 * @param {string} checkId
 * @returns {string}
 */
export const branchFor = (checkId) => `bot/${checkId}`;

/**
 * What to do with the check's open bot PRs. `treeMatches` says whether the
 * branch already holds the fixed tree. Pure.
 *
 * @param {{branch: string, openPrs: PrRef[], findings: string[], treeMatches?: boolean}} input
 * @returns {PrPlan}
 */
export function planPr({ branch, openPrs, findings, treeMatches = false }) {
  if (findings.length === 0) {
    return { action: openPrs.length > 0 ? 'close' : 'none', supersede: openPrs };
  }
  const others = openPrs.filter((pr) => pr.head.ref !== branch);
  if (others.length === openPrs.length) return { action: 'create', supersede: openPrs };
  return { action: treeMatches ? 'none' : 'update', supersede: others };
}

/**
 * PR description for a fix, kept short: a bot PR is not a feature branch, so it
 * has the template's Summary and Testing notes and nothing else. The title is the
 * same every day, so what changed is here. Pure.
 *
 * @param {{check: Check, findings: string[], changed: string[]}} input
 *   `changed` lists the files the fix changed.
 * @returns {string}
 */
export function renderPrBody({ check, findings, changed }) {
  const fix = /** @type {import('./morning-check.mjs').PrFix} */ (check.prFix);
  return [
    '## Summary',
    '',
    `${fix.summary} Regenerated with \`${fix.fixCommand}\` (${changed.length} file(s) changed).`,
    ...(fix.details ? ['', fix.details(findings)] : []),
    '',
    '## Testing notes',
    '',
    `\`${fix.verifyCommand}\` reported ${findings.length} drifted file(s) before and none after.`,
  ].join('\n');
}

/**
 * The Basic credential git sends for a token. Pure.
 *
 * @param {string} token
 * @returns {string}
 */
export const basicAuth = (token) => Buffer.from(`x-access-token:${token}`).toString('base64');

/**
 * Environment variables that make git send the token with every github.com
 * request, in place of a credential helper or a URL that carries the token.
 * Pure.
 *
 * @param {string} token
 * @returns {Record<string, string>}
 */
export function gitAuthEnv(token) {
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basicAuth(token)}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

/**
 * Creates the label if it is missing, so it can be put on an issue or PR.
 *
 * @param {ApiClient} api
 * @param {string} repo
 */
export async function ensureLabel(api, repo) {
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
}

/**
 * Puts the label on an open PR.
 *
 * @param {ApiClient} api
 * @param {string} repo
 * @param {number} number
 */
async function labelPr(api, repo, number) {
  await ensureLabel(api, repo);
  await api.request('POST', `/repos/${repo}/issues/${number}/labels`, { labels: [LABEL] });
}

/**
 * @param {string} cwd
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function git(cwd, args, env = process.env) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();
}

/**
 * Open PRs for a check: those whose head branch carries its prefix.
 *
 * @param {ApiClient} botApi
 * @param {string} repo
 * @param {string} checkId
 * @returns {Promise<PrRef[]>}
 */
export async function listBotPrs(botApi, repo, checkId) {
  const prs = await botApi.paginate(`/repos/${repo}/pulls?state=open&per_page=100`);
  return prs.filter(
    (pr) => pr.head?.ref === branchFor(checkId) || pr.head?.ref?.startsWith(branchPrefix(checkId)),
  );
}

/**
 * @param {ApiClient} botApi
 * @param {string} repo
 * @param {PrRef} pr
 * @param {string} note
 */
async function closePr(botApi, repo, pr, note) {
  await botApi.request('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: note });
  await botApi.request('PATCH', `/repos/${repo}/pulls/${pr.number}`, { state: 'closed' });
}

/**
 * Closes the check's open bot PRs once its findings are gone.
 *
 * @param {{check: Check, repo: string, botApi: ApiClient, runUrl?: string}} input
 * @returns {Promise<number>} How many PRs were closed.
 */
export async function closeBotPrs({ check, repo, botApi, runUrl = '' }) {
  const openPrs = await listBotPrs(botApi, repo, check.id);
  const plan = planPr({ branch: '', openPrs, findings: [] });
  for (const pr of plan.supersede) {
    await closePr(
      botApi,
      repo,
      pr,
      `The check passes without this change${runUrl ? ` (${runUrl})` : ''}. Closing.`,
    );
  }
  return plan.supersede.length;
}

/**
 * Applies the check's fix, and opens a PR for it as the bot, or updates the one
 * already open on the check's branch. Throws, leaving nothing pushed, if the
 * working tree is not clean, the fix does not clear the check, or it changes
 * nothing. The working tree is put back as it was.
 *
 * @param {{check: Check, findings: string[], repoRoot: string, repo: string, botApi: ApiClient, token: string, remoteUrl?: string, runUrl?: string}} input
 * @returns {Promise<string>} What was done: `none`, `created #n`, `updated #n`, `retitled #n`, `labelled #n` or `closed n superseded`.
 */
export async function publishFix({
  check,
  findings,
  repoRoot,
  repo,
  botApi,
  token,
  remoteUrl = `https://github.com/${repo}.git`,
  runUrl = '',
}) {
  if (!check.prFix) throw new Error(`${check.id} has no prFix`);
  if (git(repoRoot, ['status', '--porcelain'])) {
    throw new Error('the working tree is not clean; refusing to build a fix on it');
  }
  const startRef =
    git(repoRoot, ['symbolic-ref', '-q', '--short', 'HEAD']) ||
    git(repoRoot, ['rev-parse', 'HEAD']);

  try {
    check.prFix.apply(repoRoot);
    const left = check.run(repoRoot);
    if (left.length > 0) {
      throw new Error(`${check.id}: the fix left ${left.length} finding(s), first: ${left[0]}`);
    }
    git(repoRoot, ['add', '-A']);
    if (!git(repoRoot, ['status', '--porcelain'])) {
      throw new Error(`${check.id}: the fix changed nothing`);
    }
    const changed = git(repoRoot, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
    const title = check.prFix.prTitle(findings);
    const body = renderPrBody({ check, findings, changed });

    const tree = git(repoRoot, ['write-tree']);
    const branch = branchFor(check.id);
    const openPrs = await listBotPrs(botApi, repo, check.id);
    const current = openPrs.find((pr) => pr.head.ref === branch);

    const me = (await botApi.request('GET', '/user')).data;
    const name = me.name || me.login;
    const email = `${me.id}+${me.login}@users.noreply.github.com`;
    const env = {
      ...process.env,
      ...gitAuthEnv(token),
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    };
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${basicAuth(token)}`);

    // The branch's own tip, if a PR is open on it: the new commit goes on top.
    let tip = '';
    if (current) {
      git(repoRoot, ['fetch', '-q', remoteUrl, `refs/heads/${branch}`], env);
      tip = git(repoRoot, ['rev-parse', 'FETCH_HEAD']);
    }
    const treeMatches = Boolean(tip) && git(repoRoot, ['rev-parse', `${tip}^{tree}`]) === tree;
    const plan = planPr({ branch, openPrs, findings, treeMatches });

    let created = null;
    if (plan.action === 'create' || plan.action === 'update') {
      const message = `${title}\n\nGenerated with \`${check.prFix.fixCommand}\`.`;
      const parent = tip || git(repoRoot, ['rev-parse', 'HEAD']);
      const commit = git(repoRoot, ['commit-tree', tree, '-p', parent, '-m', message], env);
      git(repoRoot, ['push', '-q', remoteUrl, `${commit}:refs/heads/${branch}`], env);
    }
    if (plan.action === 'create') {
      await ensureLabel(botApi, repo);
      const base = (await botApi.request('GET', `/repos/${repo}`)).data.default_branch;
      created = (
        await botApi.request('POST', `/repos/${repo}/pulls`, { title, head: branch, base, body })
      ).data;
      await labelPr(botApi, repo, created.number);
    }

    // An open PR whose text is stale (new fix, or the title scheme changed) is edited, not replaced.
    const retitle = current && (plan.action === 'update' || current.title !== title);
    if (current && retitle) {
      await botApi.request('PATCH', `/repos/${repo}/pulls/${current.number}`, { title, body });
    }

    // A PR opened before it was labelled, or without the label, gets it now.
    const relabel = current && !(current.labels ?? []).some((l) => l.name === LABEL);
    if (current && relabel) await labelPr(botApi, repo, current.number);

    const successor = created ?? current;
    for (const pr of plan.supersede) {
      await closePr(
        botApi,
        repo,
        pr,
        `Superseded${successor ? ` by #${successor.number}` : ''}${runUrl ? ` (${runUrl})` : ''}. Closing.`,
      );
    }
    if (created) return `created #${created.number}`;
    if (current && plan.action === 'update') return `updated #${current.number}`;
    if (current && retitle) return `retitled #${current.number}`;
    if (current && relabel) return `labelled #${current.number}`;
    return plan.supersede.length > 0 ? `closed ${plan.supersede.length} superseded` : 'none';
  } finally {
    git(repoRoot, ['checkout', '-q', '-f', startRef]);
    git(repoRoot, ['clean', '-fdq']);
  }
}
