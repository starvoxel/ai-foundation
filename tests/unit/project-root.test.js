// ------------------------------
// project-root.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkProjectRoot, projectRootProblem } from '../../lib/project-root.js';

describe('projectRootProblem', () => {
  const none = () => false;
  const only =
    (...names) =>
    (name) =>
      names.includes(name);

  it('never objects to global scope, wherever it runs', () => {
    assert.equal(projectRootProblem('global', '/home/me', none), null);
  });

  it('accepts project scope where there is a .aiconfig.json', () => {
    assert.equal(projectRootProblem('project', '/p', only('.aiconfig.json')), null);
  });

  it('accepts project scope where there is a .git', () => {
    assert.equal(projectRootProblem('project', '/p', only('.git')), null);
  });

  it('refuses project scope with no marker, naming the directory and --scope global', () => {
    const message = projectRootProblem('project', '/home/me', none);
    assert.match(message, /No project found in \/home\/me/);
    assert.match(message, /\.aiconfig\.json or \.git/);
    assert.match(message, /--scope global/);
  });
});

describe('checkProjectRoot', () => {
  it('reads the real directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aif-root-'));
    try {
      assert.notEqual(checkProjectRoot('project', dir), null);
      writeFileSync(join(dir, '.aiconfig.json'), '{}\n');
      assert.equal(checkProjectRoot('project', dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a .git directory and a .git file, as in a worktree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aif-root-'));
    try {
      mkdirSync(join(dir, '.git'));
      assert.equal(checkProjectRoot('project', dir), null);
      rmSync(join(dir, '.git'), { recursive: true });
      writeFileSync(join(dir, '.git'), 'gitdir: /elsewhere\n');
      assert.equal(checkProjectRoot('project', dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
