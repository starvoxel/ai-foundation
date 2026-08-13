/**
 * Integration tests for install freshness logic:
 * - Skip install when bundle is already current
 * - --update mode refreshes only stale bundles
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { runSnapshot } from '../../lib/commands/snapshot.js';
import { readManifest } from '../../lib/manifest.js';
import { TARGETS } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: install freshness', () => {
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
    const output = [];
    console.log = (...args) => output.push(args.join(' '));
    console.error = (...args) => output.push(args.join(' '));
    try { return { code: fn(), output }; }
    finally { console.log = origLog; console.error = origErr; }
  }

  it('skips install when bundle is already current', () => {
    // Generate snapshot, then install
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    // Second install should skip
    const { code, output } = quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.some(line => line.includes('already current')));
  });

  it('installs when no snapshot exists (no freshness data)', () => {
    // Install without snapshot — should proceed
    const { code, output } = quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.some(line => line.includes('Installed')));
  });

  it('reinstalls when source changes after snapshot update', () => {
    // Generate snapshot, install
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    // Modify a source file
    const agentPath = join(repo, 'agents', 'test-agent.yaml');
    const content = readFileSync(agentPath, 'utf8');
    writeFileSync(agentPath, content + '\n# modified', 'utf8');

    // Regenerate snapshot (simulates running aif snapshot after edit)
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));

    // Now install should proceed (source hashes differ)
    const { code, output } = quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.some(line => line.includes('Installed')));
  });

  it('--update skips current bundles', () => {
    // Generate snapshot, install
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    // Update should skip
    const { code, output } = quiet(() => runInstall({ args: { update: true }, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.some(line => line.includes('already current')));
    assert.ok(output.some(line => line.includes('0 updated, 1 current')));
  });

  it('--update reinstalls stale bundles', () => {
    // Generate snapshot, install
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    // Modify source and regenerate snapshot
    const agentPath = join(repo, 'agents', 'test-agent.yaml');
    const content = readFileSync(agentPath, 'utf8');
    writeFileSync(agentPath, content + '\n# modified', 'utf8');
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));

    // Update should reinstall
    const { code, output } = quiet(() => runInstall({ args: { update: true }, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.some(line => line.includes('updating')));
    assert.ok(output.some(line => line.includes('1 updated, 0 current')));
  });

  it('--update reports nothing when nothing is installed', () => {
    const { code, output } = quiet(() => runInstall({ args: { update: true }, positional: [] }, repo));
    assert.equal(code, 0);
    assert.ok(output.some(line => line.includes('Nothing installed')));
  });

  it('stores sourceHashes in manifest when snapshot exists', () => {
    quiet(() => runSnapshot({ args: { bundle: 'test-bundle' }, positional: [] }, repo));
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    const manifest = readManifest(repo);
    const entry = manifest.bundles['test-bundle_kiro'];
    assert.ok(entry.sourceHashes);
    assert.ok(Object.keys(entry.sourceHashes).length > 0);
    assert.ok(Object.values(entry.sourceHashes).every(h => h.startsWith('sha256:')));
  });

  it('does not store sourceHashes when no snapshot exists', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo));

    const manifest = readManifest(repo);
    const entry = manifest.bundles['test-bundle_kiro'];
    assert.equal(entry.sourceHashes, undefined);
  });
});
