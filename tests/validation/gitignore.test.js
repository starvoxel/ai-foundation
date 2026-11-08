/**
 * Plan: cloud-agent-override (Milestone 2). The cloud Setup script writes
 * .claude/settings.local.json to override the committed agent; it must never be committable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

describe('.gitignore', () => {
  it('ignores .claude/settings.local.json', () => {
    const result = spawnSync('git', ['check-ignore', '-q', '.claude/settings.local.json'], {
      cwd: REPO_ROOT,
    });
    assert.equal(result.status, 0);
  });
});
