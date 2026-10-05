/**
 * pr-watch — the pure core: watch record plus a fresh observation in, the
 * next record plus a digest out.
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Wake-independent by construction: it never sees how the session was woken,
 * only a state freshly fetched by the I/O layer. Judgment (is a red check
 * this PR's fault, how to answer a request) is deliberately absent.
 */

import { triageFeedback } from './feedback.js';
import { deriveStatus, deriveMergeable, summarize } from './digest.js';
import { evaluateStop, planNext } from './schedule.js';

/** @typedef {import('./digest.js').Observation} Observation */
/** @typedef {import('./digest.js').Digest} Digest */

/**
 * @typedef {object} WatchRecord
 * @property {1} version
 * @property {string} repo - `owner/name`
 * @property {string} target - `#<n>` or the branch name
 * @property {string|null} human - Login of the human who started the watch, set only by the caller
 * @property {string|null} self - The agent's own login, set only by the caller
 * @property {string|null} headSha
 * @property {Record<string, string>} checks - name to class, on `headSha`
 * @property {string|null} lastStatus
 * @property {string|null} mergeable
 * @property {Record<string, string>} handled - feedback key to version already acted on, answered, or escalated
 * @property {Record<string, string>} seenAct - permitted requests already reported, key to version
 * @property {number} quietSince - Epoch ms of the last difference
 * @property {number|null} pendingSince
 * @property {boolean} pendingCapReported
 * @property {boolean} blockerReported
 * @property {string|null} stopped - Stop reason once stopped
 */

/**
 * @param {{repo: string, target: string, human?: string|null, self?: string|null, now: number}} input
 * @returns {WatchRecord}
 */
export function newRecord({ repo, target, human = null, self = null, now }) {
  return {
    version: 1,
    repo,
    target,
    human,
    self,
    headSha: null,
    checks: {},
    lastStatus: null,
    mergeable: null,
    handled: {},
    seenAct: {},
    quietSince: now,
    pendingSince: null,
    pendingCapReported: false,
    blockerReported: false,
    stopped: null,
  };
}

/**
 * Apply one observation. Does not mutate `record`.
 * @param {WatchRecord} record
 * @param {Observation} obs
 * @param {{now: number, explicitStop?: boolean}} options
 * @returns {{record: WatchRecord, digest: Digest}}
 */
export function observe(record, obs, { now, explicitStop = false }) {
  const first = record.headSha === null;
  const headChanged = !first && record.headSha !== obs.headSha;
  const status = deriveStatus(obs);
  const mergeable = deriveMergeable(obs);

  /** @type {object[]} */
  const changes = [];
  if (first) changes.push({ type: 'initial' });
  else if (headChanged)
    changes.push({ type: 'head_changed', from: record.headSha, to: obs.headSha });
  else {
    for (const name of Object.keys(obs.checks.byName).sort()) {
      const from = record.checks[name] ?? null;
      const to = obs.checks.byName[name];
      if (from !== to) changes.push({ type: 'check', name, from, to });
    }
  }
  if (!first && record.lastStatus !== status) {
    changes.push({ type: 'status', from: record.lastStatus, to: status });
  }
  if (!first && record.mergeable !== mergeable) {
    changes.push({ type: 'mergeable', from: record.mergeable, to: mergeable });
  }

  // Feedback handling is per PR, not per head: a new head never re-opens handled feedback.
  const handled = { ...record.handled };
  const seenAct = { ...record.seenAct };
  const triage = triageFeedback(obs.feedbackItems, handled, {
    prAuthor: obs.author ?? null,
    human: record.human,
    self: record.self,
  });
  Object.assign(handled, triage.ownKeys);
  for (const item of triage.escalate) {
    handled[item.key] = obs.feedbackItems.find((f) => f.key === item.key)?.version ?? '';
  }
  for (const item of triage.act) {
    const version = obs.feedbackItems.find((f) => f.key === item.key)?.version ?? '';
    if (seenAct[item.key] !== version) {
      changes.push({ type: 'feedback', key: item.key, reason: item.reason, edited: item.edited });
      seenAct[item.key] = version;
    }
  }
  if (triage.escalate.length > 0) {
    changes.push({ type: 'escalate', count: triage.escalate.length });
  }

  const changed = changes.length > 0;
  const isPending = status === 'pending' || status === 'no_checks';
  const pendingSince = isPending
    ? headChanged || record.pendingSince === null
      ? now
      : record.pendingSince
    : null;
  const pendingCapReported = headChanged || !isPending ? false : record.pendingCapReported;
  const quietSince = changed ? now : record.quietSince;

  const stop = evaluateStop({
    status,
    now,
    quietSince,
    blockerReported: record.blockerReported,
    explicitStop,
    landed: obs.kind === 'branch' && Boolean(obs.landed),
  });
  const plan = planNext({ status, now, pendingSince, pendingCapReported, quietSince });

  /** @type {WatchRecord} */
  const next = {
    ...record,
    headSha: obs.headSha,
    checks: { ...obs.checks.byName },
    lastStatus: status,
    mergeable,
    handled,
    seenAct,
    quietSince,
    pendingSince,
    pendingCapReported: pendingCapReported || plan.reportOnce.includes('pending_cap'),
    stopped: stop ?? record.stopped,
  };

  /** @type {Omit<Digest, 'summary'>} */
  const body = {
    schema: 1,
    repo: record.repo,
    target: record.target,
    head_sha: obs.headSha,
    status,
    mergeable,
    changed,
    changes,
    checks: { state: obs.checks.state, red: obs.checks.red, pending: obs.checks.pending },
    feedback: { act: triage.act, escalate: triage.escalate },
    report_once: plan.reportOnce,
    stop: stop ? { reason: stop } : null,
    next_check_after_s: stop ? null : plan.nextCheckAfterS,
  };
  return { record: next, digest: { ...body, summary: summarize(body) } };
}

/**
 * Mark feedback as acted on or answered (a permitted actor's request the
 * agent has dealt with). Unknown keys are ignored. Does not mutate.
 * @param {WatchRecord} record
 * @param {string[]} keys - `kind:id` keys from a digest
 * @returns {WatchRecord}
 */
export function acknowledge(record, keys) {
  const handled = { ...record.handled };
  for (const key of keys) {
    if (typeof key === 'string' && key in record.seenAct) handled[key] = record.seenAct[key];
  }
  return { ...record, handled };
}
