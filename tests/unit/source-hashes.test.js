/**
 * Unit tests for the pure source-hash logic (lib/source-hashes/pure.js).
 * I/O behavior (lib/source-hashes/io.js) is covered by integration tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  diffSourceHashes,
  isRuntimeFile,
  isFreshnessCurrent,
} from '../../lib/source-hashes/pure.js';

describe('unit: source-hashes/isRuntimeFile', () => {
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
});

describe('unit: source-hashes/diffSourceHashes', () => {
  it('reports everything added when nothing was recorded', () => {
    for (const recorded of [null, undefined]) {
      const result = diffSourceHashes({ 'agents/foo.yaml': 'sha256:aaa' }, recorded);
      assert.equal(result.stale, true);
      assert.deepEqual(result.added, ['agents/foo.yaml']);
      assert.deepEqual(result.removed, []);
      assert.deepEqual(result.changed, []);
    }
  });

  it('reports not stale when hashes match exactly', () => {
    const hashes = { 'agents/foo.yaml': 'sha256:aaa', 'steering/global/core.md': 'sha256:bbb' };
    const result = diffSourceHashes(hashes, { ...hashes });
    assert.deepEqual(result, { stale: false, added: [], removed: [], changed: [] });
  });

  it('detects changed sources', () => {
    const result = diffSourceHashes(
      { 'agents/foo.yaml': 'sha256:new', 'steering/global/core.md': 'sha256:bbb' },
      { 'agents/foo.yaml': 'sha256:old', 'steering/global/core.md': 'sha256:bbb' },
    );
    assert.equal(result.stale, true);
    assert.deepEqual(result.changed, ['agents/foo.yaml']);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.removed, []);
  });

  it('detects added sources', () => {
    const result = diffSourceHashes(
      { 'agents/foo.yaml': 'sha256:aaa', 'agents/bar.yaml': 'sha256:bbb' },
      { 'agents/foo.yaml': 'sha256:aaa' },
    );
    assert.equal(result.stale, true);
    assert.deepEqual(result.added, ['agents/bar.yaml']);
    assert.deepEqual(result.changed, []);
    assert.deepEqual(result.removed, []);
  });

  it('detects removed sources', () => {
    const result = diffSourceHashes(
      { 'agents/foo.yaml': 'sha256:aaa' },
      { 'agents/foo.yaml': 'sha256:aaa', 'agents/bar.yaml': 'sha256:bbb' },
    );
    assert.equal(result.stale, true);
    assert.deepEqual(result.removed, ['agents/bar.yaml']);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.changed, []);
  });

  it('detects all three types simultaneously', () => {
    const result = diffSourceHashes(
      { 'agents/kept.yaml': 'sha256:changed', 'agents/new.yaml': 'sha256:nnn' },
      { 'agents/kept.yaml': 'sha256:original', 'agents/gone.yaml': 'sha256:ggg' },
    );
    assert.equal(result.stale, true);
    assert.deepEqual(result.changed, ['agents/kept.yaml']);
    assert.deepEqual(result.added, ['agents/new.yaml']);
    assert.deepEqual(result.removed, ['agents/gone.yaml']);
  });

  it('handles empty records on both sides', () => {
    assert.deepEqual(diffSourceHashes({}, {}), {
      stale: false,
      added: [],
      removed: [],
      changed: [],
    });
  });
});

describe('unit: source-hashes/isFreshnessCurrent', () => {
  it('returns false when there are no recorded hashes', () => {
    assert.equal(isFreshnessCurrent(undefined, { 'agents/foo.yaml': 'sha256:aaa' }), false);
  });

  it('returns false when there are no fresh hashes', () => {
    assert.equal(isFreshnessCurrent({ 'agents/foo.yaml': 'sha256:aaa' }, null), false);
  });

  it('returns true when recorded hashes exactly match the fresh ones', () => {
    const hashes = { 'agents/foo.yaml': 'sha256:aaa' };
    assert.equal(isFreshnessCurrent(hashes, { ...hashes }), true);
  });

  it('returns false when a hash differs', () => {
    assert.equal(
      isFreshnessCurrent({ 'agents/foo.yaml': 'sha256:old' }, { 'agents/foo.yaml': 'sha256:new' }),
      false,
    );
  });

  it('returns false when a source was added', () => {
    assert.equal(
      isFreshnessCurrent(
        { 'agents/foo.yaml': 'sha256:aaa' },
        { 'agents/foo.yaml': 'sha256:aaa', 'agents/bar.yaml': 'sha256:bbb' },
      ),
      false,
    );
  });

  it('returns false when a source was removed', () => {
    assert.equal(
      isFreshnessCurrent(
        { 'agents/foo.yaml': 'sha256:aaa', 'agents/bar.yaml': 'sha256:bbb' },
        { 'agents/foo.yaml': 'sha256:aaa' },
      ),
      false,
    );
  });
});
