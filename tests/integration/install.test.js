import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { runUninstall } from '../../lib/commands/uninstall.js';
import { readManifest } from '../../lib/manifest.js';
import { TARGETS } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: install command', () => {
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

  it('requires --bundle', () => {
    const code = quiet(() => runInstall({ args: { harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('requires --harness', () => {
    const code = quiet(() => runInstall({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('rejects unknown harness', () => {
    const code = quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'bogus' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('rejects unknown bundle', () => {
    const code = quiet(() => runInstall({ args: { bundle: 'nonexistent', harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('records manifest entry with version and file list', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    const manifest = readManifest(repo);
    const entry = manifest['test-bundle_kiro'];
    assert.ok(entry);
    assert.equal(entry.version, '1.0.0');
    assert.ok(entry.files.length > 0);
    assert.ok(entry.files[0].hash.startsWith('sha256:'));
  });
});

describe('integration: uninstall command', () => {
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

  it('requires --bundle', () => {
    const code = quiet(() => runUninstall({ args: { harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('requires --harness', () => {
    const code = quiet(() => runUninstall({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('fails gracefully if bundle not installed', () => {
    const code = quiet(() => runUninstall({ args: { bundle: 'nonexistent', harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 1);
  });

  it('removes manifest entry after uninstall', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    const manifest = readManifest(repo);
    assert.equal(manifest['test-bundle_kiro'], undefined);
  });
});
