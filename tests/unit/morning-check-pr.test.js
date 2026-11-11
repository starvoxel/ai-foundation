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
  LABEL,
  closeBotPrs,
  ensureLabel,
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
  it('is one stable branch per check, apart from the retired hashed ones', () => {
    assert.equal(branchFor('demo'), 'bot/demo');
    assert.ok(!branchFor('demo').startsWith(branchPrefix('demo')));
    assert.ok('bot/demo-abcdef0123'.startsWith(branchPrefix('demo')));
  });
});

describe('planPr', () => {
  const branch = 'bot/demo';

  it('creates a PR when none is open', () => {
    assert.deepEqual(planPr({ branch, openPrs: [], findings: ['f'] }), {
      action: 'create',
      supersede: [],
    });
  });

  it('does nothing when the open PR already holds the fixed tree', () => {
    const plan = planPr({ branch, openPrs: [pr(1, branch)], findings: ['f'], treeMatches: true });
    assert.deepEqual(plan, { action: 'none', supersede: [] });
  });

  it('updates the open PR when the fix differs', () => {
    const plan = planPr({ branch, openPrs: [pr(1, branch)], findings: ['f'] });
    assert.deepEqual(plan, { action: 'update', supersede: [] });
  });

  it('creates a PR on the stable branch and supersedes a retired hashed one', () => {
    const old = pr(1, 'bot/demo-0000000000');
    assert.deepEqual(planPr({ branch, openPrs: [old], findings: ['f'] }), {
      action: 'create',
      supersede: [old],
    });
  });

  it('keeps the matching PR and supersedes the others', () => {
    const old = pr(1, 'bot/demo-old');
    const plan = planPr({
      branch,
      openPrs: [old, pr(2, branch)],
      findings: ['f'],
      treeMatches: true,
    });
    assert.deepEqual(plan, { action: 'none', supersede: [old] });
  });

  it('closes every open PR once the findings are gone', () => {
    const open = [pr(1, 'bot/demo'), pr(2, 'bot/demo-b')];
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
      details: () => 'Components refreshed:\n\n- `a`',
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

  it("includes the check's details after the summary", () => {
    assert.ok(body.includes('Components refreshed:\n\n- `a`'));
  });

  it('gives the check command with its before and after result', () => {
    assert.ok(body.includes('`demo --check` reported 2 drifted file(s) before and none after.'));
  });

  it('is short, with no checklist, disclosure or instructions to a reader', () => {
    assert.ok(body.split('\n').length <= 12);
    assert.ok(body.length < 400);
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
  const open = [
    pr(1, 'bot/demo-abc'),
    pr(2, 'feature/x'),
    pr(3, 'bot/other-abc'),
    pr(4, 'bot/demo'),
  ];

  it('keeps only PRs whose branch carries the check prefix', async () => {
    const found = await listBotPrs(fakeApi(open), 'o/r', 'demo');
    assert.deepEqual(
      found.map((p) => p.number),
      [1, 4],
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
    assert.equal(closed, 2);
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

describe('ensureLabel', () => {
  it('creates the morning-check label', async () => {
    const api = fakeApi();
    await ensureLabel(api, 'o/r');
    assert.equal(api.calls[0].path, '/repos/o/r/labels');
    assert.equal(api.calls[0].body.name, LABEL);
    assert.equal(LABEL, 'morning-check');
  });

  it('carries on when the label already exists (422)', async () => {
    const api = {
      request: async () => {
        throw Object.assign(new Error('Validation Failed'), { status: 422 });
      },
    };
    await assert.doesNotReject(() => ensureLabel(api, 'o/r'));
  });

  it('rethrows any other failure', async () => {
    const api = {
      request: async () => {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      },
    };
    await assert.rejects(() => ensureLabel(api, 'o/r'), /Forbidden/);
  });
});
