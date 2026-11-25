/**
 * Integration tests for install freshness logic:
 * - Skip install when bundle is already current
 * - --update mode refreshes only stale bundles
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { runStatus } from '../../lib/commands/status.js';
import { readManifest, writeManifest } from '../../lib/manifest.js';
import { TARGETS } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: install freshness', () => {
  let repo;
  let originalTargets;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        {
          name: 'test-agent',
          version: '0.1.0',
          domain: 'eng',
          description: 'Test.',
          prompt: 'x',
          tools: ['read'],
          approved_tools: ['read'],
          skills: [],
        },
      ],
      steering: { global: ['core.md'] },
      bundles: [{ name: 'test-bundle', version: '1.0.0', description: 'Test.', domain: 'eng' }],
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
    try {
      return { code: fn(), output };
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  }

  it('skips install when bundle is already current', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );

    // Second install should skip
    const { code, output } = quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('already current')));
  });

  it('reinstalls when a source changes after install', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );

    // Modify a source file
    const agentPath = join(repo, 'agents', 'test-agent.yaml');
    const content = readFileSync(agentPath, 'utf8');
    writeFileSync(agentPath, content + '\n# modified', 'utf8');

    // Now install should proceed (source hashes differ)
    const { code, output } = quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('Installed')));
  });

  it('retries a server that failed to install, then treats the bundle as current once it installs', () => {
    const yamlPath = join(repo, 'servers', 'late', 'late.yaml');
    mkdirSync(join(repo, 'servers', 'late'), { recursive: true });
    const broken = 'name: late\nversion: 0.1.0\ndescription: late\ntools: []\n'; // no protocol
    writeFileSync(yamlPath, broken, 'utf8');
    mkdirSync(join(repo, 'bundles', 'late-bundle'), { recursive: true });
    writeFileSync(
      join(repo, 'bundles', 'late-bundle', 'bundle.yaml'),
      'name: late-bundle\nversion: 1.0.0\ndescription: Late.\ndomain: eng\nservers:\n  - late\n',
      'utf8',
    );
    const install = () =>
      quiet(() =>
        runInstall(
          { args: { bundle: 'late-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
          repo,
        ),
      );

    const first = install();
    assert.ok(first.output.some((l) => l.includes('has no protocol field')));
    // Still failing: the bundle must not count as current just because the server dropped out.
    assert.ok(install().output.some((l) => l.includes('Installed')));

    writeFileSync(yamlPath, broken + 'protocol: mcp\ntransport: stdio\n', 'utf8');
    assert.ok(install().output.some((l) => l.includes('server: late')));
    assert.ok(install().output.some((l) => l.includes('already current')));
  });

  it('--update skips current bundles', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );

    // Update should skip
    const { code, output } = quiet(() =>
      runInstall({ args: { update: true, scope: 'global' }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('already current')));
    assert.ok(output.some((line) => line.includes('0 updated, 1 current')));
  });

  it('--update reinstalls stale bundles', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );

    // Modify a source file
    const agentPath = join(repo, 'agents', 'test-agent.yaml');
    const content = readFileSync(agentPath, 'utf8');
    writeFileSync(agentPath, content + '\n# modified', 'utf8');

    // Update should reinstall
    const { code, output } = quiet(() =>
      runInstall({ args: { update: true, scope: 'global' }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('updating')));
    assert.ok(output.some((line) => line.includes('1 updated, 0 current')));
  });

  it('--update reports nothing when nothing is installed', () => {
    const { code, output } = quiet(() =>
      runInstall({ args: { update: true, scope: 'global' }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('Nothing installed')));
  });

  it('stores sourceHashes in the manifest on install', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );

    const manifest = readManifest(repo);
    const entry = manifest.bundles['test-bundle_kiro'];
    assert.ok(entry.sourceHashes);
    assert.ok(Object.keys(entry.sourceHashes).length > 0);
    assert.ok(Object.values(entry.sourceHashes).every((h) => h.startsWith('sha256:')));
  });

  it('--update reinstalls a bundle that was recorded without source hashes', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );
    const manifest = readManifest(repo);
    delete manifest.bundles['test-bundle_kiro'].sourceHashes;
    writeManifest(repo, manifest);

    const { code, output } = quiet(() =>
      runInstall({ args: { update: true, scope: 'global' }, positional: [] }, repo),
    );
    assert.equal(code, 0);
    assert.ok(output.some((line) => line.includes('1 updated, 0 current')));
  });

  it('status reports a changed source and flags the bundle', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );
    const agentPath = join(repo, 'agents', 'test-agent.yaml');
    writeFileSync(agentPath, readFileSync(agentPath, 'utf8') + '\n# modified', 'utf8');

    const { output } = quiet(() => runStatus({ args: { scope: 'global' }, positional: [] }, repo));
    assert.ok(output.some((line) => line.includes('Source freshness: 1 changed')));
    assert.ok(output.some((line) => line.includes('aif install --scope global --update')));
  });

  it('status reports an error, not "current", when a bundle cannot be resolved', () => {
    quiet(() =>
      runInstall(
        { args: { bundle: 'test-bundle', harness: 'kiro', scope: 'global' }, positional: [] },
        repo,
      ),
    );
    rmSync(join(repo, 'bundles', 'test-bundle'), { recursive: true, force: true });

    const { output } = quiet(() => runStatus({ args: { scope: 'global' }, positional: [] }, repo));
    assert.ok(output.some((line) => line.includes('Source freshness: cannot check')));
  });
});
