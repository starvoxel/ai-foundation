/**
 * Git-backed tests for .github/scripts/morning-check.mjs: which files changed
 * in the window, and the guard end to end against a real repository.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/morning-check.mjs'),
).href;
const { changedFilesSince, runGuard } = await import(SCRIPT);

const HOURS_AGO = (/** @type {number} */ h) => new Date(Date.now() - h * 3_600_000).toISOString();

describe('morning check — real git', () => {
  let repoRoot;

  /** Commit the given files with the given author and committer date. */
  function commit(files, message, when) {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(repoRoot, path, '..'), { recursive: true });
      writeFileSync(join(repoRoot, path), content);
    }
    const env = { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when };
    execFileSync('git', ['add', '-A'], { cwd: repoRoot });
    execFileSync('git', ['commit', '-q', '-m', message], { cwd: repoRoot, env });
  }

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aif-morning-test-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('lists files changed after the last commit before the window', () => {
    commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
    commit({ 'lib/new.js': 'x', 'docs/a.md': 'x' }, 'recent', HOURS_AGO(2));
    assert.deepEqual(changedFilesSince(repoRoot, 26).sort(), ['docs/a.md', 'lib/new.js']);
  });

  it('is empty when nothing changed inside the window', () => {
    commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
    assert.deepEqual(changedFilesSince(repoRoot, 26), []);
  });

  it('is null when no commit precedes the window', () => {
    commit({ 'a.txt': 'x' }, 'young', HOURS_AGO(2));
    assert.equal(changedFilesSince(repoRoot, 26), null);
  });

  it('counts a merged branch whose own commits are older than the window', () => {
    commit({ 'base.txt': 'x' }, 'base', HOURS_AGO(100));
    execFileSync('git', ['checkout', '-q', '-b', 'feature'], { cwd: repoRoot });
    commit({ 'lib/feature.js': 'x' }, 'feature work', HOURS_AGO(80));
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: repoRoot });
    const env = { ...process.env, GIT_AUTHOR_DATE: HOURS_AGO(1), GIT_COMMITTER_DATE: HOURS_AGO(1) };
    execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'Merge feature', 'feature'], {
      cwd: repoRoot,
      env,
    });
    assert.deepEqual(changedFilesSince(repoRoot, 26), ['lib/feature.js']);
  });

  describe('runGuard', () => {
    const notMonday = new Date('2026-11-03T09:07:00Z');
    const quiet = () => {};

    it('skips on a quiet day and writes run=false for the workflow', async () => {
      commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
      commit({ 'docs/a.md': 'x' }, 'docs only', HOURS_AGO(2));
      const output = join(repoRoot, 'out.txt');
      const d = await runGuard({
        env: { GITHUB_OUTPUT: output },
        repoRoot,
        now: notMonday,
        api: null,
        log: quiet,
      });
      assert.equal(d.run, false);
      assert.equal(readFileSync(output, 'utf8'), 'run=false\n');
    });

    it('runs when a watched path changed in the window', async () => {
      commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
      commit({ 'lib/thing.js': 'x' }, 'code', HOURS_AGO(2));
      const d = await runGuard({ env: {}, repoRoot, now: notMonday, api: null, log: quiet });
      assert.equal(d.run, true);
      assert.match(d.reason, /install-drift/);
    });

    it('runs on Monday even when nothing changed', async () => {
      commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
      const monday = new Date('2026-11-02T09:07:00Z');
      const d = await runGuard({ env: {}, repoRoot, now: monday, api: null, log: quiet });
      assert.deepEqual(d, { run: true, reason: 'forced' });
    });

    it('runs when forced from the environment', async () => {
      commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
      const d = await runGuard({
        env: { FORCE: 'true' },
        repoRoot,
        now: notMonday,
        api: null,
        log: quiet,
      });
      assert.equal(d.run, true);
    });

    it('runs to re-check when an issue is open', async () => {
      commit({ 'old.txt': 'x' }, 'old', HOURS_AGO(60));
      const api = { paginate: async () => [{ number: 7, body: 'x' }], request: async () => ({}) };
      const d = await runGuard({ env: { REPO: 'o/r' }, repoRoot, now: notMonday, api, log: quiet });
      assert.equal(d.run, true);
      assert.match(d.reason, /open item/);
    });
  });
});
