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
function fakeApi(overrides = {}, head = 'abc') {
  const calls = [];
  const base = {
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
    'GET /repos/o/r/commits/abc': {
      sha: 'abc',
      commit: { message: 'Add the feature' },
      author: { login: 'jo' },
      parents: [{ sha: 'p0' }],
      files: [{ filename: 'lib/x.js' }],
    },
    'POST /repos/o/r/issues/7/comments': {},
  };
  // Re-key the fixture to another head SHA, for tests that need a full-length one.
  const rekeyed =
    head === 'abc'
      ? base
      : Object.fromEntries(
          Object.entries(base).map(([key, value]) => [
            key.replaceAll('abc', head),
            JSON.parse(JSON.stringify(value).replaceAll('abc', head)),
          ]),
        );
  const responses = { ...rekeyed, ...overrides };
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

  const stackedError = httpError(
    403,
    'Merging stacked PRs via this endpoint is not supported. Use the asynchronous merge endpoint instead.',
  );
  const ASYNC = 'PUT /repos/o/r/pulls/7/merge-async';
  const POLL = 'GET /repos/o/r/pulls/7/merge-async/u-1';

  it('merges a stacked PR through the asynchronous endpoint, pinned to the new head', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'PUT /repos/o/r/pulls/7/merge': stackedError,
        [ASYNC]: { status: 'pending', details: { uuid: 'u-1' } },
        [POLL]: (n) =>
          n < 2 ? { status: 'pending' } : { status: 'merged', details: { sha: 'm1' } },
      }),
    );
    const result = await run({ env: liveEnv(), api, log: quiet, sleep: async () => {} });
    assert.equal(result, 'merged');
    const start = calls.find((call) => call.path.endsWith('/merge-async'));
    assert.deepEqual(start.body, { sha: 'commit1', merge_method: 'merge' });
    assert.equal(calls.filter((call) => call.path.endsWith('/merge')).length, 1);
    assert.match(posted(calls).at(-1).body.body, /^\*\*Merge successful\*\*/);
  });

  it('treats an already-merged answer from the asynchronous endpoint as done', async () => {
    const { api } = fakeApi(
      liveResponses({ 'PUT /repos/o/r/pulls/7/merge': stackedError, [ASYNC]: { merged: true } }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet, sleep: async () => {} }), 'merged');
  });

  it('reports a failed asynchronous merge with its reason, and does not claim success', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'PUT /repos/o/r/pulls/7/merge': stackedError,
        [ASYNC]: { status: 'pending', details: { uuid: 'u-1' } },
        [POLL]: { status: 'failed', details: { message: 'a check failed lower in the stack' } },
      }),
    );
    await assert.rejects(
      run({ env: liveEnv(), api, log: quiet, sleep: async () => {} }),
      /failed: a check failed lower in the stack/,
    );
    assert.match(
      posted(calls).at(-1).body.body,
      /^\*\*Merge failed\*\*\nError: .*lower in the stack/,
    );
  });

  it('gives up when the asynchronous merge never settles', async () => {
    const { api, calls } = fakeApi(
      liveResponses({
        'PUT /repos/o/r/pulls/7/merge': stackedError,
        [ASYNC]: { status: 'pending', details: { uuid: 'u-1' } },
        [POLL]: { status: 'pending' },
      }),
    );
    await assert.rejects(
      run({ env: liveEnv(), api, log: quiet, sleep: async () => {} }),
      /did not finish in time/,
    );
    assert.equal(calls.filter((call) => call.path.endsWith('/u-1')).length, 30);
  });

  it('fails clearly when the asynchronous endpoint returns no request id or queues the merge', async () => {
    for (const [first, poll, pattern] of [
      [{ status: 'pending' }, null, /request id/],
      [{ status: 'pending', details: { uuid: 'u-1' } }, { status: 'enqueued' }, /queued/],
    ]) {
      const { api } = fakeApi(
        liveResponses({
          'PUT /repos/o/r/pulls/7/merge': stackedError,
          [ASYNC]: first,
          [POLL]: poll,
        }),
      );
      await assert.rejects(
        run({ env: liveEnv(), api, log: quiet, sleep: async () => {} }),
        pattern,
      );
    }
  });

  it('uses the asynchronous endpoint only for the stacked 403, not for another 403', async () => {
    const { api, calls } = fakeApi(
      liveResponses({ 'PUT /repos/o/r/pulls/7/merge': httpError(403, 'Resource not accessible') }),
    );
    await assert.rejects(run({ env: liveEnv(), api, log: quiet, sleep: async () => {} }), /403/);
    assert.ok(!calls.some((call) => call.path.endsWith('/merge-async')));
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

const H = 'a'.repeat(40);
const pendingRuns = {
  [`GET /repos/o/r/commits/${H}/check-runs?per_page=100&page=1`]: {
    check_runs: [{ name: 'Validate', status: 'in_progress', conclusion: null }],
  },
};
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const marker = (at = NOW - HOUR, sha = H, login = 'jo') =>
  `<!-- merge-queued login=${login} sha=${sha} at=${at} -->`;
const botComment = (body) => ({ user: { type: 'Bot', login: 'app[bot]' }, body });
const wakeEnv = () => ({ GITHUB_REPOSITORY: REPO, EVENT_NAME: 'workflow_run', DRY_RUN: 'false' });
const QUEUE_LIST = 'GET /repos/o/r/issues?labels=merge-queued&state=open&per_page=100&page=1';
const COMMENT_LIST = 'GET /repos/o/r/issues/7/comments?per_page=100&page=1';
const LABEL_DELETE = 'DELETE /repos/o/r/issues/7/labels/merge-queued';

const queueApi = (responses) => fakeApi(responses, H);

/** Responses for a waiting PR 7 whose marker names head `abc` (the fake pads it to 40 hex digits). */
function queueResponses(overrides = {}) {
  return liveResponses({
    [QUEUE_LIST]: [{ number: 7, pull_request: {} }, { number: 9 }],
    [COMMENT_LIST]: [botComment(marker())],
    [LABEL_DELETE]: null,
    'POST /repos/o/r/merges': { sha: 'upd1', parents: [{ sha: H }, { sha: 'maintip' }] },
    ...overrides,
  });
}

describe('run, waiting for checks', () => {
  it('queues a /merge whose only problem is a running check, recording who, which head and when', async () => {
    const { api, calls } = fakeApi({ ...pendingRuns, 'POST /repos/o/r/issues/7/labels': {} }, H);
    const result = await run({ env: liveEnv(), api, log: quiet, now: () => NOW });
    assert.equal(result, 'queued');
    const label = calls.find((call) => call.path === '/repos/o/r/issues/7/labels');
    assert.deepEqual(label.body, { labels: ['merge-queued'] });
    const body = posted(calls).find((call) => call.path.endsWith('/comments')).body.body;
    assert.match(body, /^\*\*Waiting for checks\*\*\n/);
    assert.match(body, /for up to 4 hours/);
    assert.ok(body.endsWith(`<!-- merge-queued login=jo sha=${H} at=${NOW} -->`));
    assert.deepEqual(mutations(calls), []);
  });

  it('does not queue when anything besides a running check is wrong', async () => {
    const { api, calls } = fakeApi(
      {
        [`GET /repos/o/r/commits/${H}/check-runs?per_page=100&page=1`]: {
          check_runs: [
            { name: 'Validate', status: 'completed', conclusion: 'failure' },
            { name: 'Other', status: 'in_progress', conclusion: null },
          ],
        },
      },
      H,
    );
    const result = await run({ env: liveEnv(), api, log: quiet, now: () => NOW });
    assert.equal(result, 'refused');
    assert.ok(!calls.some((call) => call.path.endsWith('/labels')));
  });

  it('does not queue in dry-run mode', async () => {
    const { api, calls } = fakeApi(pendingRuns, H);
    const result = await run({ env: env(), api, log: quiet, now: () => NOW });
    assert.equal(result, 'refused');
    assert.ok(!calls.some((call) => call.path.endsWith('/labels')));
  });

  it('ignores the wake-up entirely in dry-run mode', async () => {
    const { api, calls } = fakeApi();
    const result = await run({
      env: { ...wakeEnv(), DRY_RUN: 'true' },
      api,
      log: quiet,
      now: () => NOW,
    });
    assert.equal(result, 'ignored');
    assert.deepEqual(calls, []);
  });

  it('merges a waiting PR once its checks pass, dropping the label first, and skips non-PRs', async () => {
    const { api, calls } = queueApi(queueResponses());
    const result = await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.equal(result, 'queue-checked');
    assert.ok(idx(calls, LABEL_DELETE) < idx(calls, 'PUT /repos/o/r/pulls/7/merge'));
    assert.ok(idx(calls, 'PUT /repos/o/r/pulls/7/merge') > 0);
    assert.ok(!calls.some((call) => call.path.includes('/issues/9/')));
    const last = posted(calls).at(-1).body.body;
    assert.match(last, /^\*\*Merge successful\*\*/);
  });

  it('keeps waiting, silently, while checks are still running', async () => {
    const { api, calls } = queueApi(queueResponses(pendingRuns));
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.deepEqual(mutations(calls), []);
    assert.deepEqual(posted(calls), []);
  });

  it('drops the wait and says why when a check failed', async () => {
    const { api, calls } = queueApi(
      queueResponses({
        [`GET /repos/o/r/commits/${H}/check-runs?per_page=100&page=1`]: {
          check_runs: [{ name: 'Validate', status: 'completed', conclusion: 'failure' }],
        },
      }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.ok(names(calls).includes(LABEL_DELETE));
    assert.equal(
      posted(calls).at(-1).body.body,
      '**Merge failed**\nA required check failed. Fix it and try again.',
    );
    assert.deepEqual(
      mutations(calls).map((c) => c.method),
      ['DELETE'],
    );
  });

  it('drops a wait older than four hours without looking at the PR', async () => {
    const { api, calls } = queueApi(
      queueResponses({ [COMMENT_LIST]: [botComment(marker(NOW - 4 * HOUR - 1))] }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.match(posted(calls).at(-1).body.body, /did not finish within 4 hours/);
    assert.ok(!names(calls).includes('GET /repos/o/r/pulls/7'));
    assert.ok(names(calls).includes(LABEL_DELETE));
  });

  it('still waits at exactly four hours', async () => {
    const { api, calls } = queueApi(
      queueResponses({ ...pendingRuns, [COMMENT_LIST]: [botComment(marker(NOW - 4 * HOUR))] }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.deepEqual(mutations(calls), []);
  });

  it('drops the wait when the head moved since the request', async () => {
    const { api, calls } = queueApi(
      queueResponses({ [COMMENT_LIST]: [botComment(marker(NOW - HOUR, 'b'.repeat(40)))] }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.match(posted(calls).at(-1).body.body, /branch changed while waiting/);
    assert.ok(!names(calls).includes('PUT /repos/o/r/pulls/7/merge'));
  });

  it('drops the wait when the requester lost write access', async () => {
    const { api, calls } = queueApi(
      queueResponses({
        'GET /repos/o/r/collaborators/jo/permission': { permission: 'read' },
      }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.match(posted(calls).at(-1).body.body, /write access/);
    assert.ok(!names(calls).includes('PUT /repos/o/r/pulls/7/merge'));
  });

  it('trusts only a marker written by a bot', async () => {
    const forged = { user: { type: 'User', login: 'mallory' }, body: marker() };
    const { api, calls } = queueApi(queueResponses({ [COMMENT_LIST]: [forged] }));
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.match(posted(calls).at(-1).body.body, /could not be found/);
    assert.ok(!names(calls).includes('PUT /repos/o/r/pulls/7/merge'));
  });

  it('uses the latest marker when there are several', async () => {
    const { api, calls } = queueApi(
      queueResponses({
        ...pendingRuns,
        [COMMENT_LIST]: [botComment(marker(NOW - 9 * HOUR)), botComment(marker(NOW - HOUR))],
      }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.deepEqual(mutations(calls), []);
  });

  it('quietly drops the label of a PR that is no longer open', async () => {
    const { api, calls } = queueApi(
      queueResponses({
        'GET /repos/o/r/pulls/7': {
          state: 'closed',
          draft: false,
          mergeable: false,
          head: { sha: H, ref: 'feat/x', repo: { full_name: REPO } },
          base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
          user: { login: 'jo' },
          labels: [],
        },
      }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
    assert.deepEqual(posted(calls), []);
    assert.ok(names(calls).includes(LABEL_DELETE));
  });

  it('tolerates the label already being gone', async () => {
    const { api } = queueApi(
      queueResponses({
        ...pendingRuns,
        [COMMENT_LIST]: [],
        [LABEL_DELETE]: httpError(404),
      }),
    );
    await run({ env: wakeEnv(), api, log: quiet, now: () => NOW });
  });

  it('keeps settling the other waiting PRs when one merge fails, then fails the job', async () => {
    const { api, calls } = queueApi(
      queueResponses({
        [QUEUE_LIST]: [
          { number: 7, pull_request: {} },
          { number: 8, pull_request: {} },
        ],
        'PUT /repos/o/r/pulls/7/merge': httpError(500, 'boom'),
        'GET /repos/o/r/issues/8/comments?per_page=100&page=1': [],
        'DELETE /repos/o/r/issues/8/labels/merge-queued': null,
        'POST /repos/o/r/issues/8/comments': {},
      }),
    );
    await assert.rejects(run({ env: wakeEnv(), api, log: quiet, now: () => NOW }), /500/);
    assert.ok(names(calls).includes('DELETE /repos/o/r/issues/8/labels/merge-queued'));
    assert.match(
      posted(calls).find(
        (call) => call.path === '/repos/o/r/issues/7/comments' && /Error 500/.test(call.body.body),
      ).body.body,
      /Merge failed/,
    );
  });
});

describe('run, after a failed merge left bot commits on the head', () => {
  const pull = {
    state: 'open',
    draft: false,
    mergeable: true,
    head: { sha: 'ver1', ref: 'feat/x', repo: { full_name: REPO } },
    base: { ref: 'main', repo: { full_name: REPO, default_branch: 'main' } },
    user: { login: 'jo' },
    labels: [{ name: 'bump:patch' }],
  };
  const botCommit = (message, parents, files, login = 'app[bot]') => ({
    commit: { message },
    author: { login },
    parents: parents.map((sha) => ({ sha })),
    files: files.map((filename) => ({ filename })),
  });
  const VERSION_FILES = ['package.json', 'package-lock.json'];
  const PRETTY = `${JSON.stringify({ name: 'x', version: '0.5.5' }, null, 2)}\n`;

  /** PR head `ver1` = version commit on update `upd0` on `abc`, whose checks passed; `abc` is the tested head. */
  function stacked(overrides = {}) {
    return liveResponses({
      'GET /repos/o/r/pulls/7': pull,
      'GET /repos/o/r/commits/ver1': botCommit(
        'Set the version to 0.5.5 [skip ci]',
        ['upd0'],
        VERSION_FILES,
      ),
      'GET /repos/o/r/commits/upd0': botCommit(
        'Merge main into feat/x [skip ci]',
        ['abc', 'maintip'],
        ['lib/y.js'],
      ),
      'GET /repos/o/r/compare/main...maintip': { ahead_by: 0, behind_by: 0 },
      'GET /repos/o/r/compare/main...ver1': { merge_base_commit: { sha: 'tip' }, behind_by: 0 },
      'GET /repos/o/r/commits/ver1/check-runs?per_page=100&page=1': { check_runs: [] },
      'GET /repos/o/r/contents/package.json?ref=ver1': { sha: 'vb', content: b64(PRETTY) },
      'GET /repos/o/r/git/commits/ver1': { tree: { sha: 'tree0' } },
      'GET /repos/o/r/git/blobs/vb': { content: b64(PRETTY) },
      'GET /repos/o/r/contents/package-lock.json?ref=ver1': httpError(404),
      ...overrides,
    });
  }

  it('gates on the commit beneath them and merges the head as it is, without another version commit', async () => {
    const { api, calls } = fakeApi(stacked());
    const result = await run({ env: liveEnv(), api, log: quiet, sleep: async () => {} });
    assert.equal(result, 'merged');
    const merge = calls.find((call) => call.method === 'PUT');
    assert.equal(merge.body.sha, 'ver1');
    assert.ok(names(calls).includes('GET /repos/o/r/commits/abc/check-runs?per_page=100&page=1'));
    assert.ok(!calls.some((call) => call.path === '/repos/o/r/git/commits'));
    assert.ok(!calls.some((call) => call.path === '/repos/o/r/merges'));
    assert.equal(
      posted(calls).at(-1).body.body,
      '**Merge successful**\nVersion bumped from v0.5.4 -> v0.5.5',
    );
  });

  it('still refuses when the commit beneath them has a failing check', async () => {
    const { api, calls } = fakeApi(
      stacked({
        'GET /repos/o/r/commits/abc/check-runs?per_page=100&page=1': {
          check_runs: [{ name: 'Validate', status: 'completed', conclusion: 'failure' }],
        },
      }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.ok(!calls.some((call) => call.method === 'PUT'));
  });

  it('does not look past a commit by a person, even with the bot message', async () => {
    const { api, calls } = fakeApi(
      stacked({
        'GET /repos/o/r/commits/ver1': botCommit(
          'Set the version to 0.5.5 [skip ci]',
          ['upd0'],
          VERSION_FILES,
          'mallory',
        ),
      }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.match(posted(calls).at(-1).body.body, /Required checks have not run/);
    assert.ok(!calls.some((call) => call.method === 'PUT'));
  });

  it('does not look past a version commit that touches another file', async () => {
    const { api, calls } = fakeApi(
      stacked({
        'GET /repos/o/r/commits/ver1': botCommit(
          'Set the version to 0.5.5 [skip ci]',
          ['upd0'],
          [...VERSION_FILES, 'lib/evil.js'],
        ),
      }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.ok(!calls.some((call) => call.method === 'PUT'));
  });

  it('does not look past an update whose second parent is not in main', async () => {
    const { api, calls } = fakeApi(
      stacked({ 'GET /repos/o/r/compare/main...maintip': { ahead_by: 1, behind_by: 0 } }),
    );
    assert.equal(await run({ env: liveEnv(), api, log: quiet }), 'refused');
    assert.ok(!calls.some((call) => call.method === 'PUT'));
  });
});
