/**
 * Unit tests for oversight level resolution (lib/oversight.js) and the
 * `aif oversight` command (lib/commands/oversight.js).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveOversight, isOversightLevel, OVERSIGHT_LEVELS } from '../../lib/oversight.js';
import { runOversight } from '../../lib/commands/oversight.js';

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

  it('lets a request lower or raise the level when not enforced', () => {
    assert.equal(
      resolveOversight({ configured: 'always', enforced: false, requested: 'none' }).level,
      'none',
    );
    assert.equal(
      resolveOversight({ configured: 'none', enforced: false, requested: 'always' }).level,
      'always',
    );
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

  it('accepts a request equal to the enforced level', () => {
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

describe('unit: oversight command', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'oversight-test-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function run(args) {
    const origLog = console.log;
    const origError = console.error;
    const out = [];
    const err = [];
    console.log = (...a) => out.push(a.join(' '));
    console.error = (...a) => err.push(a.join(' '));
    try {
      const code = runOversight({ args, positional: [] }, projectRoot);
      return { code, out, err };
    } finally {
      console.log = origLog;
      console.error = origError;
    }
  }

  it('defaults to by-size with no .aiconfig.json', () => {
    const { code, out } = run({});
    assert.equal(code, 0);
    assert.deepEqual(out, ['by-size']);
  });

  it('applies a request when not enforced', () => {
    assert.deepEqual(run({ request: 'none' }).out, ['none']);
  });

  it('keeps the enforced level and notes the ignored request on stderr', () => {
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ oversight: { default: 'always', enforced: true } }),
    );
    const { code, out, err } = run({ request: 'none' });
    assert.equal(code, 0);
    assert.deepEqual(out, ['always']);
    assert.match(err[0], /enforced/);
  });

  it('fails on an invalid request or a bare --request', () => {
    assert.equal(run({ request: 'x' }).code, 1);
    assert.equal(run({ request: true }).code, 1);
  });
});
