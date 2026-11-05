// ------------------------------
// dependabot-auto-merge.test.js
//
// Author: Starvoxel AI Agent - 2026-11-04
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Tests for .github/scripts/dependabot-auto-merge.mjs: the pure eligibility
 * decision and the env/output wrapper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPT = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/dependabot-auto-merge.mjs'),
).href;
const { decide, run } = await import(SCRIPT);

const PATCH = 'version-update:semver-patch';

/**
 * Build one `updated-dependencies-json` entry.
 * @param {object} [overrides] - Fields to replace
 * @returns {object}
 */
function update(overrides = {}) {
  return {
    dependencyName: 'x',
    dependencyType: 'direct:development',
    updateType: PATCH,
    packageEcosystem: 'npm_and_yarn',
    ...overrides,
  };
}

describe('decide', () => {
  it('approves a patch update of a direct npm dev dependency', () => {
    assert.equal(decide(JSON.stringify([update()])).eligible, true);
  });

  it('approves a patch update of a GitHub Action', () => {
    const action = update({
      packageEcosystem: 'github_actions',
      dependencyType: 'direct:production',
    });
    assert.equal(decide(JSON.stringify([action])).eligible, true);
  });

  it('approves a group only when every member is safe', () => {
    assert.equal(
      decide(JSON.stringify([update(), update({ dependencyName: 'y' })])).eligible,
      true,
    );
    const mixed = [update(), update({ dependencyType: 'direct:production' })];
    assert.equal(decide(JSON.stringify(mixed)).eligible, false);
  });

  it('rejects minor and major updates', () => {
    for (const updateType of ['version-update:semver-minor', 'version-update:semver-major']) {
      assert.equal(decide(JSON.stringify([update({ updateType })])).eligible, false);
    }
  });

  it('rejects npm runtime and indirect dependencies', () => {
    for (const dependencyType of ['direct:production', 'indirect']) {
      assert.equal(decide(JSON.stringify([update({ dependencyType })])).eligible, false);
    }
  });

  it('rejects other ecosystems', () => {
    assert.equal(decide(JSON.stringify([update({ packageEcosystem: 'docker' })])).eligible, false);
  });

  it('fails closed on missing, invalid or oddly shaped input', () => {
    for (const input of [
      undefined,
      '',
      'not json',
      '{}',
      '[]',
      'null',
      '[null]',
      '["x"]',
      '[{}]',
    ]) {
      assert.equal(decide(input).eligible, false, String(input));
    }
  });

  it('explains a rejection', () => {
    const { reason } = decide(
      JSON.stringify([update(), update({ updateType: 'version-update:semver-major' })]),
    );
    assert.match(reason, /1 of 2 updates/);
  });
});

describe('run', () => {
  it('logs the decision and appends it to GITHUB_OUTPUT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dependabot-auto-merge-'));
    try {
      const out = join(dir, 'output');
      const lines = [];
      const decision = run(
        { UPDATES_JSON: JSON.stringify([update()]), GITHUB_OUTPUT: out },
        (line) => lines.push(line),
      );
      assert.equal(decision.eligible, true);
      assert.equal(readFileSync(out, 'utf8'), 'eligible=true\n');
      assert.match(lines[0], /^auto-merge eligible:/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('works without GITHUB_OUTPUT and reports ineligible for no metadata', () => {
    const lines = [];
    const decision = run({}, (line) => lines.push(line));
    assert.equal(decision.eligible, false);
    assert.match(lines[0], /^auto-merge not eligible:/);
  });
});
