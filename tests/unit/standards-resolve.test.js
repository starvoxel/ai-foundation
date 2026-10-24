// ------------------------------
// standards-resolve.test.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Unit tests for the standards skill's resolver script
 * (skills/standards/scripts/resolve.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolve } from 'node:path';

import {
  DEFAULT_PROJECT_STANDARDS,
  parseStandard,
  projectOverridePath,
  resolveStandards,
} from '../../skills/standards/scripts/resolve.js';
import { DEFAULTS } from '../../lib/aiconfig-defaults.js';

const std = (name, tags, dependsOn = []) => ({ name, tags, dependsOn });

describe('unit: parseStandard', () => {
  it('reads name, flow-list tags, and depends_on', () => {
    const out = parseStandard(
      '---\nname: csharp_avalonia\ntags: [csharp, avalonia]\ndepends_on: [csharp_base]\n---\nBody',
    );
    assert.deepEqual(out, {
      name: 'csharp_avalonia',
      tags: ['csharp', 'avalonia'],
      dependsOn: ['csharp_base'],
    });
  });

  it('reads block lists and quoted values, and an empty depends_on', () => {
    const out = parseStandard("---\nname: 'x'\ntags:\n  - 'a'\n  - b\ndepends_on: []\n---");
    assert.deepEqual(out, { name: 'x', tags: ['a', 'b'], dependsOn: [] });
  });

  it('returns null without frontmatter or a name', () => {
    assert.equal(parseStandard('# no frontmatter'), null);
    assert.equal(parseStandard('---\ntags: [a]\n---'), null);
  });
});

describe('unit: resolveStandards', () => {
  const all = [
    std('csharp_base', ['csharp']),
    std('csharp_avalonia', ['csharp', 'avalonia'], ['csharp_base']),
    std('csharp_unity', ['csharp', 'unity'], ['csharp_base']),
  ];

  it("matches when all of a standard's tags are present and orders dependencies first", () => {
    assert.deepEqual(resolveStandards(all, ['csharp', 'avalonia']), [
      'csharp_base',
      'csharp_avalonia',
    ]);
  });

  it('skips a standard with a tag the project lacks', () => {
    assert.deepEqual(resolveStandards(all, ['csharp']), ['csharp_base']);
  });

  it('adds a dependency that did not match on its own', () => {
    const list = [std('top', ['x'], ['dep']), std('dep', ['unrelated'])];
    assert.deepEqual(resolveStandards(list, ['x']), ['dep', 'top']);
  });

  it('returns nothing when no tags are configured', () => {
    assert.deepEqual(resolveStandards(all, []), []);
  });

  it('throws on a missing dependency and on a cycle', () => {
    assert.throws(
      () => resolveStandards([std('a', ['x'], ['gone'])], ['x']),
      /Missing standard "gone"/,
    );
    assert.throws(
      () => resolveStandards([std('a', ['x'], ['b']), std('b', ['y'], ['a'])], ['x']),
      /cycle/i,
    );
  });
});

describe('unit: project standards override', () => {
  it('defaults to project-standards.md at the project root, as lib/aiconfig-defaults.js does', () => {
    assert.equal(DEFAULT_PROJECT_STANDARDS, DEFAULTS.project_standards);
    assert.equal(projectOverridePath({}), resolve('project-standards.md'));
  });

  it('uses the configured path when set', () => {
    assert.equal(
      projectOverridePath({ project_standards: 'docs/ours.md' }),
      resolve('docs/ours.md'),
    );
    assert.equal(projectOverridePath({ project_standards: '' }), resolve('project-standards.md'));
  });
});
