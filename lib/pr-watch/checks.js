/**
 * pr-watch — CI check evaluation (pure).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Classifies GitHub check-runs and commit statuses for one commit into
 * green / pending / red and reports facts only. Whether a red check is this
 * PR's fault, and how to fix it, stays with the agent.
 */

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
 * @property {Record<string, CheckClass>} byName - Every check by name (a duplicate name keeps its worst class)
 * @property {{name: string, conclusion: string, base_red: boolean}[]} red
 * @property {string[]} pending
 */

const SEVERITY = { green: 0, pending: 1, red: 2 };

/**
 * @param {{name?: string, status?: string|null, conclusion?: string|null}[]} checkRuns
 * @param {{context?: string, state?: string|null}[]} statuses
 * @param {{name?: string, status?: string|null, conclusion?: string|null}[]|null} [baseCheckRuns] - Check-runs on the base branch head, to flag a failure that is already red there
 * @returns {CheckSummary}
 */
export function evaluateChecks(checkRuns, statuses, baseCheckRuns = null) {
  /** @type {Record<string, CheckClass>} */
  const byName = {};
  /** @type {Record<string, string>} */
  const conclusions = {};
  const add = (name, cls, conclusion) => {
    const key = typeof name === 'string' && name ? name : '(unnamed)';
    if (!(key in byName) || SEVERITY[cls] > SEVERITY[byName[key]]) {
      byName[key] = cls;
      conclusions[key] = conclusion;
    }
  };
  for (const run of Array.isArray(checkRuns) ? checkRuns : []) {
    add(run?.name, classifyCheckRun(run), String(run?.conclusion ?? run?.status ?? 'unknown'));
  }
  for (const st of Array.isArray(statuses) ? statuses : []) {
    add(st?.context, classifyStatus(st), String(st?.state ?? 'unknown'));
  }

  const base_redNames = new Set(
    (Array.isArray(baseCheckRuns) ? baseCheckRuns : [])
      .filter((r) => classifyCheckRun(r) === 'red')
      .map((r) => r?.name),
  );

  const names = Object.keys(byName).sort();
  const red = names
    .filter((n) => byName[n] === 'red')
    .map((n) => ({ name: n, conclusion: conclusions[n], base_red: base_redNames.has(n) }));
  const pending = names.filter((n) => byName[n] === 'pending');

  /** @type {CheckSummary['state']} */
  let state = 'green';
  if (names.length === 0) state = 'none';
  else if (red.length > 0) state = 'red';
  else if (pending.length > 0) state = 'pending';
  return { state, byName, red, pending };
}
