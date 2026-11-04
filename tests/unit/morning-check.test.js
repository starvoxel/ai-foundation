/**
 * Tests for .github/scripts/morning-check.mjs: the pure decisions (drift
 * parsing, the guard, the issue plan) and the run flow against an in-memory
 * fake of the GitHub REST API. The git-backed parts are in
 * tests/integration/morning-check-git.test.js.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/morning-check.mjs'),
).href;
const {
  CHECKS,
  LABEL,
  MAX_TITLE,
  checksTouched,
  decideGuard,
  findExisting,
  installComponentNames,
  installDriftTitle,
  isForcedDay,
  markerFor,
  parseDriftOutput,
  planIssue,
  renderBody,
  reportMode,
  renderSummary,
  runChecks,
} = await import(SCRIPT);

/** @returns {import('../../.github/scripts/morning-check.mjs').Check} */
function fakeCheck(overrides = {}) {
  return {
    id: 'demo',
    title: 'Demo has drifted',
    paths: ['src/', 'config.json'],
    fix: 'Run the demo fix.',
    run: () => [],
    ...overrides,
  };
}

/**
 * In-memory stand-in for the GitHub client: serves the given open issues and
 * records every write.
 */
function fakeApi(openItems = [], { labelExists = false } = {}) {
  const calls = [];
  return {
    calls,
    paginate: async () => openItems,
    request: async (method, path, body) => {
      calls.push({ method, path, body });
      if (path.endsWith('/labels') && labelExists) {
        throw Object.assign(new Error('Validation Failed'), { status: 422 });
      }
      return { data: {}, headers: new Headers() };
    },
  };
}

const quiet = () => {};

describe('parseDriftOutput', () => {
  it('returns the changed, missing and retired lines', () => {
    const out = [
      '⚠ claude (engineering): 3 file(s) drifted',
      '::warning::claude project install drifted (3 file(s))',
      '    changed: .claude/.installs.yaml',
      '    missing: .claude/agents/new.md',
      '    retired: .claude/agents/old.md',
      '    Run `aif install --scope project --update` and commit the result to refresh it.',
    ].join('\n');
    assert.deepEqual(parseDriftOutput(out), [
      'changed: .claude/.installs.yaml',
      'missing: .claude/agents/new.md',
      'retired: .claude/agents/old.md',
    ]);
  });

  it('returns nothing for a current install', () => {
    assert.deepEqual(parseDriftOutput('✓ claude (engineering): project install is current\n'), []);
  });

  it('returns nothing when there is no project-scope install', () => {
    assert.deepEqual(parseDriftOutput('No project-scope install found.\n'), []);
  });

  it('throws on output it does not recognise rather than reporting clean', () => {
    assert.throws(() => parseDriftOutput(''), /Unrecognised install check output/);
    assert.throws(() => parseDriftOutput('something else entirely'), /Unrecognised/);
  });
});

describe('checks registry', () => {
  it('has the install drift check with watched paths and a fix', () => {
    const drift = CHECKS.find((c) => c.id === 'install-drift');
    assert.ok(drift);
    assert.ok(drift.paths.includes('.claude/'));
    assert.ok(drift.paths.includes('lib/'));
    assert.match(drift.fix, /aif install --scope project --update/);
  });

  it('gives every check a unique id', () => {
    const ids = CHECKS.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('checksTouched', () => {
  it('matches a watched directory prefix and an exact file', () => {
    const check = fakeCheck();
    assert.deepEqual(checksTouched(['src/a/b.js'], [check]), [check]);
    assert.deepEqual(checksTouched(['config.json'], [check]), [check]);
  });

  it('ignores unwatched paths and does not match a longer sibling name', () => {
    const check = fakeCheck();
    assert.deepEqual(checksTouched(['docs/readme.md', 'srcs/a.js'], [check]), []);
    assert.deepEqual(checksTouched([], [check]), []);
  });
});

describe('decideGuard', () => {
  const checks = [fakeCheck()];

  it('runs when forced, whatever changed', () => {
    const d = decideGuard({ force: true, openItems: 0, changedFiles: [], checks });
    assert.deepEqual(d, { run: true, reason: 'forced' });
  });

  it('runs to re-check when an issue is open', () => {
    const d = decideGuard({ force: false, openItems: 1, changedFiles: [], checks });
    assert.equal(d.run, true);
    assert.match(d.reason, /open item/);
  });

  it('runs when the window start is unknown', () => {
    const d = decideGuard({ force: false, openItems: 0, changedFiles: null, checks });
    assert.equal(d.run, true);
    assert.match(d.reason, /cannot tell/);
  });

  it('runs when a watched path changed, naming the check', () => {
    const d = decideGuard({ force: false, openItems: 0, changedFiles: ['src/x.js'], checks });
    assert.equal(d.run, true);
    assert.match(d.reason, /demo/);
  });

  it('skips when nothing watched changed', () => {
    const d = decideGuard({ force: false, openItems: 0, changedFiles: ['docs/a.md'], checks });
    assert.equal(d.run, false);
    assert.match(d.reason, /nothing watched changed/);
  });
});

describe('isForcedDay', () => {
  it('is true on Monday (UTC) and false on other days', () => {
    assert.equal(isForcedDay(new Date('2026-11-02T09:07:00Z')), true);
    assert.equal(isForcedDay(new Date('2026-11-03T09:07:00Z')), false);
    assert.equal(isForcedDay(new Date('2026-11-01T09:07:00Z')), false);
  });
});

describe('renderBody / planIssue / findExisting', () => {
  const check = fakeCheck();

  it('puts the marker, every finding and the fix in the body', () => {
    const body = renderBody(check, ['changed: a', 'missing: b']);
    assert.ok(body.includes(markerFor('demo')));
    assert.ok(body.includes('`changed: a`') && body.includes('`missing: b`'));
    assert.ok(body.includes('Run the demo fix.'));
  });

  it('renders identical findings to an identical body', () => {
    assert.equal(renderBody(check, ['a']), renderBody(check, ['a']));
  });

  it('creates an issue for a new finding', () => {
    const plan = planIssue({ check, findings: ['a'], existing: null });
    assert.equal(plan.action, 'create');
    assert.equal(plan.title, 'Morning check: Demo has drifted');
  });

  it('does nothing when the open issue already says the same', () => {
    const existing = { number: 7, body: renderBody(check, ['a']) };
    assert.equal(planIssue({ check, findings: ['a'], existing }).action, 'none');
  });

  it('updates the open issue when the findings changed', () => {
    const existing = { number: 7, body: renderBody(check, ['a']) };
    assert.equal(planIssue({ check, findings: ['a', 'b'], existing }).action, 'update');
  });

  it('closes the open issue when the findings are gone', () => {
    const existing = { number: 7, body: renderBody(check, ['a']) };
    assert.equal(planIssue({ check, findings: [], existing }).action, 'close');
  });

  it('does nothing when clean and no issue is open', () => {
    assert.equal(planIssue({ check, findings: [], existing: null }).action, 'none');
  });

  it('finds an issue by its check marker only', () => {
    const issues = [
      { number: 1, body: 'unrelated' },
      { number: 2, body: `${markerFor('other')}\nx` },
      { number: 3, body: `${markerFor('demo')}\nx` },
      { number: 4, body: null },
    ];
    assert.equal(findExisting(issues, 'demo')?.number, 3);
    assert.equal(findExisting(issues, 'missing'), null);
  });
});

describe('renderSummary', () => {
  it('lists each check with its result and issue action, escaping pipes', () => {
    const md = renderSummary([
      { check: fakeCheck(), findings: ['a'], error: null, action: 'create' },
      {
        check: fakeCheck({ id: 'b' }),
        findings: null,
        error: 'could not verify: x | y',
        action: 'none',
      },
    ]);
    assert.match(md, /\| demo \| 1 finding\(s\) \| create \|/);
    assert.match(md, /\| b \| could not verify: x \\\| y \| none \|/);
  });
});

describe('runChecks', () => {
  const env = { REPO: 'o/r', GH_TOKEN: 't' };

  it('creates the label and an issue when a check finds something', async () => {
    const api = fakeApi();
    const check = fakeCheck({ run: () => ['changed: a'] });
    const { failed } = await runChecks({ env, repoRoot: '.', checks: [check], api, log: quiet });
    assert.equal(failed, 0);
    assert.deepEqual(
      api.calls.map((c) => `${c.method} ${c.path}`),
      ['POST /repos/o/r/labels', 'POST /repos/o/r/issues'],
    );
    const issue = api.calls[1].body;
    assert.deepEqual(issue.labels, [LABEL]);
    assert.equal(issue.title, 'Morning check: Demo has drifted');
  });

  it('carries on when the label already exists', async () => {
    const api = fakeApi([], { labelExists: true });
    const check = fakeCheck({ run: () => ['changed: a'] });
    await runChecks({ env, repoRoot: '.', checks: [check], api, log: quiet });
    assert.equal(api.calls.at(-1).path, '/repos/o/r/issues');
  });

  it('writes nothing when the open issue is already current', async () => {
    const check = fakeCheck({ run: () => ['changed: a'] });
    const api = fakeApi([{ number: 7, body: renderBody(check, ['changed: a']) }]);
    await runChecks({ env, repoRoot: '.', checks: [check], api, log: quiet });
    assert.deepEqual(api.calls, []);
  });

  it('updates the open issue when the findings changed', async () => {
    const check = fakeCheck({ run: () => ['changed: a', 'changed: b'] });
    const api = fakeApi([{ number: 7, body: renderBody(check, ['changed: a']) }]);
    await runChecks({ env, repoRoot: '.', checks: [check], api, log: quiet });
    assert.equal(api.calls.length, 1);
    assert.equal(api.calls[0].method, 'PATCH');
    assert.equal(api.calls[0].path, '/repos/o/r/issues/7');
  });

  it('comments and closes the open issue once the check is clean', async () => {
    const check = fakeCheck({ run: () => [] });
    const api = fakeApi([{ number: 7, body: renderBody(check, ['changed: a']) }]);
    await runChecks({
      env: { ...env, RUN_URL: 'https://example.test/run/1' },
      repoRoot: '.',
      checks: [check],
      api,
      log: quiet,
    });
    assert.equal(api.calls[0].path, '/repos/o/r/issues/7/comments');
    assert.match(api.calls[0].body.body, /https:\/\/example\.test\/run\/1/);
    assert.deepEqual(api.calls[1].body, { state: 'closed', state_reason: 'completed' });
  });

  it('does not touch an open issue when its check could not verify', async () => {
    const check = fakeCheck({
      run: () => {
        throw new Error('boom');
      },
    });
    const api = fakeApi([{ number: 7, body: renderBody(check, ['changed: a']) }]);
    const { failed } = await runChecks({ env, repoRoot: '.', checks: [check], api, log: quiet });
    assert.equal(failed, 1);
    assert.deepEqual(api.calls, []);
  });

  it('still runs the other checks after one throws', async () => {
    const bad = fakeCheck({
      id: 'bad',
      run: () => {
        throw new Error('boom');
      },
    });
    const good = fakeCheck({ id: 'good', run: () => ['changed: a'] });
    const api = fakeApi();
    const { failed } = await runChecks({
      env,
      repoRoot: '.',
      checks: [bad, good],
      api,
      log: quiet,
    });
    assert.equal(failed, 1);
    assert.ok(api.calls.some((c) => c.path === '/repos/o/r/issues'));
  });

  it('only prints the plan on a dry run', async () => {
    const lines = [];
    const check = fakeCheck({ run: () => ['changed: a'] });
    const { failed } = await runChecks({
      env: { DRY_RUN: 'true' },
      repoRoot: '.',
      checks: [check],
      api: null,
      log: (l) => lines.push(l),
    });
    assert.equal(failed, 0);
    assert.ok(lines.some((l) => l.includes('Dry run: create issue')));
  });
});

describe('reportMode', () => {
  const prFix = {
    apply: () => {},
    prTitle: () => 't',
    summary: 's',
    fixCommand: 'f',
    verifyCommand: 'v',
  };

  it('is pr only when the check asks for it, has a fix, and a bot exists', () => {
    assert.equal(reportMode(fakeCheck({ report: 'pr', prFix }), true), 'pr');
  });

  it('falls back to an issue without a bot, without a fix, or by default', () => {
    assert.equal(reportMode(fakeCheck({ report: 'pr', prFix }), false), 'issue');
    assert.equal(reportMode(fakeCheck({ report: 'pr' }), true), 'issue');
    assert.equal(reportMode(fakeCheck({ prFix }), true), 'issue');
    assert.equal(reportMode(fakeCheck({ report: 'issue', prFix }), true), 'issue');
  });
});

describe('runChecks with a pr check', () => {
  const prFix = {
    apply: () => {},
    prTitle: () => 't',
    summary: 's',
    fixCommand: 'f',
    verifyCommand: 'v',
  };
  const env = {
    REPO: 'o/r',
    GH_TOKEN: 't',
    BOT_TOKEN: 'bot-secret',
    RUN_URL: 'https://example.test/r',
  };
  const prCheck = (findings) => fakeCheck({ report: 'pr', prFix, run: () => findings });

  it('publishes the fix as the bot and writes no issue', async () => {
    const api = fakeApi();
    const botApi = fakeApi();
    const seen = [];
    const { failed } = await runChecks({
      env,
      repoRoot: '/repo',
      checks: [prCheck(['changed: a'])],
      api,
      botApi,
      publish: async (input) => {
        seen.push(input);
        return 'created #5';
      },
      log: quiet,
    });
    assert.equal(failed, 0);
    assert.deepEqual(api.calls, []);
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].findings, ['changed: a']);
    assert.equal(seen[0].token, 'bot-secret');
    assert.equal(seen[0].repo, 'o/r');
    assert.equal(seen[0].repoRoot, '/repo');
    assert.equal(seen[0].runUrl, 'https://example.test/r');
  });

  it('reports as an issue, and says so, when there is no bot token', async () => {
    const api = fakeApi();
    const lines = [];
    let published = false;
    await runChecks({
      env: { REPO: 'o/r', GH_TOKEN: 't' },
      repoRoot: '.',
      checks: [prCheck(['changed: a'])],
      api,
      botApi: null,
      publish: async () => {
        published = true;
        return 'x';
      },
      log: (l) => lines.push(l),
    });
    assert.equal(published, false);
    assert.equal(api.calls.at(-1).path, '/repos/o/r/issues');
    assert.ok(lines.some((l) => l.includes('no bot token')));
  });

  it('closes the open bot PR and the fallback issue once the check is clean', async () => {
    const check = prCheck([]);
    const api = fakeApi([{ number: 7, body: renderBody(check, ['changed: a']) }]);
    const botApi = fakeApi([{ number: 9, head: { ref: 'bot/demo-abc' } }]);
    await runChecks({ env, repoRoot: '.', checks: [check], api, botApi, log: quiet });
    assert.ok(api.calls.some((c) => c.path === '/repos/o/r/issues/7'));
    assert.ok(
      botApi.calls.some((c) => c.path === '/repos/o/r/pulls/9' && c.body.state === 'closed'),
    );
  });

  it('records a failed publish as an error and writes no issue', async () => {
    const api = fakeApi();
    const { failed } = await runChecks({
      env,
      repoRoot: '.',
      checks: [prCheck(['changed: a'])],
      api,
      botApi: fakeApi(),
      publish: async () => {
        throw new Error('push rejected');
      },
      log: quiet,
    });
    assert.equal(failed, 1);
    assert.deepEqual(api.calls, []);
  });
});

describe('installComponentNames', () => {
  it('names rules, standards and agents by file stem, and skills by directory', () => {
    assert.deepEqual(
      installComponentNames([
        'changed: .claude/rules/engineering-git-workflow.md',
        'changed: .claude/standards/javascript_node.md',
        'missing: .claude/agents/engineer.md',
        'changed: .claude/skills/oversight/SKILL.md',
      ]),
      ['engineering-git-workflow', 'javascript_node', 'engineer', 'oversight'],
    );
  });

  it('leaves out the manifest and repeats, and ignores paths outside .claude', () => {
    assert.deepEqual(
      installComponentNames([
        'changed: .claude/.installs.yaml',
        'changed: .claude/skills/oversight/SKILL.md',
        'changed: .claude/skills/oversight/reference/x.md',
        'changed: README.md',
      ]),
      ['oversight'],
    );
  });

  it('is empty when only the manifest changed', () => {
    assert.deepEqual(installComponentNames(['changed: .claude/.installs.yaml']), []);
  });
});

describe('installDriftTitle', () => {
  it('names one or two drifted components', () => {
    assert.equal(
      installDriftTitle([
        'changed: .claude/.installs.yaml',
        'changed: .claude/rules/engineering-git-workflow.md',
      ]),
      'Refresh the committed install of engineering-git-workflow',
    );
    assert.equal(
      installDriftTitle(['changed: .claude/rules/a.md', 'changed: .claude/rules/b.md']),
      'Refresh the committed install of a and b',
    );
  });

  it('counts the components when there are more than two', () => {
    const findings = ['a', 'b', 'c'].map((n) => `changed: .claude/rules/${n}.md`);
    assert.equal(installDriftTitle(findings), 'Refresh the committed install of 3 components');
  });

  it('counts the components when two names would be too long', () => {
    const long = 'x'.repeat(40);
    const findings = [`changed: .claude/rules/${long}.md`, `changed: .claude/rules/${long}y.md`];
    assert.equal(installDriftTitle(findings), 'Refresh the committed install of 2 components');
  });

  it('falls back to the manifest when nothing else is named', () => {
    assert.equal(
      installDriftTitle(['changed: .claude/.installs.yaml']),
      'Refresh the committed install manifest',
    );
  });

  it('is imperative and within the title limit', () => {
    const t = installDriftTitle(['changed: .claude/rules/engineering-git-workflow.md']);
    assert.match(t, /^Refresh /);
    assert.ok(t.length <= MAX_TITLE);
  });
});
