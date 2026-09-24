/**
 * Unit tests for bin/aiconfig.js — CLI argv parsing and command dispatch.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseArgs, run } from '../../bin/aiconfig.js';

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

describe('bin/aiconfig parseArgs()', () => {
  it('returns null command for empty argv', () => {
    const result = parseArgs([]);
    assert.equal(result.command, null);
    assert.deepEqual(result.positional, []);
  });

  it('extracts the command and positional key', () => {
    const result = parseArgs(['get', 'paths.decisions']);
    assert.equal(result.command, 'get');
    assert.deepEqual(result.positional, ['paths.decisions']);
  });

  it('parses the --abs boolean flag', () => {
    const result = parseArgs(['get', 'paths.decisions', '--abs']);
    assert.equal(result.args.abs, true);
  });
});

describe('bin/aiconfig run()', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aiconfig-cli-test-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('prints usage and returns 0 for no command', () => {
    const { code } = quiet(() => run({ command: null, args: {}, positional: [] }, projectRoot));
    assert.equal(code, 0);
  });

  it('returns 1 for an unknown command', () => {
    const { code, err } = quiet(() =>
      run({ command: 'bogus', args: {}, positional: [] }, projectRoot),
    );
    assert.equal(code, 1);
    assert.ok(err.join('').includes('Unknown command'));
  });

  it('returns 1 for `get` with no key', () => {
    const { code } = quiet(() => run({ command: 'get', args: {}, positional: [] }, projectRoot));
    assert.equal(code, 1);
  });

  it('prints the resolved default value for an unset key', () => {
    const { code, out } = quiet(() =>
      run({ command: 'get', args: {}, positional: ['paths.decisions'] }, projectRoot),
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
      run({ command: 'get', args: {}, positional: ['paths.decisions'] }, projectRoot),
    );
    assert.equal(out[0], 'archive/decisions');
  });

  it('prints an absolute path with --abs', () => {
    const { out } = quiet(() =>
      run({ command: 'get', args: { abs: true }, positional: ['paths.decisions'] }, projectRoot),
    );
    assert.equal(out[0], join(projectRoot, 'knowledge/decisions'));
  });

  it('returns 1 with a descriptive error for an unknown field', () => {
    const { code, err } = quiet(() =>
      run({ command: 'get', args: {}, positional: ['not_a_real_field'] }, projectRoot),
    );
    assert.equal(code, 1);
    assert.ok(err.join('').includes('Unknown'));
  });
});
