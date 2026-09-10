/**
 * Integration tests for standards installation and resolution.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';

import { runInstall } from '../../lib/commands/install.js';
import { listStandards } from '../../lib/resolver.js';
import { TARGETS, transformSteering } from '../../lib/harnesses/kiro.js';
import { transformSteering as claudeTransformSteering } from '../../lib/harnesses/claude.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('integration: standards installation', () => {
  let repo;
  let originalTargets;
  let tempKiro;

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

    // Create a standards file in the temp repo
    mkdirSync(join(repo, 'standards'), { recursive: true });
    writeFileSync(
      join(repo, 'standards', 'typescript-node.md'),
      '# TypeScript Node Standards\n\nRules here.\n',
      'utf8',
    );
    writeFileSync(
      join(repo, 'standards', 'api-design.md'),
      '# API Design Standards\n\nMore rules.\n',
      'utf8',
    );
    writeFileSync(join(repo, 'standards', 'README.md'), '# Standards\n\nNot a standard.\n', 'utf8');

    tempKiro = mkdtempSync(join(tmpdir(), 'aif-kiro-target-'));
    originalTargets = { ...TARGETS };
    TARGETS.agents = join(tempKiro, 'agents');
    TARGETS.steering = join(tempKiro, 'steering');
    TARGETS.skills = join(tempKiro, 'skills');
    TARGETS.servers = join(tempKiro, 'servers');
    TARGETS.standards = join(tempKiro, 'standards');
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

  it('listStandards discovers .md files excluding README and _template', () => {
    const standards = listStandards(repo);
    assert.ok(standards.includes('typescript-node.md'));
    assert.ok(standards.includes('api-design.md'));
    assert.ok(!standards.includes('README.md'));
  });

  it('listStandards returns empty for non-existent directory', () => {
    const empty = listStandards('/tmp/does-not-exist-' + Date.now());
    assert.deepEqual(empty, []);
  });

  it('install copies standards files to harness standards directory', () => {
    quiet(() =>
      runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo),
    );

    assert.ok(existsSync(join(TARGETS.standards, 'typescript-node.md')));
    assert.ok(existsSync(join(TARGETS.standards, 'api-design.md')));
    // README should not be installed
    assert.ok(!existsSync(join(TARGETS.standards, 'README.md')));
  });

  it('installed standards content matches source', () => {
    quiet(() =>
      runInstall({ args: { bundle: 'test-bundle', harness: 'kiro' }, positional: [] }, repo),
    );

    const installed = readFileSync(join(TARGETS.standards, 'typescript-node.md'), 'utf8');
    const source = readFileSync(join(repo, 'standards', 'typescript-node.md'), 'utf8');
    assert.equal(installed, source);
  });
});

describe('integration: standards path injection in steering', () => {
  it('Kiro adapter replaces {{standards_path}} with TARGETS.standards', () => {
    const input = `---
name: "test"
version: "0.1.0"
description: "Test."
file_patterns: []
---

Load from: \`{{standards_path}}/{name}.md\`
`;
    const output = transformSteering(input);
    assert.ok(output.includes(TARGETS.standards));
    assert.ok(!output.includes('{{standards_path}}'));
  });

  it('Claude adapter replaces {{standards_path}} in body without frontmatter', () => {
    const input = 'Load from: `{{standards_path}}/{name}.md`\n';
    const output = claudeTransformSteering(input);
    assert.ok(output.includes('.claude'));
    assert.ok(!output.includes('{{standards_path}}'));
  });

  it('Kiro adapter leaves content unchanged when no placeholder present', () => {
    const input = `---
name: "test"
version: "0.1.0"
description: "Test."
file_patterns: []
---

No placeholders here.
`;
    const output = transformSteering(input);
    assert.ok(output.includes('No placeholders here.'));
  });
});
