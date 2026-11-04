/**
 * Tests for the pure parts of .github/scripts/morning-check-pr.mjs and the PR
 * listing and closing against an in-memory fake of the GitHub REST API. The
 * git-backed publish flow is in tests/integration/morning-check-pr-git.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/morning-check-pr.mjs'),
).href;
const {
  basicAuth,
  branchFor,
  branchPrefix,
  closeBotPrs,
  gitAuthEnv,
  listBotPrs,
  planPr,
  renderPrBody,
} = await import(SCRIPT);

const pr = (number, ref) => ({ number, head: { ref } });

function fakeApi(openPrs = []) {
  const calls = [];
  return {
    calls,
    paginate: async () => openPrs,
    request: async (method, path, body) => {
      calls.push({ method, path, body });
      return { data: {}, headers: new Headers() };
    },
  };
}

describe('branchFor', () => {
  it('prefixes the check id and uses the first 10 characters of the tree', () => {
    assert.equal(branchFor('demo', 'abcdef0123456789'), 'bot/demo-abcdef0123');
    assert.ok(branchFor('demo', 'abcdef0123456789').startsWith(branchPrefix('demo')));
  });

  it('gives the same branch for the same tree and different ones for different trees', () => {
    assert.equal(branchFor('d', 'aaaaaaaaaaaa'), branchFor('d', 'aaaaaaaaaaaa'));
    assert.notEqual(branchFor('d', 'aaaaaaaaaaaa'), branchFor('d', 'bbbbbbbbbbbb'));
  });
});

describe('planPr', () => {
  const branch = 'bot/demo-new';

  it('creates a PR when none is open', () => {
    assert.deepEqual(planPr({ branch, openPrs: [], findings: ['f'] }), {
      action: 'create',
      supersede: [],
    });
  });

  it('does nothing when a PR is already open for the same branch', () => {
    const plan = planPr({ branch, openPrs: [pr(1, branch)], findings: ['f'] });
    assert.deepEqual(plan, { action: 'none', supersede: [] });
  });

  it('creates a new PR and supersedes an open one with a different branch', () => {
    const old = pr(1, 'bot/demo-old');
    assert.deepEqual(planPr({ branch, openPrs: [old], findings: ['f'] }), {
      action: 'create',
      supersede: [old],
    });
  });

  it('keeps the matching PR and supersedes the others', () => {
    const old = pr(1, 'bot/demo-old');
    const plan = planPr({ branch, openPrs: [old, pr(2, branch)], findings: ['f'] });
    assert.deepEqual(plan, { action: 'none', supersede: [old] });
  });

  it('closes every open PR once the findings are gone', () => {
    const open = [pr(1, 'bot/demo-a'), pr(2, 'bot/demo-b')];
    assert.deepEqual(planPr({ branch, openPrs: open, findings: [] }), {
      action: 'close',
      supersede: open,
    });
  });

  it('does nothing when clean and nothing is open', () => {
    assert.deepEqual(planPr({ branch, openPrs: [], findings: [] }), {
      action: 'none',
      supersede: [],
    });
  });
});

describe('renderPrBody', () => {
  const check = {
    id: 'demo',
    title: 'Demo drifted',
    fix: 'Run the demo fix.',
    prFix: {
      apply: () => {},
      prTitle: () => 'Refresh the demo',
      summary: 'The demo is out of date.',
      fixCommand: 'demo --fix',
      verifyCommand: 'demo --check',
    },
  };
  const body = renderPrBody({ check, findings: ['changed: a', 'missing: b'], changed: ['a', 'b'] });

  it('is just Summary and Testing notes', () => {
    assert.deepEqual(body.match(/^## .+$/gm), ['## Summary', '## Testing notes']);
  });

  it('says why, what was run and how many files changed', () => {
    assert.match(
      body,
      /^## Summary\n\nThe demo is out of date\. Regenerated with `demo --fix` \(2 file\(s\) changed\)\./,
    );
  });

  it('gives the check command with its before and after result', () => {
    assert.ok(body.includes('`demo --check` reported 2 drifted file(s) before and none after.'));
  });

  it('is short, with no checklist, disclosure or instructions to a reader', () => {
    assert.ok(body.split('\n').length <= 8);
    assert.ok(body.length < 300);
    assert.ok(!body.includes('[ ]') && !body.includes('AI disclosure'));
    assert.ok(!body.includes('Run the demo fix.') && !body.includes('item(s)'));
  });
});

describe('git auth', () => {
  it('encodes the token as a Basic credential', () => {
    assert.equal(basicAuth('tok'), Buffer.from('x-access-token:tok').toString('base64'));
  });

  it('passes the credential through environment variables, never a URL', () => {
    const env = gitAuthEnv('tok');
    assert.equal(env.GIT_CONFIG_COUNT, '1');
    assert.equal(env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
    assert.equal(env.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${basicAuth('tok')}`);
    assert.equal(env.GIT_TERMINAL_PROMPT, '0');
    assert.ok(!Object.values(env).some((v) => v.includes('tok') && v.includes('://')));
  });
});

describe('listBotPrs / closeBotPrs', () => {
  const open = [pr(1, 'bot/demo-abc'), pr(2, 'feature/x'), pr(3, 'bot/other-abc')];

  it('keeps only PRs whose branch carries the check prefix', async () => {
    const found = await listBotPrs(fakeApi(open), 'o/r', 'demo');
    assert.deepEqual(
      found.map((p) => p.number),
      [1],
    );
  });

  it('comments on and closes each, returning how many', async () => {
    const api = fakeApi(open);
    const closed = await closeBotPrs({
      check: { id: 'demo' },
      repo: 'o/r',
      botApi: api,
      runUrl: 'https://example.test/r',
    });
    assert.equal(closed, 1);
    assert.equal(api.calls[0].path, '/repos/o/r/issues/1/comments');
    assert.match(api.calls[0].body.body, /example\.test/);
    assert.deepEqual(api.calls[1], {
      method: 'PATCH',
      path: '/repos/o/r/pulls/1',
      body: { state: 'closed' },
    });
  });

  it('closes nothing when none are open', async () => {
    const api = fakeApi([]);
    assert.equal(await closeBotPrs({ check: { id: 'demo' }, repo: 'o/r', botApi: api }), 0);
    assert.deepEqual(api.calls, []);
  });
});
