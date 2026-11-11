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
        prTitle: () => 'Refresh the demo',
        summary: 'The demo file is out of date.',
        fixCommand: 'demo --fix',
        verifyCommand: 'demo --check',
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

  it("pushes the check's branch, opens the PR as the bot, and restores the tree", async () => {
    const api = makeApi();
    const result = await publish(api);

    assert.equal(result, 'created #5');
    const branches = remoteBranches();
    const botBranch = 'bot/demo';
    assert.ok(branches.includes(botBranch), `expected bot/demo, got ${branches}`);

    // The label exists before the PR does, and is put on the PR afterwards.
    const order = api.calls.map((c) => `${c.method} ${c.path}`);
    const at = (entry) => order.indexOf(entry);
    assert.ok(at('POST /repos/o/r/labels') >= 0);
    assert.ok(at('POST /repos/o/r/labels') < at('POST /repos/o/r/pulls'));
    assert.ok(at('POST /repos/o/r/pulls') < at('POST /repos/o/r/issues/5/labels'));
    const labelCall = api.calls.find((c) => c.path === '/repos/o/r/issues/5/labels');
    assert.deepEqual(labelCall.body, { labels: ['morning-check'] });

    const pull = api.calls.find((c) => c.path === '/repos/o/r/pulls');
    assert.equal(pull.body.head, botBranch);
    assert.equal(pull.body.base, 'main');
    assert.equal(pull.body.title, 'Refresh the demo');
    assert.match(
      pull.body.body,
      /^## Summary\n\nThe demo file is out of date\. Regenerated with `demo --fix`/,
    );
    assert.ok(pull.body.body.includes('reported 1 drifted file(s) before and none after'));
    const subject = git(root, '--git-dir', remote, 'log', '-1', '--format=%s', botBranch);
    assert.equal(subject, 'Refresh the demo');
    const bodyText = git(root, '--git-dir', remote, 'log', '-1', '--format=%b', botBranch);
    assert.match(bodyText, /Generated with `demo --fix`\./);

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
    const botBranch = 'bot/demo';

    const second = makeApi([
      {
        number: 5,
        head: { ref: botBranch },
        labels: [{ name: 'morning-check' }],
        title: 'Refresh the demo',
      },
    ]);
    assert.equal(await publish(second), 'none');
    assert.equal(second.calls.filter((c) => c.method !== 'GET').length, 0);
    assert.equal(remoteBranches().filter((b) => b.startsWith('bot/demo')).length, 1);
  });

  it('labels an open PR for the same result that is missing the label', async () => {
    await publish(makeApi());
    const botBranch = 'bot/demo';

    const api = makeApi([
      { number: 5, head: { ref: botBranch }, labels: [], title: 'Refresh the demo' },
    ]);
    assert.equal(await publish(api), 'labelled #5');
    const writes = api.calls.filter((c) => c.method !== 'GET').map((c) => c.path);
    assert.deepEqual(writes, ['/repos/o/r/labels', '/repos/o/r/issues/5/labels']);
    assert.equal(remoteBranches().filter((b) => b.startsWith('bot/demo')).length, 1);
  });

  it('closes a retired hashed-branch PR and opens one on the stable branch', async () => {
    const api = makeApi([{ number: 3, head: { ref: 'bot/demo-0000000000' } }]);
    assert.equal(await publish(api), 'created #5');

    const comment = api.calls.find((c) => c.path === '/repos/o/r/issues/3/comments');
    assert.match(comment.body.body, /Superseded by #5/);
    assert.ok(api.calls.some((c) => c.path === '/repos/o/r/pulls/3' && c.body.state === 'closed'));
  });

  it('adds a commit to the open PR and edits it when the fix differs', async () => {
    await publish(makeApi());
    const firstTip = git(root, '--git-dir', remote, 'rev-parse', 'bot/demo');

    // A later run whose fix writes different content.
    const check = makeCheck({
      run: (repoRoot) => {
        const f = join(repoRoot, 'generated.txt');
        return existsSync(f) && readFileSync(f, 'utf8') === 'fixed v2' ? [] : ['changed: x'];
      },
      prFix: {
        apply: (repoRoot) => writeFileSync(join(repoRoot, 'generated.txt'), 'fixed v2'),
        prTitle: () => 'Refresh the demo',
        summary: 'The demo file is out of date.',
        fixCommand: 'demo --fix',
        verifyCommand: 'demo --check',
      },
    });
    const api = makeApi([
      { number: 5, head: { ref: 'bot/demo' }, labels: [{ name: 'morning-check' }], title: 'old' },
    ]);
    assert.equal(await publish(api, { check }), 'updated #5');

    const parents = git(root, '--git-dir', remote, 'rev-list', '--parents', '-n1', 'bot/demo');
    assert.ok(parents.includes(firstTip), 'the new commit sits on the old tip');
    assert.equal(git(root, '--git-dir', remote, 'show', 'bot/demo:generated.txt'), 'fixed v2');
    assert.ok(!api.calls.some((c) => c.method === 'POST' && c.path === '/repos/o/r/pulls'));
    const edit = api.calls.find((c) => c.method === 'PATCH' && c.path === '/repos/o/r/pulls/5');
    assert.equal(edit.body.title, 'Refresh the demo');
    assert.ok(!api.calls.some((c) => c.body?.state === 'closed'));
  });

  it('retitles an open PR for the same result whose title differs', async () => {
    await publish(makeApi());
    const api = makeApi([
      {
        number: 5,
        head: { ref: 'bot/demo' },
        labels: [{ name: 'morning-check' }],
        title: '[CI] x',
      },
    ]);
    assert.equal(await publish(api), 'retitled #5');
    assert.equal(
      api.calls.filter((c) => c.method === 'PATCH' && c.path === '/repos/o/r/pulls/5').length,
      1,
    );
    assert.equal(git(root, '--git-dir', remote, 'rev-list', '--count', 'bot/demo'), '2');
  });

  it('builds on a leftover branch when its PR has ended', async () => {
    await publish(makeApi());
    const api = makeApi([]);
    assert.equal(await publish(api), 'created #5');
    assert.equal(git(root, '--git-dir', remote, 'rev-list', '--count', 'bot/demo'), '3');
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
      prFix: {
        apply: () => {},
        prTitle: () => 't',
        summary: 's',
        fixCommand: 'f',
        verifyCommand: 'v',
      },
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
