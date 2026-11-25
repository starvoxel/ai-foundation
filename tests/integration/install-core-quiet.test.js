/**
 * A quiet install context drops progress lines from every layer (the adapters and
 * install-core) without touching console.log; a normal one still prints them.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

import { installBundle, installContext } from '../../lib/commands/install-core.js';
import { TARGETS } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: install-core quiet context', () => {
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
          skills: ['skill/test-skill'],
        },
      ],
      skills: ['test-skill'],
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

  function install(options) {
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
      const ctx = installContext('kiro', 'global', repo, repo, options);
      return { code: installBundle('test-bundle', ctx), lines };
    } finally {
      console.log = original;
    }
  }

  it('prints agent, steering, skill and summary lines by default', () => {
    const { code, lines } = install();
    assert.equal(code, 0);
    const text = lines.join('\n');
    assert.match(text, /✓ agent: test-agent/);
    assert.match(text, /✓ skill: test-skill/);
    assert.match(text, /Installed bundle "test-bundle"/);
  });

  it('prints no progress lines when quiet, and still installs', () => {
    const { code, lines } = install({ quiet: true });
    assert.equal(code, 0);
    assert.deepEqual(lines, []);
  });
});
