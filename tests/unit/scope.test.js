// ------------------------------
// scope.test.js
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { manifestLocation, parseScope, ScopeError } from '../../lib/scope.js';
import { fromStoredPath, mapManifestPaths, toStoredPath } from '../../lib/manifest.js';
import { splitProjectInstalled } from '../../lib/commands/install.js';
import { diffInstall, diffMcpServers } from '../../lib/commands/install-check.js';
import { isDefaultBundle } from '../../lib/resolver.js';

describe('parseScope', () => {
  it('defaults to global when absent', () => {
    assert.equal(parseScope(undefined), 'global');
  });

  it('accepts global and project', () => {
    assert.equal(parseScope('global'), 'global');
    assert.equal(parseScope('project'), 'project');
  });

  it('rejects an unknown scope, a bare flag, and the old name "user"', () => {
    assert.throws(() => parseScope('user'), ScopeError);
    assert.throws(() => parseScope(true), ScopeError);
    assert.throws(() => parseScope(''), ScopeError);
  });
});

describe('manifestLocation', () => {
  it('keeps the global manifest at the ai-foundation root with absolute paths', () => {
    assert.deepEqual(manifestLocation('global', 'claude', '/aif', '/proj'), {
      dir: '/aif',
      base: null,
    });
  });

  it('puts a project manifest in the harness directory, relative to the project', () => {
    assert.deepEqual(manifestLocation('project', 'claude', '/aif', '/proj'), {
      dir: join('/proj', '.claude'),
      base: '/proj',
    });
    assert.equal(manifestLocation('project', 'kiro', '/aif', '/proj').dir, join('/proj', '.kiro'));
  });
});

describe('stored manifest paths', () => {
  it('round-trips a project path through its stored, forward-slash form', () => {
    const abs = join('/proj', '.claude', 'agents', 'a.md');
    assert.equal(toStoredPath(abs, '/proj'), '.claude/agents/a.md');
    assert.equal(fromStoredPath('.claude/agents/a.md', '/proj'), abs);
  });

  it('leaves an absolute stored path unchanged', () => {
    assert.equal(fromStoredPath('/home/u/.claude/a.md', '/proj'), '/home/u/.claude/a.md');
  });

  it('maps every file path in every section and keeps other fields', () => {
    const manifest = {
      bundles: { b_claude: { version: '1.0.0', files: [{ path: 'x', hash: 'h' }] } },
      servers: { s_claude: { installedBy: ['b'], files: [{ path: 'y', hash: 'h' }] } },
      hooks: { k_claude: { files: [] } },
    };
    const mapped = mapManifestPaths(manifest, (p) => `/root/${p}`);
    assert.equal(mapped.bundles.b_claude.files[0].path, '/root/x');
    assert.equal(mapped.bundles.b_claude.version, '1.0.0');
    assert.equal(mapped.servers.s_claude.files[0].path, '/root/y');
    assert.deepEqual(mapped.servers.s_claude.installedBy, ['b']);
    assert.equal(manifest.bundles.b_claude.files[0].path, 'x', 'input is not mutated');
  });

  it('normalizes an empty manifest', () => {
    assert.deepEqual(
      mapManifestPaths(/** @type {any} */ (null), (p) => p),
      {
        bundles: {},
        servers: {},
        hooks: {},
      },
    );
  });
});

describe('splitProjectInstalled', () => {
  const projectManifest = { bundles: { engineering_claude: {} }, servers: {}, hooks: {} };

  it('skips bundles the project installs for the same harness', () => {
    assert.deepEqual(
      splitProjectInstalled(['engineering', 'ai-engineering'], projectManifest, 'claude'),
      { keep: ['ai-engineering'], skip: ['engineering'] },
    );
  });

  it('keeps a bundle installed in the project for a different harness', () => {
    assert.deepEqual(splitProjectInstalled(['engineering'], projectManifest, 'kiro'), {
      keep: ['engineering'],
      skip: [],
    });
  });

  it('handles an empty bundle list', () => {
    assert.deepEqual(splitProjectInstalled([], projectManifest, 'claude'), { keep: [], skip: [] });
  });
});

describe('diffInstall', () => {
  it('reports nothing when the project matches a fresh install', () => {
    assert.deepEqual(diffInstall({ a: 'h1' }, { a: 'h1' }, ['a']), {
      changed: [],
      missing: [],
      retired: [],
    });
  });

  it('reports changed, missing and retired files, sorted', () => {
    const fresh = { b: 'h2', a: 'h1', c: 'h3' };
    const onDisk = { a: 'other', b: 'h2', c: null, old: 'h9', gone: null };
    assert.deepEqual(diffInstall(fresh, onDisk, ['a', 'b', 'old', 'gone']), {
      changed: ['a'],
      missing: ['c'],
      retired: ['old'],
    });
  });

  it('treats an empty fresh install as everything recorded being retired', () => {
    assert.deepEqual(diffInstall({}, { x: 'h' }, ['x']), {
      changed: [],
      missing: [],
      retired: ['x'],
    });
  });
});

describe('isDefaultBundle', () => {
  it('is true only for default: true', () => {
    assert.equal(isDefaultBundle({ name: 'e', default: true }), true);
    assert.equal(isDefaultBundle({ name: 'e', default: 'true' }), false);
    assert.equal(isDefaultBundle({ name: 'e' }), false);
    assert.equal(isDefaultBundle(null), false);
  });
});

describe('diffMcpServers', () => {
  const web = { type: 'http', url: 'https://a' };

  it('ignores key order and entries the project added', () => {
    const committed = { web: { url: 'https://a', type: 'http' }, mine: { url: 'x' } };
    assert.deepEqual(diffMcpServers({ web }, committed, ['web'], '.mcp.json'), {
      changed: [],
      missing: [],
      retired: [],
    });
  });

  it('reports changed, missing and retired aif entries', () => {
    const fresh = { web: { ...web, url: 'https://b' }, added: web };
    const committed = { web, old: web, mine: web };
    assert.deepEqual(diffMcpServers(fresh, committed, ['web', 'old'], 'f'), {
      changed: ['f#web'],
      missing: ['f#added'],
      retired: ['f#old'],
    });
  });

  it('handles empty settings', () => {
    assert.deepEqual(diffMcpServers({}, {}, [], 'f'), { changed: [], missing: [], retired: [] });
  });
});
