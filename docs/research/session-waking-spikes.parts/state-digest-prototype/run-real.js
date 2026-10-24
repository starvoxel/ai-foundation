// ------------------------------
// run-real.js
//
// Author: Starvoxel AI Agent - 2026-10-06
// Plan: AIF-012
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * SPIKE PROTOTYPE (AIF-012 Task 001, S1/S2). Throwaway, NOT production.
 * Usage: node run-real.js <selfLogin> <pr> [<pr> ...]
 * Read-only: runs the stateless digest against real PRs of this repo, then the
 * S2 cursor scenarios (lost, round-trip, stale, forged-high, garbage), and
 * prints raw numbers as JSON (logins, ids, counts; never bodies).
 */

import { fetchRaw, rateRemaining } from './github-fetch.js';
import { normalize, check, encodeCursor } from './state-digest.js';

const [selfLogin, ...prArgs] = process.argv.slice(2);
const prs = prArgs.map(Number);
if (!selfLogin || prs.length === 0 || prs.some((n) => !Number.isInteger(n))) {
  console.error('usage: node run-real.js <selfLogin> <pr> [<pr> ...]');
  process.exit(2);
}

const summary = (d) => ({
  cursorStatus: d.cursorStatus,
  events: d.events.length,
  eventTypes: [...new Set(d.events.map((e) => e.type))],
});

const results = [];
for (const n of prs) {
  const meter = { calls: 0 };
  const before = rateRemaining();
  const t0 = Date.now();
  const raw = fetchRaw(n, meter);
  const ms = Date.now() - t0;
  const after = rateRemaining();
  const snap = normalize(raw, selfLogin);
  const first = check(snap, undefined);
  const second = check(snap, first.cursor);
  const stale = check(
    snap,
    encodeCursor({
      ...snap,
      maxIssueCommentId: 0,
      maxReviewId: 0,
      maxReviewCommentId: 0,
      headSha: '0'.repeat(40),
    }),
  );
  const forgedHigh = check(
    snap,
    encodeCursor({ ...snap, maxReviewCommentId: snap.maxReviewCommentId + 10 ** 9 }),
  );
  results.push({
    pr: n,
    state: snap.state,
    headSha: snap.headSha.slice(0, 7),
    fetch: {
      processCalls: meter.calls,
      restUsed: before.core - after.core,
      graphqlUsed: before.graphql - after.graphql,
      wallMs: ms,
    },
    counts: {
      checkRuns: raw.checkRuns.length,
      statuses: raw.combined.total_count,
      reviews: raw.reviews.length,
      reviewComments: raw.reviewComments.length,
      issueComments: raw.issueComments.length,
      threads: raw.threads.length,
    },
    level: {
      checks: snap.checks.state,
      mergeableState: snap.mergeableState,
      unresolvedThreads: snap.unresolvedThreads,
      threadAnswers: snap.threadAnswers,
      derived: snap.derived,
    },
    cursorLen: first.cursor.length,
    noCursor: summary(first.digest),
    roundTrip: summary(second.digest),
    stale: summary(stale.digest),
    forgedHigh: summary(forgedHigh.digest),
    garbage: summary(check(snap, 'not-a-cursor!!').digest),
  });
}
console.log(JSON.stringify(results, null, 2));
