/**
 * Integration test for DAG MCP server.
 * Validates tool invocation against real epic plan files.
 *
 * Plan ID: engineering-manager-plan (Phase 1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { dagValidate, dagComputeWaves } from '../../servers/dag/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_EPIC = `# Epic Plan: Test Feature

## 1. Metadata

| Field | Value |
|---|---|
| Epic ID | TEST-2026-08-01-001 |

## 8. Chunk Decomposition

| Chunk | Title | Depends On | Can Parallel With | Agent(s) |
|---|---|---|---|---|
| 001 | Data models | None | 002 | Software-Engineer |
| 002 | API service | None | 001 | Software-Engineer |
| 003 | Controller | 001, 002 | — | Software-Engineer |
| 004 | Tests | 003 | — | Test-Engineer |

Parallelization notes:
- Chunks 001 and 002 can run in parallel.

## 9. Acceptance Criteria

- All chunks complete.
`;

const CYCLIC_EPIC = `# Epic Plan: Broken

## 8. Chunk Decomposition

| Chunk | Title | Depends On | Can Parallel With | Agent(s) |
|---|---|---|---|---|
| 001 | First | 002 | — | Software-Engineer |
| 002 | Second | 001 | — | Software-Engineer |

## 9. Done
`;

const MISSING_REF_EPIC = `# Epic Plan: Missing

## 8. Chunk Decomposition

| Chunk | Title | Depends On | Can Parallel With | Agent(s) |
|---|---|---|---|---|
| 001 | First | None | — | Software-Engineer |
| 002 | Second | 999 | — | Software-Engineer |

## 9. Done
`;

const NO_TABLE_EPIC = `# Epic Plan: Empty

## 8. Chunk Decomposition

TBD — not yet decomposed.

## 9. Acceptance Criteria
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeTempEpic(name, content) {
  const dir = join(tmpdir(), 'dag-test-' + Date.now());
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, content, 'utf-8');
  return { path, dir };
}

// ── dag_validate ─────────────────────────────────────────────────────────────

describe('integration: dag/dag_validate', () => {
  it('validates a well-formed epic as valid', () => {
    const { path, dir } = writeTempEpic('valid.epic.md', VALID_EPIC);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects cycles in chunk dependencies', () => {
    const { path, dir } = writeTempEpic('cyclic.epic.md', CYCLIC_EPIC);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Cycle')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects missing dependency references', () => {
    const { path, dir } = writeTempEpic('missing.epic.md', MISSING_REF_EPIC);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('999')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns invalid when no chunk table exists', () => {
    const { path, dir } = writeTempEpic('empty.epic.md', NO_TABLE_EPIC);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors[0].includes('No chunk table'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── dag_compute_waves ────────────────────────────────────────────────────────

describe('integration: dag/dag_compute_waves', () => {
  it('computes correct waves for a valid epic', () => {
    const { path, dir } = writeTempEpic('valid.epic.md', VALID_EPIC);
    try {
      const result = dagComputeWaves(path);
      assert.equal(result.waves.length, 3);
      assert.deepEqual(result.waves[0], ['001', '002']);
      assert.deepEqual(result.waves[1], ['003']);
      assert.deepEqual(result.waves[2], ['004']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns chunk metadata alongside waves', () => {
    const { path, dir } = writeTempEpic('valid.epic.md', VALID_EPIC);
    try {
      const result = dagComputeWaves(path);
      assert.equal(result.chunks.length, 4);
      assert.equal(result.chunks[0].id, '001');
      assert.equal(result.chunks[0].title, 'Data models');
      assert.deepEqual(result.chunks[2].depends_on, ['001', '002']);
      assert.deepEqual(result.chunks[3].agents, ['Test-Engineer']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns empty waves for an epic with no table', () => {
    const { path, dir } = writeTempEpic('empty.epic.md', NO_TABLE_EPIC);
    try {
      const result = dagComputeWaves(path);
      assert.deepEqual(result.waves, []);
      assert.deepEqual(result.chunks, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns errors when DAG is invalid', () => {
    const { path, dir } = writeTempEpic('cyclic.epic.md', CYCLIC_EPIC);
    try {
      const result = dagComputeWaves(path);
      assert.deepEqual(result.waves, []);
      assert.ok(result.errors.length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
