/**
 * Unit tests for the iteration-7 fixes: prototype-named checks round-trip,
 * invisible-character sanitizing, lock lifecycle, shared actor decision, and
 * unambiguous state paths.
 *
 * Plan: AIF-010 (Task 005, plan Q11)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateChecks } from '../../lib/pr-watch/checks.js';
import { newRecord, observe } from '../../lib/pr-watch/observe.js';
import { readRecord, statePath, withLock, writeRecord } from '../../lib/pr-watch/store.js';
import { sanitizeText } from '../../lib/pr-watch/sanitize.js';
import { decideActor } from '../../lib/pr-watch/feedback.js';
import { UNTRUSTED_FIELDS } from '../../lib/pr-watch/digest.js';

const T0 = 1_000_000_000_000;
const SHA = 'a'.repeat(40);

const obsWith = (names, conclusion = 'success') => ({
  kind: 'pr',
  headSha: SHA,
  state: 'open',
  merged: false,
  mergeable: true,
  mergeableState: 'clean',
  author: 'alice',
  checks: evaluateChecks(
    names.map((name) => ({ name, status: 'completed', conclusion })),
    [],
  ),
  feedbackItems: [],
});

describe('check names that collide with prototype members survive persistence', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-watch-it7-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    it(`round-trips a check named ${name} through observe, writeRecord and readRecord`, () => {
      const path = join(root, 'rec.json');
      const first = observe(
        newRecord({ repo: 'o/r', target: '#1', now: T0 }),
        obsWith([name, 'Test']),
        {
          now: T0,
          self: 'agent',
          human: 'carol',
        },
      );
      writeRecord(path, first.record);
      const loaded = readRecord(path, 'o/r', '#1');
      assert.notEqual(loaded, null, 'the record must still validate');
      assert.equal(loaded?.startedAt, T0, 'startedAt survives, so the age ceilings can fire');
      const second = observe(loaded, obsWith([name, 'Test']), {
        now: T0 + 60_000,
        self: 'agent',
        human: 'carol',
      });
      assert.equal(second.digest.changed, false, 'no reset, no repeated initial report');
      assert.equal(second.digest.changes.length, 0);
      assert.equal(second.record.startedAt, T0);
      assert.equal(second.record.quietSince, T0);
    });
  }

  it('keeps handled feedback and a reported blocker across a round-trip with a hostile check name', () => {
    const path = join(root, 'rec.json');
    const rec = {
      ...observe(newRecord({ repo: 'o/r', target: '#1', now: T0 }), obsWith(['__proto__']), {
        now: T0,
      }).record,
      blockerReported: true,
      handled: { 'issue_comment:5': 'T' },
    };
    writeRecord(path, rec);
    const loaded = readRecord(path, 'o/r', '#1');
    assert.equal(loaded?.blockerReported, true);
    assert.deepEqual({ ...loaded?.handled }, { 'issue_comment:5': 'T' });
  });

  it('cannot pollute prototypes through check names, whichever way the record is built or read', () => {
    const path = join(root, 'rec.json');
    const r = observe(
      newRecord({ repo: 'o/r', target: '#1', now: T0 }),
      obsWith(['__proto__', 'constructor']),
      {
        now: T0,
      },
    );
    writeRecord(path, r.record);
    const loaded = readRecord(path, 'o/r', '#1');
    observe(loaded, obsWith(['__proto__']), { now: T0 + 1 });
    assert.equal(Object.getPrototypeOf({}), Object.prototype);
    assert.equal({}.green, undefined);
    assert.equal({}.red, undefined);
    assert.equal(Object.getPrototypeOf(loaded.checks), null);
    assert.equal(Object.hasOwn(loaded.checks, '__proto__'), true);
    assert.equal(readFileSync(path, 'utf8').includes('"__proto__"'), true);
  });
});

describe('sanitizeText removes invisible and non-printing characters', () => {
  it('strips bidi overrides and isolates, zero-width, BOM, word joiner and tag characters', () => {
    assert.equal(sanitizeText('a‮b'), 'ab');
    assert.equal(sanitizeText('a⁦b⁩c'), 'abc');
    assert.equal(sanitizeText('a​b‏c'), 'abc');
    assert.equal(sanitizeText('a⁠b﻿c'), 'abc');
    assert.equal(
      sanitizeText(`ok${String.fromCodePoint(0xe0041)}${String.fromCodePoint(0xe0042)}`),
      'ok',
    );
  });

  it('strips lone surrogates, private-use and unassigned code points', () => {
    assert.equal(sanitizeText('a\uD800b'), 'ab');
    assert.equal(sanitizeText('a\uDC00b'), 'ab');
    assert.equal(sanitizeText(`a${String.fromCodePoint(0xe000)}b`), 'ab');
    assert.equal(sanitizeText(`a${String.fromCodePoint(0x0378)}b`), 'ab');
  });

  it('keeps visible text: letters, digits, punctuation, CJK and emoji', () => {
    assert.equal(sanitizeText('Build / test (linux) #1'), 'Build / test (linux) #1');
    assert.equal(sanitizeText('テスト 构建 빌드'), 'テスト 构建 빌드');
    assert.equal(sanitizeText('ok \u{1F680}'), 'ok \u{1F680}');
  });
});

describe('summary is declared untrusted', () => {
  it('lists summary among the untrusted digest fields', () => {
    assert.ok(UNTRUSTED_FIELDS.includes('summary'));
  });
});

describe('withLock lifecycle', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-watch-lock-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('refuses to run while a fresh lock is held, then runs once it is free', () => {
    const path = join(root, 'rec.json');
    withLock(path, () => {
      assert.throws(() => withLock(path, () => 1, { timeoutMs: 120 }), /could not lock/);
    });
    assert.equal(
      withLock(path, () => 'ok'),
      'ok',
    );
  });

  it('breaks a stale lock and proceeds', () => {
    const path = join(root, 'rec.json');
    const lock = `${path}.lock`;
    mkdirSync(lock);
    writeFileSync(join(lock, 'owner'), 'dead-holder');
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock, old, old);
    assert.equal(
      withLock(path, () => 'ran', { staleMs: 30_000 }),
      'ran',
    );
    assert.equal(existsSync(lock), false);
  });

  it('does not break a lock younger than the stale limit', () => {
    const path = join(root, 'rec.json');
    mkdirSync(`${path}.lock`);
    assert.throws(
      () => withLock(path, () => 1, { timeoutMs: 120, staleMs: 30_000 }),
      /could not lock/,
    );
  });

  it('releases only a lock that still carries its own token', () => {
    const path = join(root, 'rec.json');
    const lock = `${path}.lock`;
    withLock(path, () => {
      // Simulate another command breaking this (long-running) holder's lock and taking over.
      rmSync(lock, { recursive: true, force: true });
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), 'successor-token');
    });
    assert.equal(existsSync(lock), true, 'the successor keeps its lock');
    assert.equal(readFileSync(join(lock, 'owner'), 'utf8'), 'successor-token');
  });

  it('releases its own lock when the callback throws', () => {
    const path = join(root, 'rec.json');
    assert.throws(() =>
      withLock(path, () => {
        throw new Error('boom');
      }),
    );
    assert.equal(existsSync(`${path}.lock`), false);
  });
});

describe('decideActor (shared by check and classify)', () => {
  const ctx = { prAuthor: 'alice', human: 'carol' };

  it('reports own for the caller-named self, but not when self equals the human', () => {
    assert.deepEqual(decideActor({ login: 'Bot-1' }, { ...ctx, self: 'bot-1' }), {
      verdict: 'own',
      reason: 'self',
    });
    assert.equal(decideActor({ login: 'carol' }, { ...ctx, self: 'carol' }).verdict, 'permitted');
  });

  it('holds the PR author back as escalate when self is unset', () => {
    assert.deepEqual(decideActor({ login: 'alice', association: 'OWNER' }, ctx), {
      verdict: 'escalate',
      reason: 'self_unset_author',
    });
    assert.equal(decideActor({ login: 'alice' }, { ...ctx, self: 'agent' }).verdict, 'permitted');
  });
});

describe('state paths are unambiguous', () => {
  it('does not collide a__b/c with a/b__c, and keeps PR and branch targets apart', () => {
    const one = statePath('/s', 'c', 'a__b/c', '#1');
    const two = statePath('/s', 'c', 'a/b__c', '#1');
    assert.notEqual(one, two);
    assert.notEqual(statePath('/s', 'c', 'o/r', '#1'), statePath('/s', 'c', 'o/r', 'pr-1'));
  });
});
