/**
 * pr-watch — orchestration of one pass: fetch fresh state, apply it to the
 * persisted record, persist, return the digest.
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * Every wake source (a cloud notification, a poll tick, a manual run) calls
 * the same `runCheck`; it re-fetches everything itself and ignores any
 * payload, so the wake mechanism is the only thing that differs. Nothing is
 * persisted unless the whole pass succeeded, so a failed or partial read
 * never records feedback as handled.
 */

import { dirname } from 'node:path';
import { acknowledge, newRecord, observe } from './observe.js';
import { fetchBranchObservation, fetchPrObservation } from './github.js';
import {
  ensureSafeDir,
  readRecord,
  removeRecord,
  statePath,
  withLock,
  writeRecord,
} from './store.js';

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
 * @property {boolean} [trustedStateDir] - The directory was supplied by the caller: skip ownership and mode checks
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
 * Resolve the record path and make sure its directories are safe.
 * @param {EngineDeps} deps
 * @param {Target} target
 * @returns {{path: string, name: string}}
 */
function prepare(deps, target) {
  const name = targetName(target);
  const path = statePath(deps.stateDir, deps.consumer, target.repo, name);
  const trusted = Boolean(deps.trustedStateDir);
  ensureSafeDir(deps.stateDir, { trusted });
  ensureSafeDir(dirname(path), { trusted });
  return { path, name };
}

/**
 * Load the record (or a new one) and run `fn` on it while holding the
 * record's lock. Used for the short read-modify-write steps only.
 * @template T
 * @param {EngineDeps} deps
 * @param {Target} target
 * @param {(ctx: {path: string, record: import('./observe.js').WatchRecord}) => T} fn
 * @returns {T}
 */
function withRecord(deps, target, fn) {
  const { path, name } = prepare(deps, target);
  return withLock(path, () => {
    const record =
      readRecord(path, target.repo, name) ??
      newRecord({ repo: target.repo, target: name, now: deps.now() });
    return fn({ path, record });
  });
}

/**
 * Run one check pass. `human` and `self` apply to this call only. The
 * network fetch happens outside the lock; the lock covers only re-reading the
 * record, applying the observation, and writing it back.
 * @param {EngineDeps} deps
 * @param {Target} target
 * @param {{human?: string|null, self?: string|null, explicitStop?: boolean}} [options]
 * @returns {import('./digest.js').Digest}
 */
export function runCheck(deps, target, options = {}) {
  const { path, name } = prepare(deps, target);
  // Unlocked read, used only to remember a branch's last known tip for the fetch.
  const lastHead = readRecord(path, target.repo, name)?.headSha ?? null;
  const obs =
    target.pr !== undefined
      ? fetchPrObservation(deps.ghApi, target.repo, target.pr)
      : fetchBranchObservation(
          deps.ghApi,
          target.repo,
          String(target.branch),
          target.base ?? 'main',
          lastHead,
        );
  return withLock(path, () => {
    const record =
      readRecord(path, target.repo, name) ??
      newRecord({ repo: target.repo, target: name, now: deps.now() });
    const result = observe(record, obs, {
      now: deps.now(),
      human: options.human ?? null,
      self: options.self ?? null,
      explicitStop: Boolean(options.explicitStop),
    });
    if (result.record.stopped) removeRecord(path);
    else writeRecord(path, result.record);
    return result.digest;
  });
}

/**
 * Mark feedback keys as acted on or answered.
 * @param {EngineDeps} deps
 * @param {Target} target
 * @param {string[]} keys
 * @returns {{acknowledged: string[]}}
 */
export function runAck(deps, target, keys) {
  return withRecord(deps, target, ({ path, record }) => {
    const next = acknowledge(record, keys);
    writeRecord(path, next);
    return { acknowledged: keys.filter((k) => Object.hasOwn(next.handled, k)) };
  });
}

/**
 * Record that the one blocker has been reported; the next check stops.
 * @param {EngineDeps} deps
 * @param {Target} target
 */
export function runBlocker(deps, target) {
  withRecord(deps, target, ({ path, record }) => {
    writeRecord(path, { ...record, blockerReported: true });
  });
}

/**
 * Drop the record (an explicit stop that needs no fetch).
 * @param {EngineDeps} deps
 * @param {Target} target
 */
export function runStop(deps, target) {
  withRecord(deps, target, ({ path }) => {
    removeRecord(path);
  });
}
