// ------------------------------
// mcp-launch.test.js
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isStaleLock,
  LOCK_STALE_MS,
  needsInstall,
} from '../../lib/harnesses/mcp-launch/aif-launch.mjs';

describe('needsInstall', () => {
  it('installs when there is no stamp', () => {
    assert.equal(needsInstall(null, 'abc'), true);
  });

  it('installs when package.json changed since the stamp', () => {
    assert.equal(needsInstall('old\n', 'abc'), true);
  });

  it('skips when the stamp matches, ignoring surrounding whitespace', () => {
    assert.equal(needsInstall('abc\n', 'abc'), false);
  });

  it('installs for an empty stamp', () => {
    assert.equal(needsInstall('', 'abc'), true);
  });
});

describe('isStaleLock', () => {
  it('is stale only past the threshold', () => {
    assert.equal(isStaleLock(0, LOCK_STALE_MS + 1), true);
    assert.equal(isStaleLock(0, LOCK_STALE_MS), false);
  });

  it('honours a custom threshold', () => {
    assert.equal(isStaleLock(1000, 1500, 100), true);
  });
});
