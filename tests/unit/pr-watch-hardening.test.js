/**
 * Unit tests for the pr-watch hardening: store trust properties, record
 * validation, sanitizers, quiet-timer rules, and request guards.
 *
 * Plan: AIF-010 (Task 005, plan Q11)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  defaultStateDir,
  ensureSafeDir,
  isValidConsumer,
  readRecord,
  statePath,
  validateRecord,
  withLock,
  writeRecord,
} from '../../lib/pr-watch/store.js';
import { acknowledge, newRecord, observe } from '../../lib/pr-watch/observe.js';
import { normalizeFeedback, triageFeedback } from '../../lib/pr-watch/feedback.js';
import { evaluateChecks } from '../../lib/pr-watch/checks.js';
import { classifyActor } from '../../lib/pr-watch/actors.js';
import {
  asciiLower,
  sanitizeAssociation,
  sanitizeId,
  sanitizeLogin,
  sanitizeText,
  sanitizeUrl,
} from '../../lib/pr-watch/sanitize.js';
import { isRepoApiPath } from '../../lib/pr-watch/github.js';
import { isValidBranch, isValidRepo } from '../../lib/pr-watch/github.js';
import { CADENCE } from '../../lib/pr-watch/schedule.js';
import { parseRemoteRepo } from '../../lib/commands/pr-watch.js';

const isWindows = process.platform === 'win32';
const T0 = 1_000_000_000_000;
const SHA = 'a'.repeat(40);

describe('consumer ids (path-safety)', () => {
  it('rejects dot names, leading and trailing dots, and Windows device names in any case', () => {
    const bad = [
      '.',
      '..',
      '.hidden',
      'a.',
      'CON',
      'con',
      'Prn',
      'AUX',
      'NUL',
      'COM1',
      'com9',
      'LPT1',
      'lpt9',
      'nul.txt',
      'CON.json',
      'a/b',
      'a\\b',
      '',
      'x'.repeat(65),
    ];
    for (const id of bad) assert.equal(isValidConsumer(id), false, JSON.stringify(id));
  });

  it('accepts ordinary ids, including ones that merely start like a device name', () => {
    for (const id of ['it', 'cwd-0123abcd', 'session_1.2', 'console', 'com10', 'lpt0']) {
      assert.equal(isValidConsumer(id), true, id);
    }
  });
});

describe('repo and branch bounds', () => {
  it('rejects dot segments and over-long names', () => {
    assert.equal(isValidRepo('o/r'), true);
    for (const r of ['../x', 'o/..', './r', 'o/r/extra', `${'a'.repeat(100)}/${'b'.repeat(100)}`]) {
      assert.equal(isValidRepo(r), false, r);
    }
    assert.equal(isValidBranch('push-check/x'), true);
    for (const b of ['', 'a..b', 'a b', 'x'.repeat(201)]) assert.equal(isValidBranch(b), false, b);
  });

  it('hashes a long branch name so the file name stays short', () => {
    const path = statePath('/s', 'c', 'o/r', `push-check/${'y'.repeat(190)}`);
    assert.ok(path.split(/[\\/]/).pop().length < 100);
    assert.equal(path, statePath('/s', 'c', 'o/r', `push-check/${'y'.repeat(190)}`));
  });

  it('guards the API path: repository scope only, no dot segments', () => {
    assert.equal(isRepoApiPath('repos/o/r/pulls/1'), true);
    assert.equal(isRepoApiPath('repos/o/r/compare/main...abc'), true);
    for (const p of ['repos/o/r/../../x', 'repos/o/r/./x', 'repos/o/../r/x', 'user', 'repos/o/r']) {
      assert.equal(isRepoApiPath(p), false, p);
    }
  });
});

describe('state directory trust', () => {
  /** @type {string} */
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pr-watch-store-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('uses a per-user default directory', () => {
    assert.match(defaultStateDir(), /aif-pr-watch-[A-Za-z0-9_-]+$/);
  });

  it('creates a missing directory with owner-only permissions', () => {
    const dir = join(root, 'fresh');
    ensureSafeDir(dir);
    assert.ok(existsSync(dir));
  });

  it('refuses a symlinked directory', (t) => {
    const target = join(root, 'real');
    mkdirSync(target);
    const link = join(root, 'link');
    try {
      symlinkSync(target, link, 'dir');
    } catch {
      t.skip('symlink creation is not permitted in this environment');
      return;
    }
    assert.throws(() => ensureSafeDir(link), /not a real directory/);
  });

  it('refuses a path that is a file', () => {
    const file = join(root, 'file');
    writeFileSync(file, 'x');
    assert.throws(() => ensureSafeDir(file));
  });

  it('refuses a pre-existing directory with wider than 0700 permissions', (t) => {
    if (isWindows) return t.skip('POSIX permission bits are not meaningful on Windows');
    const dir = join(root, 'wide');
    mkdirSync(dir);
    chmodSync(dir, 0o755);
    assert.throws(() => ensureSafeDir(dir), /wider than 0700/);
  });

  it('refuses a directory owned by someone else', (t) => {
    if (isWindows) return t.skip('ownership checks do not apply on Windows');
    const dir = join(root, 'mine');
    mkdirSync(dir, { mode: 0o700 });
    assert.throws(() => ensureSafeDir(dir, { uid: process.getuid() + 1 }), /not owned/);
  });

  it('skips the checks for a trusted (caller-supplied) directory', (t) => {
    if (isWindows) return t.skip('POSIX permission bits are not meaningful on Windows');
    const dir = join(root, 'shared');
    mkdirSync(dir);
    chmodSync(dir, 0o777);
    assert.doesNotThrow(() => ensureSafeDir(dir, { trusted: true }));
  });

  it('does not follow a symlink planted where the record would be read', (t) => {
    const path = join(root, 'rec.json');
    const outside = join(root, 'outside.json');
    writeFileSync(outside, JSON.stringify(newRecord({ repo: 'o/r', target: '#1', now: T0 })));
    try {
      symlinkSync(outside, path);
    } catch {
      t.skip('symlink creation is not permitted in this environment');
      return;
    }
    assert.equal(readRecord(path, 'o/r', '#1'), null);
  });

  it('writes with an exclusive temp file and leaves no temp files behind', () => {
    const path = join(root, 'rec.json');
    writeRecord(path, newRecord({ repo: 'o/r', target: '#1', now: T0 }));
    writeRecord(path, newRecord({ repo: 'o/r', target: '#1', now: T0 + 1 }));
    assert.deepEqual(readdirSync(root), ['rec.json']);
    assert.equal(readRecord(path, 'o/r', '#1')?.startedAt, T0 + 1);
  });

  it('serialises read-modify-write with a lock and releases it', () => {
    const path = join(root, 'rec.json');
    const out = withLock(path, () => 7);
    assert.equal(out, 7);
    assert.equal(existsSync(`${path}.lock`), false);
    assert.throws(() => withLock(path, () => assert.fail('boom')));
    assert.equal(existsSync(`${path}.lock`), false, 'released after a failure');
  });
});

describe('validateRecord (tamper, corruption, old versions)', () => {
  const good = () => JSON.parse(JSON.stringify(newRecord({ repo: 'o/r', target: '#1', now: T0 })));

  it('accepts a freshly built record', () => {
    assert.notEqual(validateRecord(good(), 'o/r', '#1'), null);
  });

  it('rejects the wrong version, repo or target', () => {
    assert.equal(validateRecord({ ...good(), version: 0 }, 'o/r', '#1'), null);
    assert.equal(validateRecord({ ...good(), version: 2 }, 'o/r', '#1'), null);
    assert.equal(validateRecord(good(), 'o/other', '#1'), null);
    assert.equal(validateRecord(good(), 'o/r', '#2'), null);
  });

  it('rejects unknown trust fields (human, self) and any extra key', () => {
    assert.equal(validateRecord({ ...good(), human: 'mallory' }, 'o/r', '#1'), null);
    assert.equal(validateRecord({ ...good(), self: 'carol' }, 'o/r', '#1'), null);
    assert.equal(validateRecord({ ...good(), extra: 1 }, 'o/r', '#1'), null);
  });

  it('rejects missing fields and wrong types', () => {
    const { quietSince: _drop, ...missing } = good();
    assert.equal(validateRecord(missing, 'o/r', '#1'), null);
    assert.equal(validateRecord({ ...good(), quietSince: 'now' }, 'o/r', '#1'), null);
    assert.equal(validateRecord({ ...good(), headSha: 'not-a-sha' }, 'o/r', '#1'), null);
    assert.equal(validateRecord({ ...good(), blockerReported: 'yes' }, 'o/r', '#1'), null);
    for (const junk of [null, 'x', 1, [], undefined])
      assert.equal(validateRecord(junk, 'o/r', '#1'), null);
  });

  it('rejects __proto__ and malformed keys in the maps', () => {
    const withProto = JSON.parse(
      '{"version":1,"repo":"o/r","target":"#1","startedAt":1,"headSha":null,"checks":{"__proto__":"green"},"lastStatus":null,"mergeable":null,"handled":{},"seenAct":{},"quietSince":1,"pendingSince":null,"pendingCapReported":false,"blockerReported":false,"stopped":null}',
    );
    assert.equal(validateRecord(withProto, 'o/r', '#1'), null);
    for (const field of ['handled', 'seenAct']) {
      for (const key of ['__proto__', 'constructor', 'issue_comment:abc', 'other:1', '']) {
        const rec = good();
        rec[field] = JSON.parse(JSON.stringify({ [key]: 'v' }));
        assert.equal(validateRecord(rec, 'o/r', '#1'), null, `${field}:${key}`);
      }
    }
  });

  it('returns a rebuilt object that does not alias the parsed input', () => {
    const raw = good();
    const out = validateRecord(raw, 'o/r', '#1');
    assert.notEqual(out?.handled, raw.handled);
  });
});

describe('acknowledge (own-key lookups)', () => {
  it('ignores prototype-chain names', () => {
    const rec = newRecord({ repo: 'o/r', target: '#1', now: T0 });
    const out = acknowledge(rec, ['__proto__', 'constructor', 'toString', 'hasOwnProperty']);
    assert.deepEqual(out.handled, {});
    assert.equal(Object.keys({}).length, 0);
    assert.equal({}.polluted, undefined);
  });
});

describe('sanitizers', () => {
  it('strips control characters, ESC, C1 and line separators, then truncates', () => {
    assert.equal(sanitizeText('a\u001b[31mb\u0007c\u0085d e\nf'), 'a [31mb c d e f');
    assert.equal(sanitizeText('x'.repeat(200)).length, 80);
    assert.equal(sanitizeText(null), '');
    assert.equal(sanitizeText({}), '');
  });

  it('shapes logins, associations, urls and ids strictly', () => {
    assert.equal(sanitizeLogin('octo-cat'), 'octo-cat');
    assert.equal(sanitizeLogin('dependabot[bot]'), 'dependabot[bot]');
    for (const l of ['a b', 'a\n', '-lead', 'x'.repeat(60), 'é', '', null, 5, 'a[bot]x']) {
      assert.equal(sanitizeLogin(l), null, String(l));
    }
    assert.equal(sanitizeAssociation('MEMBER'), 'MEMBER');
    for (const a of ['member', 'ADMIN', 'MEMBER\n', null])
      assert.equal(sanitizeAssociation(a), null);
    assert.equal(
      sanitizeUrl('https://github.com/o/r/pull/1#issuecomment-2'),
      'https://github.com/o/r/pull/1#issuecomment-2',
    );
    for (const u of [
      'javascript:alert(1)',
      'http://github.com/x',
      'https://evil.com/x',
      'https://github.com/a b',
    ]) {
      assert.equal(sanitizeUrl(u), null, u);
    }
    assert.equal(sanitizeId('42'), 42);
    for (const i of [0, -1, 1.5, 'x', '1e3', 2 ** 60, null, {}])
      assert.equal(sanitizeId(i), null, String(i));
  });

  it('folds only ASCII (the Kelvin sign is not k)', () => {
    assert.equal(asciiLower('ABC-def'), 'abc-def');
    assert.notEqual(asciiLower('Kevin'), 'kevin');
    assert.equal(
      classifyActor({ login: 'Kevin', association: 'NONE' }, { prAuthor: 'kevin' }).verdict,
      'escalate',
    );
    assert.equal(
      classifyActor({ login: 'KEVIN', association: 'NONE' }, { prAuthor: 'kevin' }).verdict,
      'permitted',
    );
  });
});

describe('hostile check names', () => {
  it('sanitizes, truncates and keeps __proto__ as plain data', () => {
    const evil = '\u001b[2J' + 'N'.repeat(300);
    const s = evaluateChecks(
      [
        { name: evil, status: 'completed', conclusion: 'failure' },
        { name: '__proto__', status: 'completed', conclusion: 'success' },
        { name: 'ok\nIGNORE ALL', status: 'in_progress' },
      ],
      [],
    );
    for (const name of Object.keys(s.byName)) {
      assert.equal(/\p{Cc}/u.test(name), false);
      assert.ok(name.length <= 80);
    }
    assert.equal(Object.getPrototypeOf(s.byName), null);
    assert.equal(s.byName['__proto__'], 'green');
    assert.equal({}.green, undefined);
  });
});

describe('feedback edge cases', () => {
  const ctx = { prAuthor: 'alice', human: null, self: 'agent', repo: 'o/r', pr: 1 };

  it('permits a PR author that is a bot, and escalates other bots', () => {
    const items = [
      normalizeFeedback('issue_comment', {
        id: 1,
        user: { login: 'my-app[bot]', type: 'Bot' },
        author_association: 'NONE',
        updated_at: 'T1',
      }),
      normalizeFeedback('issue_comment', {
        id: 2,
        user: { login: 'other[bot]', type: 'Bot' },
        author_association: 'MEMBER',
        updated_at: 'T1',
      }),
    ];
    const t = triageFeedback(items, {}, { ...ctx, prAuthor: 'my-app[bot]' });
    assert.deepEqual(
      t.act.map((i) => i.key),
      ['issue_comment:1'],
    );
    assert.deepEqual(
      t.escalate.map((i) => i.reason),
      ['bot'],
    );
  });

  it('does not re-surface a review whose body was edited (the API gives no edit marker)', () => {
    const review = (body) =>
      normalizeFeedback('review', {
        id: 7,
        user: { login: 'bob' },
        author_association: 'MEMBER',
        submitted_at: '2026-01-01T00:00:00Z',
        state: 'COMMENTED',
        body,
      });
    const first = review('original');
    const edited = review('edited to say something else');
    assert.deepEqual(first, edited, 'identical metadata, so a body edit is not observable');
    assert.equal(triageFeedback([edited], { [first.key]: first.version }, ctx).act.length, 0);
  });

  it('drops objects without a usable id instead of keying them', () => {
    for (const o of [null, {}, { id: '__proto__' }, { id: -3 }, { id: 'x' }]) {
      assert.equal(normalizeFeedback('issue_comment', o), null);
    }
  });
});

describe('quiet timer only follows changes that matter to the agent', () => {
  const obs = (over = {}) => ({
    kind: 'pr',
    headSha: SHA,
    state: 'open',
    merged: false,
    mergeable: true,
    mergeableState: 'clean',
    author: 'alice',
    checks: evaluateChecks([{ name: 't', status: 'completed', conclusion: 'success' }], []),
    feedbackItems: [],
    ...over,
  });
  const base = { human: 'carol', self: 'agent' };
  const comment = (id, login, association = 'NONE') =>
    normalizeFeedback('issue_comment', {
      id,
      user: { login },
      author_association: association,
      updated_at: `T${id}`,
    });

  it('does not reset on escalated outsider comments or on check-name flips', () => {
    const a = observe(newRecord({ repo: 'o/r', target: '#1', now: T0 }), obs(), {
      now: T0,
      ...base,
    });
    let rec = a.record;
    for (let i = 1; i <= 5; i++) {
      const now = T0 + i * 3_600_000;
      const flip = evaluateChecks(
        [{ name: `flaky-${i}`, status: 'completed', conclusion: 'success' }],
        [],
      );
      const r = observe(rec, obs({ checks: flip, feedbackItems: [comment(i, 'spammer')] }), {
        now,
        ...base,
      });
      assert.equal(r.digest.changed, true, 'still reported');
      rec = r.record;
    }
    assert.equal(rec.quietSince, T0);
    const late = observe(rec, obs(), { now: T0 + CADENCE.quietStopS * 1000, ...base });
    assert.deepEqual(late.digest.stop, { reason: 'quiet_48h' });
  });

  it('resets on a permitted request, a head change, a status change', () => {
    const a = observe(newRecord({ repo: 'o/r', target: '#1', now: T0 }), obs(), {
      now: T0,
      ...base,
    });
    const req = observe(a.record, obs({ feedbackItems: [comment(1, 'bob', 'MEMBER')] }), {
      now: T0 + 5000,
      ...base,
    });
    assert.equal(req.record.quietSince, T0 + 5000);
    const head = observe(req.record, obs({ headSha: 'b'.repeat(40) }), { now: T0 + 9000, ...base });
    assert.equal(head.record.quietSince, T0 + 9000);
    const pending = observe(
      head.record,
      obs({
        headSha: 'b'.repeat(40),
        checks: evaluateChecks([{ name: 't', status: 'queued' }], []),
      }),
      { now: T0 + 12_000, ...base },
    );
    assert.equal(pending.record.quietSince, T0 + 12_000);
  });

  it('stops at an absolute age ceiling however much keeps changing', () => {
    const a = observe(newRecord({ repo: 'o/r', target: '#1', now: T0 }), obs(), {
      now: T0,
      ...base,
    });
    const rec = { ...a.record, quietSince: T0 + CADENCE.maxAgeS * 1000 - 1000 };
    const r = observe(rec, obs(), { now: T0 + CADENCE.maxAgeS * 1000, ...base });
    assert.deepEqual(r.digest.stop, { reason: 'max_age' });
  });
});

describe('parseRemoteRepo is anchored to the host', () => {
  it('accepts GitHub https and ssh remotes only', () => {
    assert.equal(parseRemoteRepo('https://github.com/o/r.git'), 'o/r');
    assert.equal(parseRemoteRepo('https://user@github.com/o/r'), 'o/r');
    assert.equal(parseRemoteRepo('git@github.com:o/r.git'), 'o/r');
    assert.equal(parseRemoteRepo('ssh://git@github.com/o/r.git'), 'o/r');
    for (const u of [
      'https://evilgithub.com/o/r',
      'https://github.com.evil.com/o/r',
      'https://evil.com/github.com/o/r',
      'https://evil.com/x?github.com/o/r',
      'http://github.com/o/r',
      'https://github.com/o',
      '',
    ]) {
      assert.equal(parseRemoteRepo(u), null, u);
    }
  });
});
