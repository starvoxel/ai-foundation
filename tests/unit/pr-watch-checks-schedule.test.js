/**
 * Unit tests for lib/pr-watch/checks.js and schedule.js.
 *
 * Plan: AIF-010 (Task 005, plan Q11)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCheckRun, classifyStatus, evaluateChecks } from '../../lib/pr-watch/checks.js';
import { CADENCE, evaluateStop, planNext } from '../../lib/pr-watch/schedule.js';

const run = (name, status, conclusion = null) => ({ name, status, conclusion });

describe('classifyCheckRun', () => {
  it('treats unfinished runs as pending', () => {
    for (const status of ['queued', 'in_progress', 'waiting', 'pending', undefined, null]) {
      assert.equal(classifyCheckRun({ status, conclusion: null }), 'pending', String(status));
    }
  });

  it('classifies completed conclusions', () => {
    for (const c of ['success', 'neutral', 'skipped']) {
      assert.equal(classifyCheckRun(run('x', 'completed', c)), 'green', c);
    }
    for (const c of [
      'failure',
      'cancelled',
      'timed_out',
      'action_required',
      'stale',
      'startup_failure',
    ]) {
      assert.equal(classifyCheckRun(run('x', 'completed', c)), 'red', c);
    }
  });

  it('never reads an unknown or missing conclusion on a completed run as green', () => {
    assert.equal(classifyCheckRun(run('x', 'completed', 'brand_new')), 'red');
    assert.equal(classifyCheckRun(run('x', 'completed', null)), 'red');
    assert.equal(classifyCheckRun(null), 'pending');
  });
});

describe('classifyStatus', () => {
  it('maps legacy states', () => {
    assert.equal(classifyStatus({ state: 'success' }), 'green');
    assert.equal(classifyStatus({ state: 'pending' }), 'pending');
    assert.equal(classifyStatus({ state: 'failure' }), 'red');
    assert.equal(classifyStatus({ state: 'error' }), 'red');
    assert.equal(classifyStatus({}), 'red');
  });
});

describe('evaluateChecks', () => {
  it('reports none for an empty list (never green)', () => {
    assert.equal(evaluateChecks([], []).state, 'none');
    assert.equal(evaluateChecks(undefined, undefined).state, 'none');
  });

  it('is green only when every check is green', () => {
    assert.equal(
      evaluateChecks([run('a', 'completed', 'success'), run('b', 'completed', 'skipped')], [])
        .state,
      'green',
    );
  });

  it('is pending while any check is unfinished and none is red', () => {
    const s = evaluateChecks([run('a', 'completed', 'success'), run('b', 'in_progress')], []);
    assert.equal(s.state, 'pending');
    assert.deepEqual(s.pending, ['b']);
  });

  it('is red when any check is red, even if others are pending', () => {
    const s = evaluateChecks([run('a', 'queued'), run('b', 'completed', 'timed_out')], []);
    assert.equal(s.state, 'red');
    assert.deepEqual(s.red, [{ name: 'b', conclusion: 'timed_out', base_red: false }]);
  });

  it('keeps the worst class for a duplicate name (a re-run does not hide a failure)', () => {
    const s = evaluateChecks(
      [run('a', 'completed', 'failure'), run('a', 'completed', 'success')],
      [],
    );
    assert.equal(s.byName.a, 'red');
  });

  it('includes legacy statuses', () => {
    assert.equal(evaluateChecks([], [{ context: 'ci/x', state: 'failure' }]).state, 'red');
  });

  it('flags a red check that is already red on the base branch', () => {
    const base = [run('a', 'completed', 'failure'), run('b', 'completed', 'success')];
    const s = evaluateChecks(
      [run('a', 'completed', 'failure'), run('c', 'completed', 'failure')],
      [],
      base,
    );
    assert.deepEqual(
      s.red.map((r) => [r.name, r.base_red]),
      [
        ['a', true],
        ['c', false],
      ],
    );
  });

  it('survives garbage entries', () => {
    const s = evaluateChecks([null, {}, 'x'], [null]);
    assert.notEqual(s.state, 'green');
  });
});

describe('evaluateStop', () => {
  const base = {
    status: 'pending',
    now: 1_000_000,
    quietSince: 1_000_000,
    blockerReported: false,
    explicitStop: false,
  };

  it('stops on merged, closed, landed, blocker, explicit', () => {
    assert.equal(evaluateStop({ ...base, status: 'merged' }), 'merged');
    assert.equal(evaluateStop({ ...base, status: 'closed' }), 'closed');
    assert.equal(evaluateStop({ ...base, landed: true }), 'landed');
    assert.equal(evaluateStop({ ...base, blockerReported: true }), 'blocker_reported');
    assert.equal(evaluateStop({ ...base, explicitStop: true }), 'explicit');
  });

  it('stops after 48 hours with no difference, not before', () => {
    const t = CADENCE.quietStopS * 1000;
    assert.equal(evaluateStop({ ...base, now: base.quietSince + t - 1 }), null);
    assert.equal(evaluateStop({ ...base, now: base.quietSince + t }), 'quiet_48h');
  });

  it('keeps going otherwise', () => {
    assert.equal(evaluateStop(base), null);
  });
});

describe('planNext', () => {
  const now = 10_000_000;
  const s = (sec) => now - sec * 1000;

  it('backs off pending polls from 2 minutes to a 15-minute ceiling', () => {
    const at = (elapsed) =>
      planNext({
        status: 'pending',
        now,
        pendingSince: s(elapsed),
        pendingCapReported: false,
        quietSince: s(elapsed),
      });
    assert.equal(at(0).nextCheckAfterS, 120);
    assert.equal(at(6 * 60).nextCheckAfterS, 300);
    assert.equal(at(20 * 60).nextCheckAfterS, 600);
    assert.equal(at(45 * 60).nextCheckAfterS, 900);
    assert.ok(at(45 * 60).nextCheckAfterS <= CADENCE.pendingCeilingS);
  });

  it('reports the 60-minute pending cap once, then uses the long cadence', () => {
    const input = { status: 'pending', now, pendingSince: s(61 * 60), quietSince: s(61 * 60) };
    const first = planNext({ ...input, pendingCapReported: false });
    assert.deepEqual(first.reportOnce, ['pending_cap']);
    assert.equal(first.nextCheckAfterS, 3600);
    assert.deepEqual(planNext({ ...input, pendingCapReported: true }).reportOnce, []);
  });

  it('treats no_checks like pending', () => {
    assert.equal(
      planNext({
        status: 'no_checks',
        now,
        pendingSince: s(0),
        pendingCapReported: false,
        quietSince: s(0),
      }).nextCheckAfterS,
      120,
    );
  });

  it('waits on a human at 15 minutes, backing off toward an hour', () => {
    const at = (quiet) =>
      planNext({
        status: 'green',
        now,
        pendingSince: null,
        pendingCapReported: false,
        quietSince: s(quiet),
      }).nextCheckAfterS;
    assert.equal(at(0), 900);
    assert.equal(at(40 * 60), 1800);
    assert.equal(at(5 * 3600), 3600);
  });

  it('asks for a prompt re-check after a red or conflicting state', () => {
    for (const status of ['red', 'conflict']) {
      assert.equal(
        planNext({ status, now, pendingSince: null, pendingCapReported: false, quietSince: s(0) })
          .nextCheckAfterS,
        300,
      );
    }
  });
});
