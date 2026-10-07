/**
 * Integration tests for lib/arch-waivers.js's `git log` wrapper against a
 * throwaway git repo. Plan: AIF-013 (Task 002).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';
import { readCommits, parseWaivers } from '../../lib/arch-waivers.js';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

describe('readCommits (git log wrapper)', () => {
  let repo;
  let base;

  function commit(file, message) {
    writeFileSync(join(repo, file), message);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', message);
    return git(repo, 'rev-parse', 'HEAD');
  }

  beforeEach(() => {
    repo = createTempRepo();
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    base = commit('a.txt', 'base');
  });
  afterEach(() => destroyTempRepo(repo));

  it('returns sha/date/message for a range, newest first, with full bodies', () => {
    const c1 = commit('b.txt', 'one\n\nArch-Unaffected: 05.04 — first long reason');
    const c2 = commit(
      'c.txt',
      '* squash\n\n* bullet\n  Arch-Unaffected: 02 — second long reason\n',
    );
    const commits = readCommits({ cwd: repo, range: `${base}..HEAD` });
    assert.deepEqual(
      commits.map((c) => c.sha),
      [c2, c1],
    );
    assert.match(commits[0].date, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(parseWaivers(commits[0].message)[0].section, '02');
    assert.equal(parseWaivers(commits[1].message)[0].section, '05.04');
  });

  it('supports `since` as since..HEAD', () => {
    commit('b.txt', 'one');
    assert.equal(readCommits({ cwd: repo, since: base }).length, 1);
  });

  it('returns [] for an empty range', () => {
    assert.deepEqual(readCommits({ cwd: repo, range: `${base}..HEAD` }), []);
  });

  it('rejects option-like refs without running git', () => {
    assert.throws(() => readCommits({ cwd: repo, range: '--output=pwned' }), /unsafe git ref/);
    assert.throws(() => readCommits({ cwd: repo, since: '-n1' }), /unsafe git ref/);
  });

  it('requires exactly one of range/since', () => {
    assert.throws(() => readCommits({ cwd: repo }), /exactly one/);
    assert.throws(() => readCommits({ cwd: repo, range: 'a', since: 'b' }), /exactly one/);
  });

  it('throws on an unresolvable ref', () => {
    assert.throws(() => readCommits({ cwd: repo, range: 'nope..HEAD' }));
  });
});
