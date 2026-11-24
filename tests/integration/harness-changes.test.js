// ------------------------------
// harness-changes.test.js
//
// Author: Starvoxel AI Agent - 2026-11-23
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Runs .github/scripts/harness-changes.mjs in a real scratch git repository, so
 * the `git status --porcelain` pathspec behaviour is checked, not assumed.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(import.meta.dirname, '../../.github/scripts/harness-changes.mjs');

describe('harness-changes.mjs in a git repo', () => {
  let dir;

  /**
   * Run the script in the scratch repo and read the published output.
   * @returns {string} The `changed=…` line
   */
  function changedLine() {
    const out = join(dir, '..', `${Date.now()}-${Math.random()}.out`);
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: dir,
      env: { ...process.env, GITHUB_OUTPUT: out },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const line = readFileSync(out, 'utf8').trim();
    rmSync(out);
    return line;
  }

  /** @param {...string} args */
  function git(...args) {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  }

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'aif-harness-repo-'));
    git('init', '-q');
    mkdirSync(join(dir, '.claude'));
    writeFileSync(join(dir, '.claude', 'a.md'), 'one\n');
    writeFileSync(join(dir, 'README.md'), 'readme\n');
    git('add', '-A');
    git(
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      'init',
    );
  });

  after(() => rmSync(dir, { recursive: true, force: true }));

  it('reports changed=false for a clean tree, even when .kiro/ does not exist', () => {
    assert.equal(changedLine(), 'changed=false');
  });

  it('ignores changes outside the harness directories', () => {
    writeFileSync(join(dir, 'README.md'), 'edited\n');
    assert.equal(changedLine(), 'changed=false');
    git('checkout', '--', 'README.md');
  });

  it('reports changed=true for a modified harness file', () => {
    writeFileSync(join(dir, '.claude', 'a.md'), 'two\n');
    assert.equal(changedLine(), 'changed=true');
    git('checkout', '--', '.claude/a.md');
  });

  it('reports changed=true for a new untracked harness file', () => {
    mkdirSync(join(dir, '.kiro'));
    writeFileSync(join(dir, '.kiro', 'b.md'), 'new\n');
    assert.equal(changedLine(), 'changed=true');
  });
});
