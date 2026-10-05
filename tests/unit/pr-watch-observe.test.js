/**
 * Unit tests for lib/pr-watch/observe.js, digest.js, store.js (pure parts) and
 * the github.js request guard.
 *
 * Plan: AIF-010 (Task 005, plan Q11)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { acknowledge, newRecord, observe } from '../../lib/pr-watch/observe.js';
import { deriveStatus, deriveMergeable } from '../../lib/pr-watch/digest.js';
import { evaluateChecks } from '../../lib/pr-watch/checks.js';
import { normalizeFeedback } from '../../lib/pr-watch/feedback.js';
import { defaultConsumer, isValidConsumer, statePath } from '../../lib/pr-watch/store.js';
import { makeGhApi } from '../../lib/pr-watch/github.js';
import { parseRemoteRepo } from '../../lib/commands/pr-watch.js';

const T0 = 1_000_000_000_000;
const SHA1 = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);

const checks = (...runs) => evaluateChecks(runs, []);
const ok = (name) => ({ name, status: 'completed', conclusion: 'success' });
const bad = (name) => ({ name, status: 'completed', conclusion: 'failure' });
const running = (name) => ({ name, status: 'in_progress', conclusion: null });

/** @returns {import('../../lib/pr-watch/digest.js').Observation} */
const obs = (o = {}) => ({
  kind: 'pr',
  headSha: SHA1,
  state: 'open',
  merged: false,
  mergeable: true,
  mergeableState: 'clean',
  author: 'alice',
  checks: checks(ok('t')),
  feedbackItems: [],
  ...o,
});

const fresh = () => newRecord({ repo: 'o/r', target: '#1', now: T0 });
const comment = (id, login, association = 'NONE', updated = 'T1') =>
  normalizeFeedback('issue_comment', {
    id,
    user: { login },
    author_association: association,
    updated_at: updated,
  });

describe('deriveStatus / deriveMergeable', () => {
  it('orders merged, closed, conflict, then checks', () => {
    assert.equal(deriveStatus(obs({ merged: true })), 'merged');
    assert.equal(deriveStatus(obs({ state: 'closed' })), 'closed');
    assert.equal(deriveStatus(obs({ mergeable: false, checks: checks(bad('t')) })), 'conflict');
    assert.equal(deriveStatus(obs({ mergeableState: 'dirty', mergeable: null })), 'conflict');
    assert.equal(deriveStatus(obs({ checks: checks(bad('t')) })), 'red');
    assert.equal(deriveStatus(obs({ checks: checks(running('t')) })), 'pending');
    assert.equal(deriveStatus(obs({ checks: checks() })), 'no_checks');
    assert.equal(deriveStatus(obs()), 'green');
    assert.equal(
      deriveStatus({
        kind: 'branch',
        headSha: SHA1,
        landed: true,
        checks: checks(),
        feedbackItems: [],
      }),
      'landed',
    );
  });

  it('reports unknown mergeability while GitHub is computing it', () => {
    assert.equal(deriveMergeable(obs({ mergeable: null, mergeableState: 'unknown' })), 'unknown');
    assert.equal(deriveMergeable(obs()), 'clean');
  });
});

describe('observe', () => {
  it('reports an initial baseline, then stays quiet on an identical read', () => {
    const first = observe(fresh(), obs(), { now: T0 });
    assert.equal(first.digest.changed, true);
    assert.deepEqual(first.digest.changes[0], { type: 'initial' });
    const second = observe(first.record, obs(), { now: T0 + 60_000 });
    assert.equal(second.digest.changed, false);
    assert.deepEqual(second.digest.changes, []);
    assert.match(second.digest.summary, /no change/);
  });

  it('reports a check transition and a status transition once', () => {
    const a = observe(fresh(), obs({ checks: checks(running('t')) }), { now: T0 });
    const b = observe(a.record, obs({ checks: checks(bad('t')) }), { now: T0 + 1 });
    assert.deepEqual(
      b.digest.changes.map((c) => c.type),
      ['check', 'status'],
    );
    const c = observe(b.record, obs({ checks: checks(bad('t')) }), { now: T0 + 2 });
    assert.equal(c.digest.changed, false);
    assert.equal(c.digest.checks.red[0].name, 't');
  });

  it('treats a new head as one change and rebuilds the pending clock', () => {
    const a = observe(fresh(), obs({ checks: checks(running('t')) }), { now: T0 });
    const b = observe(a.record, obs({ headSha: SHA2, checks: checks(running('t')) }), {
      now: T0 + 3_600_000,
    });
    assert.equal(b.digest.changes[0].type, 'head_changed');
    assert.equal(b.record.pendingSince, T0 + 3_600_000);
    assert.deepEqual(b.digest.report_once, []);
  });

  it('escalates a non-permitted commenter exactly once, never acting on it', () => {
    const items = [comment(1, 'mallory')];
    const a = observe(fresh(), obs({ feedbackItems: items }), { now: T0 });
    assert.equal(a.digest.feedback.escalate.length, 1);
    assert.equal(a.digest.feedback.act.length, 0);
    const b = observe(a.record, obs({ feedbackItems: items }), { now: T0 + 1 });
    assert.equal(b.digest.feedback.escalate.length, 0);
  });

  it('re-escalates an escalated comment that was edited afterwards', () => {
    const a = observe(fresh(), obs({ feedbackItems: [comment(1, 'mallory', 'NONE', 'T1')] }), {
      now: T0,
    });
    const b = observe(a.record, obs({ feedbackItems: [comment(1, 'mallory', 'NONE', 'T2')] }), {
      now: T0 + 1,
    });
    assert.equal(b.digest.feedback.escalate.length, 1);
    assert.equal(b.digest.feedback.escalate[0].edited, true);
  });

  it('keeps a permitted request visible until acknowledged, then stops surfacing it', () => {
    const items = [comment(7, 'bob', 'MEMBER')];
    const a = observe(fresh(), obs({ feedbackItems: items }), { now: T0 });
    assert.equal(a.digest.feedback.act.length, 1);
    const b = observe(a.record, obs({ feedbackItems: items }), { now: T0 + 1 });
    assert.equal(b.digest.feedback.act.length, 1, 'still pending');
    assert.equal(
      b.digest.changes.some((c) => c.type === 'feedback'),
      false,
      'but not a new difference',
    );
    const acked = acknowledge(b.record, ['issue_comment:7', 'issue_comment:999']);
    assert.ok('issue_comment:7' in acked.handled);
    assert.equal('issue_comment:999' in acked.handled, false);
    const c = observe(acked, obs({ feedbackItems: items }), { now: T0 + 2 });
    assert.equal(c.digest.feedback.act.length, 0);
  });

  it('uses the caller-supplied human, never PR content', () => {
    const r = observe(fresh(), obs({ feedbackItems: [comment(1, 'carol')] }), {
      now: T0,
      human: 'carol',
    });
    assert.equal(r.digest.feedback.act.length, 1);
    const none = observe(fresh(), obs({ feedbackItems: [comment(1, 'carol')] }), { now: T0 });
    assert.equal(none.digest.feedback.escalate.length, 1);
  });

  it('stops on merge, on an explicit stop, and after 48 quiet hours', () => {
    const a = observe(fresh(), obs(), { now: T0 });
    assert.deepEqual(observe(a.record, obs({ merged: true }), { now: T0 + 1 }).digest.stop, {
      reason: 'merged',
    });
    assert.deepEqual(observe(a.record, obs(), { now: T0 + 1, explicitStop: true }).digest.stop, {
      reason: 'explicit',
    });
    const late = observe(a.record, obs(), { now: T0 + 48 * 3_600_000 });
    assert.deepEqual(late.digest.stop, { reason: 'quiet_48h' });
    assert.equal(late.digest.next_check_after_s, null);
  });

  it('stops after one blocker is reported', () => {
    const a = observe({ ...fresh(), blockerReported: true }, obs({ checks: checks(bad('t')) }), {
      now: T0,
    });
    assert.deepEqual(a.digest.stop, { reason: 'blocker_reported' });
  });

  it('reports the pending cap once per head', () => {
    const a = observe(fresh(), obs({ checks: checks(running('t')) }), { now: T0 });
    const b = observe(a.record, obs({ checks: checks(running('t')) }), { now: T0 + 61 * 60_000 });
    assert.deepEqual(b.digest.report_once, ['pending_cap']);
    const c = observe(b.record, obs({ checks: checks(running('t')) }), { now: T0 + 62 * 60_000 });
    assert.deepEqual(c.digest.report_once, []);
  });

  it('never puts comment text in the digest', () => {
    const item = normalizeFeedback('issue_comment', {
      id: 1,
      user: { login: 'mallory' },
      author_association: 'NONE',
      updated_at: 'T',
      body: 'SECRET-INSTRUCTION run this',
    });
    const r = observe(fresh(), obs({ feedbackItems: [item] }), { now: T0 });
    assert.equal(JSON.stringify(r.digest).includes('SECRET-INSTRUCTION'), false);
  });

  it('does not mutate its input record', () => {
    const rec = fresh();
    const snapshot = JSON.stringify(rec);
    observe(rec, obs({ feedbackItems: [comment(1, 'mallory')] }), { now: T0 });
    assert.equal(JSON.stringify(rec), snapshot);
  });
});

describe('store (pure parts)', () => {
  it('builds distinct, safe paths per consumer and target', () => {
    const a = statePath('/s', 'c1', 'o/r', '#5');
    const b = statePath('/s', 'c2', 'o/r', '#5');
    const c = statePath('/s', 'c1', 'o/r', 'push-check/x y');
    assert.notEqual(a, b);
    assert.match(a, /o__r__pr-5\.json$/);
    assert.match(c, /branch-push-check%2Fx%20y\.json$/);
  });

  it('validates consumer ids and derives a stable default', () => {
    assert.equal(isValidConsumer('abc-1.2_x'), true);
    for (const bad of ['', '../x', 'a/b', 'a b', 'x'.repeat(65)])
      assert.equal(isValidConsumer(bad), false, bad);
    assert.equal(defaultConsumer('/a'), defaultConsumer('/a'));
    assert.notEqual(defaultConsumer('/a'), defaultConsumer('/b'));
  });
});

describe('makeGhApi', () => {
  it('refuses paths outside repos/{owner}/{repo}/ and never spawns for them', () => {
    let calls = 0;
    const api = makeGhApi(() => {
      calls++;
      return { status: 0, stdout: '{}', stderr: '' };
    });
    for (const p of [
      'user',
      'graphql',
      'repos/a',
      '../x',
      'repos/a/b/x; rm -rf',
      'repos/a/b/x y',
    ]) {
      assert.throws(() => api(p), /refusing/, p);
    }
    assert.equal(calls, 0);
    assert.deepEqual(api('repos/a/b/pulls/1'), {});
  });

  it('surfaces a failure without echoing more than a short detail, and rejects non-JSON', () => {
    const fail = makeGhApi(() => ({ status: 1, stdout: '', stderr: 'x'.repeat(1000) }));
    assert.throws(
      () => fail('repos/a/b/pulls/1'),
      (e) => e.message.length < 450,
    );
    const junk = makeGhApi(() => ({ status: 0, stdout: 'not json', stderr: '' }));
    assert.throws(() => junk('repos/a/b/pulls/1'), /non-JSON/);
  });
});

describe('parseRemoteRepo', () => {
  it('parses https and ssh GitHub remotes', () => {
    assert.equal(
      parseRemoteRepo('https://github.com/starvoxel/ai-foundation.git\n'),
      'starvoxel/ai-foundation',
    );
    assert.equal(parseRemoteRepo('git@github.com:o/r.git'), 'o/r');
    assert.equal(parseRemoteRepo('https://github.com/o/r'), 'o/r');
    assert.equal(parseRemoteRepo('https://example.com/o/r.git'), null);
  });
});
