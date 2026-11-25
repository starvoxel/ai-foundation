// ------------------------------
// merge-logic.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Tests for .github/scripts/merge-logic.mjs: the pure decisions behind the `/merge` bot.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const LOGIC = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/merge-logic.mjs'),
).href;
const {
  applyVersion,
  bumpLevelFromLabels,
  decideAuthorization,
  decideMerge,
  describeRefusal,
  evaluateGate,
  formatAudit,
  isBotCommenter,
  isVersionOnlyPaths,
  nextVersion,
  UNSUPPORTED_REPLY,
  classifyComment,
  renderDryRun,
  renderRefusal,
  requiredChecksFromRules,
  toGateInput,
  firstParentIs,
  updateCommitMessage,
  verifyVersionOnly,
  versionCommitMessage,
} = await import(LOGIC);

/** A PR that passes every gate; tests override one field to break it. */
function gateInput(overrides = {}) {
  return {
    pr: {
      state: 'open',
      draft: false,
      headRepo: 'o/r',
      baseRepo: 'o/r',
      baseRef: 'main',
      authorLogin: 'a-human',
      mergeable: true,
      labels: ['bump:patch'],
    },
    defaultBranch: 'main',
    changedPaths: ['lib/thing.js'],
    requiredChecks: ['Validate', 'Test'],
    checks: [
      { name: 'Validate', status: 'completed', conclusion: 'success' },
      { name: 'Test', status: 'completed', conclusion: 'success' },
    ],
    versions: { mergeBase: '0.5.2', head: '0.5.2' },
    ...overrides,
  };
}

describe('classifyComment', () => {
  it('accepts exactly /merge, ignoring surrounding whitespace', () => {
    assert.equal(classifyComment('/merge'), 'merge');
    assert.equal(classifyComment('  /merge\n'), 'merge');
  });

  it('flags /merge followed by more text as unsupported', () => {
    assert.equal(classifyComment('/merge now'), 'unsupported');
    assert.equal(classifyComment('/merge\nplease'), 'unsupported');
    assert.equal(classifyComment('/merge @everyone'), 'unsupported');
  });

  it('leaves prose, other words and other cases alone', () => {
    assert.equal(classifyComment('please /merge'), 'none');
    assert.equal(classifyComment('/merged'), 'none');
    assert.equal(classifyComment('/mergefoo bar'), 'none');
    assert.equal(classifyComment('/MERGE'), 'none');
    assert.equal(classifyComment('**/merge dry run** for #7'), 'none');
    assert.equal(classifyComment(''), 'none');
  });

  it('treats a non-string body as not ours', () => {
    assert.equal(classifyComment(undefined), 'none');
    assert.equal(classifyComment(null), 'none');
  });
});

describe('isBotCommenter', () => {
  it('flags the Bot type and any login containing [bot]', () => {
    assert.equal(isBotCommenter('anything', 'Bot'), true);
    assert.equal(isBotCommenter('github-actions[bot]', 'User'), true);
    assert.equal(isBotCommenter('x[bot]y', 'User'), true);
  });

  it('lets an ordinary user through, including a login that merely says bot', () => {
    assert.equal(isBotCommenter('jo', 'User'), false);
    assert.equal(isBotCommenter('starvoxel-bot', 'User'), false);
    assert.equal(isBotCommenter('', ''), false);
  });
});

describe('UNSUPPORTED_REPLY', () => {
  it('names the supported command and echoes nothing from the comment', () => {
    assert.match(UNSUPPORTED_REPLY, /Comment exactly `\/merge`/);
    assert.doesNotMatch(UNSUPPORTED_REPLY, /@/);
  });
});

describe('decideAuthorization', () => {
  const human = { commenterType: 'User', commenterLogin: 'jo', permission: 'write' };

  it('allows a human with write, maintain or admin', () => {
    for (const permission of ['write', 'maintain', 'admin']) {
      assert.deepEqual(decideAuthorization({ ...human, permission }), { ok: true });
    }
  });

  it('refuses a bot commenter', () => {
    assert.deepEqual(decideAuthorization({ ...human, commenterType: 'Bot' }), {
      ok: false,
      reason: 'bot-commenter',
    });
  });

  it('refuses read, triage and unknown permissions', () => {
    for (const permission of ['read', 'triage', 'none', '', undefined]) {
      assert.deepEqual(decideAuthorization({ ...human, permission }), {
        ok: false,
        reason: 'no-write-permission',
      });
    }
  });
});

describe('bumpLevelFromLabels', () => {
  it('reads the level from the one bump label, ignoring other labels', () => {
    assert.deepEqual(bumpLevelFromLabels(['docs', 'bump:minor']), { level: 'minor' });
  });

  it('reports a missing label', () => {
    assert.deepEqual(bumpLevelFromLabels(['docs']), { error: 'label-missing' });
    assert.deepEqual(bumpLevelFromLabels([]), { error: 'label-missing' });
  });

  it('reports more than one bump label', () => {
    assert.deepEqual(bumpLevelFromLabels(['bump:patch', 'bump:minor']), {
      error: 'label-multiple',
    });
  });

  it('reports a level that is not patch, minor or major', () => {
    assert.deepEqual(bumpLevelFromLabels(['bump:breaking']), { error: 'label-unknown' });
  });
});

describe('nextVersion', () => {
  it('bumps patch and minor', () => {
    assert.equal(nextVersion('0.5.2', 'patch'), '0.5.3');
    assert.equal(nextVersion('0.5.2', 'minor'), '0.6.0');
  });

  it('treats major as minor below 1.0', () => {
    assert.equal(nextVersion('0.5.2', 'major'), '0.6.0');
    assert.equal(nextVersion('0.0.9', 'major'), '0.1.0');
  });

  it('bumps the real major from 1.0', () => {
    assert.equal(nextVersion('1.4.7', 'major'), '2.0.0');
    assert.equal(nextVersion('1.4.7', 'minor'), '1.5.0');
  });

  it('throws on a version that is not plain x.y.z', () => {
    for (const bad of ['', '1.2', '1.2.3-beta', 'v1.2.3', '1.2.3\n; rm']) {
      assert.throws(() => nextVersion(bad, 'patch'), /not plain x\.y\.z/);
    }
  });

  it('throws on an unknown level', () => {
    assert.throws(() => nextVersion('0.5.2', 'breaking'), /Unknown bump level/);
  });
});

describe('evaluateGate', () => {
  it('passes a clean PR and returns its level', () => {
    assert.deepEqual(evaluateGate(gateInput()), { ok: true, reasons: [], level: 'patch' });
  });

  it('accepts skipped and neutral required checks', () => {
    const checks = [
      { name: 'Validate', status: 'completed', conclusion: 'skipped' },
      { name: 'Test', status: 'completed', conclusion: 'neutral' },
    ];
    assert.equal(evaluateGate(gateInput({ checks })).ok, true);
  });

  it('refuses a PR that is not open, is a draft, or is from a fork', () => {
    const base = gateInput();
    const gate = evaluateGate(
      gateInput({ pr: { ...base.pr, state: 'closed', draft: true, headRepo: 'x/r' } }),
    );
    assert.deepEqual(gate.reasons, ['not-open', 'draft', 'fork']);
  });

  it('refuses a stacked PR that does not target the default branch', () => {
    const base = gateInput();
    const gate = evaluateGate(gateInput({ pr: { ...base.pr, baseRef: 'feature-x' } }));
    assert.deepEqual(gate.reasons, ['base-not-main']);
  });

  it('refuses a Dependabot PR', () => {
    const base = gateInput();
    const gate = evaluateGate(gateInput({ pr: { ...base.pr, authorLogin: 'dependabot[bot]' } }));
    assert.deepEqual(gate.reasons, ['dependabot']);
  });

  it('refuses unless GitHub reports the PR mergeable', () => {
    const base = gateInput();
    for (const mergeable of [false, null]) {
      const gate = evaluateGate(gateInput({ pr: { ...base.pr, mergeable } }));
      assert.deepEqual(gate.reasons, ['not-mergeable']);
    }
  });

  it('refuses a hand-edited version', () => {
    const gate = evaluateGate(gateInput({ versions: { mergeBase: '0.5.2', head: '0.5.3' } }));
    assert.deepEqual(gate.reasons, ['version-hand-edited']);
  });

  it('requires a bump label when shipped content changes', () => {
    const base = gateInput();
    const gate = evaluateGate(gateInput({ pr: { ...base.pr, labels: [] } }));
    assert.deepEqual(gate.reasons, ['label-missing']);
  });

  it('allows no label when nothing shipped changes, with no level', () => {
    const base = gateInput();
    const gate = evaluateGate(
      gateInput({ pr: { ...base.pr, labels: [] }, changedPaths: ['docs/x.md'] }),
    );
    assert.deepEqual(gate, { ok: true, reasons: [], level: null });
  });

  it('ignores a label when nothing shipped changes', () => {
    const gate = evaluateGate(gateInput({ changedPaths: ['docs/x.md'] }));
    assert.deepEqual(gate, { ok: true, reasons: [], level: null });
  });

  it('refuses several or unknown bump labels even when nothing shipped changes', () => {
    const base = gateInput();
    const several = evaluateGate(
      gateInput({
        pr: { ...base.pr, labels: ['bump:patch', 'bump:minor'] },
        changedPaths: ['docs/x.md'],
      }),
    );
    assert.deepEqual(several.reasons, ['label-multiple']);
    const unknown = evaluateGate(gateInput({ pr: { ...base.pr, labels: ['bump:breaking'] } }));
    assert.deepEqual(unknown.reasons, ['label-unknown']);
  });

  it('refuses a required check that is missing, pending or failed', () => {
    const missing = evaluateGate(
      gateInput({ checks: [{ name: 'Validate', status: 'completed', conclusion: 'success' }] }),
    );
    assert.deepEqual(missing.reasons, ['check-missing']);
    const pending = evaluateGate(
      gateInput({
        checks: [
          { name: 'Validate', status: 'in_progress', conclusion: null },
          { name: 'Test', status: 'completed', conclusion: 'success' },
        ],
      }),
    );
    assert.deepEqual(pending.reasons, ['check-pending']);
    const failed = evaluateGate(
      gateInput({
        checks: [
          { name: 'Validate', status: 'completed', conclusion: 'failure' },
          { name: 'Test', status: 'completed', conclusion: 'cancelled' },
        ],
      }),
    );
    assert.deepEqual(failed.reasons, ['check-failed']);
  });

  it('refuses when any run of a required check name fails', () => {
    const checks = [
      { name: 'Validate', status: 'completed', conclusion: 'success' },
      { name: 'Validate', status: 'completed', conclusion: 'failure' },
      { name: 'Test', status: 'completed', conclusion: 'success' },
    ];
    assert.deepEqual(evaluateGate(gateInput({ checks })).reasons, ['check-failed']);
  });

  it('ignores checks that are not required', () => {
    const checks = [
      ...gateInput().checks,
      { name: 'Optional', status: 'completed', conclusion: 'failure' },
    ];
    assert.equal(evaluateGate(gateInput({ checks })).ok, true);
  });

  it('collects every reason instead of stopping at the first', () => {
    const base = gateInput();
    const gate = evaluateGate(
      gateInput({ pr: { ...base.pr, draft: true, labels: [] }, checks: [] }),
    );
    assert.deepEqual(gate.reasons, ['draft', 'label-missing', 'check-missing']);
  });
});

describe('decideMerge', () => {
  it('returns the version to assign against main, not the PR base', () => {
    const decision = decideMerge({ ...gateInput(), mainVersion: '0.5.4', behind: false });
    assert.deepEqual(decision, {
      action: 'merge',
      bump: { level: 'patch', from: '0.5.4', to: '0.5.5' },
      updateBranch: false,
    });
  });

  it('asks for a branch update when the PR is behind main', () => {
    const decision = decideMerge({ ...gateInput(), mainVersion: '0.5.2', behind: true });
    assert.equal(decision.action, 'merge');
    assert.equal(decision.updateBranch, true);
  });

  it('merges with no bump when nothing shipped changes', () => {
    const decision = decideMerge({
      ...gateInput({ changedPaths: ['docs/x.md'] }),
      mainVersion: '0.5.2',
      behind: false,
    });
    assert.deepEqual(decision, { action: 'merge', bump: null, updateBranch: false });
  });

  it('refuses with the gate reasons', () => {
    const base = gateInput();
    const decision = decideMerge({
      ...gateInput({ pr: { ...base.pr, draft: true } }),
      mainVersion: '0.5.2',
      behind: false,
    });
    assert.deepEqual(decision, { action: 'refuse', reasons: ['draft'] });
  });

  it('throws when main has an unusable version and a bump is needed', () => {
    assert.throws(
      () => decideMerge({ ...gateInput(), mainVersion: 'oops', behind: false }),
      /not plain x\.y\.z/,
    );
  });
});

describe('describeRefusal', () => {
  it('lists one line per reason and passes unknown codes through', () => {
    const text = describeRefusal(['draft', 'mystery']);
    assert.equal(text, '- The PR is a draft.\n- mystery');
  });

  it('returns an empty string for no reasons', () => {
    assert.equal(describeRefusal([]), '');
  });
});

describe('isVersionOnlyPaths', () => {
  it('accepts the two version files, in any subset', () => {
    assert.equal(isVersionOnlyPaths(['package.json']), true);
    assert.equal(isVersionOnlyPaths(['package-lock.json', 'package.json']), true);
  });

  it('refuses any other file, a nested manifest, or an empty commit', () => {
    assert.equal(isVersionOnlyPaths(['package.json', 'lib/x.js']), false);
    assert.equal(isVersionOnlyPaths(['servers/gmail/package.json']), false);
    assert.equal(isVersionOnlyPaths([]), false);
  });
});

describe('applyVersion and verifyVersionOnly', () => {
  const pkg = `${JSON.stringify({ name: 'x', version: '0.5.2', type: 'module' }, null, 2)}\n`;
  const lock = `${JSON.stringify(
    {
      name: 'x',
      version: '0.5.2',
      lockfileVersion: 3,
      packages: { '': { name: 'x', version: '0.5.2' }, 'node_modules/y': { version: '1.0.0' } },
    },
    null,
    2,
  )}\n`;

  it('sets the version in package.json and leaves the rest alone', () => {
    const after = applyVersion(pkg, '0.6.0');
    assert.equal(JSON.parse(after).version, '0.6.0');
    assert.deepEqual(verifyVersionOnly(pkg, after, '0.6.0'), { ok: true });
  });

  it('sets both version fields in the lock file and keeps dependency versions', () => {
    const after = JSON.parse(applyVersion(lock, '0.6.0'));
    assert.equal(after.version, '0.6.0');
    assert.equal(after.packages[''].version, '0.6.0');
    assert.equal(after.packages['node_modules/y'].version, '1.0.0');
    assert.deepEqual(verifyVersionOnly(lock, JSON.stringify(after), '0.6.0'), { ok: true });
  });

  it('reproduces the original bytes when the version is unchanged', () => {
    assert.equal(applyVersion(pkg, '0.5.2'), pkg);
    assert.equal(applyVersion(lock, '0.5.2'), lock);
  });

  it('throws on a version that is not plain x.y.z', () => {
    assert.throws(() => applyVersion(pkg, '1.0'), /not plain x\.y\.z/);
  });

  it('throws on JSON that is not an object', () => {
    assert.throws(() => applyVersion('[]', '0.6.0'), /not a JSON object/);
    assert.throws(() => applyVersion('null', '0.6.0'), /not a JSON object/);
    assert.throws(() => applyVersion('not json', '0.6.0'), SyntaxError);
  });

  it('refuses a change beyond the version fields', () => {
    const tampered = JSON.stringify({ ...JSON.parse(pkg), version: '0.6.0', scripts: { x: 'y' } });
    const result = verifyVersionOnly(pkg, tampered, '0.6.0');
    assert.equal(result.ok, false);
    assert.match(result.reason, /beyond its version fields/);
  });

  it('refuses a dependency change in the lock file', () => {
    const lockObj = JSON.parse(applyVersion(lock, '0.6.0'));
    lockObj.packages['node_modules/y'].version = '9.9.9';
    const result = verifyVersionOnly(lock, JSON.stringify(lockObj), '0.6.0');
    assert.equal(result.ok, false);
  });

  it('refuses a wrong version in either field', () => {
    const wrong = verifyVersionOnly(pkg, applyVersion(pkg, '0.7.0'), '0.6.0');
    assert.equal(wrong.ok, false);
    assert.match(wrong.reason, /expected '0\.6\.0'/);
    const lockObj = JSON.parse(applyVersion(lock, '0.6.0'));
    lockObj.packages[''].version = '0.5.2';
    const stale = verifyVersionOnly(lock, JSON.stringify(lockObj), '0.6.0');
    assert.equal(stale.ok, false);
  });

  it('reports unreadable manifests instead of throwing', () => {
    const result = verifyVersionOnly(pkg, 'not json', '0.6.0');
    assert.equal(result.ok, false);
    assert.match(result.reason, /unreadable/);
    assert.equal(verifyVersionOnly('[]', pkg, '0.5.2').ok, false);
  });
});

describe('formatAudit', () => {
  const base = { commenter: 'jo', headSha: 'abc123', checks: ['Validate', 'Test'] };

  it('names the commenter, versions, head, branch state and checks', () => {
    const line = formatAudit({
      ...base,
      bump: { level: 'minor', from: '0.5.4', to: '0.6.0' },
      updatedBranch: true,
    });
    assert.equal(
      line,
      'Merged by /merge from @jo: 0.5.4 -> 0.6.0 (minor); gated head abc123; branch updated from main; checks: Validate, Test.',
    );
  });

  it('says so when no version changed and the branch was current', () => {
    const line = formatAudit({ ...base, bump: null, updatedBranch: false });
    assert.match(line, /no version change; gated head abc123; branch up to date/);
  });
});

describe('evaluateGate with no required checks', () => {
  it('refuses rather than passing vacuously', () => {
    const gate = evaluateGate(gateInput({ requiredChecks: [], checks: [] }));
    assert.deepEqual(gate.reasons, ['checks-unknown']);
  });
});

describe('requiredChecksFromRules', () => {
  it('collects the required status check names, without repeats', () => {
    const rules = [
      { type: 'deletion' },
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'Validate' }, { context: 'Test' }] },
      },
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'Test' }] },
      },
    ];
    assert.deepEqual(requiredChecksFromRules(rules), ['Validate', 'Test']);
  });

  it('returns nothing for rules without status checks or an unexpected shape', () => {
    assert.deepEqual(requiredChecksFromRules([{ type: 'deletion' }]), []);
    assert.deepEqual(requiredChecksFromRules([{ type: 'required_status_checks' }]), []);
    assert.deepEqual(requiredChecksFromRules(null), []);
    assert.deepEqual(requiredChecksFromRules({}), []);
    assert.deepEqual(
      requiredChecksFromRules([
        {
          type: 'required_status_checks',
          parameters: { required_status_checks: [{ context: 5 }, null] },
        },
      ]),
      [],
    );
  });
});

describe('toGateInput', () => {
  const pull = {
    state: 'open',
    draft: false,
    mergeable: true,
    head: { sha: 'abc', repo: { full_name: 'o/r' } },
    base: { ref: 'main', repo: { full_name: 'o/r' } },
    user: { login: 'jo' },
    labels: [{ name: 'bump:minor' }],
  };
  const data = {
    pull,
    files: [{ filename: 'lib/x.js' }],
    checkRuns: [{ name: 'Validate', status: 'completed', conclusion: 'success', id: 1 }],
    requiredChecks: ['Validate'],
    mergeBaseJson: '{"version":"0.5.2"}',
    headJson: '{"version":"0.5.2"}',
    defaultBranch: 'main',
  };

  it('maps the API payloads onto the gate input', () => {
    assert.deepEqual(toGateInput(data), {
      pr: {
        state: 'open',
        draft: false,
        headRepo: 'o/r',
        baseRepo: 'o/r',
        baseRef: 'main',
        authorLogin: 'jo',
        mergeable: true,
        labels: ['bump:minor'],
      },
      defaultBranch: 'main',
      changedPaths: ['lib/x.js'],
      requiredChecks: ['Validate'],
      checks: [{ name: 'Validate', status: 'completed', conclusion: 'success' }],
      versions: { mergeBase: '0.5.2', head: '0.5.2' },
    });
  });

  it('keeps an unknown mergeable state as null and tolerates a missing fork repo', () => {
    const input = toGateInput({
      ...data,
      pull: { ...pull, mergeable: null, head: { sha: 'abc', repo: null } },
    });
    assert.equal(input.pr.mergeable, null);
    assert.equal(input.pr.headRepo, '');
  });

  it('reads no version from a missing or unreadable package.json', () => {
    const input = toGateInput({ ...data, mergeBaseJson: null, headJson: 'not json' });
    assert.deepEqual(input.versions, { mergeBase: undefined, head: undefined });
  });
});

describe('renderDryRun', () => {
  const context = { pullNumber: 7, headSha: 'abc123' };

  it('says what would be merged and that nothing was done', () => {
    const text = renderDryRun(
      { action: 'merge', bump: { level: 'patch', from: '0.5.4', to: '0.5.5' }, updateBranch: true },
      context,
    );
    assert.match(text, /dry run\*\* for #7 at `abc123`\. Nothing was pushed or merged/);
    assert.match(text, /Version: 0\.5\.4 -> 0\.5\.5 \(patch\)/);
    assert.match(text, /merge `main` into the branch first/);
  });

  it('says so when no version changes and the branch is current', () => {
    const text = renderDryRun({ action: 'merge', bump: null, updateBranch: false }, context);
    assert.match(text, /no version change/);
    assert.match(text, /branch is up to date/);
  });

  it('lists the refusal reasons', () => {
    const text = renderDryRun({ action: 'refuse', reasons: ['draft'] }, context);
    assert.match(text, /Would refuse:\n- The PR is a draft\./);
  });
});

describe('commit messages', () => {
  it('skip CI on the bot commits and name what they do', () => {
    assert.equal(updateCommitMessage('feat/x', 'main'), 'Merge main into feat/x [skip ci]');
    assert.equal(versionCommitMessage('0.6.0'), 'Set the version to 0.6.0 [skip ci]');
  });
});

describe('firstParentIs', () => {
  it('is true only when the first parent matches', () => {
    assert.equal(firstParentIs([{ sha: 'a' }, { sha: 'b' }], 'a'), true);
    assert.equal(firstParentIs([{ sha: 'b' }, { sha: 'a' }], 'a'), false);
  });

  it('is false for no parents or a malformed value', () => {
    assert.equal(firstParentIs([], 'a'), false);
    assert.equal(firstParentIs(undefined, 'a'), false);
    assert.equal(firstParentIs(null, 'a'), false);
    assert.equal(firstParentIs([null], 'a'), false);
  });
});

describe('renderRefusal', () => {
  it('says it refused and changed nothing, and lists the reasons', () => {
    const text = renderRefusal(['draft', 'label-missing'], { pullNumber: 7, headSha: 'abc' });
    assert.match(text, /^\*\*\/merge refused\*\* for #7 at `abc`\. Nothing was changed\./);
    assert.match(text, /- The PR is a draft\./);
    assert.match(text, /- The PR changes shipped content but has no/);
    assert.doesNotMatch(text, /dry run/i);
  });
});
