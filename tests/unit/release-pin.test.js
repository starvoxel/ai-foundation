// ------------------------------
// release-pin.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { explicitPin, pickLatestTag } from '../../lib/release-pin.js';

describe('pickLatestTag', () => {
  it('picks the highest version, comparing numbers rather than text', () => {
    assert.equal(pickLatestTag(['v0.9.0', 'v0.10.0', 'v0.2.5']), 'v0.10.0');
    assert.equal(pickLatestTag(['v1.0.0', 'v0.99.99']), 'v1.0.0');
    assert.equal(pickLatestTag(['v0.4.0', 'v0.4.1', 'v0.4.10', 'v0.4.2']), 'v0.4.10');
  });

  it('ignores tags that are not plain vX.Y.Z', () => {
    assert.equal(pickLatestTag(['legacy/process-v1', 'v0.5.0-rc1', 'latest', 'v0.4.0']), 'v0.4.0');
  });

  it('never returns a tag that could be read as a git option', () => {
    const hostile = [
      '--upload-pack=x',
      '-rf',
      'v1.0.0 --force',
      'v1.0.0\n--output=x',
      '$(touch x)',
    ];
    assert.equal(pickLatestTag(hostile), null);
    assert.equal(pickLatestTag([...hostile, 'v0.3.0']), 'v0.3.0');
  });

  it('tolerates blank lines and trailing whitespace from git output', () => {
    assert.equal(pickLatestTag(['', 'v0.4.0  ', '']), 'v0.4.0');
  });

  it('returns null when there is no release tag', () => {
    assert.equal(pickLatestTag([]), null);
    assert.equal(pickLatestTag(['legacy/process-v1']), null);
  });
});

describe('explicitPin', () => {
  const sha = 'a'.repeat(40);

  it('accepts a full SHA with a release tag', () => {
    assert.deepEqual(explicitPin(sha, 'v0.6.0'), { sha, version: 'v0.6.0' });
  });

  it('rejects a short or malformed SHA', () => {
    assert.throws(() => explicitPin('abc123', 'v0.6.0'), /40-character/);
    assert.throws(() => explicitPin('A'.repeat(40), 'v0.6.0'), /40-character/);
    assert.throws(() => explicitPin(undefined, 'v0.6.0'), /40-character/);
    assert.throws(() => explicitPin(true, 'v0.6.0'), /40-character/);
  });

  it('rejects a missing or malformed version', () => {
    assert.throws(() => explicitPin(sha, '0.6.0'), /release tag/);
    assert.throws(() => explicitPin(sha, undefined), /release tag/);
  });
});
