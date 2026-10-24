// ------------------------------
// githooks.test.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Validation: the repo's .githooks refresh the gitignored arc42 index after
 * clone/pull/checkout and can never block a git operation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = ['post-merge', 'post-checkout', 'post-rewrite', 'refresh-index'];

describe('validation: .githooks', () => {
  for (const hook of HOOKS) {
    it(`${hook} exists and is executable`, () => {
      accessSync(join(ROOT, '.githooks', hook), constants.X_OK);
    });
  }

  it('package.json prepare points git at .githooks', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    assert.match(pkg.scripts.prepare, /core\.hooksPath \.githooks/);
  });

  it('the index file the hooks write is gitignored', () => {
    assert.match(
      readFileSync(join(ROOT, '.gitignore'), 'utf8'),
      /^docs\/architecture\/index\.json$/m,
    );
  });

  it('refresh-index exits 0 outside a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aif-hook-'));
    try {
      execFileSync(join(ROOT, '.githooks', 'refresh-index'), { cwd: dir, stdio: 'pipe' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
