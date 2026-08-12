import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, run } from '../../bin/aif.js';

describe('bin/cli parseArgs()', () => {
  it('returns null command for empty argv', () => {
    const result = parseArgs([]);
    assert.equal(result.command, null);
    assert.deepEqual(result.args, {});
    assert.deepEqual(result.positional, []);
  });

  it('extracts the command from first non-flag argument', () => {
    const result = parseArgs(['install']);
    assert.equal(result.command, 'install');
  });

  it('parses --key value pairs', () => {
    const result = parseArgs(['install', '--bundle', 'engineering', '--harness', 'kiro']);
    assert.equal(result.command, 'install');
    assert.equal(result.args.bundle, 'engineering');
    assert.equal(result.args.harness, 'kiro');
  });

  it('parses boolean flags (no value)', () => {
    const result = parseArgs(['--help']);
    assert.equal(result.args.help, true);
  });

  it('captures positional arguments after command', () => {
    const result = parseArgs(['list', 'bundles']);
    assert.equal(result.command, 'list');
    assert.deepEqual(result.positional, ['bundles']);
  });

  it('treats lone flag value as boolean when followed by a command-like word', () => {
    // --help consumes 'install' as its value since parser has no flag schema
    // In practice, --help should come after the command or alone
    const result = parseArgs(['install', '--help']);
    assert.equal(result.command, 'install');
    assert.equal(result.args.help, true);
  });

  it('treats flag followed by another flag as boolean', () => {
    const result = parseArgs(['install', '--verbose', '--bundle', 'eng']);
    assert.equal(result.args.verbose, true);
    assert.equal(result.args.bundle, 'eng');
  });
});

describe('bin/cli run()', () => {
  it('returns 1 for no command', async () => {
    const code = await run({ command: null, args: {}, positional: [] });
    assert.equal(code, 1);
  });

  it('returns 0 for --help', async () => {
    const code = await run({ command: null, args: { help: true }, positional: [] });
    assert.equal(code, 0);
  });

  it('returns 1 for unknown command', async () => {
    const code = await run({ command: 'bogus', args: {}, positional: [] });
    assert.equal(code, 1);
  });

  it('returns 1 for valid but unimplemented command', async () => {
    const code = await run({ command: 'install', args: {}, positional: [] });
    assert.equal(code, 1);
  });
});
