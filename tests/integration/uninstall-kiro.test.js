import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { runUninstall } from '../../lib/commands/uninstall.js';
import { TARGETS } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: uninstall (kiro-specific)', () => {
  let repo;
  let originalTargets;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        { name: 'test-agent', version: '0.1.0', domain: 'eng', description: 'Test.', prompt: 'x', tools: ['read'], approved_tools: ['read'], skills: [] },
      ],
      steering: { global: ['core.md'] },
      bundles: [
        { name: 'test-bundle', version: '1.0.0', description: 'Test.', domain: 'eng' },
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

  it('deletes agent JSON from Kiro target', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    const agentPath = join(TARGETS.agents, 'test-agent.json');
    assert.ok(existsSync(agentPath), 'precondition: file exists');

    quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    assert.ok(!existsSync(agentPath));
  });

  it('deletes steering files from Kiro target', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    const steeringPath = join(TARGETS.steering, 'global-core.md');
    assert.ok(existsSync(steeringPath), 'precondition: file exists');

    quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    assert.ok(!existsSync(steeringPath));
  });

  it('handles already-deleted target files gracefully', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    const agentPath = join(TARGETS.agents, 'test-agent.json');
    if (existsSync(agentPath)) unlinkSync(agentPath);

    const code = quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 0);
  });
});
