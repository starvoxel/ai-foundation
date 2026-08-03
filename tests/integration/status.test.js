import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { runStatus } from '../../lib/commands/status.js';
import { TARGETS } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: status command', () => {
  let repo;
  let originalTargets;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        { name: 'test-agent', version: '0.1.0', domain: 'eng', description: 'Test.', prompt: 'You are test.', tools: ['read'], approved_tools: ['read'], skills: [] },
      ],
      skills: [],
      steering: { global: ['core.md'] },
      servers: [],
      bundles: [
        { name: 'test-bundle', version: '1.0.0', description: 'Test bundle.', domain: 'eng' },
      ],
    });

    const tempKiro = mkdtempSync(join(tmpdir(), 'aif-kiro-target-'));
    originalTargets = { ...TARGETS };
    TARGETS.agents = join(tempKiro, 'agents');
    TARGETS.steering = join(tempKiro, 'steering');
    TARGETS.skills = join(tempKiro, 'skills');
    TARGETS.servers = join(tempKiro, 'servers');
    TARGETS.mcpSettings = join(tempKiro, 'settings', 'mcp.json');
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
    try { return fn(); }
    finally { console.log = origLog; console.error = origErr; }
  }

  function captureLog(fn) {
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try { return { code: fn(), output: lines.join('\n') }; }
    finally { console.log = origLog; }
  }

  it('reports nothing when no installs exist', () => {
    const { code, output } = captureLog(() => runStatus({ args: {}, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.includes('Nothing installed'));
  });

  it('reports installed bundle with file counts', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    const { code, output } = captureLog(() => runStatus({ args: {}, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.includes('test-bundle'));
    assert.ok(output.includes('kiro'));
    assert.ok(output.includes('current'));
  });
});
