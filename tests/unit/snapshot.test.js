/**
 * Unit tests for the pure snapshot subsystem logic (lib/snapshot/pure.js).
 * I/O behavior (lib/snapshot/io.js) and CLI orchestration
 * (lib/commands/snapshot.js) are covered by integration tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  diffSnapshot,
  isRuntimeFile,
  isFreshnessCurrent,
  resolveExplicitTargets,
} from '../../lib/snapshot/pure.js';

// ── isRuntimeFile ────────────────────────────────────────────────────────────

describe('unit: snapshot/isRuntimeFile', () => {
  it('excludes files under tests/', () => {
    assert.equal(isRuntimeFile('tests/foo.test.js'), false);
    assert.equal(isRuntimeFile('tests/helpers/fixture.js'), false);
  });

  it('excludes .test.js files outside tests/', () => {
    assert.equal(isRuntimeFile('index.test.js'), false);
  });

  it('includes ordinary runtime files', () => {
    assert.equal(isRuntimeFile('index.js'), true);
    assert.equal(isRuntimeFile('lib/logic.js'), true);
  });

  it("excludes the resource's own snapshot.json to avoid self-reference", () => {
    assert.equal(isRuntimeFile('snapshot.json'), false);
  });
});

// ── resolveExplicitTargets ───────────────────────────────────────────────────

describe('unit: snapshot/resolveExplicitTargets', () => {
  const kinds = ['bundle', 'server', 'hook'];

  it('returns an empty target list when no kind args are present', () => {
    const result = resolveExplicitTargets({}, kinds);
    assert.deepEqual(result, { ok: true, targets: [] });
  });

  it('resolves a single explicit target', () => {
    const result = resolveExplicitTargets({ bundle: 'engineering' }, kinds);
    assert.deepEqual(result, { ok: true, targets: [{ kind: 'bundle', name: 'engineering' }] });
  });

  it('resolves multiple explicit targets of different kinds', () => {
    const result = resolveExplicitTargets({ bundle: 'engineering', server: 'git' }, kinds);
    assert.equal(result.ok, true);
    assert.deepEqual(result.targets, [
      { kind: 'bundle', name: 'engineering' },
      { kind: 'server', name: 'git' },
    ]);
  });

  it('ignores args for kinds not in the recognized list', () => {
    const result = resolveExplicitTargets({ bundle: 'engineering', unknown: 'x' }, kinds);
    assert.deepEqual(result.targets, [{ kind: 'bundle', name: 'engineering' }]);
  });

  it('returns an error when a kind flag has no string value', () => {
    const result = resolveExplicitTargets({ bundle: true }, kinds);
    assert.equal(result.ok, false);
    assert.match(result.error, /--bundle/);
  });

  it('returns an error for an empty string value', () => {
    const result = resolveExplicitTargets({ server: '' }, kinds);
    assert.equal(result.ok, false);
    assert.match(result.error, /--server/);
  });
});

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

// -- isFreshnessCurrent --------------------------------------------------------

describe('unit: snapshot/isFreshnessCurrent', () => {
  it('returns false when there are no stored source hashes', () => {
    const snapshot = { sources: { 'agents/foo.yaml': 'sha256:aaa' } };
    assert.equal(isFreshnessCurrent(undefined, snapshot), false);
  });

  it('returns false when there is no fresh snapshot', () => {
    assert.equal(isFreshnessCurrent({ 'agents/foo.yaml': 'sha256:aaa' }, null), false);
  });

  it('returns false when the fresh snapshot has no sources field', () => {
    assert.equal(isFreshnessCurrent({ 'agents/foo.yaml': 'sha256:aaa' }, {}), false);
  });

  it('returns true when stored hashes exactly match the fresh snapshot', () => {
    const stored = { 'agents/foo.yaml': 'sha256:aaa' };
    const snapshot = { sources: { 'agents/foo.yaml': 'sha256:aaa' } };
    assert.equal(isFreshnessCurrent(stored, snapshot), true);
  });

  it('returns false when a hash differs', () => {
    const stored = { 'agents/foo.yaml': 'sha256:old' };
    const snapshot = { sources: { 'agents/foo.yaml': 'sha256:new' } };
    assert.equal(isFreshnessCurrent(stored, snapshot), false);
  });

  it('returns false when the fresh snapshot has an added source', () => {
    const stored = { 'agents/foo.yaml': 'sha256:aaa' };
    const snapshot = {
      sources: { 'agents/foo.yaml': 'sha256:aaa', 'agents/bar.yaml': 'sha256:bbb' },
    };
    assert.equal(isFreshnessCurrent(stored, snapshot), false);
  });

  it('returns false when the fresh snapshot has a removed source', () => {
    const stored = { 'agents/foo.yaml': 'sha256:aaa', 'agents/bar.yaml': 'sha256:bbb' };
    const snapshot = { sources: { 'agents/foo.yaml': 'sha256:aaa' } };
    assert.equal(isFreshnessCurrent(stored, snapshot), false);
  });
});
