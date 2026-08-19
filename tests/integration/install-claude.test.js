import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { runUninstall } from '../../lib/commands/uninstall.js';
import { readManifest } from '../../lib/manifest.js';
import { TARGETS } from '../../lib/harnesses/claude.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: install (claude-specific)', () => {
  let repo;
  let originalTargets;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        { name: 'test-agent', version: '0.1.0', domain: 'eng', description: 'Test agent.', prompt: 'You are a test agent.', tools: ['read', 'grep', 'shell'], approved_tools: ['read'], skills: ['skill/test-skill'] },
        { name: 'blocked-agent', version: '0.1.0', domain: 'eng', description: 'Agent with blocked commands.', prompt: 'You are a restricted agent.', tools: ['read', 'shell'], approved_tools: ['read'], blocked_commands: ['git *', 'gh *'] },
      ],
      skills: ['test-skill'],
      steering: { global: ['core.md'], eng: ['rules.md'] },
      servers: [],
      bundles: [
        { name: 'test-bundle', version: '1.0.0', description: 'Test bundle.', domain: 'eng' },
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
    try { return fn(); }
    finally { console.log = origLog; console.error = origErr; }
  }

  it('transforms agents to markdown with Claude Code tool names', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    const agentPath = join(TARGETS.agents, 'test-agent.md');
    assert.ok(existsSync(agentPath));
    const content = readFileSync(agentPath, 'utf8');
    assert.ok(content.includes('name: test-agent'));
    assert.ok(content.includes('Read, Grep, Bash'));
    assert.ok(content.includes('You are a test agent.'));
  });

  it('installs steering as rules in .claude/rules/', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    assert.ok(existsSync(join(TARGETS.rules, 'global-core.md')));
    assert.ok(existsSync(join(TARGETS.rules, 'eng-rules.md')));
  });

  it('installs skills as SKILL.md in a per-skill directory under .claude/skills/', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    const skillPath = join(TARGETS.skills, 'test-skill', 'SKILL.md');
    assert.ok(existsSync(skillPath));
  });

  it('copies bundled skill subdirectories (reference/, assets/) alongside SKILL.md', () => {
    const refDir = join(repo, 'skills', 'test-skill', 'reference');
    mkdirSync(refDir, { recursive: true });
    writeFileSync(join(refDir, 'notes.md'), '# notes\n', 'utf8');

    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    const refPath = join(TARGETS.skills, 'test-skill', 'reference', 'notes.md');
    assert.ok(existsSync(refPath));
    assert.equal(readFileSync(refPath, 'utf8'), '# notes\n');
  });

  it('records manifest and uninstall works', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    const manifest = readManifest(repo);
    assert.ok(manifest.bundles['test-bundle_claude']);

    quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    const after = readManifest(repo);
    assert.equal(after.bundles['test-bundle_claude'], undefined);
    assert.ok(!existsSync(join(TARGETS.agents, 'test-agent.md')));
  });

  it('installs the shared block-command hook script (bundle has a blocked_commands agent)', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    assert.ok(existsSync(join(TARGETS.scripts, 'block-command', 'logic.js')));
    assert.ok(existsSync(join(TARGETS.scripts, 'block-command', 'cli.js')));

    const manifest = readManifest(repo);
    const hookEntry = manifest.hooks['block-command_claude'];
    assert.ok(hookEntry);
    assert.deepEqual(hookEntry.installedBy, ['test-bundle']);
  });

  it('wires a PreToolUse hook for an agent with blocked_commands', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    const agentPath = join(TARGETS.agents, 'blocked-agent.md');
    const content = readFileSync(agentPath, 'utf8');
    assert.ok(content.includes('PreToolUse'));
    assert.ok(content.includes('block-command'));
    assert.ok(content.includes('git *'));
  });

  it('removes the shared hook script when the last depending bundle is uninstalled', () => {
    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));
    quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    assert.ok(!existsSync(join(TARGETS.scripts, 'block-command', 'cli.js')));

    const manifest = readManifest(repo);
    assert.equal(manifest.hooks['block-command_claude'], undefined);
  });

  it('keeps the shared hook script installed while another bundle still depends on it', () => {
    // Second bundle, also with a blocked_commands agent, sharing the same
    // hook resource as test-bundle.
    const secondBundleDir = join(repo, 'bundles', 'other-bundle');
    mkdirSync(secondBundleDir, { recursive: true });
    writeFileSync(
      join(secondBundleDir, 'bundle.yaml'),
      'name: other-bundle\nversion: "1.0.0"\ndescription: Other bundle.\nagents:\n  - blocked-agent.yaml\n',
      'utf8'
    );

    quiet(() => runInstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));
    quiet(() => runInstall({ args: { bundle: 'other-bundle', harness: 'claude' }, positional: [] }, repo));

    let manifest = readManifest(repo);
    assert.deepEqual(manifest.hooks['block-command_claude'].installedBy.sort(), ['other-bundle', 'test-bundle']);

    quiet(() => runUninstall({ args: { bundle: 'test-bundle', harness: 'claude' }, positional: [] }, repo));

    // Hook script stays installed — other-bundle still depends on it.
    assert.ok(existsSync(join(TARGETS.scripts, 'block-command', 'cli.js')));
    manifest = readManifest(repo);
    assert.deepEqual(manifest.hooks['block-command_claude'].installedBy, ['other-bundle']);

    quiet(() => runUninstall({ args: { bundle: 'other-bundle', harness: 'claude' }, positional: [] }, repo));

    // Now removed — no bundle depends on it anymore.
    assert.ok(!existsSync(join(TARGETS.scripts, 'block-command', 'cli.js')));
    manifest = readManifest(repo);
    assert.equal(manifest.hooks['block-command_claude'], undefined);
  });
});
