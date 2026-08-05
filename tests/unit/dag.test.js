/**
 * Unit tests for DAG server pure logic.
 *
 * Plan ID: engineering-manager-plan (Phase 1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseChunkTable,
  parseList,
  buildGraph,
  validate,
  computeWaves,
} from '../../servers/dag/index.js';

// ── parseList ────────────────────────────────────────────────────────────────

describe('unit: dag/parseList', () => {
  it('returns empty array for "None"', () => {
    assert.deepEqual(parseList('None'), []);
  });

  it('returns empty array for "none" (case-insensitive)', () => {
    assert.deepEqual(parseList('none'), []);
  });

  it('returns empty array for em-dash', () => {
    assert.deepEqual(parseList('—'), []);
  });

  it('returns empty array for hyphen', () => {
    assert.deepEqual(parseList('-'), []);
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(parseList(''), []);
  });

  it('returns empty array for null/undefined', () => {
    assert.deepEqual(parseList(null), []);
    assert.deepEqual(parseList(undefined), []);
  });

  it('splits comma-separated values', () => {
    assert.deepEqual(parseList('001, 002'), ['001', '002']);
  });

  it('splits semicolon-separated values', () => {
    assert.deepEqual(parseList('001; 002'), ['001', '002']);
  });

  it('handles single value', () => {
    assert.deepEqual(parseList('001'), ['001']);
  });

  it('trims whitespace from values', () => {
    assert.deepEqual(parseList('  001 , 002  '), ['001', '002']);
  });
});

// ── parseChunkTable ──────────────────────────────────────────────────────────

describe('unit: dag/parseChunkTable', () => {
  const validEpic = `# Epic Plan: Test

## 1. Metadata

Some metadata here.

## 8. Chunk Decomposition

| Chunk | Title | Depends On | Can Parallel With | Agent(s) |
|---|---|---|---|---|
| 001 | Data layer | None | 002 | Software-Engineer |
| 002 | API routes | None | 001 | Software-Engineer |
| 003 | Integration | 001, 002 | — | Software-Engineer, Test-Engineer |

Parallelization notes:
- Chunks 001 and 002 can run in parallel.

## 9. Acceptance Criteria

Done.
`;

  it('parses a well-formed chunk table', () => {
    const chunks = parseChunkTable(validEpic);
    assert.equal(chunks.length, 3);
  });

  it('extracts chunk IDs correctly', () => {
    const chunks = parseChunkTable(validEpic);
    assert.deepEqual(chunks.map(c => c.id), ['001', '002', '003']);
  });

  it('extracts titles correctly', () => {
    const chunks = parseChunkTable(validEpic);
    assert.equal(chunks[0].title, 'Data layer');
    assert.equal(chunks[2].title, 'Integration');
  });

  it('parses dependencies correctly', () => {
    const chunks = parseChunkTable(validEpic);
    assert.deepEqual(chunks[0].depends_on, []);
    assert.deepEqual(chunks[1].depends_on, []);
    assert.deepEqual(chunks[2].depends_on, ['001', '002']);
  });

  it('parses agents correctly', () => {
    const chunks = parseChunkTable(validEpic);
    assert.deepEqual(chunks[0].agents, ['Software-Engineer']);
    assert.deepEqual(chunks[2].agents, ['Software-Engineer', 'Test-Engineer']);
  });

  it('returns empty array when no Section 8 exists', () => {
    const noSection8 = '# Epic\n\n## 7. Open Questions\n\nStuff\n';
    assert.deepEqual(parseChunkTable(noSection8), []);
  });

  it('returns empty array when Section 8 has no table', () => {
    const emptySection = '## 8. Chunk Decomposition\n\nTBD\n\n## 9. Acceptance\n';
    assert.deepEqual(parseChunkTable(emptySection), []);
  });
});

// ── buildGraph ───────────────────────────────────────────────────────────────

describe('unit: dag/buildGraph', () => {
  it('creates nodes from chunk IDs', () => {
    const chunks = [
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['001'] },
    ];
    const graph = buildGraph(chunks);
    assert.equal(graph.nodes.size, 2);
    assert.ok(graph.nodes.has('001'));
    assert.ok(graph.nodes.has('002'));
  });

  it('creates edges from dependencies', () => {
    const chunks = [
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['001'] },
    ];
    const graph = buildGraph(chunks);
    assert.deepEqual(graph.edges.get('001'), []);
    assert.deepEqual(graph.edges.get('002'), ['001']);
  });
});

// ── validate ─────────────────────────────────────────────────────────────────

describe('unit: dag/validate', () => {
  it('returns valid for a simple DAG', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['001'] },
      { id: '003', depends_on: ['001', '002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('returns valid for all-independent chunks', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: [] },
      { id: '003', depends_on: [] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, true);
  });

  it('detects missing dependency references', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['999'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('999'));
    assert.ok(result.errors[0].includes('does not exist'));
  });

  it('detects a simple cycle (A→B→A)', () => {
    const graph = buildGraph([
      { id: '001', depends_on: ['002'] },
      { id: '002', depends_on: ['001'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Cycle detected')));
  });

  it('detects a longer cycle (A→B→C→A)', () => {
    const graph = buildGraph([
      { id: '001', depends_on: ['003'] },
      { id: '002', depends_on: ['001'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Cycle detected')));
  });

  it('detects cycle even with valid nodes present', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['003'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('002')));
    assert.ok(result.errors.some(e => e.includes('003')));
  });

  it('reports both missing refs and cycles', () => {
    const graph = buildGraph([
      { id: '001', depends_on: ['999'] },
      { id: '002', depends_on: ['003'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('999')));
    assert.ok(result.errors.some(e => e.includes('Cycle')));
  });
});

// ── computeWaves ─────────────────────────────────────────────────────────────

describe('unit: dag/computeWaves', () => {
  it('puts all independent chunks in wave 1', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: [] },
      { id: '003', depends_on: [] },
    ]);
    const waves = computeWaves(graph);
    assert.equal(waves.length, 1);
    assert.deepEqual(waves[0], ['001', '002', '003']);
  });

  it('computes linear dependency chain as separate waves', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['001'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const waves = computeWaves(graph);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0], ['001']);
    assert.deepEqual(waves[1], ['002']);
    assert.deepEqual(waves[2], ['003']);
  });

  it('computes diamond dependency correctly', () => {
    // 001 and 002 independent, 003 depends on both
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: [] },
      { id: '003', depends_on: ['001', '002'] },
    ]);
    const waves = computeWaves(graph);
    assert.equal(waves.length, 2);
    assert.deepEqual(waves[0], ['001', '002']);
    assert.deepEqual(waves[1], ['003']);
  });

  it('handles complex multi-wave graph', () => {
    // Wave 1: 001, 002
    // Wave 2: 003 (depends 001), 004 (depends 002)
    // Wave 3: 005 (depends 003, 004)
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: [] },
      { id: '003', depends_on: ['001'] },
      { id: '004', depends_on: ['002'] },
      { id: '005', depends_on: ['003', '004'] },
    ]);
    const waves = computeWaves(graph);
    assert.equal(waves.length, 3);
    assert.deepEqual(waves[0], ['001', '002']);
    assert.deepEqual(waves[1], ['003', '004']);
    assert.deepEqual(waves[2], ['005']);
  });

  it('returns empty array for empty graph', () => {
    const graph = { nodes: new Set(), edges: new Map() };
    const waves = computeWaves(graph);
    assert.deepEqual(waves, []);
  });

  it('returns deterministic sorted order within waves', () => {
    const graph = buildGraph([
      { id: '003', depends_on: [] },
      { id: '001', depends_on: [] },
      { id: '002', depends_on: [] },
    ]);
    const waves = computeWaves(graph);
    assert.deepEqual(waves[0], ['001', '002', '003']);
  });
});
