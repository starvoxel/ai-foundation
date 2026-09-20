import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

import { validateCitations, runValidate } from '../../lib/commands/validate.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

describe('validate refs — real repo', () => {
  it('has no dangling or ordinal-only skill/steering citations', () => {
    const exitCode = runValidate({ positional: ['refs'], args: {} }, ROOT);
    assert.equal(exitCode, 0);
  });
});

describe('validate refs — named-locator citations', () => {
  let repo;

  beforeEach(() => {
    repo = createTempRepo();
  });

  afterEach(() => {
    destroyTempRepo(repo);
  });

  function writeSkill(name, body) {
    const dir = join(repo, 'skills', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), body, 'utf8');
  }

  function writeSteering(relPath, body) {
    const full = join(repo, 'steering', relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body, 'utf8');
  }

  it('accepts a valid quoted step citation and a bare whole-skill reference', () => {
    writeSkill(
      'widget-maker',
      [
        '---',
        "name: 'widget-maker'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        '### Step 1 — Do The Thing',
        '',
        '### Step 2 — Finish Up',
        '',
      ].join('\n'),
    );
    writeSkill(
      'orchestrator',
      [
        '---',
        "name: 'orchestrator'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        'Call `skill/widget-maker`: "Do The Thing" first.',
        '',
        'See also `skill/widget-maker` for the full procedure.',
        '',
      ].join('\n'),
    );

    const errors = validateCitations(repo);
    assert.deepEqual(errors, []);
  });

  it('rejects a stale quoted step citation whose target step no longer exists', () => {
    writeSkill(
      'widget-maker',
      [
        '---',
        "name: 'widget-maker'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        '### Step 1 — Do The Thing',
        '',
      ].join('\n'),
    );
    writeSkill(
      'orchestrator',
      [
        '---',
        "name: 'orchestrator'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        'Call `skill/widget-maker`: "A Step That Was Renamed" first.',
        '',
      ].join('\n'),
    );

    const errors = validateCitations(repo);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /drifted/);
  });

  it('rejects a raw step-ordinal citation', () => {
    writeSkill(
      'widget-maker',
      [
        '---',
        "name: 'widget-maker'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        '### Step 1 — Do The Thing',
        '',
      ].join('\n'),
    );
    writeSkill(
      'orchestrator',
      [
        '---',
        "name: 'orchestrator'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        'Run this (skill/widget-maker Step 1) before continuing.',
        '',
      ].join('\n'),
    );

    const errors = validateCitations(repo);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /raw step-ordinal citation/);
  });

  it('reports a citation to a non-existent skill', () => {
    writeSkill(
      'orchestrator',
      [
        '---',
        "name: 'orchestrator'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        'See `skill/does-not-exist` for details.',
        '',
      ].join('\n'),
    );

    const errors = validateCitations(repo);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /cites non-existent skill\/does-not-exist/);
  });

  it('scans README.md files too, including at the repo root', () => {
    writeSkill(
      'widget-maker',
      [
        '---',
        "name: 'widget-maker'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        '### Step 1 — Do The Thing',
        '',
      ].join('\n'),
    );
    mkdirSync(join(repo, 'agents'), { recursive: true });
    writeFileSync(
      join(repo, 'agents', 'README.md'),
      'Run this (skill/widget-maker Step 1) before continuing.\n',
      'utf8',
    );
    writeFileSync(join(repo, 'AGENTS.md'), 'See `skill/does-not-exist` for details.\n', 'utf8');

    const errors = validateCitations(repo);
    assert.equal(errors.length, 2);
    assert.ok(errors.some((e) => e.startsWith('agents/README.md') && /raw step-ordinal/.test(e)));
    assert.ok(errors.some((e) => e.startsWith('AGENTS.md') && /cites non-existent/.test(e)));
  });

  it('validates named Rule citations against a steering file the same way', () => {
    writeSteering('engineering/sample.md', '### Rule: Do The Thing\n');
    writeSkill(
      'orchestrator',
      [
        '---',
        "name: 'orchestrator'",
        "version: '0.1.0'",
        "description: 'x'",
        '---',
        '',
        'Follow `steering/engineering/sample.md`: "Do The Thing".',
        '',
        'This one is stale: `steering/engineering/sample.md`: "Not A Real Rule".',
        '',
        'This one is a raw ordinal: (steering/engineering/sample.md Rule 1).',
        '',
      ].join('\n'),
    );

    const errors = validateCitations(repo);
    assert.equal(errors.length, 2);
    assert.ok(errors.some((e) => /drifted/.test(e)));
    assert.ok(errors.some((e) => /raw rule-ordinal citation/.test(e)));
  });
});
