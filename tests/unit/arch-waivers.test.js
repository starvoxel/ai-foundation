/**
 * Unit tests for lib/arch-waivers.js pure functions.
 * Plan: AIF-013 (Task 002).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseWaivers,
  validateReason,
  evaluateWaivers,
  escapeTableCell,
  parseGitLogOutput,
  assertSafeRef,
} from '../../lib/arch-waivers.js';

describe('validateReason', () => {
  it('accepts a real reason', () => {
    assert.equal(validateReason('doc only describes the public CLI surface').valid, true);
  });
  it('rejects placeholders case-insensitively with punctuation', () => {
    for (const r of ['n/a', 'N/A.', 'NA', 'none', 'OK', 'Unaffected', '-', '...', '', '  ']) {
      const res = validateReason(r);
      assert.equal(res.valid, false, r);
      assert.match(res.rejection, /placeholder/);
    }
  });
  it('rejects short reasons by non-space count', () => {
    const res = validateReason('too short');
    assert.equal(res.valid, false);
    assert.match(res.rejection, /too short/);
  });
  it('counts non-space characters, not total length', () => {
    assert.equal(validateReason('a b c d e f g h i').valid, false); // 9 non-space
    assert.equal(validateReason('a b c d e f g h i j').valid, true); // 10
  });
});

describe('parseWaivers', () => {
  it('parses an em dash waiver', () => {
    const [w] = parseWaivers(
      'Subject\n\nArch-Unaffected: 05.04 — behavior unchanged, refactor only',
    );
    assert.deepEqual(w, {
      section: '05.04',
      reason: 'behavior unchanged, refactor only',
      valid: true,
    });
  });
  it('accepts em dash without surrounding spaces', () => {
    assert.equal(parseWaivers('Arch-Unaffected: 02—constraints still hold true')[0].section, '02');
  });
  it('accepts ASCII " -- " and " - " fallbacks', () => {
    assert.equal(
      parseWaivers('Arch-Unaffected: 05.04 -- internal rename only')[0].reason,
      'internal rename only',
    );
    assert.equal(
      parseWaivers('Arch-Unaffected: 05.04 - internal rename only')[0].reason,
      'internal rename only',
    );
  });
  it('does not treat a hyphen without spaces as a separator', () => {
    const [w] = parseWaivers('Arch-Unaffected: 05.04-internal rename only');
    assert.equal(w.valid, false);
    assert.match(w.rejection, /malformed/);
  });
  it('keeps section as a string', () => {
    assert.equal(
      typeof parseWaivers('Arch-Unaffected: 05 — long enough reason')[0].section,
      'string',
    );
  });
  it('parses a squash-shaped body with mid-body bullet waivers', () => {
    const msg = [
      '* Add waiver parser',
      '',
      '* Wire the gate',
      '',
      '  Arch-Unaffected: 05.04 — gate wiring does not change documented flow',
      '',
      '* Fix lint',
      '- Arch-Unaffected: 02 — constraints unaffected by lint fix',
    ].join('\n');
    const ws = parseWaivers(msg);
    assert.equal(ws.length, 2);
    assert.equal(ws[0].section, '05.04');
    assert.equal(ws[1].section, '02');
  });
  it('handles bullet-prefixed and CRLF lines', () => {
    const ws = parseWaivers(
      '* Arch-Unaffected: 05.04 — reason is long enough\r\n- Arch-Unaffected: 02 — another long reason\r\n',
    );
    assert.deepEqual(
      ws.map((w) => w.reason),
      ['reason is long enough', 'another long reason'],
    );
  });
  it('supports multiple waivers per message', () => {
    const ws = parseWaivers(
      'S\n\nArch-Unaffected: 05.03 — first long reason\nArch-Unaffected: 05.04 — second long reason',
    );
    assert.equal(ws.length, 2);
  });
  it('ignores the key when not at line start (prose mention)', () => {
    assert.deepEqual(parseWaivers('see the Arch-Unaffected: 05.04 — x trailer docs'), []);
  });
  it('is case-sensitive on the key', () => {
    assert.deepEqual(parseWaivers('arch-unaffected: 05.04 — long enough reason'), []);
  });
  it('flags a bad section token as malformed', () => {
    const [w] = parseWaivers('Arch-Unaffected: foo — long enough reason');
    assert.equal(w.valid, false);
    assert.equal(w.section, '');
  });
  it('flags empty and placeholder reasons', () => {
    assert.equal(parseWaivers('Arch-Unaffected: 05.04')[0].valid, false);
    assert.equal(parseWaivers('Arch-Unaffected: 05.04 — n/a')[0].valid, false);
    assert.equal(parseWaivers('Arch-Unaffected: 05.04 — short')[0].valid, false);
  });
  it('treats injection-looking reasons as inert text', () => {
    const reason = '$(rm -rf /); `x` | <script>alert(1)</script> [a](javascript:b)';
    const [w] = parseWaivers(`Arch-Unaffected: 05.04 — ${reason}`);
    assert.equal(w.valid, true);
    assert.equal(w.reason, reason);
  });
  it('returns [] for empty/undefined input', () => {
    assert.deepEqual(parseWaivers(''), []);
    assert.deepEqual(parseWaivers(undefined), []);
  });
});

describe('evaluateWaivers', () => {
  const sectionKeyFiles = new Map([
    ['05.03', ['lib/a.js', 'lib/b.js']],
    ['05.04', ['lib/c.js']],
  ]);
  const commit = (sha, message) => ({ sha, date: '2026-10-06T00:00:00Z', message });

  it('accepts a section-level waiver covering all listed changed files', () => {
    const r = evaluateWaivers({
      commits: [commit('s1', 'x\n\nArch-Unaffected: 05.03 — only comments changed here')],
      sectionKeyFiles,
      changedFiles: ['lib/a.js', 'lib/b.js', 'lib/c.js'],
    });
    assert.equal(r.rejected.length, 0);
    assert.deepEqual(r.accepted[0].coveredFiles, ['lib/a.js', 'lib/b.js']);
    assert.deepEqual(r.coveredFiles, ['lib/a.js', 'lib/b.js']);
  });
  it('rejects a section listing none of the changed files', () => {
    const r = evaluateWaivers({
      commits: [commit('s1', 'Arch-Unaffected: 05.04 — only comments changed here')],
      sectionKeyFiles,
      changedFiles: ['lib/a.js'],
    });
    assert.equal(r.accepted.length, 0);
    assert.match(r.rejected[0].rejection, /lists none of the changed files/);
    assert.deepEqual(r.coveredFiles, []);
  });
  it('rejects an unknown section', () => {
    const r = evaluateWaivers({
      commits: [commit('s1', 'Arch-Unaffected: 99 — only comments changed here')],
      sectionKeyFiles,
      changedFiles: ['lib/a.js'],
    });
    assert.match(r.rejected[0].rejection, /unknown section 99/);
  });
  it('rejects mechanically invalid reasons and carries sha/date', () => {
    const r = evaluateWaivers({
      commits: [commit('s1', 'Arch-Unaffected: 05.03 — n/a')],
      sectionKeyFiles,
      changedFiles: ['lib/a.js'],
    });
    assert.equal(r.rejected[0].sha, 's1');
    assert.equal(r.rejected[0].date, '2026-10-06T00:00:00Z');
    assert.match(r.rejected[0].rejection, /placeholder/);
  });
  it('accepts a plain-object map and normalizes paths', () => {
    const r = evaluateWaivers({
      commits: [commit('s1', 'Arch-Unaffected: 05.03 — only comments changed here')],
      sectionKeyFiles: { '05.03': ['./lib/a.js'] },
      changedFiles: ['lib\\a.js'],
    });
    assert.equal(r.accepted.length, 1);
  });
  it('evaluates waivers across multiple commits', () => {
    const r = evaluateWaivers({
      commits: [
        commit('s1', 'Arch-Unaffected: 05.03 — only comments changed here'),
        commit('s2', 'Arch-Unaffected: 05.04 — only comments changed here'),
      ],
      sectionKeyFiles,
      changedFiles: ['lib/a.js', 'lib/c.js'],
    });
    assert.deepEqual(r.coveredFiles, ['lib/a.js', 'lib/c.js']);
  });
});

describe('escapeTableCell', () => {
  it('escapes table, html, backtick, and link characters', () => {
    const out = escapeTableCell('a|b <i>x</i> `c` [l](u) & \\');
    assert.doesNotMatch(out, /[|<>`[\]\\]/);
    assert.match(out, /&#124;/);
    assert.match(out, /&lt;i&gt;/);
    assert.match(out, /&amp;/);
  });
  it('collapses newlines and control characters to spaces', () => {
    assert.equal(escapeTableCell('a\nb\r\nc\x00d'), 'a b c d');
  });
  it('handles non-strings', () => {
    assert.equal(escapeTableCell(undefined), '');
    assert.equal(escapeTableCell(5), '5');
  });
});

describe('parseGitLogOutput', () => {
  it('parses NUL-terminated records with multi-line messages', () => {
    const out =
      'aaa\n2026-01-01T00:00:00+00:00\nSubject\n\nBody line\n\0bbb\n2026-01-02T00:00:00+00:00\nOther\n\0';
    assert.deepEqual(parseGitLogOutput(out), [
      { sha: 'aaa', date: '2026-01-01T00:00:00+00:00', message: 'Subject\n\nBody line' },
      { sha: 'bbb', date: '2026-01-02T00:00:00+00:00', message: 'Other' },
    ]);
  });
  it('returns [] for empty output', () => {
    assert.deepEqual(parseGitLogOutput(''), []);
  });
});

describe('assertSafeRef', () => {
  it('accepts normal refs and ranges', () => {
    assert.equal(assertSafeRef('origin/main..HEAD'), 'origin/main..HEAD');
  });
  it('rejects option-like, empty, and whitespace refs', () => {
    for (const bad of ['--output=x', '-n1', '', 'a b', 'a\nb', undefined]) {
      assert.throws(() => assertSafeRef(bad), undefined, String(bad));
    }
  });
});
