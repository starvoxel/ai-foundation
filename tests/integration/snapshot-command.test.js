/**
 * Integration tests for `aif snapshot`'s CLI orchestration (lib/commands/snapshot.js):
 * wildcard target expansion (a bare `--{kind}` flag with no value) and combining
 * kinds in one call. Pure target-resolution logic is covered by
 * tests/unit/snapshot.test.js; this file exercises it against a real filesystem.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { runSnapshot } from '../../lib/commands/snapshot.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

function quiet(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const output = [];
  console.log = (...args) => output.push(args.join(' '));
  console.error = (...args) => output.push(args.join(' '));
  try {
    return { code: fn(), output };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

describe('integration: snapshot command — wildcard targets', () => {
  let repo;

  beforeEach(() => {
    repo = createTempRepo({
      bundles: [
        { name: 'engineering', version: '1.0.0', description: 'Eng.', domain: 'eng' },
        { name: 'generic', version: '1.0.0', description: 'Generic.', servers: ['git'] },
      ],
      servers: ['git'],
    });
  });

  afterEach(() => {
    destroyTempRepo(repo);
  });

  it('a bare --bundle flag snapshots every bundle, not just one', () => {
    const { code, output } = quiet(() =>
      runSnapshot({ args: { bundle: true }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(existsSync(join(repo, 'bundles', 'engineering', 'snapshot.json')));
    assert.ok(existsSync(join(repo, 'bundles', 'generic', 'snapshot.json')));
    assert.ok(!existsSync(join(repo, 'servers', 'git', 'snapshot.json')));
    assert.ok(output.some((line) => line.includes('engineering')));
    assert.ok(output.some((line) => line.includes('generic')));
  });

  it('a bare --bundle flag combined with a named --server flag covers both', () => {
    const { code } = quiet(() =>
      runSnapshot({ args: { bundle: true, server: 'git' }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(existsSync(join(repo, 'bundles', 'engineering', 'snapshot.json')));
    assert.ok(existsSync(join(repo, 'bundles', 'generic', 'snapshot.json')));
    assert.ok(existsSync(join(repo, 'servers', 'git', 'snapshot.json')));
  });

  it('--bundle --check reports every bundle without writing', () => {
    quiet(() => runSnapshot({ args: { bundle: true }, positional: [] }, repo));
    const { code, output } = quiet(() =>
      runSnapshot({ args: { bundle: true, check: true }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('engineering')));
    assert.ok(output.some((line) => line.includes('generic')));
  });

  it('a wildcard for a kind with nothing to snapshot reports nothing to do, not an error', () => {
    const { code, output } = quiet(() =>
      runSnapshot({ args: { hook: true }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('Nothing to snapshot')));
  });

  it('an empty string value is still rejected, unlike a bare flag', () => {
    const { code, output } = quiet(() =>
      runSnapshot({ args: { bundle: '' }, positional: [] }, repo),
    );
    assert.equal(code, 1);
    assert.ok(output.some((line) => line.includes('--bundle')));
  });
});
