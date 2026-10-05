/**
 * pr-watch — CI check evaluation (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Classifies GitHub check-runs and commit statuses for one commit into
 * green / pending / red and reports facts only. Whether a red check is this
 * PR's fault, and how to fix it, stays with the agent.
 *
 * "Green" means every check or status the API returned for the commit is
 * green. There is no required-check awareness (the helper cannot read branch
 * protection) and no use of `mergeable_state`, so a PR GitHub still marks
 * `blocked` (a missing required check or review) can read green here; the
 * mergeable field in the digest is reported separately.
 *
 * Check names are third-party text: they are sanitized and truncated here.
 */

import { sanitizeText } from './sanitize.js';

/** @typedef {'green'|'pending'|'red'} CheckClass */

const GREEN_CONCLUSIONS = new Set(['success', 'neutral', 'skipped']);
const RED_CONCLUSIONS = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'stale',
  'startup_failure',
]);

/**
 * Classify one check-run. An unknown conclusion on a completed run is red
 * (never silently green).
 * @param {{status?: string|null, conclusion?: string|null}} run
 * @returns {CheckClass}
 */
export function classifyCheckRun(run) {
  if (run?.status !== 'completed') return 'pending';
  const conclusion = run.conclusion;
  if (typeof conclusion === 'string' && GREEN_CONCLUSIONS.has(conclusion)) return 'green';
  if (typeof conclusion === 'string' && RED_CONCLUSIONS.has(conclusion)) return 'red';
  return 'red';
}

/**
 * Classify one legacy commit status (`state`).
 * @param {{state?: string|null}} status
 * @returns {CheckClass}
 */
export function classifyStatus(status) {
  if (status?.state === 'success') return 'green';
  if (status?.state === 'pending') return 'pending';
  return 'red';
}

/**
 * @typedef {object} CheckSummary
 * @property {'none'|CheckClass} state - `none` when no check or status exists for the commit
 * @property {Record<string, CheckClass>} byName - Every check by sanitized name (a duplicate name keeps its worst class)
 * @property {{name: string, conclusion: string, base_red: boolean}[]} red
 * @property {string[]} pending
 */

const SEVERITY = { green: 0, pending: 1, red: 2 };

/**
 * @param {unknown} value
 * @returns {string}
 */
function safeName(value) {
  return sanitizeText(value) || '(unnamed)';
}

/**
 * @param {{name?: string, status?: string|null, conclusion?: string|null}[]} checkRuns
 * @param {{context?: string, state?: string|null}[]} statuses
 * @param {{name?: string, status?: string|null, conclusion?: string|null}[]|null} [baseCheckRuns] - Check-runs on the base branch head, to flag a failure that is already red there
 * @returns {CheckSummary}
 */
export function evaluateChecks(checkRuns, statuses, baseCheckRuns = null) {
  /** @type {Map<string, CheckClass>} */
  const byName = new Map();
  /** @type {Map<string, string>} */
  const conclusions = new Map();
  const add = (rawName, cls, conclusion) => {
    const key = safeName(rawName);
    const prev = byName.get(key);
    if (prev === undefined || SEVERITY[cls] > SEVERITY[prev]) {
      byName.set(key, cls);
      conclusions.set(key, sanitizeText(conclusion, 40));
    }
  };
  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    add(run?.name, classifyCheckRun(run), String(run?.conclusion ?? run?.status ?? 'unknown'));
  }
  for (const st of Array.isArray(statuses) ? statuses : []) {
    add(st?.context, classifyStatus(st), String(st?.state ?? 'unknown'));
  }

  const baseRedNames = new Set(
    (Array.isArray(baseCheckRuns) ? baseCheckRuns : [])
      .filter((r) => classifyCheckRun(r) === 'red')
      .map((r) => safeName(r?.name)),
  );

  const names = [...byName.keys()].sort();
  const red = names
    .filter((n) => byName.get(n) === 'red')
    .map((n) => ({
      name: n,
      conclusion: /** @type {string} */ (conclusions.get(n)),
      base_red: baseRedNames.has(n),
    }));
  const pending = names.filter((n) => byName.get(n) === 'pending');

  /** @type {CheckSummary['state']} */
  let state = 'green';
  if (names.length === 0) state = 'none';
  else if (red.length > 0) state = 'red';
  else if (pending.length > 0) state = 'pending';
  /** @type {Record<string, CheckClass>} */
  const plain = Object.create(null);
  for (const n of names) plain[n] = /** @type {CheckClass} */ (byName.get(n));
  return { state, byName: plain, red, pending };
}
