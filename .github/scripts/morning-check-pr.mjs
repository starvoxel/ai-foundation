/**
 * Opens the pull request for a morning check whose findings have a mechanical
 * fix, as the bot account whose token the workflow fetched from the secrets
 * manager (see morning-check.mjs and .github/workflows/morning-check.yml).
 *
 * The branch name carries a hash of the fixed tree, so the same findings always
 * map to the same branch: a run that finds an open PR for that branch changes
 * nothing, and a run whose fix differs opens a new PR and closes the old one as
 * superseded. Branches are only ever created, never force-pushed.
 *
 * The token is used for the push and the PR calls only. It reaches git through
 * environment variables, never the command line, where it would show in a
 * process list.
 */

import { execFileSync } from 'node:child_process';

/**
 * @typedef {import('./morning-check.mjs').Check} Check
 * @typedef {import('./morning-check.mjs').ApiClient} ApiClient
 * @typedef {{number: number, head: {ref: string}}} PrRef
 * @typedef {{action: 'none'|'create'|'close', supersede: PrRef[]}} PrPlan
 */

/** @param {string} checkId */
export const branchPrefix = (checkId) => `bot/${checkId}-`;

/**
 * The branch for a fix, from the hash of the tree it produces. Pure.
 *
 * @param {string} checkId
 * @param {string} tree  The git tree hash of the fixed working tree.
 * @returns {string}
 */
export const branchFor = (checkId, tree) => `${branchPrefix(checkId)}${tree.slice(0, 10)}`;

/**
 * What to do with the check's open bot PRs. Pure.
 *
 * @param {{branch: string, openPrs: PrRef[], findings: string[]}} input
 * @returns {PrPlan}
 */
export function planPr({ branch, openPrs, findings }) {
  if (findings.length === 0) {
    return { action: openPrs.length > 0 ? 'close' : 'none', supersede: openPrs };
  }
  const others = openPrs.filter((pr) => pr.head.ref !== branch);
  if (others.length < openPrs.length) return { action: 'none', supersede: others };
  return { action: 'create', supersede: openPrs };
}

/**
 * PR description for a fix, kept short: a bot PR is not a feature branch, so it
 * has the template's Summary and Testing notes and nothing else. Pure.
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
  return prs.filter((pr) => pr.head?.ref?.startsWith(branchPrefix(checkId)));
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
 * Applies the check's fix, and opens a PR for it as the bot unless one is
 * already open for the same result. Throws, leaving nothing pushed, if the
 * working tree is not clean, the fix does not clear the check, or it changes
 * nothing. The working tree is put back as it was.
 *
 * @param {{check: Check, findings: string[], repoRoot: string, repo: string, botApi: ApiClient, token: string, remoteUrl?: string, runUrl?: string}} input
 * @returns {Promise<string>} What was done: `none`, `created #n` or `closed n superseded`.
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

    const branch = branchFor(check.id, git(repoRoot, ['write-tree']));
    const plan = planPr({
      branch,
      openPrs: await listBotPrs(botApi, repo, check.id),
      findings,
    });

    let created = null;
    if (plan.action === 'create') {
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

      git(repoRoot, ['checkout', '-q', '-b', branch]);
      const message = `${title}\n\nGenerated with \`${check.prFix.fixCommand}\`.`;
      git(repoRoot, ['commit', '-q', '-m', message], env);
      git(repoRoot, ['push', '-q', remoteUrl, `HEAD:refs/heads/${branch}`], env);
      const base = (await botApi.request('GET', `/repos/${repo}`)).data.default_branch;
      created = (
        await botApi.request('POST', `/repos/${repo}/pulls`, {
          title,
          head: branch,
          base,
          body: renderPrBody({ check, findings, changed }),
        })
      ).data;
    }

    for (const pr of plan.supersede) {
      await closePr(
        botApi,
        repo,
        pr,
        `Superseded${created ? ` by #${created.number}` : ''}${runUrl ? ` (${runUrl})` : ''}. Closing.`,
      );
    }
    if (created) return `created #${created.number}`;
    return plan.supersede.length > 0 ? `closed ${plan.supersede.length} superseded` : 'none';
  } finally {
    git(repoRoot, ['checkout', '-q', '-f', startRef]);
    git(repoRoot, ['clean', '-fdq']);
  }
}
