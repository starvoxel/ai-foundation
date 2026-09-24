/**
 * Unit tests for the `aif config` command (lib/commands/config.js).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runConfig } from '../../lib/commands/config.js';

function quiet(fn) {
  const origLog = console.log;
  const origError = console.error;
  const out = [];
  const err = [];
  console.log = (...args) => out.push(args.join(' '));
  console.error = (...args) => err.push(args.join(' '));
  try {
    const code = fn();
    return { code, out, err };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

describe('unit: config command', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns 1 with no key given', () => {
    const { code } = quiet(() => runConfig({ args: {}, positional: [] }, projectRoot));
    assert.equal(code, 1);
  });

  it('prints the resolved default value for an unset key', () => {
    const { code, out } = quiet(() =>
      runConfig({ args: {}, positional: ['paths.decisions'] }, projectRoot),
    );
    assert.equal(code, 0);
    assert.equal(out[0], 'knowledge/decisions');
  });

  it('prints a configured value over the default', () => {
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'archive/decisions' } }),
    );
    const { out } = quiet(() =>
      runConfig({ args: {}, positional: ['paths.decisions'] }, projectRoot),
    );
    assert.equal(out[0], 'archive/decisions');
  });

  it('prints an absolute path with --abs', () => {
    const { out } = quiet(() =>
      runConfig({ args: { abs: true }, positional: ['paths.decisions'] }, projectRoot),
    );
    assert.equal(out[0], join(projectRoot, 'knowledge/decisions'));
  });

  it('returns 1 with a descriptive error for an unknown field', () => {
    const { code, err } = quiet(() =>
      runConfig({ args: {}, positional: ['not_a_real_field'] }, projectRoot),
    );
    assert.equal(code, 1);
    assert.ok(err.join('').includes('Unknown'));
  });
});
