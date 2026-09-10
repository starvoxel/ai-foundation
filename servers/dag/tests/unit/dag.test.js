/**
 * Unit tests for DAG server pure logic.
 *
 * Plan ID: engineering-manager-plan (Phase 1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseChunksFile, buildGraph, validate, computeWaves } from '../../logic.js';

// ── parseChunksFile ──────────────────────────────────────────────────────────

describe('unit: dag/parseChunksFile', () => {
  it('parses a valid chunks object', () => {
    const data = {
      epic_id: 'TEST-001',
      chunks: [
        { id: '001', title: 'Data layer', depends_on: [], agents: ['Software-Engineer'] },
        { id: '002', title: 'API routes', depends_on: ['001'], agents: ['Software-Engineer'] },
      ],
    };
    const { chunks, errors } = parseChunksFile(data);
    assert.equal(chunks.length, 2);
    assert.deepEqual(errors, []);
  });

  it('extracts chunk fields correctly', () => {
    const data = {
      chunks: [
        {
          id: '003',
          title: 'Integration',
          depends_on: ['001', '002'],
          agents: ['Software-Engineer', 'Test-Engineer'],
        },
      ],
    };
    const { chunks } = parseChunksFile(data);
    assert.equal(chunks[0].id, '003');
    assert.equal(chunks[0].title, 'Integration');
    assert.deepEqual(chunks[0].depends_on, ['001', '002']);
    assert.deepEqual(chunks[0].agents, ['Software-Engineer', 'Test-Engineer']);
  });

  it('returns error for null input', () => {
    const { chunks, errors } = parseChunksFile(null);
    assert.equal(chunks.length, 0);
    assert.ok(errors[0].includes('not a valid JSON object'));
  });

  it('returns error for non-object input', () => {
    const { chunks, errors } = parseChunksFile('string');
    assert.equal(chunks.length, 0);
    assert.ok(errors[0].includes('not a valid JSON object'));
  });

  it('returns error when chunks array is missing', () => {
    const { chunks, errors } = parseChunksFile({ epic_id: 'TEST' });
    assert.equal(chunks.length, 0);
    assert.ok(errors[0].includes('Missing or invalid "chunks" array'));
  });

  it('returns error for chunk without id', () => {
    const data = { chunks: [{ title: 'No ID', depends_on: [], agents: [] }] };
    const { errors } = parseChunksFile(data);
    assert.ok(errors.some((e) => e.includes('missing or invalid "id"')));
  });

  it('returns error for chunk without title', () => {
    const data = { chunks: [{ id: '001', depends_on: [], agents: [] }] };
    const { errors } = parseChunksFile(data);
    assert.ok(errors.some((e) => e.includes('missing or invalid "title"')));
  });

  it('returns error when depends_on is not an array', () => {
    const data = { chunks: [{ id: '001', title: 'Test', depends_on: 'bad', agents: [] }] };
    const { errors } = parseChunksFile(data);
    assert.ok(errors.some((e) => e.includes('"depends_on" must be an array')));
  });

  it('returns error when agents is not an array', () => {
    const data = { chunks: [{ id: '001', title: 'Test', depends_on: [], agents: 'bad' }] };
    const { errors } = parseChunksFile(data);
    assert.ok(errors.some((e) => e.includes('"agents" must be an array')));
  });

  it('still collects valid chunks when some are invalid', () => {
    const data = {
      chunks: [
        { id: '001', title: 'Good', depends_on: [], agents: [] },
        'not an object',
        { id: '002', title: 'Also good', depends_on: [], agents: [] },
      ],
    };
    const { chunks, errors } = parseChunksFile(data);
    assert.equal(chunks.length, 2);
    assert.equal(errors.length, 1);
  });

  it('detects duplicate chunk IDs', () => {
    const data = {
      chunks: [
        { id: '001', title: 'First', depends_on: [], agents: [] },
        { id: '001', title: 'Duplicate', depends_on: [], agents: [] },
      ],
    };
    const { chunks, errors } = parseChunksFile(data);
    assert.equal(chunks.length, 1);
    assert.ok(errors.some((e) => e.includes('duplicate chunk id "001"')));
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
    assert.ok(result.errors.some((e) => e.includes('Cycle detected')));
  });

  it('detects a longer cycle (A→B→C→A)', () => {
    const graph = buildGraph([
      { id: '001', depends_on: ['003'] },
      { id: '002', depends_on: ['001'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Cycle detected')));
  });

  it('detects cycle even with valid nodes present', () => {
    const graph = buildGraph([
      { id: '001', depends_on: [] },
      { id: '002', depends_on: ['003'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('002')));
    assert.ok(result.errors.some((e) => e.includes('003')));
  });

  it('reports both missing refs and cycles', () => {
    const graph = buildGraph([
      { id: '001', depends_on: ['999'] },
      { id: '002', depends_on: ['003'] },
      { id: '003', depends_on: ['002'] },
    ]);
    const result = validate(graph);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('999')));
    assert.ok(result.errors.some((e) => e.includes('Cycle')));
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

  it('handles a single-chunk graph', () => {
    const graph = buildGraph([{ id: '001', depends_on: [] }]);
    const waves = computeWaves(graph);
    assert.equal(waves.length, 1);
    assert.deepEqual(waves[0], ['001']);
  });
});
