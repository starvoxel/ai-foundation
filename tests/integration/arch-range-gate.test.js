/**
 * Integration tests for the PR-range gate (`aif index architecture --check
 * --base/--head`) against real throwaway git repos.
 * Plan: AIF-013 (Task 003).
 *
 * The legacy last_verified check is still live, so a range that changes a
 * key_file without touching its doc is exercised with `--head <commit>`: HEAD
 * itself sits one commit later, where the doc's last_verified has been bumped.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { readRange, findDefaultBase } from '../../lib/architecture.js';
import { runIndex } from '../../lib/commands/index.js';
import { parseArgs } from '../../bin/aif.js';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function commitAll(cwd, message) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

function docContent(lastVerified, { section = '05.04', keyFiles = ['src/thing.js'] } = {}) {
  return `---
section: '${section}'
title: 'T'
lifecycle: published
last_verified: ${lastVerified}
tags: []
key_files:
${keyFiles.map((f) => `  - ${f}`).join('\n')}
---

> Summary.
`;
}

/** Run the CLI entry in-process, capturing console output. */
function runCli(repoRoot, argv) {
  const out = [];
  const err = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  let code;
  try {
    code = runIndex(parseArgs(['index', 'architecture', '--check', ...argv]), repoRoot);
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const REASON = 'internal refactor, the documented behaviour is unchanged';

describe('architecture range gate — real git ranges', () => {
  let repo;
  let base;
  let docPath;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'aif-range-gate-'));
    git(repo, 'init', '-q', '-b', 'trunk');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    writeFileSync(
      join(repo, '.aiconfig.json'),
      JSON.stringify({ paths: { architecture: 'docs/architecture' } }),
    );
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'thing.js'), 'export const x = 1;\n');
    writeFileSync(join(repo, 'src', 'other.js'), 'export const y = 1;\n');
    mkdirSync(join(repo, 'docs', 'architecture'), { recursive: true });
    docPath = join(repo, 'docs', 'architecture', '05_04_thing.md');
    writeFileSync(docPath, docContent('0'.repeat(40) /* replaced below */));
    base = commitAll(repo, 'base');
    // Point last_verified at a real commit so the legacy check can run.
    writeFileSync(docPath, docContent(base));
    base = commitAll(repo, 'pin doc');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  /** Change thing.js in one commit, then bump the doc's last_verified in the next. */
  function changeKeyFile(message) {
    writeFileSync(join(repo, 'src', 'thing.js'), `export const x = ${Math.random()};\n`);
    const changed = commitAll(repo, message);
    writeFileSync(docPath, docContent(changed));
    // The follow-up touches the doc, so it is deliberately excluded via --head.
    const bump = commitAll(repo, 'bump last_verified');
    return { changed, bump };
  }

  it('readRange lists deletions and both sides of a rename, and the range commits', () => {
    git(repo, 'mv', 'src/other.js', 'src/renamed.js');
    git(repo, 'rm', '-q', 'src/thing.js');
    commitAll(repo, 'rename and delete');
    const range = readRange({ cwd: repo, base });
    assert.deepEqual(range.changedFiles.sort(), ['src/other.js', 'src/renamed.js', 'src/thing.js']);
    assert.equal(range.commits.length, 1);
    assert.equal(range.commits[0].message, 'rename and delete');
  });

  it('readRange uses changes since the merge-base, not the base tip', () => {
    git(repo, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(repo, 'src', 'other.js'), 'export const y = 2;\n');
    commitAll(repo, 'feature change');
    git(repo, 'checkout', '-q', 'trunk');
    writeFileSync(join(repo, 'src', 'thing.js'), 'export const x = 99;\n');
    commitAll(repo, 'trunk moved on');
    const range = readRange({ cwd: repo, base: 'trunk', head: 'feature' });
    assert.deepEqual(range.changedFiles, ['src/other.js']);
    assert.equal(range.commits.length, 1);
  });

  it('readRange rejects option-like and unresolvable refs', () => {
    assert.throws(() => readRange({ cwd: repo, base: '--output=/tmp/x' }), /unsafe git ref/);
    assert.throws(() => readRange({ cwd: repo, base, head: '-x' }), /unsafe git ref/);
    assert.throws(() => readRange({ cwd: repo, base: 'no-such-ref' }), /does not resolve/);
  });

  it('fails when a key_file changed and neither doc nor waiver covers it', () => {
    const { changed } = changeKeyFile('change thing');
    const r = runCli(repo, ['--base', base, '--head', changed]);
    assert.equal(r.code, 1);
    assert.match(r.err, /Range gate failed/);
    assert.match(r.err, /src\/thing\.js \(listed by: docs\/architecture\/05_04_thing\.md\)/);
    assert.match(r.err, /Arch-Unaffected: <section>/);
  });

  it('passes when the doc changed in the range', () => {
    changeKeyFile('change thing');
    const r = runCli(repo, ['--base', base]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Range gate passed/);
  });

  it('passes with a waiver as a mid-body, squash-shaped bullet and reports it', () => {
    const { changed } = changeKeyFile(
      `Squash title\n\n* first thing\n* Arch-Unaffected: 05.04 — ${REASON}\n* last thing`,
    );
    const r = runCli(repo, ['--base', base, '--head', changed]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /accepted waiver .*section 05\.04 covers src\/thing\.js/);
  });

  it('fails and reports a rejected waiver naming a non-listing section', () => {
    writeFileSync(
      join(repo, 'docs', 'architecture', '05_05_other.md'),
      docContent(base, { section: '05.05', keyFiles: ['src/other.js'] }),
    );
    const { changed } = changeKeyFile(`Change\n\nArch-Unaffected: 05.05 — ${REASON}`);
    const r = runCli(repo, ['--base', base, '--head', changed]);
    assert.equal(r.code, 1);
    assert.match(r.err, /rejected waiver .*section 05\.05 — section 05\.05 lists none/);
    assert.match(r.err, /Range gate failed/);
  });

  it('fails on a placeholder waiver reason', () => {
    const { changed } = changeKeyFile('Change\n\nArch-Unaffected: 05.04 — n/a');
    const r = runCli(repo, ['--base', base, '--head', changed]);
    assert.equal(r.code, 1);
    assert.match(r.err, /rejected waiver .*placeholder/);
  });

  it('fails closed on an explicit --base that does not resolve', () => {
    const r = runCli(repo, ['--base', 'does-not-exist']);
    assert.equal(r.code, 1);
    assert.match(r.err, /Range gate could not run: git ref does not resolve/);
  });

  it('fails closed on a --base with no value or an option-like value', () => {
    assert.equal(runCli(repo, ['--base']).code, 1);
    const r = runCli(repo, ['--base', '-x']);
    assert.equal(r.code, 1);
    assert.match(r.err, /require a git ref value/);
  });

  it('rejects --base/--head without --check', () => {
    const err = [];
    const orig = console.error;
    console.error = (...a) => err.push(a.join(' '));
    let code;
    try {
      code = runIndex(parseArgs(['index', 'architecture', '--base', base]), repo);
    } finally {
      console.error = orig;
    }
    assert.equal(code, 1);
    assert.match(err.join('\n'), /only valid with --check/);
  });

  it('skips with a notice when no --base is given and no main/origin/main exists', () => {
    assert.equal(findDefaultBase(repo), null);
    const r = runCli(repo, []);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Range gate skipped/);
  });

  it('discovers the merge-base with main when no --base is given', () => {
    git(repo, 'branch', '-m', 'main');
    git(repo, 'checkout', '-q', '-b', 'feature');
    assert.equal(findDefaultBase(repo), base);
    writeFileSync(join(repo, 'src', 'thing.js'), 'export const x = 5;\n');
    const changed = commitAll(repo, 'feature change');
    writeFileSync(docPath, docContent(changed));
    // Doc changed in the range -> covered, gate passes against the default base.
    commitAll(repo, 'doc follows');
    const r = runCli(repo, []);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Range gate passed/);
  });

  it('fails against a default base when the key_file change is uncovered', () => {
    git(repo, 'branch', '-m', 'main');
    git(repo, 'checkout', '-q', '-b', 'feature');
    const { changed } = changeKeyFile('uncovered change');
    const r = runCli(repo, ['--head', changed]);
    assert.equal(r.code, 1);
    assert.match(r.err, /Range gate failed/);
  });

  it('flags a deleted key_file in the range', () => {
    git(repo, 'rm', '-q', 'src/thing.js');
    const deleted = commitAll(repo, 'delete thing');
    // Restore the file later so the legacy missing-from-disk check passes at HEAD.
    git(repo, 'checkout', base, '--', 'src/thing.js');
    const restored = commitAll(repo, 'restore thing');
    writeFileSync(docPath, docContent(restored));
    commitAll(repo, 'bump last_verified');
    const r = runCli(repo, ['--base', base, '--head', deleted]);
    assert.equal(r.code, 1);
    assert.match(r.err, /src\/thing\.js/);
  });

  it('sanitizes control characters from untrusted waiver text in output', () => {
    const { changed } = changeKeyFile(
      'Change\n\nArch-Unaffected: 05.99 — x\u001b[31mred\u001b[0m reason text',
    );
    const r = runCli(repo, ['--base', base, '--head', changed]);
    assert.equal(r.code, 1);
    assert.ok(!r.err.includes('\u001b'));
  });

  it('keeps a stale (missing from disk) key_file failing regardless of the gate', () => {
    renameSync(join(repo, 'src', 'thing.js'), join(repo, 'src', 'gone.js'));
    commitAll(repo, 'move thing away');
    const r = runCli(repo, ['--base', base]);
    assert.equal(r.code, 1);
    assert.match(r.err, /stale against key_files/);
  });
});
