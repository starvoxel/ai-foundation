/**
 * pr-watch — watch-record persistence (I/O).
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 * One small JSON file per consumer and target, under a per-user directory in
 * the OS temp directory (never inside a repository, so it cannot be
 * committed). The consumer id keeps two sessions from sharing a record.
 *
 * Trust properties:
 * - The default directory is per user. Before use it must be a real
 *   directory (not a symlink), and on POSIX owned by the current user with
 *   mode 0700; anything else is refused. On Windows ownership and mode are not
 *   checked (the per-user temp directory's ACL is the protection).
 * - Files are created exclusively (`wx`, random suffix, mode 0600) then
 *   renamed, so a pre-planted file or symlink is never followed.
 * - A record is validated against a strict schema and against the path it was
 *   read for; an invalid or tampered record is discarded (the watch starts
 *   fresh) and never trusted. A record holds no `human` or `self`: those come
 *   from the caller on every call, so a record can neither grant nor revoke
 *   trust.
 * - A caller-supplied `--state-dir` is trusted as given (no ownership check).
 * - Read-modify-write is serialised with a lock directory so two commands on
 *   one record do not lose each other's update.
 *
 * A record holds logins, IDs and SHAs only: never a token, never comment text.
 */

import { createHash, randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

const CONSUMER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const MAX_ENCODED_TARGET = 100;
const KEY_RE = /^(review|review_comment|issue_comment):\d{1,15}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const CHECK_CLASSES = new Set(['green', 'pending', 'red']);
const RECORD_KEYS = [
  'version',
  'repo',
  'target',
  'startedAt',
  'headSha',
  'checks',
  'lastStatus',
  'mergeable',
  'handled',
  'seenAct',
  'quietSince',
  'pendingSince',
  'pendingCapReported',
  'blockerReported',
  'stopped',
];

/**
 * Consumer ids become a directory name: no dot names, no leading dot, no
 * trailing dot, no Windows reserved device names (with or without extension).
 * @param {string} consumer
 * @returns {boolean}
 */
export function isValidConsumer(consumer) {
  if (typeof consumer !== 'string' || !CONSUMER_RE.test(consumer)) return false;
  if (consumer.endsWith('.')) return false;
  return !WINDOWS_RESERVED.test(consumer.split('.')[0]);
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

/** @returns {string} A filesystem-safe identifier for the current user */
function currentUserId() {
  if (typeof process.getuid === 'function') return String(process.getuid());
  let name = 'user';
  try {
    name = userInfo().username;
  } catch {
    /* fall through to the generic name */
  }
  return name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'user';
}

/** @returns {string} Default (per-user) state directory */
export function defaultStateDir() {
  return join(tmpdir(), `aif-pr-watch-${currentUserId()}`);
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
  // Percent-encoding keeps the owner/name boundary unambiguous.
  // Underscores are encoded too, so the `__` between the parts cannot occur inside a part.
  const safeRepo = encodeURIComponent(repo).replace(/_/g, '%5F');
  let safeTarget;
  if (target.startsWith('#')) {
    safeTarget = `pr-${target.slice(1)}`;
  } else {
    const encoded = encodeURIComponent(target).replace(/_/g, '%5F');
    safeTarget =
      encoded.length <= MAX_ENCODED_TARGET
        ? `branch-${encoded}`
        : `branch-h-${createHash('sha256').update(target).digest('hex').slice(0, 32)}`;
  }
  return join(stateDir, consumer, `${safeRepo}__${safeTarget}.json`);
}

/**
 * Create `dir` if needed and refuse it unless it is safe to use.
 * @param {string} dir
 * @param {{platform?: string, uid?: number|null, trusted?: boolean}} [env] - Injectable for tests; `trusted` skips the checks (a caller-supplied directory)
 */
export function ensureSafeDir(dir, env = {}) {
  const platform = env.platform ?? process.platform;
  const uid =
    env.uid !== undefined
      ? env.uid
      : typeof process.getuid === 'function'
        ? process.getuid()
        : null;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (env.trusted) return;
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(
      `refusing state directory ${dir}: not a real directory (pass --state-dir to choose another)`,
    );
  }
  if (platform !== 'win32' && uid !== null) {
    if (st.uid !== uid)
      throw new Error(
        `refusing state directory ${dir}: not owned by the current user (pass --state-dir to choose another)`,
      );
    if ((st.mode & 0o077) !== 0) {
      throw new Error(
        `refusing state directory ${dir}: permissions are wider than 0700 (pass --state-dir to choose another)`,
      );
    }
  }
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate and rebuild a parsed record. Returns a fresh object built only
 * from checked fields, or null when anything is off (wrong types or version,
 * repo/target different from the path's, unknown keys such as `human`/`self`,
 * malformed keys including `__proto__`).
 * @param {unknown} raw
 * @param {string} repo
 * @param {string} target
 * @returns {import('./observe.js').WatchRecord|null}
 */
export function validateRecord(raw, repo, target) {
  if (!isPlainObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== RECORD_KEYS.length || !RECORD_KEYS.every((k) => Object.hasOwn(raw, k)))
    return null;
  if (raw.version !== 1 || raw.repo !== repo || raw.target !== target) return null;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const strOrNull = (v) => v === null || (typeof v === 'string' && v.length <= 100);
  if (!num(raw.startedAt) || !num(raw.quietSince)) return null;
  if (!(raw.pendingSince === null || num(raw.pendingSince))) return null;
  if (!(raw.headSha === null || (typeof raw.headSha === 'string' && SHA_RE.test(raw.headSha))))
    return null;
  if (!strOrNull(raw.lastStatus) || !strOrNull(raw.mergeable) || !strOrNull(raw.stopped))
    return null;
  if (typeof raw.pendingCapReported !== 'boolean' || typeof raw.blockerReported !== 'boolean')
    return null;
  if (!isPlainObject(raw.checks) || !isPlainObject(raw.handled) || !isPlainObject(raw.seenAct))
    return null;

  // Check names are third-party text and may be `__proto__`, `constructor`, ...: keep them as
  // plain own data on a null-prototype object so they round-trip and cannot reach a prototype.
  /** @type {Record<string, string>} */
  const checks = Object.create(null);
  for (const [k, v] of Object.entries(raw.checks)) {
    if (k.length > 80 || typeof v !== 'string' || !CHECK_CLASSES.has(v)) return null;
    checks[k] = v;
  }
  /** @type {Record<string, string>[]} */
  const maps = [];
  for (const field of ['handled', 'seenAct']) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (raw[field]))) {
      if (!KEY_RE.test(k) || typeof v !== 'string' || v.length > 40) return null;
      out[k] = v;
    }
    maps.push(out);
  }
  return {
    version: 1,
    repo,
    target,
    startedAt: /** @type {number} */ (raw.startedAt),
    headSha: /** @type {string|null} */ (raw.headSha),
    checks,
    lastStatus: /** @type {string|null} */ (raw.lastStatus),
    mergeable: /** @type {string|null} */ (raw.mergeable),
    handled: maps[0],
    seenAct: maps[1],
    quietSince: /** @type {number} */ (raw.quietSince),
    pendingSince: /** @type {number|null} */ (raw.pendingSince),
    pendingCapReported: raw.pendingCapReported,
    blockerReported: raw.blockerReported,
    stopped: /** @type {string|null} */ (raw.stopped),
  };
}

/**
 * Read a record. A missing file, an unsafe file (symlink, not a regular
 * file), or an invalid record all yield null (start fresh).
 * @param {string} path
 * @param {string} repo
 * @param {string} target
 * @returns {import('./observe.js').WatchRecord|null}
 */
export function readRecord(path, repo, target) {
  try {
    const st = lstatSync(path);
    if (!st.isFile()) return null;
    return validateRecord(JSON.parse(readFileSync(path, 'utf8')), repo, target);
  } catch {
    return null;
  }
}

/**
 * Write a record atomically: an exclusively created temp file, then rename.
 * @param {string} path
 * @param {import('./observe.js').WatchRecord} record
 */
export function writeRecord(path, record) {
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/**
 * @param {string} path
 */
export function removeRecord(path) {
  rmSync(path, { force: true });
}

/**
 * @param {number} ms
 */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @param {string} lock
 * @returns {string|null} The owner token inside a lock directory, if readable
 */
function readOwner(lock) {
  try {
    return readFileSync(join(lock, 'owner'), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Remove a lock that is no longer valid, without ever following a link.
 * - nothing there: report "retry";
 * - not a directory (a regular file, a symlink, a dangling link): it cannot be
 *   a holder's lock, so remove that entry itself (the link, never its target);
 * - a directory older than `staleMs`: rename it aside to a unique name, then
 *   check the renamed lock still has the owner token seen beforehand. If a
 *   faster waiter replaced it in between, the fresh lock is put back untouched.
 * @param {string} lock
 * @param {number} staleMs
 * @param {{beforeRename?: () => void}} [hooks] - Test seam for the takeover interleaving
 * @returns {boolean} True when the lock path is now free to retry, false when a live lock remains
 */
export function removeStaleLock(lock, staleMs, hooks = {}) {
  let st;
  try {
    st = lstatSync(lock);
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT';
  }
  if (!st.isDirectory()) {
    rmSync(lock, { force: true });
    return true;
  }
  if (Date.now() - st.mtimeMs <= staleMs) return false;
  const seen = readOwner(lock);
  hooks.beforeRename?.();
  const grave = `${lock}.stale-${randomBytes(6).toString('hex')}`;
  try {
    renameSync(lock, grave);
  } catch {
    return true; // someone else removed or replaced it: just retry
  }
  if (readOwner(grave) !== seen) {
    try {
      renameSync(grave, lock); // a fresh lock was created after we looked: restore it
      return false;
    } catch {
      /* the lock path was taken again; the displaced holder's release checks its token */
    }
  }
  rmSync(grave, { recursive: true, force: true });
  return true;
}

/**
 * @param {string} lock
 * @param {number} staleMs
 * @returns {boolean} `removeStaleLock`'s answer, or false when it could not run (the caller then waits)
 */
function tryRemoveStale(lock, staleMs) {
  try {
    return removeStaleLock(lock, staleMs);
  } catch {
    return false;
  }
}

/**
 * Run `fn` holding a lock on `path`. The lock is a directory created
 * atomically next to the record, holding an owner token. It protects only the
 * short read-modify-write, never a network fetch. A stale or invalid lock is
 * removed by `removeStaleLock`; the holder releases only a lock that still
 * carries its own token, so it can never remove a successor's lock. Every
 * retry path checks the deadline and gives up after `timeoutMs`.
 * @template T
 * @param {string} path
 * @param {() => T} fn
 * @param {{timeoutMs?: number, staleMs?: number}} [options]
 * @returns {T}
 */
export function withLock(path, fn, { timeoutMs = 5000, staleMs = 30_000 } = {}) {
  const lock = `${path}.lock`;
  const ownerFile = join(lock, 'owner');
  const token = randomBytes(8).toString('hex');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lock);
      try {
        writeFileSync(ownerFile, token, { flag: 'wx', mode: 0o600 });
      } catch (writeErr) {
        rmSync(lock, { recursive: true, force: true });
        throw writeErr;
      }
      break;
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err;
      const freed = tryRemoveStale(lock, staleMs);
      if (Date.now() > deadline) {
        throw new Error(`could not lock ${path}: another pr-watch command holds it`, {
          cause: err,
        });
      }
      if (!freed) sleep(50);
    }
  }
  try {
    return fn();
  } finally {
    if (readOwner(lock) === token) rmSync(lock, { recursive: true, force: true });
  }
}
