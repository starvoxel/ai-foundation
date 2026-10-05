/**
 * pr-watch — orchestration of one pass: fetch fresh state, apply it to the
 * persisted record, persist, return the digest.
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Every wake source (a cloud notification, a poll tick, a manual run) calls
 * the same `runCheck`; it re-fetches everything itself and ignores any
 * payload, so the wake mechanism is the only thing that differs.
 */

import { acknowledge, newRecord, observe } from './observe.js';
import { fetchBranchObservation, fetchPrObservation } from './github.js';
import { readRecord, removeRecord, statePath, writeRecord } from './store.js';

/**
 * @typedef {object} Target
 * @property {string} repo - `owner/name`
 * @property {number} [pr] - PR number; omit for a branch watch
 * @property {string} [branch] - Branch name (watch without a PR)
 * @property {string} [base] - Base branch for a branch watch (default `main`)
 */

/**
 * @typedef {object} EngineDeps
 * @property {import('./github.js').GhApi} ghApi
 * @property {string} stateDir
 * @property {string} consumer
 * @property {() => number} now
 */

/**
 * @param {Target} t
 * @returns {string}
 */
function targetName(t) {
  return t.pr !== undefined ? `#${t.pr}` : String(t.branch);
}

/**
 * Load the persisted record, or start a new one. Caller-supplied `human` and
 * `self` overwrite the stored values (they come only from the caller's own
 * message, never from fetched content).
 * @param {EngineDeps} deps
 * @param {Target} target
 * @param {{human?: string|null, self?: string|null}} who
 */
function load(deps, target, who) {
  const path = statePath(deps.stateDir, deps.consumer, target.repo, targetName(target));
  const stored = readRecord(path);
  const base =
    stored ?? newRecord({ repo: target.repo, target: targetName(target), now: deps.now() });
  return {
    path,
    record: {
      ...base,
      human: who.human ?? base.human,
      self: who.self ?? base.self,
    },
  };
}

/**
 * Run one check pass.
 * @param {EngineDeps} deps
 * @param {Target} target
 * @param {{human?: string|null, self?: string|null, explicitStop?: boolean}} [options]
 * @returns {import('./digest.js').Digest}
 */
export function runCheck(deps, target, options = {}) {
  const { path, record } = load(deps, target, options);
  const obs =
    target.pr !== undefined
      ? fetchPrObservation(deps.ghApi, target.repo, target.pr)
      : fetchBranchObservation(
          deps.ghApi,
          target.repo,
          String(target.branch),
          target.base ?? 'main',
        );
  const result = observe(record, obs, {
    now: deps.now(),
    explicitStop: Boolean(options.explicitStop),
  });
  if (result.record.stopped) removeRecord(path);
  else writeRecord(path, result.record);
  return result.digest;
}

/**
 * Mark feedback keys as acted on or answered.
 * @param {EngineDeps} deps
 * @param {Target} target
 * @param {string[]} keys
 * @returns {{acknowledged: string[]}}
 */
export function runAck(deps, target, keys) {
  const { path, record } = load(deps, target, {});
  const next = acknowledge(record, keys);
  writeRecord(path, next);
  return { acknowledged: keys.filter((k) => k in next.handled) };
}

/**
 * Record that the one blocker has been reported; the next check stops.
 * @param {EngineDeps} deps
 * @param {Target} target
 */
export function runBlocker(deps, target) {
  const { path, record } = load(deps, target, {});
  writeRecord(path, { ...record, blockerReported: true });
}

/**
 * Drop the record (an explicit stop that needs no fetch).
 * @param {EngineDeps} deps
 * @param {Target} target
 */
export function runStop(deps, target) {
  removeRecord(statePath(deps.stateDir, deps.consumer, target.repo, targetName(target)));
}
