// ------------------------------
// decisions-index.test.js
//
// Author: Starvoxel AI Agent - 2026-08-19
// Plan: AIF-002-014, AIF-003-002
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
import { parseArgs } from '../../bin/aif.js';
import { buildDecisionIndexForDir, collectDecisionFiles } from '../../lib/decisions.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

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

// A record that has been through the amendment ladder (AIF-META-002), used
// to verify last_amended/amendment_count end-to-end (AIF-003-002).
function amendedDecisionFixture({ id, status = 'Approved', title }) {
  return `# Decision Record: ${title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | ${id} |
| Project | ai-foundation |
| Tier | A |
| Domain | architecture |
| Status | ${status} |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2026-08-19 |
| Last Amended | 2026-09-02 (Amendment 1) |
| Referenced By | — |
| References | — |
| Tags | — |

---

## Amendments

| # | Date | Summary | Outcome |
|---|---|---|---|
| 1 | 2026-09-02 | Clarified scope | Approved |

## Problem Statement

Test fixture.
`;
}

// Legacy pre-Tier×Domain fixture (mirrors AIF-ARCH-001/002/003, migrated
// without Tier/Domain fields — chunk AIF-002-009, "light-touch"). Human-
// approved fix, no formal Plan ID, per chat approval 2026-08-24.
function legacyDecisionFixture({ id, status = 'Approved', references = '—', title }) {
  return `# Decision Record: ${title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | ${id} |
| Project | ai-foundation |
| Status | ${status} |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2020-01-01 |
| Referenced By | — |
| References | ${references} |
| Tags | — |

---

## Problem Statement

Test fixture. This decision predates the AIF-META-001 Tier x Domain model.
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

  it('DEC-IT01b: legacy records missing Tier/Domain do not halt the scan and '
    + 'produce a complete, correct index alongside fully-tagged records', async () => {
    const decisionsDir = join(projectRoot, 'docs', 'decisions');
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'docs/decisions' } }),
      'utf8',
    );
    // Fully-tagged record.
    writeFileSync(
      join(decisionsDir, 'AIF-002-001.decision.md'),
      decisionFixture({ id: 'AIF-002-001', title: 'Fully Tagged Decision' }),
      'utf8',
    );
    // Legacy records missing Tier/Domain, one referencing the other.
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-001.decision.md'),
      legacyDecisionFixture({ id: 'AIF-ARCH-001', title: 'Legacy Decision One' }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-002.decision.md'),
      legacyDecisionFixture({
        id: 'AIF-ARCH-002',
        title: 'Legacy Decision Two',
        references: 'AIF-ARCH-001',
      }),
      'utf8',
    );

    const { code } = await quiet(() => runIndex({ args: { d: true }, positional: [] }, projectRoot));
    assert.equal(code, 0);

    const indexPath = join(decisionsDir, 'index.json');
    assert.ok(existsSync(indexPath));
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    assert.equal(index.entries.length, 3);

    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));
    assert.equal(byId['AIF-002-001'].tier, 'A');
    assert.equal(byId['AIF-002-001'].domain, 'architecture');
    assert.equal(byId['AIF-ARCH-001'].tier, null);
    assert.equal(byId['AIF-ARCH-001'].domain, null);
    assert.equal(byId['AIF-ARCH-002'].tier, null);
    assert.equal(byId['AIF-ARCH-002'].domain, null);
    assert.deepEqual(byId['AIF-ARCH-001'].referenced_by, ['AIF-ARCH-002']);
    assert.deepEqual(byId['AIF-ARCH-002'].references, ['AIF-ARCH-001']);
  });

  it('002-T15: an amended record and a non-amended record both carry correct '
    + 'last_amended/amendment_count', async () => {
    const decisionsDir = join(projectRoot, 'docs', 'decisions');
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(projectRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { decisions: 'docs/decisions' } }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-001.decision.md'),
      decisionFixture({ id: 'AIF-ARCH-001', title: 'Never Amended' }),
      'utf8',
    );
    writeFileSync(
      join(decisionsDir, 'AIF-ARCH-002.decision.md'),
      amendedDecisionFixture({ id: 'AIF-ARCH-002', title: 'Once Amended' }),
      'utf8',
    );

    const { code } = await quiet(() => runIndex({ args: { d: true }, positional: [] }, projectRoot));
    assert.equal(code, 0);

    const indexPath = join(decisionsDir, 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.equal(byId['AIF-ARCH-001'].last_amended, null);
    assert.equal(byId['AIF-ARCH-001'].amendment_count, 0);
    assert.equal(byId['AIF-ARCH-002'].last_amended, '2026-09-02 (Amendment 1)');
    assert.equal(byId['AIF-ARCH-002'].amendment_count, 1);
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

  it('end-to-end: `aif index -d` (short flag, via the real bin/aif.js parseArgs) '
    + 'is recognized the same way `--decision` is (Test-Engineer gap coverage, '
    + 'added post-implementation — see AIF-002-014 Test Results Report)', async () => {
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

    // This mirrors exactly what a real user typing `aif index -d` triggers:
    // bin/aif.js's parseArgs(process.argv.slice(2)) feeding runIndex's
    // `parsed` argument — not a hand-built { args: { d: true } } object like
    // every other test in this file uses.
    const parsed = parseArgs(['index', '-d']);
    const { code } = await quiet(() => runIndex(parsed, projectRoot));

    assert.equal(
      code,
      0,
      'Expected `aif index -d` (short flag) to generate the decision index, '
      + 'same as `--decision` does. bin/aif.js\'s parseArgs() only recognizes '
      + 'double-dash (--decision/--knowledge) flags — single-dash short flags '
      + '(-d/-k) are captured as positional arguments instead of args.d/args.k, '
      + 'so parsed.args.d is undefined and runIndex() falls through to the '
      + 'no-flag usage error. Every other test in this file bypasses this bug '
      + 'by hand-constructing `{ args: { d: true } }` directly, never going '
      + 'through the real CLI argument parser end-to-end.',
    );
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

  describe('002-T16/002-T17: real repo docs/decisions', () => {
    it('002-T17: all real records index cleanly, none carry Last Amended/Amendments '
      + '(no retrofit, per Epic AIF-003). Entry count is compared against '
      + 'collectDecisionFiles().length rather than a hardcoded literal, since the '
      + 'plan\'s assumption of 16 records was already stale by the time this chunk '
      + 'ran (AIF-PLAN-001 was removed by an unrelated chunk, ac33c98, without a '
      + 'matching index regeneration) — this test should not need to change every '
      + 'time a record is added or removed. AIF-META-002 is exempted from the '
      + 'amendment_count: 0 assertion: it is the decision that defines the '
      + '`## Amendments` table format and contains a fenced markdown example of one '
      + '(2 rows) inside its own body — exactly the fenced-code-block exposure the '
      + 'chunk plan accepted and declined to fix as Epic AIF-003 Risk 1.', () => {
        const decisionsDir = resolveDecisionsPath(REPO_ROOT);
        const index = buildDecisionIndexForDir(decisionsDir);
        const onDiskCount = collectDecisionFiles(decisionsDir).length;

        assert.equal(index.entries.length, onDiskCount);
        for (const entry of index.entries) {
          assert.equal(entry.last_amended, null, `${entry.id} should have last_amended: null`);
          if (entry.id === 'AIF-META-002') {
            assert.equal(entry.amendment_count, 2, 'AIF-META-002: fenced example table (Risk 1)');
          } else {
            assert.equal(entry.amendment_count, 0, `${entry.id} should have amendment_count: 0`);
          }
        }
      });

    it('002-T16: the committed docs/decisions/index.json is up to date with the '
      + 'real records (regenerated by this chunk per Epic AIF-003 Risk 12)', async () => {
        const { code } = await quiet(
          () => runIndex({ args: { d: true, check: true }, positional: [] }, REPO_ROOT),
        );
        assert.equal(code, 0);
      });
  });
});
