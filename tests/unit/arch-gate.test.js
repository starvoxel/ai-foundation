/**
 * Unit tests for the pure PR-range gate (lib/architecture.js
 * `evaluateRangeGate`, `buildSectionKeyFiles`, `parseNameOnlyOutput`).
 * Plan: AIF-013 (Task 003). Synthetic records/diffs/commits only — no git.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateRangeGate,
  buildSectionKeyFiles,
  parseNameOnlyOutput,
} from '../../lib/architecture.js';

const DOC_DIR = 'docs/architecture';

/** @returns {import('../../lib/architecture.js').ArchitectureRecord} */
function rec(path, section, key_files) {
  return {
    path,
    section,
    title: 't',
    summary: '',
    lifecycle: 'published',
    tags: [],
    key_files,
    last_verified: 'x',
  };
}

const RECORDS = [
  rec('05_04_indexing.md', '05.04', ['lib/a.js', 'lib/b.js']),
  rec('05_05_commands.md', '05.05', ['lib/b.js', 'lib/c.js']),
];

const commit = (message, sha = 'a'.repeat(40)) => ({ sha, date: '2026-01-01T00:00:00Z', message });
const REASON = 'refactor only, documented behaviour is unchanged';

function gate(changedFiles, commits = []) {
  return evaluateRangeGate({ records: RECORDS, docDir: DOC_DIR, changedFiles, commits });
}

describe('evaluateRangeGate', () => {
  it('passes when no key_file changed', () => {
    const r = gate(['README.md', 'lib/other.js']);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.coveredFiles, []);
  });

  it('fails a changed key_file with no doc change or waiver, naming all listing docs', () => {
    const r = gate(['lib/b.js']);
    assert.deepEqual(r.violations, [
      {
        file: 'lib/b.js',
        docs: ['docs/architecture/05_04_indexing.md', 'docs/architecture/05_05_commands.md'],
      },
    ]);
  });

  it('passes when a doc listing the file also changed', () => {
    const r = gate(['lib/a.js', 'docs/architecture/05_04_indexing.md']);
    assert.deepEqual(r.violations, []);
    assert.deepEqual(r.coveredFiles, ['lib/a.js']);
  });

  it('passes a file listed in two docs when only one of them changed', () => {
    const r = gate(['lib/b.js', 'docs/architecture/05_05_commands.md']);
    assert.deepEqual(r.violations, []);
  });

  it('does not accept a doc change in a different directory with the same name', () => {
    const r = gate(['lib/a.js', 'other/05_04_indexing.md']);
    assert.equal(r.violations.length, 1);
  });

  it('passes with a valid waiver naming a listing section', () => {
    const r = gate(['lib/a.js'], [commit(`Fix\n\nArch-Unaffected: 05.04 — ${REASON}`)]);
    assert.deepEqual(r.violations, []);
    assert.equal(r.acceptedWaivers.length, 1);
    assert.deepEqual(r.coveredFiles, ['lib/a.js']);
  });

  it('fails and reports a waiver naming a section that does not list the changed file', () => {
    const r = gate(['lib/a.js'], [commit(`Arch-Unaffected: 05.05 — ${REASON}`)]);
    assert.equal(r.violations.length, 1);
    assert.equal(r.acceptedWaivers.length, 0);
    assert.equal(r.rejectedWaivers.length, 1);
    assert.match(r.rejectedWaivers[0].rejection, /lists none of the changed files/);
  });

  it('fails and reports a waiver naming an unknown section', () => {
    const r = gate(['lib/a.js'], [commit(`Arch-Unaffected: 99 — ${REASON}`)]);
    assert.equal(r.violations.length, 1);
    assert.match(r.rejectedWaivers[0].rejection, /unknown section/);
  });

  it('fails on a placeholder reason and on a too-short reason', () => {
    const placeholder = gate(['lib/a.js'], [commit('Arch-Unaffected: 05.04 — n/a')]);
    assert.equal(placeholder.violations.length, 1);
    assert.match(placeholder.rejectedWaivers[0].rejection, /placeholder/);

    const short = gate(['lib/a.js'], [commit('Arch-Unaffected: 05.04 — no change')]);
    assert.equal(short.violations.length, 1);
    assert.equal(short.rejectedWaivers.length, 1);
  });

  it('accepts a waiver from a different commit of the range', () => {
    const r = gate(
      ['lib/a.js'],
      [commit('Unrelated change', 'b'.repeat(40)), commit(`Arch-Unaffected: 05.04 — ${REASON}`)],
    );
    assert.deepEqual(r.violations, []);
  });

  it('accepts a waiver in a mid-body, bullet-shaped squash message', () => {
    const msg = `Squash title\n\n* first change\n* Arch-Unaffected: 05.04 — ${REASON}\n* last change`;
    assert.deepEqual(gate(['lib/a.js'], [commit(msg)]).violations, []);
  });

  it('treats a deleted key_file like any other changed file', () => {
    // Deletion appears in the changed-file list the same as an edit.
    assert.equal(gate(['lib/c.js']).violations.length, 1);
    const waived = gate(['lib/c.js'], [commit(`Arch-Unaffected: 05.05 — ${REASON}`)]);
    assert.deepEqual(waived.violations, []);
  });

  it('flags both sides of a rename when both are listed', () => {
    // --no-renames reports old (deleted) and new (added) paths separately.
    const r = gate(['lib/a.js', 'lib/c.js']);
    assert.deepEqual(
      r.violations.map((v) => v.file),
      ['lib/a.js', 'lib/c.js'],
    );
    // Renaming into a listed path with the doc updated passes for that side only.
    const partial = gate(['lib/a.js', 'lib/old-name.js', 'docs/architecture/05_04_indexing.md']);
    assert.deepEqual(partial.violations, []);
  });

  it('one section-level waiver covers every changed file the section lists', () => {
    const r = gate(
      ['lib/a.js', 'lib/b.js', 'lib/c.js'],
      [commit(`Arch-Unaffected: 05.04 — ${REASON}`)],
    );
    // 05.04 lists a and b; c is only in 05.05 and stays a violation.
    assert.deepEqual(r.coveredFiles, ['lib/a.js', 'lib/b.js']);
    assert.deepEqual(
      r.violations.map((v) => v.file),
      ['lib/c.js'],
    );
    assert.deepEqual(r.acceptedWaivers[0].coveredFiles, ['lib/a.js', 'lib/b.js']);
  });

  it('normalizes backslash and ./ paths', () => {
    const r = evaluateRangeGate({
      records: [rec('x.md', '01', ['./lib/a.js'])],
      docDir: 'docs\\architecture\\',
      changedFiles: ['lib\\a.js', 'docs\\architecture\\x.md'],
      commits: [],
    });
    assert.deepEqual(r.violations, []);
  });

  it('supports an architecture dir at the repo root', () => {
    const r = evaluateRangeGate({
      records: [rec('x.md', '01', ['lib/a.js'])],
      docDir: '',
      changedFiles: ['lib/a.js', 'x.md'],
      commits: [],
    });
    assert.deepEqual(r.violations, []);
  });
});

describe('buildSectionKeyFiles', () => {
  it('unions key_files across docs sharing a section token', () => {
    const map = buildSectionKeyFiles([
      rec('a.md', '01', ['z.js', 'a.js']),
      rec('b.md', '01', ['a.js']),
    ]);
    assert.deepEqual(map.get('01'), ['a.js', 'z.js']);
  });
});

describe('parseNameOnlyOutput', () => {
  it('splits NUL-separated output and drops empties', () => {
    assert.deepEqual(parseNameOnlyOutput('a b.js\0c.js\0'), ['a b.js', 'c.js']);
    assert.deepEqual(parseNameOnlyOutput(''), []);
  });
});
