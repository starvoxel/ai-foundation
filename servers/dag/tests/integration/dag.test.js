/**
 * Integration tests for DAG server I/O layer.
 * Tests dagValidate and dagComputeWaves against real filesystem operations.
 *
 * Plan ID: engineering-manager-plan (Phase 1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { dagValidate, dagComputeWaves } from '../../logic.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_CHUNKS = {
  epic_id: 'TEST-001',
  chunks: [
    { id: '001', title: 'Data models', depends_on: [], agents: ['Software-Engineer'] },
    { id: '002', title: 'API service', depends_on: [], agents: ['Software-Engineer'] },
    { id: '003', title: 'Controller', depends_on: ['001', '002'], agents: ['Software-Engineer'] },
    { id: '004', title: 'Tests', depends_on: ['003'], agents: ['Test-Engineer'] },
  ],
};

const CYCLIC_CHUNKS = {
  epic_id: 'TEST-CYCLIC',
  chunks: [
    { id: '001', title: 'First', depends_on: ['002'], agents: ['Software-Engineer'] },
    { id: '002', title: 'Second', depends_on: ['001'], agents: ['Software-Engineer'] },
  ],
};

const MISSING_REF_CHUNKS = {
  epic_id: 'TEST-MISSING',
  chunks: [
    { id: '001', title: 'First', depends_on: [], agents: ['Software-Engineer'] },
    { id: '002', title: 'Second', depends_on: ['999'], agents: ['Software-Engineer'] },
  ],
};

const EMPTY_CHUNKS = {
  epic_id: 'TEST-EMPTY',
  chunks: [],
};

const INVALID_SCHEMA = {
  epic_id: 'TEST-BAD',
  chunks: [
    { id: '001', depends_on: [], agents: [] },
    { title: 'No ID', depends_on: [], agents: [] },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeTempChunks(data, filename = 'chunks.json') {
  const dir = join(tmpdir(), 'dag-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  return { path, dir };
}

// ── dag-validate ─────────────────────────────────────────────────────────────

describe('integration: dag/dag-validate', () => {
  it('validates a well-formed chunks file as valid', () => {
    const { path, dir } = writeTempChunks(VALID_CHUNKS);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects cycles in chunk dependencies', () => {
    const { path, dir } = writeTempChunks(CYCLIC_CHUNKS);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Cycle')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects missing dependency references', () => {
    const { path, dir } = writeTempChunks(MISSING_REF_CHUNKS);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('999')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns invalid when chunks array is empty', () => {
    const { path, dir } = writeTempChunks(EMPTY_CHUNKS);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors[0].includes('No chunks defined'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns schema errors for malformed chunks', () => {
    const { path, dir } = writeTempChunks(INVALID_SCHEMA);
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('title')));
      assert.ok(result.errors.some(e => e.includes('"id"')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns error for invalid JSON content', () => {
    const dir = join(tmpdir(), 'dag-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'bad.json');
    writeFileSync(path, 'not valid json {{{', 'utf-8');
    try {
      const result = dagValidate(path);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('Invalid JSON')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns error for non-existent file', () => {
    const result = dagValidate('/tmp/does-not-exist-' + Date.now() + '.json');
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Failed to read file')));
  });
});

// ── dag-compute-waves ────────────────────────────────────────────────────────

describe('integration: dag/dag-compute-waves', () => {
  it('computes correct waves for a valid chunks file', () => {
    const { path, dir } = writeTempChunks(VALID_CHUNKS);
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
    const { path, dir } = writeTempChunks(VALID_CHUNKS);
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

  it('returns empty waves for an empty chunks file', () => {
    const { path, dir } = writeTempChunks(EMPTY_CHUNKS);
    try {
      const result = dagComputeWaves(path);
      assert.deepEqual(result.waves, []);
      assert.deepEqual(result.chunks, []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns errors when DAG is invalid', () => {
    const { path, dir } = writeTempChunks(CYCLIC_CHUNKS);
    try {
      const result = dagComputeWaves(path);
      assert.deepEqual(result.waves, []);
      assert.ok(result.errors.length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
