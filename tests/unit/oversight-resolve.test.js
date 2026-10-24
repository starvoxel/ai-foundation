// ------------------------------
// oversight-resolve.test.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Unit tests for the oversight skill's resolver script
 * (skills/oversight/scripts/resolve.js).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  DEFAULT_ENFORCED,
  DEFAULT_LEVEL,
  OVERSIGHT_LEVELS,
  isOversightLevel,
  main,
  resolveOversight,
} from '../../skills/oversight/scripts/resolve.js';
import { DEFAULTS } from '../../lib/aiconfig-defaults.js';

describe('unit: resolveOversight', () => {
  it('lists the levels from lowest to highest', () => {
    assert.deepEqual(OVERSIGHT_LEVELS, ['none', 'by-size', 'always']);
    assert.equal(isOversightLevel('by-size'), true);
    assert.equal(isOversightLevel('sometimes'), false);
  });

  it('returns the configured level when nothing is requested', () => {
    assert.deepEqual(resolveOversight({ configured: 'by-size', enforced: false }), {
      level: 'by-size',
      source: 'config',
    });
  });

  it('rejects a non-boolean enforced instead of silently ignoring it', () => {
    assert.throws(
      () => resolveOversight({ configured: 'always', enforced: 'true', requested: 'none' }),
      /Invalid oversight\.enforced/,
    );
  });

  it('lets a request lower or raise the level when not enforced', () => {
    const lower = resolveOversight({ configured: 'always', enforced: false, requested: 'none' });
    const raise = resolveOversight({ configured: 'none', enforced: false, requested: 'always' });
    assert.equal(lower.level, 'none');
    assert.equal(raise.level, 'always');
  });

  it('lets a request raise the level when enforced', () => {
    const result = resolveOversight({ configured: 'by-size', enforced: true, requested: 'always' });
    assert.deepEqual(result, { level: 'always', source: 'request' });
  });

  it('ignores a request that lowers the level when enforced, and says so', () => {
    const result = resolveOversight({ configured: 'by-size', enforced: true, requested: 'none' });
    assert.equal(result.level, 'by-size');
    assert.equal(result.source, 'config');
    assert.match(result.note, /enforced/);
  });

  it('accepts a request equal to the enforced level without a note', () => {
    const result = resolveOversight({ configured: 'always', enforced: true, requested: 'always' });
    assert.equal(result.level, 'always');
    assert.equal(result.note, undefined);
  });

  it('throws on an invalid configured or requested level', () => {
    assert.throws(
      () => resolveOversight({ configured: 'sometimes', enforced: false }),
      /oversight.default/,
    );
    assert.throws(
      () => resolveOversight({ configured: 'none', enforced: false, requested: 'x' }),
      /Invalid oversight level/,
    );
  });
});

describe('unit: oversight script defaults', () => {
  it('match the documented defaults in lib/aiconfig-defaults.js', () => {
    assert.equal(DEFAULT_LEVEL, DEFAULTS['oversight.default']);
    assert.equal(DEFAULT_ENFORCED, DEFAULTS['oversight.enforced']);
  });
});

describe('unit: oversight script main()', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oversight-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(args, config) {
    const configPath = join(dir, '.aiconfig.json');
    if (config) writeFileSync(configPath, JSON.stringify(config));
    const origLog = console.log;
    const origError = console.error;
    const out = [];
    const err = [];
    console.log = (...a) => out.push(a.join(' '));
    console.error = (...a) => err.push(a.join(' '));
    try {
      const code = main([...args, '--config', configPath]);
      return { code, out, err };
    } finally {
      console.log = origLog;
      console.error = origError;
    }
  }

  it('defaults to by-size with no .aiconfig.json', () => {
    const { code, out } = run([]);
    assert.equal(code, 0);
    assert.deepEqual(out, ['by-size']);
  });

  it('applies a request when not enforced', () => {
    assert.deepEqual(run(['--request', 'none']).out, ['none']);
  });

  it('keeps the enforced level and notes the ignored request on stderr', () => {
    const { code, out, err } = run(['--request', 'none'], {
      oversight: { default: 'always', enforced: true },
    });
    assert.equal(code, 0);
    assert.deepEqual(out, ['always']);
    assert.match(err[0], /enforced/);
  });

  it('fails on an invalid request, a bare --request, or invalid JSON', () => {
    assert.equal(run(['--request', 'x']).code, 1);
    assert.equal(run(['--request']).code, 1);
    writeFileSync(join(dir, '.aiconfig.json'), '{ not json');
    assert.equal(run([]).code, 1);
  });
});
