/**
 * pr-watch — status derivation and digest rendering (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * The digest is the one output every wake source produces: terse JSON plus a
 * short human line, transitions only, metadata only (no comment text).
 */

/**
 * @typedef {object} Observation
 * @property {'pr'|'branch'} kind
 * @property {string} headSha
 * @property {boolean} [merged] - PR only
 * @property {'open'|'closed'} [state] - PR only
 * @property {boolean} [draft] - PR only
 * @property {boolean|null} [mergeable] - PR only; null while GitHub is still computing it
 * @property {string|null} [mergeableState] - PR only
 * @property {string|null} [author] - PR only: the PR author's login
 * @property {boolean} [landed] - Branch only: the base branch already contains the tip
 * @property {import('./checks.js').CheckSummary} checks
 * @property {import('./feedback.js').FeedbackItem[]} feedbackItems
 */

/**
 * @param {Observation} obs
 * @returns {'merged'|'closed'|'landed'|'conflict'|'red'|'pending'|'no_checks'|'green'}
 */
export function deriveStatus(obs) {
  if (obs.kind === 'pr') {
    if (obs.merged) return 'merged';
    if (obs.state === 'closed') return 'closed';
    if (obs.mergeable === false || obs.mergeableState === 'dirty') return 'conflict';
  } else if (obs.landed) {
    return 'landed';
  }
  switch (obs.checks.state) {
    case 'red':
      return 'red';
    case 'pending':
      return 'pending';
    case 'none':
      return 'no_checks';
    default:
      return 'green';
  }
}

/**
 * @param {Observation} obs
 * @returns {'clean'|'conflicting'|'unknown'|'n/a'}
 */
export function deriveMergeable(obs) {
  if (obs.kind !== 'pr') return 'n/a';
  if (obs.mergeable === false || obs.mergeableState === 'dirty') return 'conflicting';
  if (obs.mergeable === true) return 'clean';
  return 'unknown';
}

/**
 * @typedef {object} Digest
 * @property {1} schema
 * @property {string} repo
 * @property {string} target - `#<n>` for a PR, the branch name otherwise
 * @property {string} head_sha
 * @property {string} status
 * @property {string} mergeable
 * @property {boolean} changed - Any difference from the record (including first read)
 * @property {object[]} changes
 * @property {{state: string, red: import('./checks.js').CheckSummary['red'], pending: string[]}} checks
 * @property {{act: object[], escalate: object[]}} feedback - `act`: unacknowledged requests from permitted actors; `escalate`: first-time reports of everyone else
 * @property {string[]} report_once - One-time reports now due (e.g. `pending_cap`)
 * @property {{reason: string}|null} stop
 * @property {number|null} next_check_after_s - Null once the watch has stopped
 * @property {string} summary - One human line
 */

/**
 * One human line for a digest.
 * @param {Omit<Digest, 'summary'>} d
 * @returns {string}
 */
export function summarize(d) {
  const parts = [`${d.target} ${d.status}`];
  if (d.status === 'red' && d.checks.red.length > 0) {
    parts.push(`failing: ${d.checks.red.map((r) => r.name).join(', ')}`);
  }
  if (d.status === 'pending' && d.checks.pending.length > 0) {
    parts.push(`${d.checks.pending.length} check(s) pending`);
  }
  if (d.feedback.act.length > 0) parts.push(`${d.feedback.act.length} request(s) to evaluate`);
  if (d.feedback.escalate.length > 0) {
    parts.push(`${d.feedback.escalate.length} from non-permitted actors: escalate once`);
  }
  if (d.report_once.length > 0) parts.push(`report once: ${d.report_once.join(', ')}`);
  if (d.stop) parts.push(`STOP (${d.stop.reason})`);
  else if (!d.changed) parts.push(`no change, next check in ${d.next_check_after_s}s`);
  else parts.push(`next check in ${d.next_check_after_s}s`);
  return parts.join('; ');
}
