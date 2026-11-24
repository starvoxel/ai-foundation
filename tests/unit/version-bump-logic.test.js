// ------------------------------
// version-bump-logic.test.js
//
// Author: Starvoxel AI Agent - 2026-11-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Tests for .github/scripts/version-bump-logic.mjs: version ordering and the
 * "shipped content needs a package.json bump" rule.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MODULE = pathToFileURL(
  resolve(import.meta.dirname, '../../.github/scripts/version-bump-logic.mjs'),
).href;
const { SHIPPED_DIRS, isOlder, needsPackageBump, packageBumpError, shippedChanges } = await import(
  MODULE
);

const pkg = (version) => JSON.stringify({ name: 'p', version });

describe('isOlder', () => {
  it('orders versions numerically per part', () => {
    assert.equal(isOlder('0.3.0', '0.4.0'), true);
    assert.equal(isOlder('0.9.0', '0.10.0'), true);
    assert.equal(isOlder('1.0.0', '0.9.9'), false);
    assert.equal(isOlder('1.0.0', '1.0.0'), false);
  });
});

describe('needsPackageBump', () => {
  it('is true for a change under any shipped directory', () => {
    for (const dir of SHIPPED_DIRS) {
      assert.equal(needsPackageBump([`${dir}/x/file.md`]), true, dir);
    }
  });

  it('is false for docs, tests, .github, root files and empty input', () => {
    assert.equal(
      needsPackageBump([
        'docs/a.md',
        'tests/a.test.js',
        '.github/a.yml',
        'README.md',
        'eslint.config.js',
      ]),
      false,
    );
    assert.equal(needsPackageBump([]), false);
  });

  it('ignores dependency manifests anywhere, so Dependabot PRs are exempt', () => {
    assert.equal(
      needsPackageBump([
        'package.json',
        'package-lock.json',
        'servers/gmail/package.json',
        'servers/gmail/package-lock.json',
      ]),
      false,
    );
  });

  it('does not match a look-alike directory prefix', () => {
    assert.equal(needsPackageBump(['library/a.js', 'binary/a', 'skills-old/a.md']), false);
  });
});

describe('shippedChanges', () => {
  it('returns only the shipped paths, in order', () => {
    assert.deepEqual(shippedChanges(['docs/a.md', 'lib/b.js', 'bin/c.js']), [
      'lib/b.js',
      'bin/c.js',
    ]);
  });
});

describe('packageBumpError', () => {
  const changedPaths = ['lib/a.js'];

  it('is null when the version moved forward', () => {
    assert.equal(
      packageBumpError({ changedPaths, baseJson: pkg('1.0.0'), headJson: pkg('1.0.1') }),
      null,
    );
  });

  it('names the unchanged version and the shipped files', () => {
    const error = packageBumpError({
      changedPaths,
      baseJson: pkg('1.0.0'),
      headJson: pkg('1.0.0'),
    });
    assert.match(error, /shipped content changed \(lib\/a\.js\) but version stayed at '1\.0\.0'/);
  });

  it('truncates a long list of shipped files', () => {
    const many = ['lib/a.js', 'lib/b.js', 'lib/c.js', 'lib/d.js'];
    const error = packageBumpError({
      changedPaths: many,
      baseJson: pkg('1.0.0'),
      headJson: pkg('1.0.0'),
    });
    assert.match(error, /lib\/a\.js, lib\/b\.js, lib\/c\.js, …/);
  });

  it('reports a version that went backwards', () => {
    const error = packageBumpError({
      changedPaths,
      baseJson: pkg('1.0.0'),
      headJson: pkg('0.9.0'),
    });
    assert.match(error, /went backwards \('1\.0\.0' -> '0\.9\.0'\)/);
  });

  it('reports a missing or unreadable head package.json', () => {
    for (const headJson of [null, '{ not json', JSON.stringify({ name: 'p' })]) {
      assert.match(
        packageBumpError({ changedPaths, baseJson: pkg('1.0.0'), headJson }),
        /missing or unreadable/,
      );
    }
  });

  it('does not apply without shipped changes or without a base package.json version', () => {
    assert.equal(
      packageBumpError({
        changedPaths: ['docs/a.md'],
        baseJson: pkg('1.0.0'),
        headJson: pkg('1.0.0'),
      }),
      null,
    );
    assert.equal(packageBumpError({ changedPaths, baseJson: null, headJson: pkg('1.0.0') }), null);
    assert.equal(
      packageBumpError({ changedPaths, baseJson: '{ not json', headJson: pkg('1.0.0') }),
      null,
    );
  });
});
