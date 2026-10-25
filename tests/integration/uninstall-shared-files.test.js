/**
 * Integration test: uninstalling one bundle must not delete files another
 * installed bundle also installed to the same path (e.g. shared rules).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runInstall } from '../../lib/commands/install.js';
import { runUninstall } from '../../lib/commands/uninstall.js';
import { TARGETS } from '../../lib/harnesses/claude.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: uninstall (files shared across bundles)', () => {
  let repo;
  let originalTargets;

  beforeEach(() => {
    repo = createTempRepo({
      steering: { eng: ['rules.md'] },
      bundles: [
        { name: 'bundle-a', version: '1.0.0', description: 'A.', domain: 'eng' },
        { name: 'bundle-b', version: '1.0.0', description: 'B.', domain: 'eng' },
      ],
    });

    const tempClaude = mkdtempSync(join(tmpdir(), 'aif-claude-target-'));
    originalTargets = { ...TARGETS };
    TARGETS.agents = join(tempClaude, 'agents');
    TARGETS.rules = join(tempClaude, 'rules');
    TARGETS.skills = join(tempClaude, 'skills');
    TARGETS.servers = join(tempClaude, 'servers');
    TARGETS.standards = join(tempClaude, 'standards');
    TARGETS.scripts = join(tempClaude, 'scripts');
    TARGETS.mcpSettings = join(tempClaude, 'claude.json');
  });

  afterEach(() => {
    Object.assign(TARGETS, originalTargets);
    destroyTempRepo(repo);
  });

  function quiet(fn) {
    const origLog = console.log;
    const origErr = console.error;
    console.log = () => {};
    console.error = () => {};
    try {
      return fn();
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  }

  const run = (fn, bundle) =>
    quiet(() => fn({ args: { bundle, harness: 'claude' }, positional: [] }, repo));
  const rulePath = () => join(TARGETS.rules, 'eng-rules.md');

  it('keeps a file both bundles installed until the last owner uninstalls', () => {
    run(runInstall, 'bundle-a');
    run(runInstall, 'bundle-b');
    assert.ok(existsSync(rulePath()));

    run(runUninstall, 'bundle-a');
    assert.ok(existsSync(rulePath()));

    run(runUninstall, 'bundle-b');
    assert.ok(!existsSync(rulePath()));
  });

  it('still removes the file when the sole owner uninstalls', () => {
    run(runInstall, 'bundle-a');
    run(runUninstall, 'bundle-a');
    assert.ok(!existsSync(rulePath()));
  });
});
