// ------------------------------
// harness-changes.test.js
//
// Author: Starvoxel AI Agent - 2026-11-23
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Tests for .github/scripts/harness-changes.mjs: the pure porcelain check and
 * the env/output wrapper, with git stubbed out.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/harness-changes.mjs'),
).href;
const { hasChanges, watchedPaths, run } = await import(SCRIPT);

describe('hasChanges', () => {
  it('is false for empty or whitespace-only output', () => {
    assert.equal(hasChanges(''), false);
    assert.equal(hasChanges('\n'), false);
  });

  it('is true when any path is listed', () => {
    assert.equal(hasChanges(' M .claude/agents/engineer.md\n'), true);
    assert.equal(hasChanges('?? .kiro/steering/new.md\n'), true);
  });
});

describe('watchedPaths', () => {
  it('lists the harness directories, the integrations manifest and the unpinned integration files', () => {
    assert.deepEqual(watchedPaths(), [
      '.claude',
      '.kiro',
      '.aif',
      '.githooks/commit-msg',
      '.githooks/post-checkout',
      '.githooks/post-merge',
      '.githooks/post-rewrite',
      '.githooks/refresh-index',
      'scripts/session-start.sh',
    ]);
  });

  it('never lists a workflow file, which Dependabot owns', () => {
    for (const path of watchedPaths()) assert.ok(!path.startsWith('.github/'), path);
  });
});

describe('run', () => {
  /**
   * Run with a stubbed git and a temp GITHUB_OUTPUT file.
   * @param {string} porcelain - Stubbed `git status --porcelain` output
   * @returns {{ changed: boolean, output: string, logs: string[], dirs: string[][] }}
   */
  function runWith(porcelain) {
    const dir = mkdtempSync(join(tmpdir(), 'aif-harness-'));
    const out = join(dir, 'output');
    const logs = [];
    const dirs = [];
    try {
      const changed = run(
        { GITHUB_OUTPUT: out },
        {
          status: (d) => {
            dirs.push(d);
            return porcelain;
          },
          log: (line) => logs.push(line),
        },
      );
      return { changed, output: readFileSync(out, 'utf8'), logs, dirs };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('publishes changed=true and limits git to the watched paths', () => {
    const result = runWith(' M .claude/skills/x/SKILL.md\n');
    assert.equal(result.changed, true);
    assert.equal(result.output, 'changed=true\n');
    assert.deepEqual(result.dirs, [watchedPaths()]);
    assert.match(result.logs[0], /have changes/);
  });

  it('publishes changed=false when git reports nothing', () => {
    const result = runWith('');
    assert.equal(result.changed, false);
    assert.equal(result.output, 'changed=false\n');
    assert.match(result.logs[0], /unchanged/);
  });

  it('does not require GITHUB_OUTPUT', () => {
    assert.equal(run({}, { status: () => '', log: () => {} }), false);
  });
});
