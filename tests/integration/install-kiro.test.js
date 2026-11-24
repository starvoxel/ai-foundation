import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, mkdirSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { TARGETS, installServers } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: install (kiro-specific)', () => {
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
          prompt: 'You are test.',
          tools: ['read', 'grep'],
          approved_tools: ['read'],
          skills: ['skill/test-skill'],
        },
      ],
      skills: ['test-skill'],
      steering: { global: ['core.md'], eng: ['rules.md'] },
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
    try {
      return fn();
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  }

  it('transforms agents to JSON with mapped tools and resources', () => {
    quiet(() =>
      runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo),
    );

    const agentPath = join(TARGETS.agents, 'test-agent.json');
    assert.ok(existsSync(agentPath));
    const json = JSON.parse(readFileSync(agentPath, 'utf8'));
    assert.equal(json.name, 'test-agent');
    assert.deepEqual(json.tools, ['read', 'grep']);
    assert.deepEqual(json.allowedTools, ['read']);
    assert.ok(json.resources.includes('file://.kiro/steering/**/*.md'));
    assert.ok(json.resources.includes('skill://.kiro/skills/test-skill/SKILL.md'));
  });

  it('flattens steering paths and installs to Kiro steering dir', () => {
    quiet(() =>
      runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo),
    );

    // steering/global/core.md → global-core.md
    assert.ok(existsSync(join(TARGETS.steering, 'global-core.md')));
    // steering/eng/rules.md → eng-rules.md
    assert.ok(existsSync(join(TARGETS.steering, 'eng-rules.md')));
  });

  it('installs skill files to Kiro skills dir', () => {
    quiet(() =>
      runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo),
    );

    const skillFile = join(TARGETS.skills, 'test-skill', 'SKILL.md');
    assert.ok(existsSync(skillFile));
  });

  it('registers an HTTP server without recording a hash of the shared mcp.json', () => {
    // The whole-file hash read as stale once a project added its own server entry.
    const dir = join(repo, 'servers', 'remote');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'remote.yaml'),
      'name: remote\nversion: 0.1.0\nprotocol: mcp\ntransport: http\nurl: https://example.test/mcp\ndescription: r\ntools: []\n',
      'utf8',
    );
    const results = quiet(() => installServers(['remote'], repo));
    assert.deepEqual(results, [{ name: 'remote', files: [] }]);
    const settings = JSON.parse(readFileSync(TARGETS.mcpSettings, 'utf8'));
    assert.equal(settings.mcpServers.remote.url, 'https://example.test/mcp');
  });
});
