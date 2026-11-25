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
const { paginate, run } = await import(SCRIPT);

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
      head: { sha: 'abc', repo: { full_name: REPO } },
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
    'GET /repos/o/r/contents/package.json?ref=main': { content: b64('{"version":"0.5.4"}') },
    'GET /repos/o/r/contents/package.json?ref=base': { content: b64('{"version":"0.5.2"}') },
    'GET /repos/o/r/contents/package.json?ref=abc': { content: b64('{"version":"0.5.2"}') },
    'POST /repos/o/r/issues/7/comments': {},
    ...overrides,
  };
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    const key = `${method} ${path}`;
    if (!(key in responses)) throw new Error(`unexpected call ${key}`);
    const value = responses[key];
    if (value instanceof Error) throw value;
    return value;
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
  it('ignores a comment that is not exactly /merge, without any API call', async () => {
    const { api, calls } = fakeApi();
    const result = await run({ env: env({ COMMENT_BODY: '/merge please' }), api, log: quiet });
    assert.equal(result, 'ignored');
    assert.deepEqual(calls, []);
  });

  it('reports what it would merge and never writes anything but the comment', async () => {
    const { api, calls } = fakeApi();
    const result = await run({ env: env(), api, log: quiet });
    assert.equal(result, 'would-merge');
    assert.deepEqual(mutations(calls), []);
    assert.equal(posted(calls).length, 1);
    const body = posted(calls)[0].body.body;
    assert.match(body, /Version: 0\.5\.4 -> 0\.5\.5 \(patch\)/);
    assert.match(body, /merge `main` into the branch first/);
  });

  it('refuses a commenter without write access and does not read the PR', async () => {
    const { api, calls } = fakeApi({
      'GET /repos/o/r/collaborators/jo/permission': { permission: 'read' },
    });
    const result = await run({ env: env(), api, log: quiet });
    assert.equal(result, 'refused');
    assert.match(posted(calls)[0].body.body, /does not have write permission/);
    assert.ok(!calls.some((call) => call.path.startsWith('/repos/o/r/pulls/')));
  });

  it('refuses a bot commenter even with admin access, and does not read the PR', async () => {
    const { api, calls } = fakeApi({
      'GET /repos/o/r/collaborators/a-bot/permission': { permission: 'admin' },
    });
    const result = await run({
      env: env({ COMMENTER_LOGIN: 'a-bot', COMMENTER_TYPE: 'Bot' }),
      api,
      log: quiet,
    });
    assert.equal(result, 'refused');
    assert.match(posted(calls)[0].body.body, /commenter is a bot/);
    assert.ok(!calls.some((call) => call.path.startsWith('/repos/o/r/pulls/')));
  });

  it('refuses a draft PR with a pending check, listing both reasons', async () => {
    const base = fakeApi().api;
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
    assert.ok(base);
    const result = await run({ env: env(), api, log: quiet });
    assert.equal(result, 'refused');
    const body = posted(calls)[0].body.body;
    assert.match(body, /is a draft/);
    assert.match(body, /still running/);
  });

  it('refuses when the required checks cannot be determined', async () => {
    const { api, calls } = fakeApi({ 'GET /repos/o/r/rules/branches/main': [] });
    assert.equal(await run({ env: env(), api, log: quiet }), 'refused');
    assert.match(posted(calls)[0].body.body, /required checks could not be determined/);
  });

  it('refuses live mode, since only the dry run is built', async () => {
    const { api, calls } = fakeApi();
    await assert.rejects(run({ env: env({ DRY_RUN: 'false' }), api, log: quiet }), /dry-run only/);
    assert.deepEqual(calls, []);
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
