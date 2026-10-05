/**
 * Unit tests for the iteration-8 fixes: lock path edge cases and the
 * stale-lock takeover race, code-point truncation, unambiguous state paths,
 * the anchored HTTP status pattern, and the stopped-watch guard.
 *
 * Plan: AIF-010 (Task 005, plan Q11)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeStaleLock, statePath, withLock } from '../../lib/pr-watch/store.js';
import { sanitizeText } from '../../lib/pr-watch/sanitize.js';
import { GhApiError, makeGhApi } from '../../lib/pr-watch/github.js';
import { runCheck, runStop } from '../../lib/pr-watch/engine.js';

const SHA = 'a'.repeat(40);

describe('withLock never hangs on an odd lock path', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-watch-lock8-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  /** @returns {boolean} true when a symlink could be created */
  function tryLink(target, link) {
    // A junction needs no privilege on Windows, so it is tried when a symlink is refused.
    for (const type of ['dir', 'junction']) {
      try {
        symlinkSync(target, link, type);
        return true;
      } catch {
        /* try the next link type */
      }
    }
    return false;
  }

  /** Runs withLock and asserts it finishes well inside the timeout. */
  function boundedLock(path, options = { timeoutMs: 1000, staleMs: 30_000 }) {
    const start = Date.now();
    let outcome;
    try {
      outcome = { value: withLock(path, () => 'ran', options) };
    } catch (err) {
      outcome = { error: err };
    }
    assert.ok(
      Date.now() - start < options.timeoutMs + 1500,
      'returned or timed out in bounded time',
    );
    return outcome;
  }

  it('replaces a dangling symlink at the lock path and runs', (t) => {
    const path = join(root, 'rec.json');
    if (!tryLink(join(root, 'does-not-exist'), `${path}.lock`)) {
      return t.skip('neither a symlink nor a junction can be created in this environment');
    }
    assert.equal(boundedLock(path).value, 'ran');
    assert.equal(existsSync(`${path}.lock`), false);
  });

  it('removes a symlink to a directory without touching the target', (t) => {
    const path = join(root, 'rec.json');
    const target = join(root, 'precious');
    mkdirSync(target);
    writeFileSync(join(target, 'keep.txt'), 'data');
    if (!tryLink(target, `${path}.lock`)) {
      return t.skip('neither a symlink nor a junction can be created in this environment');
    }
    assert.equal(boundedLock(path).value, 'ran');
    assert.equal(
      readFileSync(join(target, 'keep.txt'), 'utf8'),
      'data',
      'the link target is untouched',
    );
  });

  it('removes a regular file sitting at the lock path and runs', () => {
    const path = join(root, 'rec.json');
    writeFileSync(`${path}.lock`, 'not a lock');
    assert.equal(boundedLock(path).value, 'ran');
  });

  it('times out, rather than spinning, when a live lock is held', () => {
    const path = join(root, 'rec.json');
    mkdirSync(`${path}.lock`);
    const out = boundedLock(path, { timeoutMs: 300, staleMs: 30_000 });
    assert.match(String(out.error?.message), /could not lock/);
  });

  it('removes a stale lock directory that has no owner file', () => {
    const path = join(root, 'rec.json');
    const lock = `${path}.lock`;
    mkdirSync(lock);
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock, old, old);
    assert.equal(boundedLock(path).value, 'ran');
  });
});

describe('removeStaleLock (takeover race)', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-watch-stale8-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const makeStale = (lock, owner) => {
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), owner);
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock, old, old);
  };

  it('removes a stale lock', () => {
    const lock = join(root, 'x.lock');
    makeStale(lock, 'dead');
    assert.equal(removeStaleLock(lock, 30_000), true);
    assert.equal(existsSync(lock), false);
    assert.deepEqual(readdirSync(root), [], 'no leftover renamed lock');
  });

  it('leaves a live lock alone', () => {
    const lock = join(root, 'x.lock');
    mkdirSync(lock);
    assert.equal(removeStaleLock(lock, 30_000), false);
    assert.equal(existsSync(lock), true);
  });

  it('reports a missing lock as free to retry', () => {
    assert.equal(removeStaleLock(join(root, 'none.lock'), 30_000), true);
  });

  it('puts back a fresh lock that a faster waiter created between the look and the rename', () => {
    const lock = join(root, 'x.lock');
    makeStale(lock, 'dead');
    const freed = removeStaleLock(lock, 30_000, {
      beforeRename: () => {
        // The faster waiter removes the stale lock and takes a fresh one.
        rmSync(lock, { recursive: true, force: true });
        mkdirSync(lock);
        writeFileSync(join(lock, 'owner'), 'fast-waiter');
      },
    });
    assert.equal(freed, false, 'a live lock remains');
    assert.equal(
      readFileSync(join(lock, 'owner'), 'utf8'),
      'fast-waiter',
      'the fresh lock survives',
    );
    assert.equal(lstatSync(lock).isDirectory(), true);
    assert.deepEqual(readdirSync(root), ['x.lock'], 'nothing left behind');
  });
});

describe('sanitizeText truncates by code point', () => {
  it('never leaves a lone surrogate when an astral character straddles the cut', () => {
    const astral = '\u{1D4B3}';
    const text = `${'a'.repeat(78)}${astral}bb`; // 81 code points: the cut falls after the astral char
    const out = sanitizeText(text);
    assert.equal([...out].length, 80);
    assert.equal(out.endsWith(`${astral}…`), true);
    assert.equal(out, out.toWellFormed(), 'no lone surrogates');
  });

  it('drops a whole astral character that does not fit, not half of it', () => {
    const astral = '\u{1F680}';
    const out = sanitizeText(`${'a'.repeat(79)}${astral}${astral}`);
    assert.equal(out, `${'a'.repeat(79)}…`);
    assert.equal(out, out.toWellFormed());
  });

  it('leaves text of exactly the limit untouched', () => {
    assert.equal(sanitizeText('a'.repeat(80)), 'a'.repeat(80));
  });

  it('still strips ZWJ (documented display trade-off)', () => {
    assert.equal(sanitizeText('a‍b'), 'ab');
  });
});

describe('state path has no residual ambiguity', () => {
  it('keeps o/r__branch-x PR 1 apart from o/r branch x__pr-1', () => {
    const one = statePath('/s', 'c', 'o/r__branch-x', '#1');
    const two = statePath('/s', 'c', 'o/r', 'x__pr-1');
    assert.notEqual(one, two);
  });

  it('keeps the earlier collision cases apart', () => {
    assert.notEqual(statePath('/s', 'c', 'a__b/c', '#1'), statePath('/s', 'c', 'a/b__c', '#1'));
    assert.notEqual(statePath('/s', 'c', 'o/r', '#1'), statePath('/s', 'c', 'o/r', 'pr-1'));
  });

  it('is deterministic for the same inputs', () => {
    assert.equal(statePath('/s', 'c', 'o/r_x', 'a_b'), statePath('/s', 'c', 'o/r_x', 'a_b'));
  });
});

describe('the HTTP status pattern is anchored to a line end', () => {
  /** @param {string} stderr */
  const statusOf = (stderr) => {
    const api = makeGhApi(() => ({ status: 1, stdout: '', stderr }));
    try {
      api('repos/o/r/pulls/1');
    } catch (err) {
      return err instanceof GhApiError ? err.httpStatus : 'other';
    }
    return 'no error';
  };

  it('reads the status at the end of a stderr line', () => {
    assert.equal(statusOf('gh: Not Found (HTTP 404)'), 404);
    assert.equal(statusOf('some preamble\ngh: Forbidden (HTTP 403)\n'), 403);
  });

  it('ignores a status-looking fragment in the middle of a line', () => {
    assert.equal(statusOf('gh: odd message (HTTP 404) and more text'), null);
    assert.equal(statusOf('no status here'), null);
  });
});

describe('a concurrent stop is not undone by an in-flight check', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-watch-eng8-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const pull = {
    state: 'open',
    merged: false,
    mergeable: true,
    mergeable_state: 'clean',
    user: { login: 'alice' },
    head: { sha: SHA },
    base: { ref: 'main' },
  };
  /** @param {() => void} [onFetch] */
  const makeApi = (onFetch) => (path) => {
    onFetch?.();
    if (path.includes('/pulls/5?') || path.endsWith('/pulls/5')) return pull;
    if (path.includes('/check-runs')) {
      return {
        total_count: 1,
        check_runs: [{ name: 't', status: 'completed', conclusion: 'success' }],
      };
    }
    if (path.includes('/status')) return { total_count: 0, statuses: [] };
    return [];
  };

  it('refuses to restart a watch that was stopped during the fetch', () => {
    const deps = (ghApi) => ({
      ghApi,
      stateDir: root,
      trustedStateDir: true,
      consumer: 'c',
      now: () => 1_000_000_000_000,
    });
    const target = { repo: 'o/r', pr: 5 };
    runCheck(deps(makeApi()), target); // establishes a record
    let stopped = false;
    const racing = makeApi(() => {
      if (!stopped) {
        stopped = true;
        runStop(deps(makeApi()), target);
      }
    });
    assert.throws(() => runCheck(deps(racing), target), /stopped while this check ran/);
    const left = readdirSync(join(root, 'c')).filter((f) => f.endsWith('.json'));
    assert.deepEqual(left, [], 'no record resurrected');
  });

  it('still starts a record normally when none existed before the fetch', () => {
    const digest = runCheck(
      {
        ghApi: makeApi(),
        stateDir: root,
        trustedStateDir: true,
        consumer: 'c2',
        now: () => 1_000_000_000_000,
      },
      { repo: 'o/r', pr: 5 },
    );
    assert.equal(digest.status, 'green');
    assert.equal(readdirSync(join(root, 'c2')).filter((f) => f.endsWith('.json')).length, 1);
  });
});
