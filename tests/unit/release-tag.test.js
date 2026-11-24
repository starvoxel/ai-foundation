// ------------------------------
// release-tag.test.js
//
// Author: Starvoxel AI Agent - 2026-11-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Tests for .github/scripts/release-tag.mjs: the pure release decision and the
 * env/output wrapper, with the version and tag list injected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/release-tag.mjs'),
).href;
const { decideRelease, run } = await import(SCRIPT);

describe('decideRelease', () => {
  it('releases a version whose tag does not exist', () => {
    assert.deepEqual(decideRelease('0.4.0', ['v0.3.0']), {
      release: true,
      tag: 'v0.4.0',
      reason: 'tag v0.4.0 does not exist yet',
    });
  });

  it('releases the first version when there are no tags', () => {
    assert.equal(decideRelease('0.4.0', []).release, true);
  });

  it('does not release twice for a tag that exists (re-run safe)', () => {
    const decision = decideRelease('0.4.0', ['v0.3.0', 'v0.4.0']);
    assert.equal(decision.release, false);
    assert.equal(decision.tag, 'v0.4.0');
  });

  it('releases a lower version whose tag is missing, since only existence is tested', () => {
    assert.equal(decideRelease('0.2.0', ['v0.3.0']).release, true);
  });

  it('accepts a pre-release version', () => {
    assert.equal(decideRelease('1.0.0-rc.1', []).tag, 'v1.0.0-rc.1');
  });

  it('refuses anything that is not plain semver, so nothing odd reaches the shell', () => {
    for (const version of [
      undefined,
      null,
      4,
      '',
      'latest',
      '1.0',
      'v1.0.0',
      '1.0.0; rm -rf /',
      '1.0.0\nx=y',
      '$(id).0.0',
    ]) {
      const decision = decideRelease(version, []);
      assert.equal(decision.release, false, String(version));
      assert.equal(decision.tag, '');
    }
  });
});

describe('run', () => {
  /**
   * Run with stubbed I/O and a temp GITHUB_OUTPUT file.
   * @param {unknown} version
   * @param {string[]} tags
   * @returns {{ decision: object, output: string, logs: string[] }}
   */
  function runWith(version, tags) {
    const dir = mkdtempSync(join(tmpdir(), 'aif-release-'));
    const out = join(dir, 'output');
    const logs = [];
    try {
      const decision = run(
        { GITHUB_OUTPUT: out },
        { readVersion: () => version, listTags: () => tags, log: (line) => logs.push(line) },
      );
      return { decision, output: readFileSync(out, 'utf8'), logs };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('publishes release=true and the tag, and logs what it will create', () => {
    const { output, logs } = runWith('0.4.0', ['v0.3.0']);
    assert.equal(output, 'release=true\ntag=v0.4.0\n');
    assert.match(logs[0], /creating v0\.4\.0/);
  });

  it('publishes release=false and logs why when the tag exists', () => {
    const { output, logs } = runWith('0.4.0', ['v0.4.0']);
    assert.equal(output, 'release=false\ntag=v0.4.0\n');
    assert.match(logs[0], /no release needed \(tag v0\.4\.0 already exists\)/);
  });

  it('publishes an empty tag for an invalid version', () => {
    assert.equal(runWith('bad', []).output, 'release=false\ntag=\n');
  });

  it('does not require GITHUB_OUTPUT', () => {
    assert.equal(
      run({}, { readVersion: () => '0.4.0', listTags: () => [], log: () => {} }).release,
      true,
    );
  });
});
