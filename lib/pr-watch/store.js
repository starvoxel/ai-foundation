/**
 * pr-watch — watch-record persistence (I/O).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * One small JSON file per consumer and target, under the OS temp directory
 * (never inside a repository, so it cannot be committed). The consumer id
 * keeps two sessions from clobbering each other. Writes are atomic
 * (temp file then rename). A record holds logins, IDs and SHAs only: never a
 * token, never comment text.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONSUMER_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * @param {string} consumer
 * @returns {boolean}
 */
export function isValidConsumer(consumer) {
  return typeof consumer === 'string' && CONSUMER_RE.test(consumer);
}

/**
 * Default consumer id: stable per working directory, so a session that keeps
 * one worktree keeps one record without anyone choosing a name.
 * @param {string} cwd
 * @returns {string}
 */
export function defaultConsumer(cwd) {
  return `cwd-${createHash('sha256').update(cwd).digest('hex').slice(0, 12)}`;
}

/** @returns {string} Default state directory */
export function defaultStateDir() {
  return join(tmpdir(), 'aif-pr-watch');
}

/**
 * Pure: the state file path for a consumer and target.
 * @param {string} stateDir
 * @param {string} consumer
 * @param {string} repo - `owner/name`
 * @param {string} target - `#<n>` or a branch name
 * @returns {string}
 */
export function statePath(stateDir, consumer, repo, target) {
  const safeRepo = repo.replace('/', '__');
  const safeTarget = target.startsWith('#')
    ? `pr-${target.slice(1)}`
    : `branch-${encodeURIComponent(target)}`;
  return join(stateDir, consumer, `${safeRepo}__${safeTarget}.json`);
}

/**
 * @param {string} path
 * @returns {import('./observe.js').WatchRecord|null} null when missing or unreadable
 */
export function readRecord(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} path
 * @param {import('./observe.js').WatchRecord} record
 */
export function writeRecord(path, record) {
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

/**
 * @param {string} path
 */
export function removeRecord(path) {
  rmSync(path, { force: true });
}
