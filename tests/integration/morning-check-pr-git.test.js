/**
 * Git-backed tests for publishFix in .github/scripts/morning-check-pr.mjs: it
 * pushes a branch to a real (local, bare) remote and calls a fake GitHub API.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/morning-check-pr.mjs'),
).href;
const { publishFix } = await import(SCRIPT);

const ID = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com' };

describe('publishFix — real git', () => {
  let root;
  let work;
  let remote;

  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...ID, GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' },
    }).trim();

  /** A check that is clean once `generated.txt` says `fixed`. */
  function makeCheck(overrides = {}) {
    return {
      id: 'demo',
      title: 'Demo drifted',
      fix: 'Run the demo fix.',
      paths: [],
      run: (repoRoot) => {
        const f = join(repoRoot, 'generated.txt');
        return existsSync(f) && readFileSync(f, 'utf8') === 'fixed'
          ? []
          : ['changed: generated.txt'];
      },
      prFix: {
        apply: (repoRoot) => writeFileSync(join(repoRoot, 'generated.txt'), 'fixed'),
        commitMessage: 'Refresh the demo',
        prTitle: 'Refresh the demo',
      },
      ...overrides,
    };
  }

  /** Fake GitHub: records writes, serves the given open PRs. */
  function makeApi(openPrs = []) {
    const calls = [];
    return {
      calls,
      paginate: async () => openPrs,
      request: async (method, path, body) => {
        calls.push({ method, path, body });
        if (method === 'GET' && path === '/user') {
          return { data: { login: 'helper-bot', id: 42, name: null } };
        }
        if (method === 'GET' && path === '/repos/o/r') return { data: { default_branch: 'main' } };
        if (method === 'POST' && path === '/repos/o/r/pulls') return { data: { number: 5 } };
        return { data: {} };
      },
    };
  }

  const publish = (api, extra = {}) =>
    publishFix({
      check: makeCheck(),
      findings: ['changed: generated.txt'],
      repoRoot: work,
      repo: 'o/r',
      botApi: api,
      token: 'bot-token',
      remoteUrl: remote,
      ...extra,
    });

  const remoteBranches = () =>
    git(root, 'ls-remote', '--heads', remote)
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split('refs/heads/')[1]);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'aif-pr-test-'));
    remote = join(root, 'remote.git');
    work = join(root, 'work');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main', work]);
    writeFileSync(join(work, 'README.md'), 'x');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'init');
    git(work, 'push', '-q', remote, 'main');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('pushes a hashed branch, opens the PR as the bot, and restores the tree', async () => {
    const api = makeApi();
    const result = await publish(api);

    assert.equal(result, 'created #5');
    const branches = remoteBranches();
    const botBranch = branches.find((b) => b.startsWith('bot/demo-'));
    assert.ok(botBranch, `expected a bot/demo-* branch, got ${branches}`);

    const pull = api.calls.find((c) => c.path === '/repos/o/r/pulls');
    assert.equal(pull.body.head, botBranch);
    assert.equal(pull.body.base, 'main');
    assert.equal(pull.body.title, 'Refresh the demo');
    assert.ok(pull.body.body.includes('changed: generated.txt'));

    // The commit carries the bot's identity and the fix, and nothing else.
    const author = git(root, '--git-dir', remote, 'log', '-1', '--format=%an <%ae>', botBranch);
    assert.equal(author, 'helper-bot <42+helper-bot@users.noreply.github.com>');
    assert.equal(
      git(root, '--git-dir', remote, 'show', '--name-only', '--format=', botBranch),
      'generated.txt',
    );

    // The working tree is back on main and clean.
    assert.equal(git(work, 'symbolic-ref', '--short', 'HEAD'), 'main');
    assert.equal(git(work, 'status', '--porcelain'), '');
    assert.equal(existsSync(join(work, 'generated.txt')), false);
  });

  it('does nothing when a PR is already open for the same result', async () => {
    const first = makeApi();
    await publish(first);
    const botBranch = remoteBranches().find((b) => b.startsWith('bot/demo-'));

    const second = makeApi([{ number: 5, head: { ref: botBranch } }]);
    assert.equal(await publish(second), 'none');
    assert.equal(second.calls.filter((c) => c.method !== 'GET').length, 0);
    assert.equal(remoteBranches().filter((b) => b.startsWith('bot/demo-')).length, 1);
  });

  it('opens a new PR and closes the old one when the fix differs', async () => {
    const api = makeApi([{ number: 3, head: { ref: 'bot/demo-0000000000' } }]);
    assert.equal(await publish(api), 'created #5');

    const comment = api.calls.find((c) => c.path === '/repos/o/r/issues/3/comments');
    assert.match(comment.body.body, /Superseded by #5/);
    assert.ok(api.calls.some((c) => c.path === '/repos/o/r/pulls/3' && c.body.state === 'closed'));
  });

  it('refuses a dirty working tree and pushes nothing', async () => {
    writeFileSync(join(work, 'stray.txt'), 'x');
    const api = makeApi();
    await assert.rejects(() => publish(api), /not clean/);
    assert.deepEqual(remoteBranches(), ['main']);
    assert.equal(api.calls.length, 0);
  });

  it('throws, pushes nothing and restores the tree when the fix leaves findings', async () => {
    const check = makeCheck({
      prFix: { apply: () => {}, commitMessage: 'm', prTitle: 't' },
    });
    const api = makeApi();
    await assert.rejects(() => publish(api, { check }), /left 1 finding/);
    assert.deepEqual(remoteBranches(), ['main']);
    assert.equal(git(work, 'status', '--porcelain'), '');
  });

  it('throws when the fix changes nothing', async () => {
    writeFileSync(join(work, 'generated.txt'), 'fixed');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'already fixed');
    // The check reports a finding by caller input, but applying the fix is a no-op.
    const api = makeApi();
    await assert.rejects(() => publish(api), /changed nothing/);
    assert.deepEqual(remoteBranches(), ['main']);
  });
});
