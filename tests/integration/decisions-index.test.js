// ------------------------------
// decisions-index.test.js
//
// Author: Starvoxel AI Agent - 2026-08-19
// Plan: AIF-002-014
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Integration tests for `aif index -d` decision-index generation/validation
 * (filesystem operations), mirroring tests/integration/knowledge-index.test.js's
 * structure.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runIndex, resolveDecisionsPath } from '../../lib/commands/index.js';

function decisionFixture({ id, tier = 'A', domain = 'architecture', status = 'Approved', references = '—', title }) {
  return `# Decision Record: ${title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | ${id} |
| Project | ai-foundation |
| Tier | ${tier} |
| Domain | ${domain} |
| Status | ${status} |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2026-08-19 |
| Referenced By | — |
| References | ${references} |
| Tags | — |

---

## Problem Statement

Test fixture.
`;
}

async function quiet(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const output = [];
  console.log = (...args) => output.push(args.join(' '));
  console.error = (...args) => output.push(args.join(' '));
  try {
    const code = await fn();
    return { code, output };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

describe('integration: decision index', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aif-decisions-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('DEC-IT01: writes a correct index.json at a configured non-default paths.decisions', () => {
    const decisionsDir = join(projectRoot, 'governance', 'records');
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'governance/records' } }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-001.decision.md'),
      decisionFixture({ id: 'AIF-ARCH-001', title: 'First Decision' }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-002.decision.md'),
      decisionFixture({ id: 'AIF-ARCH-002', title: 'Second Decision', references: 'AIF-ARCH-001' }),
      'utf8',
    );

    return quiet(() => runIndex({ args: { d: true }, positional: [] }, projectRoot)).then(({ code }) => {
      assert.equal(code, 0);
      const indexPath = join(decisionsDir, 'index.json');
      assert.ok(existsSync(indexPath));
      const index = JSON.parse(readFileSync(indexPath, 'utf8'));
      assert.equal(index.entries.length, 2);
      const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));
      assert.deepEqual(byId['AIF-ARCH-001'].referenced_by, ['AIF-ARCH-002']);
      assert.deepEqual(byId['AIF-ARCH-002'].references, ['AIF-ARCH-001']);
    });
  });

  it('DEC-IT02: no -k/-d flag is a usage error, not an implicit -k', async () => {
    const { code, output } = await quiet(() => runIndex({ args: {}, positional: [] }, projectRoot));
    assert.equal(code, 1);
    assert.ok(output.some((line) => /-k|-d|--knowledge|--decision/.test(line)));
    assert.ok(!existsSync(join(projectRoot, 'knowledge', 'index.json')));
  });

  it('DEC-IT03: --check against a freshly-generated, unmodified index exits 0', async () => {
    const decisionsDir = join(projectRoot, 'docs', 'decisions');
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'docs/decisions' } }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-001.decision.md'),
      decisionFixture({ id: 'AIF-ARCH-001', title: 'First Decision' }),
      'utf8',
    );

    const gen = await quiet(() => runIndex({ args: { d: true }, positional: [] }, projectRoot));
    assert.equal(gen.code, 0);

    const check = await quiet(() => runIndex({ args: { d: true, check: true }, positional: [] }, projectRoot));
    assert.equal(check.code, 0);
  });

  it('DEC-IT04: --check against a staled index exits non-zero with a diff summary', async () => {
    const decisionsDir = join(projectRoot, 'docs', 'decisions');
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'docs/decisions' } }),
      'utf8',
    );
    const fixturePath = join(decisionsDir, 'AIF-ARCH-001.decision.md');
    writeFileSync(fixturePath, decisionFixture({ id: 'AIF-ARCH-001', title: 'First Decision' }), 'utf8');

    const gen = await quiet(() => runIndex({ args: { d: true }, positional: [] }, projectRoot));
    assert.equal(gen.code, 0);

    // Stale the index by changing the fixture's status after generation.
    writeFileSync(
      fixturePath,
      decisionFixture({ id: 'AIF-ARCH-001', title: 'First Decision', status: 'Deferred' }),
      'utf8',
    );

    const check = await quiet(() => runIndex({ args: { d: true, check: true }, positional: [] }, projectRoot));
    assert.equal(check.code, 1);
    assert.ok(check.output.some((line) => /AIF-ARCH-001/.test(line)));
  });

  it('DEC-IT05: a malformed fixture file exits non-zero and names the offending file', async () => {
    const decisionsDir = join(projectRoot, 'docs', 'decisions');
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'docs/decisions' } }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-001.decision.md'),
      decisionFixture({ id: 'AIF-ARCH-001', title: 'Good Decision' }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'broken.decision.md'),
      '# Decision Record: Broken\n\n## Metadata\n\nNot a table.\n',
      'utf8',
    );

    const { code, output } = await quiet(() => runIndex({ args: { d: true }, positional: [] }, projectRoot));
    assert.equal(code, 1);
    assert.ok(output.some((line) => /broken\.decision\.md/.test(line)));
    assert.ok(!existsSync(join(decisionsDir, 'index.json')));
  });

  it('DEC-IT06: both -k and -d together exits non-zero with a usage error', async () => {
    const { code, output } = await quiet(
      () => runIndex({ args: { k: true, d: true }, positional: [] }, projectRoot),
    );
    assert.equal(code, 1);
    assert.ok(output.length > 0);
  });

  describe('DEC-IT07: resolveDecisionsPath fallback derivation', () => {
    it('(a) paths.knowledge configured non-default, paths.decisions unset -> {knowledge}/decisions', () => {
      writeFileSync(
        join(projectRoot, '.aiconfig.json'),
        JSON.stringify({ paths: { knowledge: 'notes' } }),
        'utf8',
      );
      const resolved = resolveDecisionsPath(projectRoot);
      assert.equal(resolved, join(projectRoot, 'notes', 'decisions'));
      assert.notEqual(resolved, join(projectRoot, 'docs', 'decisions'));
    });

    it('(b) both paths.knowledge and paths.decisions unset -> knowledge/decisions default', () => {
      // No .aiconfig.json at all.
      const resolved = resolveDecisionsPath(projectRoot);
      assert.equal(resolved, join(projectRoot, 'knowledge', 'decisions'));
    });
  });
});
