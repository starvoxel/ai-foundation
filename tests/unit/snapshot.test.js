/**
 * Unit tests for snapshot command logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { diffSnapshot } from '../../lib/commands/snapshot.js';

// ── diffSnapshot ─────────────────────────────────────────────────────────────

describe('unit: snapshot/diffSnapshot', () => {
  it('reports stale when no existing snapshot', () => {
    const computed = {
      sources: { 'agents/foo.yaml': 'sha256:aaa' },
    };
    const result = diffSnapshot(computed, null);
    assert.equal(result.stale, true);
    assert.deepEqual(result.added, ['agents/foo.yaml']);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.changed, []);
  });

  it('reports not stale when hashes match exactly', () => {
    const snapshot = {
      sources: {
        'agents/foo.yaml': 'sha256:aaa',
        'steering/global/core.md': 'sha256:bbb',
      },
    };
    const result = diffSnapshot(snapshot, snapshot);
    assert.equal(result.stale, false);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.changed, []);
  });

  it('detects changed sources', () => {
    const computed = {
      sources: {
        'agents/foo.yaml': 'sha256:new-hash',
        'steering/global/core.md': 'sha256:bbb',
      },
    };
    const existing = {
      sources: {
        'agents/foo.yaml': 'sha256:old-hash',
        'steering/global/core.md': 'sha256:bbb',
      },
    };
    const result = diffSnapshot(computed, existing);
    assert.equal(result.stale, true);
    assert.deepEqual(result.changed, ['agents/foo.yaml']);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
  });

  it('detects added sources', () => {
    const computed = {
      sources: {
        'agents/foo.yaml': 'sha256:aaa',
        'agents/bar.yaml': 'sha256:bbb',
      },
    };
    const existing = {
      sources: {
        'agents/foo.yaml': 'sha256:aaa',
      },
    };
    const result = diffSnapshot(computed, existing);
    assert.equal(result.stale, true);
    assert.deepEqual(result.added, ['agents/bar.yaml']);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.removed, []);
  });

  it('detects removed sources', () => {
    const computed = {
      sources: {
        'agents/foo.yaml': 'sha256:aaa',
      },
    };
    const existing = {
      sources: {
        'agents/foo.yaml': 'sha256:aaa',
        'agents/bar.yaml': 'sha256:bbb',
      },
    };
    const result = diffSnapshot(computed, existing);
    assert.equal(result.stale, true);
    assert.deepEqual(result.removed, ['agents/bar.yaml']);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.changed, []);
  });

  it('detects all three types simultaneously', () => {
    const computed = {
      sources: {
        'agents/kept.yaml': 'sha256:changed',
        'agents/new.yaml': 'sha256:nnn',
      },
    };
    const existing = {
      sources: {
        'agents/kept.yaml': 'sha256:original',
        'agents/gone.yaml': 'sha256:ggg',
      },
    };
    const result = diffSnapshot(computed, existing);
    assert.equal(result.stale, true);
    assert.deepEqual(result.changed, ['agents/kept.yaml']);
    assert.deepEqual(result.added, ['agents/new.yaml']);
    assert.deepEqual(result.removed, ['agents/gone.yaml']);
  });

  it('handles empty sources in both', () => {
    const computed = { sources: {} };
    const existing = { sources: {} };
    const result = diffSnapshot(computed, existing);
    assert.equal(result.stale, false);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.changed, []);
  });
});
