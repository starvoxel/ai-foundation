// ------------------------------
// state-digest.js
//
// Author: Starvoxel AI Agent - 2026-10-06
// Plan: AIF-012
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * SPIKE PROTOTYPE (AIF-012 Task 001, S1/S2). Throwaway research material, NOT
 * production code and not wired into any CLI. Pure functions only: raw GitHub
 * REST/GraphQL payloads in, a digest plus the next opaque cursor out. No I/O,
 * no persisted state, no lock.
 *
 * Trust model: every string from GitHub (comment bodies, titles, logins) is
 * attacker-controlled. The digest never carries bodies or titles, only ids,
 * numbers, enums and logins. The cursor is caller-supplied data and is only
 * ever used to compute the caller's own diff.
 */

const FAILING = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
]);
const CHECK_STATES = ['none', 'pending', 'failing', 'passing'];
const PR_STATES = ['open', 'closed', 'merged'];
const MAX_CURSOR_CHARS = 400;
const SHA_RE = /^[0-9a-f]{40}$/;
const MERGE_RE = /^[a-z_]{1,24}$/;

/**
 * Collapse check runs plus combined commit status into one state.
 * @param {Array<{status: string, conclusion: string|null, name: string}>} runs
 * @param {{state?: string, total_count?: number}} [combined]
 * @returns {{state: string, failing: string[], pending: number, total: number}}
 */
export function classifyChecks(runs = [], combined = {}) {
  const failing = runs.filter((r) => r.status === 'completed' && FAILING.has(r.conclusion));
  const pending = runs.filter((r) => r.status !== 'completed').length;
  const statusCount = combined.total_count ?? 0;
  const statusFailing = statusCount > 0 && ['failure', 'error'].includes(combined.state);
  const statusPending = statusCount > 0 && combined.state === 'pending';
  let state = 'passing';
  if (runs.length === 0 && statusCount === 0) state = 'none';
  else if (failing.length > 0 || statusFailing) state = 'failing';
  else if (pending > 0 || statusPending) state = 'pending';
  return {
    state,
    failing: failing.map((r) => r.name),
    pending,
    total: runs.length + statusCount,
  };
}

/**
 * Group review comments into threads (by root id) and mark which threads end
 * with a comment from `selfLogin` (derivable "answered" signal).
 * @param {Array<{id: number, in_reply_to_id?: number, user?: {login: string}}>} comments
 * @param {string} selfLogin
 * @returns {{threads: number, answeredBySelf: number}}
 */
export function threadAnswers(comments, selfLogin) {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const rootOf = (c) => {
    let cur = c;
    let hops = 0;
    while (cur.in_reply_to_id && byId.has(cur.in_reply_to_id) && hops < 1000) {
      cur = byId.get(cur.in_reply_to_id);
      hops += 1;
    }
    return cur.id;
  };
  const last = new Map();
  for (const c of [...comments].sort((a, b) => a.id - b.id)) last.set(rootOf(c), c);
  let answeredBySelf = 0;
  for (const c of last.values()) if (c.user?.login === selfLogin) answeredBySelf += 1;
  return { threads: last.size, answeredBySelf };
}

/**
 * Normalise raw GitHub payloads into a snapshot. Drops every free-text field.
 * @param {object} raw - {pr, checkRuns, combined, reviews, reviewComments, issueComments, threads}
 * @param {string} selfLogin - the watching agent's own login
 * @param {Date} now
 * @returns {object} snapshot
 */
export function normalize(raw, selfLogin, now = new Date()) {
  const { pr, checkRuns = [], combined = {}, reviews = [], reviewComments = [] } = raw;
  const { issueComments = [], threads = [] } = raw;
  const state = pr.merged ? 'merged' : pr.state;
  const others = (xs) => xs.filter((x) => x.user?.login !== selfLogin);
  const feedbackTimes = [
    ...others(issueComments).map((c) => c.created_at),
    ...others(reviewComments).map((c) => c.created_at),
    ...others(reviews).map((r) => r.submitted_at),
  ].filter(Boolean);
  const times = [...feedbackTimes, ...checkRuns.map((r) => r.completed_at).filter(Boolean)];
  const selfTimes = issueComments
    .filter((c) => c.user?.login === selfLogin)
    .map((c) => c.created_at)
    .sort();
  const lastActivity = times.sort().at(-1) ?? null;
  const lastSelf = selfTimes.at(-1) ?? null;
  const ms = (iso) => (iso ? new Date(iso).getTime() : null);
  return {
    number: pr.number,
    state,
    draft: Boolean(pr.draft),
    headSha: pr.head.sha,
    mergeableState: pr.mergeable_state ?? 'unknown',
    checks: classifyChecks(checkRuns, combined),
    unresolvedThreads: threads.filter((t) => !t.isResolved).length,
    threadAnswers: threadAnswers(reviewComments, selfLogin),
    maxIssueCommentId: Math.max(0, ...issueComments.map((c) => c.id)),
    maxReviewId: Math.max(0, ...reviews.map((r) => r.id)),
    maxReviewCommentId: Math.max(0, ...reviewComments.map((c) => c.id)),
    feedback: {
      issueComments: others(issueComments).map((c) => ({ id: c.id, by: c.user?.login })),
      reviews: others(reviews).map((r) => ({ id: r.id, by: r.user?.login, state: r.state })),
      reviewComments: others(reviewComments).map((c) => ({ id: c.id, by: c.user?.login })),
    },
    derived: {
      lastActivityAt: lastActivity,
      lastSelfCommentAt: lastSelf,
      quietMs: lastActivity ? now.getTime() - ms(lastActivity) : null,
      unansweredSinceSelf: lastSelf
        ? feedbackTimes.filter((t) => t > lastSelf).length
        : feedbackTimes.length,
    },
  };
}

/**
 * Encode a snapshot into an opaque cursor (base64url JSON, under 400 chars).
 * @param {object} snap
 * @returns {string}
 */
export function encodeCursor(snap) {
  const body = {
    v: 1,
    sha: snap.headSha,
    st: snap.state,
    ck: snap.checks.state,
    ms: snap.mergeableState,
    ic: snap.maxIssueCommentId,
    rv: snap.maxReviewId,
    rc: snap.maxReviewCommentId,
  };
  return Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
}

const isId = (n) => Number.isSafeInteger(n) && n >= 0;

/**
 * Strictly validate a caller-supplied cursor. Never throws; never trusts.
 * @param {unknown} cursor
 * @returns {{ok: true, value: object}|{ok: false, reason: string}}
 */
export function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') {
    return { ok: false, reason: 'lost' };
  }
  if (typeof cursor !== 'string' || cursor.length > MAX_CURSOR_CHARS) {
    return { ok: false, reason: 'invalid' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) return { ok: false, reason: 'invalid' };
  let v;
  try {
    v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const keys = ['v', 'sha', 'st', 'ck', 'ms', 'ic', 'rv', 'rc'];
  const shapeOk =
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === keys.length &&
    keys.every((k) => Object.hasOwn(v, k)) &&
    v.v === 1 &&
    SHA_RE.test(v.sha) &&
    PR_STATES.includes(v.st) &&
    CHECK_STATES.includes(v.ck) &&
    typeof v.ms === 'string' &&
    MERGE_RE.test(v.ms) &&
    isId(v.ic) &&
    isId(v.rv) &&
    isId(v.rc);
  return shapeOk ? { ok: true, value: v } : { ok: false, reason: 'invalid' };
}

/**
 * Compute the digest: level state (always reported) plus edge events since the
 * cursor. A lost/invalid/ahead cursor falls back to over-reporting (every
 * existing item is "new"), never to silence.
 * @param {object} snap - from normalize()
 * @param {string|undefined} cursor - opaque cursor from the previous call
 * @returns {{digest: object, cursor: string}}
 */
export function check(snap, cursor) {
  const dec = decodeCursor(cursor);
  let cursorStatus = dec.ok ? 'ok' : dec.reason;
  let base = dec.ok ? dec.value : { sha: null, st: null, ck: null, ms: null, ic: 0, rv: 0, rc: 0 };
  // A watermark beyond anything that exists is impossible unless forged (or a
  // comment was deleted): treat as lost so a forged value cannot hide feedback.
  if (
    dec.ok &&
    (base.ic > snap.maxIssueCommentId ||
      base.rv > snap.maxReviewId ||
      base.rc > snap.maxReviewCommentId)
  ) {
    cursorStatus = 'ahead';
    base = { sha: null, st: null, ck: null, ms: null, ic: 0, rv: 0, rc: 0 };
  }
  const events = [];
  if (base.sha !== snap.headSha) events.push({ type: 'head', from: base.sha, to: snap.headSha });
  if (base.st !== snap.state) events.push({ type: 'state', from: base.st, to: snap.state });
  if (base.ck !== snap.checks.state) {
    events.push({ type: 'checks', from: base.ck, to: snap.checks.state });
  }
  if (base.ms !== snap.mergeableState) {
    events.push({ type: 'mergeable', from: base.ms, to: snap.mergeableState });
  }
  const fresh = (list, mark) => list.filter((x) => x.id > mark);
  for (const c of fresh(snap.feedback.issueComments, base.ic)) {
    events.push({ type: 'issue_comment', id: c.id, by: c.by });
  }
  for (const r of fresh(snap.feedback.reviews, base.rv)) {
    events.push({ type: 'review', id: r.id, by: r.by, state: r.state });
  }
  for (const c of fresh(snap.feedback.reviewComments, base.rc)) {
    events.push({ type: 'review_comment', id: c.id, by: c.by });
  }
  const digest = {
    cursorStatus,
    pr: snap.number,
    state: snap.state,
    headSha: snap.headSha,
    mergeableState: snap.mergeableState,
    checks: snap.checks,
    unresolvedThreads: snap.unresolvedThreads,
    derived: snap.derived,
    events,
  };
  return { digest, cursor: encodeCursor(snap) };
}
