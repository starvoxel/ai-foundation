// ------------------------------
// merge-bot.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Tests for .github/scripts/merge.mjs: the dry-run wrapper, with the GitHub API replaced by a fake
 * that records every call.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(resolve(import.meta.dirname, '../../.github/scripts/merge.mjs')).href;
const { createApi, paginate, run } = await import(SCRIPT);

const REPO = 'o/r';
const b64 = (/** @type {string} */ text) => Buffer.from(text).toString('base64');

/** A fake API over a table of canned responses keyed by `METHOD path`; records every call. */
function fakeApi(overrides = {}) {
  const calls = [];
  const responses = {
    'GET /repos/o/r/collaborators/jo/permission': { permission: 'write' },
    'GET /repos/o/r/pulls/7': {
      state: 'open',
      draft: false,
      mergeable: true,
      head: { sha: 'abc', ref: 'feat/x', repo: { full_name: REPO } },
      base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
      user: { login: 'jo' },
      labels: [{ name: 'bump:patch' }],
    },
    'GET /repos/o/r/pulls/7/files?per_page=100&page=1': [{ filename: 'lib/x.js' }],
    'GET /repos/o/r/commits/abc/check-runs?per_page=100&page=1': {
      check_runs: [{ name: 'Validate', status: 'completed', conclusion: 'success' }],
    },
    'GET /repos/o/r/rules/branches/main': [
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'Validate' }] },
      },
    ],
    'GET /repos/o/r/compare/main...abc': { merge_base_commit: { sha: 'base' }, behind_by: 2 },
    'GET /repos/o/r/contents/package.json?ref=main': {
      sha: 'mainblob',
      content: b64('{"version":"0.5.4"}'),
    },
    'GET /repos/o/r/contents/package.json?ref=base': { content: b64('{"version":"0.5.2"}') },
    'GET /repos/o/r/contents/package.json?ref=abc': { content: b64('{"version":"0.5.2"}') },
    'POST /repos/o/r/issues/7/comments': {},
    ...overrides,
  };
  const counts = {};
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (!(key in responses)) throw new Error(`unexpected call ${key}`);
    counts[key] = (counts[key] ?? 0) + 1;
    const value = responses[key];
    const result = typeof value === 'function' ? value(counts[key]) : value;
    if (result instanceof Error) throw result;
    return result;
  };
  return { api, calls };
}

const env = (overrides = {}) => ({
  GITHUB_REPOSITORY: REPO,
  PR_NUMBER: '7',
  COMMENT_BODY: '/merge',
  COMMENTER_LOGIN: 'jo',
  COMMENTER_TYPE: 'User',
  DRY_RUN: 'true',
  ...overrides,
});

const posted = (calls) => calls.filter((call) => call.method === 'POST');
const mutations = (calls) => calls.filter((call) => !['GET', 'POST'].includes(call.method));
const quiet = () => {};

describe('run', () => {
  it('ignores prose that only mentions /merge, without any API call', async () => {
    for (const COMMENT_BODY of ['please /merge', '/merged', 'looks good']) {
      const { api, calls } = fakeApi();
      const result = await run({ env: env({ COMMENT_BODY }), api, log: quiet });
      assert.equal(result, 'ignored');
      assert.deepEqual(calls, []);
    }
  });

  it('answers an unsupported command from a writer once, without reading the PR', async () => {
    const { api, calls } = fakeApi();
    const result = await run({ env: env({ COMMENT_BODY: '/merge now' }), api, log: quiet });
    assert.equal(result, 'unsupported');
    assert.equal(posted(calls).length, 1);
    assert.equal(posted(calls)[0].body.body, 'Unsupported command. Comment exactly `/merge`.');
    assert.doesNotMatch(posted(calls)[0].body.body, /now/);
    assert.deepEqual(mutations(calls), []);
    assert.ok(!calls.some((call) => call.path.startsWith('/repos/o/r/pulls/')));
  });

  it('stays silent on an unsupported command from someone without write access', async () => {
    const { api, calls } = fakeApi({
      'GET /repos/o/r/collaborators/jo/permission': { permission: 'read' },
    });
    const result = await run({ env: env({ COMMENT_BODY: '/merge now' }), api, log: quiet });
    assert.equal(result, 'ignored');
    assert.deepEqual(posted(calls), []);
  });

  it('never replies to a bot, whatever it says, and makes no API call', async () => {
    for (const overrides of [
      { COMMENTER_LOGIN: 'github-actions[bot]', COMMENTER_TYPE: 'Bot' },
      { COMMENTER_LOGIN: 'some-app[bot]', COMMENTER_TYPE: 'User' },
    ]) {
      for (const COMMENT_BODY of ['/merge', '/merge now']) {
        const { api, calls } = fakeApi();
        const result = await run({ env: env({ ...overrides, COMMENT_BODY }), api, log: quiet });
        assert.equal(result, 'ignored');
        assert.deepEqual(calls, []);
      }
    }
  });

  it('reports what it would merge and never writes anything but the comment', async () => {
    const { api, calls } = fakeApi();
    const result = await run({ env: env(), api, log: quiet });
    assert.equal(result, 'would-merge');
    assert.deepEqual(mutations(calls), []);
    assert.equal(posted(calls).length, 1);
    const body = posted(calls)[0].body.body;
    assert.equal(
      body,
      '**Dry run: would merge**\nVersion would be bumped from v0.5.4 -> v0.5.5\n`main` would be merged to branch',
    );
  });

  it('refuses a commenter without write access and does not read the PR', async () => {
    const { api, calls } = fakeApi({
      'GET /repos/o/r/collaborators/jo/permission': { permission: 'read' },
    });
    const result = await run({ env: env(), api, log: quiet });
    assert.equal(result, 'refused');
    assert.match(posted(calls)[0].body.body, /You need write access to merge this PR\./);
    assert.ok(!calls.some((call) => call.path.startsWith('/repos/o/r/pulls/')));
  });

  it('refuses a draft PR with a pending check, listing both reasons', async () => {
    const { api, calls } = fakeApi({
      'GET /repos/o/r/pulls/7': {
        state: 'open',
        draft: true,
        mergeable: true,
        head: { sha: 'abc', repo: { full_name: REPO } },
        base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
        user: { login: 'jo' },
        labels: [{ name: 'bump:patch' }],
      },
      'GET /repos/o/r/commits/abc/check-runs?per_page=100&page=1': {
        check_runs: [{ name: 'Validate', status: 'in_progress', conclusion: null }],
      },
    });
    const result = await run({ env: env(), api, log: quiet });
    assert.equal(result, 'refused');
    const body = posted(calls)[0].body.body;
    assert.match(body, /is a draft/);
    assert.match(body, /Not all checks have finished\. Try again once all are done\./);
  });

  it('refuses when the required checks cannot be determined', async () => {
    const { api, calls } = fakeApi({ 'GET /repos/o/r/rules/branches/main': [] });
    assert.equal(await run({ env: env(), api, log: quiet }), 'refused');
    assert.match(posted(calls)[0].body.body, /Could not read the required checks\./);
  });

  it('rejects a bad repository or PR number', async () => {
    const { api } = fakeApi();
    await assert.rejects(
      run({ env: env({ GITHUB_REPOSITORY: 'nope' }), api, log: quiet }),
      /Bad repository/,
    );
    await assert.rejects(run({ env: env({ PR_NUMBER: 'x' }), api, log: quiet }), /Bad repository/);
  });

  it('retries while mergeable is still being computed', async () => {
    let pulls = 0;
    const { api: inner, calls } = fakeApi();
    const api = async (method, path, body) => {
      if (method === 'GET' && path === '/repos/o/r/pulls/7') {
        pulls += 1;
        const pull = await inner(method, path, body);
        return pulls < 3 ? { ...pull, mergeable: null } : pull;
      }
      return inner(method, path, body);
    };
    const sleeps = [];
    const result = await run({ env: env(), api, log: quiet, sleep: async (ms) => sleeps.push(ms) });
    assert.equal(result, 'would-merge');
    assert.equal(pulls, 3);
    assert.equal(sleeps.length, 2);
    assert.equal(posted(calls).length, 1);
  });

  it('propagates an API failure without posting a comment', async () => {
    const { api, calls } = fakeApi({ 'GET /repos/o/r/rules/branches/main': new Error('boom') });
    await assert.rejects(run({ env: env(), api, log: quiet }), /boom/);
    assert.deepEqual(posted(calls), []);
  });
});

describe('paginate', () => {
  it('collects every page until a short one', async () => {
    const pages = { 1: Array(100).fill('a'), 2: Array(100).fill('b'), 3: ['c'] };
    const seen = [];
    const api = async (_method, path) => {
      const page = Number(/[?&]page=(\d+)/.exec(path)[1]);
      seen.push(path);
      return pages[page];
    };
    const items = await paginate(api, '/x');
    assert.equal(items.length, 201);
    assert.equal(seen[0], '/x?per_page=100&page=1');
  });

  it('reads the list from the named key and appends to an existing query', async () => {
    const api = async (_method, path) => {
      assert.equal(path, '/x?a=1&per_page=100&page=1');
      return { check_runs: [1, 2] };
    };
    assert.deepEqual(await paginate(api, '/x?a=1', 'check_runs'), [1, 2]);
  });

  it('returns an empty list for an empty or missing response', async () => {
    assert.deepEqual(await paginate(async () => ({}), '/x', 'check_runs'), []);
    assert.deepEqual(await paginate(async () => null, '/x'), []);
  });
});

/** An error shaped like the API wrapper's, with an HTTP status. */
const httpError = (status, detail) =>
  Object.assign(new Error(`HTTP ${status}`), { status, detail });

/** The extra endpoints the live path calls, for a PR that is behind main and has no lock file. */
function liveResponses(overrides = {}) {
  return {
    'GET /repos/o/r/git/blobs/mainblob': { content: b64('{"version":"0.5.4"}') },
    'POST /repos/o/r/merges': { sha: 'upd1', parents: [{ sha: 'abc' }, { sha: 'maintip' }] },
    'GET /repos/o/r/contents/package.json?ref=upd1': {
      sha: 'headblob',
      content: b64('{"name":"x","version":"0.5.2"}'),
    },
    'GET /repos/o/r/git/blobs/headblob': { content: b64('{"name":"x","version":"0.5.2"}\n') },
    'GET /repos/o/r/contents/package-lock.json?ref=upd1': httpError(404),
    'GET /repos/o/r/git/commits/upd1': { tree: { sha: 'tree0' } },
    'POST /repos/o/r/git/blobs': { sha: 'newblob' },
    'POST /repos/o/r/git/trees': { sha: 'tree1' },
    'POST /repos/o/r/git/commits': { sha: 'commit1' },
    'PATCH /repos/o/r/git/refs/heads/feat/x': {},
    'PUT /repos/o/r/pulls/7/merge': { merged: true },
    ...overrides,
  };
}

const liveEnv = (overrides = {}) => env({ DRY_RUN: 'false', ...overrides });
const names = (calls) => calls.map((call) => `${call.method} ${call.path}`);
const idx = (calls, key) => names(calls).indexOf(key);

describe('run, live', () => {
  it('rejects a DRY_RUN that is neither true nor false', async () => {
    const { api, calls } = fakeApi();
    await assert.rejects(
      run({ env: env({ DRY_RUN: 'maybe' }), api, log: quiet }),
      /DRY_RUN must be/,
    );
    assert.deepEqual(calls, []);
  });

  it('updates the branch, commits the version on top, then merges, in that order', async () => {
    const { api, calls } = fakeApi(liveResponses());
    const result = await run({ env: liveEnv(), api, log: quiet });
    assert.equal(result, 'merged');

    const update = calls.find((call) => call.path === '/repos/o/r/merges');
    assert.deepEqual(update.body, {
      base: 'feat/x',
      head: 'main',
      commit_message: 'Merge main into feat/x [skip ci]',
    });
    const commit = calls.find((call) => call.path === '/repos/o/r/git/commits');
    assert.deepEqual(commit.body.parents, ['upd1']);
    assert.equal(commit.body.message, 'Set the version to 0.5.5 [skip ci]');
    const ref = calls.find((call) => call.method === 'PATCH');
    assert.deepEqual(ref.body, { sha: 'commit1', force: false });
    const merge = calls.find((call) => call.method === 'PUT');
    assert.deepEqual(merge.body, { sha: 'commit1', merge_method: 'merge' });

    assert.ok(idx(calls, 'POST /repos/o/r/merges') < idx(calls, 'POST /repos/o/r/git/commits'));
    assert.ok(
      idx(calls, 'PATCH /repos/o/r/git/refs/heads/feat/x') <
        idx(calls, 'PUT /repos/o/r/pulls/7/merge'),
    );
    const audit = posted(calls).at(-1).body.body;
    assert.equal(
      audit,
      '**Merge successful**\nVersion bumped from v0.5.4 -> v0.5.5\n`main` merged to branch',
    );
  });

  it('writes only the version into package.json, nothing else', async () => {
    const { api, calls } = fakeApi(liveResponses());
    await run({ env: liveEnv(), api, log: quiet });
    const blob = calls.find((call) => call.method === 'POST' && call.path.endsWith('/git/blobs'));
    assert.deepEqual(JSON.parse(blob.body.content), { name: 'x', version: '0.5.5' });
    const tree = calls.find((call) => call.path.endsWith('/git/trees'));
    assert.equal(tree.body.base_tree, 'tree0');
    assert.deepEqual(
      tree.body.tree.map((entry) => entry.path),
      ['package.json'],
    );
  });

  it('rewrites the lock file too when there is one', async () => {
    const lock = '{"name":"x","version":"0.5.2","packages":{"":{"name":"x","version":"0.5.2"}}}\n';
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/contents/package-lock.json?ref=upd1': { sha: 'lockblob', content: '' },
        'GET /repos/o/r/git/blobs/lockblob': { content: b64(lock) },
      }),
    );
    await run({ env: liveEnv(), api, log: quiet });
    const tree = calls.find((call) => call.path.endsWith('/git/trees'));
    assert.deepEqual(
      tree.body.tree.map((entry) => entry.path),
      ['package.json', 'package-lock.json'],
    );
    const written = calls
      .filter((call) => call.method === 'POST' && call.path.endsWith('/git/blobs'))
      .map((call) => JSON.parse(call.body.content));
    assert.equal(written[1].packages[''].version, '0.5.5');
    assert.equal(written[1].version, '0.5.5');
  });

  it('assigns the version against main as it is now, not as the gate saw it', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/git/blobs/mainblob': { content: b64('{"version":"0.5.9"}') },
      }),
    );
    await run({ env: liveEnv(), api, log: quiet });
    const commit = calls.find((call) => call.path === '/repos/o/r/git/commits');
    assert.equal(commit.body.message, 'Set the version to 0.5.10 [skip ci]');
  });

  it('skips the branch update when the PR is already up to date', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/compare/main...abc': { merge_base_commit: { sha: 'base' }, behind_by: 0 },
        'GET /repos/o/r/contents/package.json?ref=abc': {
          sha: 'headblob',
          content: b64('{"name":"x","version":"0.5.2"}'),
        },
        'GET /repos/o/r/contents/package-lock.json?ref=abc': httpError(404),
        'GET /repos/o/r/git/commits/abc': { tree: { sha: 'tree0' } },
      }),
    );
    await run({ env: liveEnv(), api, log: quiet });
    assert.ok(!names(calls).includes('POST /repos/o/r/merges'));
    assert.deepEqual(calls.find((call) => call.path.endsWith('/git/commits')).body.parents, [
      'abc',
    ]);
    assert.equal(
      posted(calls).at(-1).body.body,
      '**Merge successful**\nVersion bumped from v0.5.4 -> v0.5.5',
    );
  });

  it('does not claim a branch update when GitHub had nothing to merge', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'POST /repos/o/r/merges': null,
        'GET /repos/o/r/contents/package.json?ref=abc': {
          sha: 'headblob',
          content: b64('{"name":"x","version":"0.5.2"}'),
        },
        'GET /repos/o/r/contents/package-lock.json?ref=abc': httpError(404),
        'GET /repos/o/r/git/commits/abc': { tree: { sha: 'tree0' } },
      }),
    );
    await run({ env: liveEnv(), api, log: quiet });
    assert.deepEqual(calls.find((call) => call.path.endsWith('/git/commits')).body.parents, [
      'abc',
    ]);
    assert.equal(
      posted(calls).at(-1).body.body,
      '**Merge successful**\nVersion bumped from v0.5.4 -> v0.5.5',
    );
  });

  it('merges without any commit when nothing shipped changed', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/pulls/7/files?per_page=100&page=1': [{ filename: 'docs/x.md' }],
        'GET /repos/o/r/compare/main...abc': { merge_base_commit: { sha: 'base' }, behind_by: 0 },
      }),
    );
    const result = await run({ env: liveEnv(), api, log: quiet });
    assert.equal(result, 'merged');
    assert.ok(!names(calls).includes('POST /repos/o/r/git/commits'));
    assert.deepEqual(calls.find((call) => call.method === 'PUT').body, {
      sha: 'abc',
      merge_method: 'merge',
    });
    assert.equal(posted(calls).at(-1).body.body, '**Merge successful**\nNo version change');
  });

  it('still refuses on the gate before touching anything', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/commits/abc/check-runs?per_page=100&page=1': {
          check_runs: [{ name: 'Validate', status: 'completed', conclusion: 'failure' }],
        },
      }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.deepEqual(mutations(calls), []);
    assert.equal(posted(calls).length, 1);
    assert.match(posted(calls)[0].body.body, /A required check failed\. Fix it and try again\./);
  });

  it('refuses, changing nothing, when the head moved after the checks were read', async () => {
    const first = {
      state: 'open',
      draft: false,
      mergeable: true,
      head: { sha: 'abc', ref: 'feat/x', repo: { full_name: REPO } },
      base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
      user: { login: 'jo' },
      labels: [{ name: 'bump:patch' }],
    };
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/pulls/7': (n) =>
          n === 1 ? first : { ...first, head: { ...first.head, sha: 'sneaky' } },
      }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.deepEqual(mutations(calls), []);
    assert.ok(!names(calls).includes('POST /repos/o/r/merges'));
    assert.match(posted(calls).at(-1).body.body, /The branch changed while merging\. Try again\./);
  });

  it('refuses when merging main into the branch conflicts, and stops there', async () => {
    const { api, calls } = fakeApi(liveResponses({ 'POST /repos/o/r/merges': httpError(409) }));
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.ok(!names(calls).includes('POST /repos/o/r/git/commits'));
    assert.deepEqual(mutations(calls), []);
    assert.match(
      posted(calls).at(-1).body.body,
      /^\*\*Merge failed\*\*\nMerging `main` into the branch conflicts\./,
    );
  });

  it('fails without merging when the branch moved during the update', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'POST /repos/o/r/merges': { sha: 'upd1', parents: [{ sha: 'sneaky' }, { sha: 'maintip' }] },
      }),
    );
    await assert.rejects(run({ env: liveEnv(), api, log: quiet }), /branch moved/);
    assert.ok(!names(calls).includes('PUT /repos/o/r/pulls/7/merge'));
    assert.match(posted(calls).at(-1).body.body, /^\*\*Merge failed\*\*\nError: The branch moved/);
  });

  it('fails without moving the branch when package.json is not a JSON object', async () => {
    const { api, calls } = fakeApi(
      liveResponses({ 'GET /repos/o/r/git/blobs/headblob': { content: b64('[]') } }),
    );
    await assert.rejects(run({ env: liveEnv(), api, log: quiet }), /not a JSON object/);
    assert.ok(!names(calls).some((name) => name.startsWith('PATCH')));
    assert.ok(!names(calls).includes('PUT /repos/o/r/pulls/7/merge'));
  });

  it('reports a merge that is refused every time, after retrying, with the recovery hint', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'PUT /repos/o/r/pulls/7/merge': httpError(405, 'Pull Request is not mergeable'),
      }),
    );
    const sleeps = [];
    await assert.rejects(
      run({ env: liveEnv(), api, log: quiet, sleep: async (ms) => sleeps.push(ms) }),
      /HTTP 405/,
    );
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 3);
    assert.deepEqual(sleeps, [3000, 3000]);
    const failure = posted(calls).at(-1).body.body;
    assert.equal(
      failure,
      '**Merge failed**\nError 405: Pull Request is not mergeable\nTry again. If the branch was just updated, push a commit so the checks run on it.',
    );
  });

  it('does not retry an error other than 405', async () => {
    const { api, calls } = fakeApi(
      liveResponses({ 'PUT /repos/o/r/pulls/7/merge': httpError(409) }),
    );
    const sleeps = [];
    await assert.rejects(
      run({ env: liveEnv(), api, log: quiet, sleep: async (ms) => sleeps.push(ms) }),
      /HTTP 409/,
    );
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
    assert.deepEqual(sleeps, []);
  });

  it('merges when a 405 clears on a retry', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'PUT /repos/o/r/pulls/7/merge': (n) => (n < 3 ? httpError(405) : { merged: true }),
      }),
    );
    const result = await run({ env: liveEnv(), api, log: quiet, sleep: async () => {} });
    assert.equal(result, 'merged');
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 3);
    assert.match(posted(calls).at(-1).body.body, /^\*\*Merge successful\*\*/);
  });

  it('waits for GitHub to compute mergeability before merging', async () => {
    const ready = {
      state: 'open',
      draft: false,
      mergeable: true,
      head: { sha: 'abc', ref: 'feat/x', repo: { full_name: REPO } },
      base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
      user: { login: 'jo' },
      labels: [{ name: 'bump:patch' }],
    };
    // Reads 1 (gate) and 2 (head check) are normal; the next two come back still computing.
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/pulls/7': (n) =>
          n === 3 || n === 4 ? { ...ready, mergeable: null } : ready,
      }),
    );
    const sleeps = [];
    const result = await run({
      env: liveEnv(),
      api,
      log: quiet,
      sleep: async (ms) => sleeps.push(ms),
    });
    assert.equal(result, 'merged');
    assert.deepEqual(sleeps, [2000, 2000]);
    const reads = names(calls).filter((name) => name === 'GET /repos/o/r/pulls/7').length;
    assert.equal(reads, 5);
    assert.ok(
      idx(calls, 'PUT /repos/o/r/pulls/7/merge') >
        idx(calls, 'PATCH /repos/o/r/git/refs/heads/feat/x'),
    );
  });

  it('merges anyway when mergeability never settles, and lets GitHub decide', async () => {
    const stuck = {
      state: 'open',
      draft: false,
      mergeable: true,
      head: { sha: 'abc', ref: 'feat/x', repo: { full_name: REPO } },
      base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
      user: { login: 'jo' },
      labels: [{ name: 'bump:patch' }],
    };
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/pulls/7': (n) => (n <= 2 ? stuck : { ...stuck, mergeable: null }),
      }),
    );
    const sleeps = [];
    await run({ env: liveEnv(), api, log: quiet, sleep: async (ms) => sleeps.push(ms) });
    assert.equal(sleeps.length, 10);
    assert.equal(calls.filter((call) => call.method === 'PUT').length, 1);
  });

  it('heads a live refusal as a refusal, not a dry run', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'GET /repos/o/r/commits/abc/check-runs?per_page=100&page=1': {
          check_runs: [{ name: 'Validate', status: 'completed', conclusion: 'failure' }],
        },
      }),
    );
    await run({ env: liveEnv(), api, log: quiet });
    const text = posted(calls)[0].body.body;
    assert.equal(text, '**Merge failed**\nA required check failed. Fix it and try again.');
  });

  it('never replies to a bot in live mode either, and makes no call', async () => {
    const { api, calls } = fakeApi(liveResponses());
    const result = await run({
      env: liveEnv({ COMMENTER_LOGIN: 'merge-app[bot]', COMMENTER_TYPE: 'Bot' }),
      api,
      log: quiet,
    });
    assert.equal(result, 'ignored');
    assert.deepEqual(calls, []);
  });
});

describe('createApi', () => {
  const reply = (status, statusText, body) => async () => ({
    ok: status < 400,
    status,
    statusText,
    json: async () => {
      if (body === undefined) throw new SyntaxError('no body');
      return body;
    },
  });

  it("puts GitHub's own message in the error, with the status", async () => {
    const api = createApi(
      't0k',
      reply(405, 'Method Not Allowed', {
        message: 'Required status check "Validate" is expected.',
      }),
    );
    await assert.rejects(api('PUT', '/repos/o/r/pulls/7/merge', {}), (err) => {
      assert.equal(err.status, 405);
      assert.match(
        err.message,
        /PUT \/repos\/o\/r\/pulls\/7\/merge failed: 405 Method Not Allowed: Required status check/,
      );
      return true;
    });
  });

  it('falls back to the status text when there is no readable message', async () => {
    for (const body of [undefined, {}, { message: 5 }, null]) {
      const api = createApi('t0k', reply(500, 'Server Error', body));
      await assert.rejects(api('GET', '/x'), /^Error: GitHub GET \/x failed: 500 Server Error$/);
    }
  });

  it('shortens a very long message', async () => {
    const api = createApi('t0k', reply(422, 'Unprocessable', { message: 'x'.repeat(1000) }));
    await assert.rejects(api('GET', '/x'), (err) => err.message.length < 400);
  });

  it('never puts the token in an error, and sends it only as a header', async () => {
    let sent;
    const api = createApi('s3cret', async (url, init) => {
      sent = init;
      return reply(403, 'Forbidden', { message: 'nope' })();
    });
    await assert.rejects(api('GET', '/x'), (err) => !err.message.includes('s3cret'));
    assert.equal(sent.headers.Authorization, 'Bearer s3cret');
  });

  it('returns the parsed body on success and null on 204', async () => {
    assert.deepEqual(await createApi('t', reply(200, 'OK', { a: 1 }))('GET', '/x'), { a: 1 });
    assert.equal(await createApi('t', reply(204, 'No Content'))('GET', '/x'), null);
  });
});
