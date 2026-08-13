import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  manifestPath,
  parseManifest,
  serializeManifest,
  getSectionEntry,
  setSectionEntry,
  removeSectionEntry,
  addOwner,
  removeOwner,
} from '../../lib/manifest.js';
import { MANIFEST_FILENAME } from '../../lib/constants.js';

describe('unit: manifest', () => {
  describe('manifestPath()', () => {
    it('joins repo root with manifest filename', () => {
      assert.equal(manifestPath('/some/repo'), join('/some/repo', MANIFEST_FILENAME));
    });

    it('works with Windows-style paths', () => {
      const result = manifestPath('C:\\Users\\dev\\project');
      assert.ok(result.endsWith(MANIFEST_FILENAME));
    });
  });

  describe('parseManifest()', () => {
    it('parses valid YAML into a normalized sectioned object', () => {
      const yaml = 'bundles:\n  engineering_kiro:\n    version: "1.0.0"\n    files: []\n';
      const result = parseManifest(yaml);
      assert.deepEqual(result, {
        bundles: { engineering_kiro: { version: '1.0.0', files: [] } },
        servers: {},
        hooks: {},
      });
    });

    it('returns a normalized empty manifest for empty YAML', () => {
      assert.deepEqual(parseManifest(''), { bundles: {}, servers: {}, hooks: {} });
    });

    it('returns a normalized empty manifest for null-producing YAML', () => {
      assert.deepEqual(parseManifest('---\n'), { bundles: {}, servers: {}, hooks: {} });
    });
  });

  describe('serializeManifest()', () => {
    it('produces valid YAML string with all sections', () => {
      const data = { bundles: { test_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      const result = serializeManifest(data);
      assert.ok(result.includes('bundles'));
      assert.ok(result.includes('test_kiro'));
      assert.ok(result.includes('servers'));
      assert.ok(result.includes('hooks'));
    });

    it('roundtrips with parseManifest', () => {
      const data = {
        bundles: {
          a_kiro: { version: '1.0.0', files: [{ path: '/x/y.json', hash: 'sha256:abc' }] },
          b_kiro: { version: '2.0.0', files: [] },
        },
        servers: {
          git_kiro: { files: [], installedBy: ['a'] },
        },
        hooks: {},
      };
      const roundtripped = parseManifest(serializeManifest(data));
      assert.deepEqual(roundtripped, data);
    });
  });

  describe('getSectionEntry()', () => {
    const manifest = {
      bundles: {
        engineering_kiro: { version: '1.0.0', files: [{ path: '/a', hash: 'h1' }] },
        product_kiro: { version: '2.0.0', files: [] },
      },
      servers: {
        git_kiro: { files: [], installedBy: ['engineering'] },
      },
      hooks: {},
    };

    it('returns the entry for an existing key in the bundles section', () => {
      assert.deepEqual(getSectionEntry(manifest, 'bundles', 'engineering_kiro'), {
        version: '1.0.0',
        files: [{ path: '/a', hash: 'h1' }],
      });
    });

    it('returns the entry for an existing key in the servers section', () => {
      assert.deepEqual(getSectionEntry(manifest, 'servers', 'git_kiro'), {
        files: [],
        installedBy: ['engineering'],
      });
    });

    it('returns undefined for a missing key', () => {
      assert.equal(getSectionEntry(manifest, 'bundles', 'nonexistent'), undefined);
    });

    it('returns undefined for an empty manifest', () => {
      assert.equal(getSectionEntry({}, 'bundles', 'anything'), undefined);
    });
  });

  describe('setSectionEntry()', () => {
    it('adds a new entry to an empty manifest', () => {
      const entry = { version: '1.0.0', files: [] };
      const result = setSectionEntry({}, 'bundles', 'eng_kiro', entry);
      assert.deepEqual(result.bundles, { eng_kiro: entry });
      assert.deepEqual(result.servers, {});
      assert.deepEqual(result.hooks, {});
    });

    it('adds a new entry without affecting existing ones', () => {
      const existing = { bundles: { a_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      const entry = { version: '2.0.0', files: [] };
      const result = setSectionEntry(existing, 'bundles', 'b_kiro', entry);
      assert.deepEqual(result.bundles.a_kiro, { version: '1.0.0', files: [] });
      assert.deepEqual(result.bundles.b_kiro, entry);
    });

    it('overwrites an existing entry', () => {
      const existing = { bundles: { a_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      const updated = { version: '1.1.0', files: [{ path: '/x', hash: 'y' }] };
      const result = setSectionEntry(existing, 'bundles', 'a_kiro', updated);
      assert.deepEqual(result.bundles.a_kiro, updated);
    });

    it('writes into the servers section independently of bundles', () => {
      const existing = { bundles: { a_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      const result = setSectionEntry(existing, 'servers', 'git_kiro', { files: [], installedBy: ['a'] });
      assert.deepEqual(result.servers.git_kiro, { files: [], installedBy: ['a'] });
      assert.deepEqual(result.bundles.a_kiro, { version: '1.0.0', files: [] });
    });

    it('does not mutate the original manifest', () => {
      const existing = { bundles: { a_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      setSectionEntry(existing, 'bundles', 'b_kiro', { version: '2.0.0', files: [] });
      assert.equal(existing.bundles.b_kiro, undefined);
    });
  });

  describe('removeSectionEntry()', () => {
    it('removes an existing key and returns removed: true', () => {
      const manifest = {
        bundles: { a_kiro: { version: '1.0.0', files: [] }, b_kiro: { version: '2.0.0', files: [] } },
        servers: {},
        hooks: {},
      };
      const result = removeSectionEntry(manifest, 'bundles', 'a_kiro');
      assert.equal(result.removed, true);
      assert.equal(result.manifest.bundles.a_kiro, undefined);
      assert.deepEqual(result.manifest.bundles.b_kiro, { version: '2.0.0', files: [] });
    });

    it('returns removed: false for a missing key', () => {
      const manifest = { bundles: { a_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      const result = removeSectionEntry(manifest, 'bundles', 'nonexistent');
      assert.equal(result.removed, false);
      assert.deepEqual(result.manifest, manifest);
    });

    it('returns removed: false for empty manifest', () => {
      const result = removeSectionEntry({}, 'bundles', 'anything');
      assert.equal(result.removed, false);
    });

    it('does not mutate the original manifest', () => {
      const manifest = { bundles: { a_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      removeSectionEntry(manifest, 'bundles', 'a_kiro');
      assert.ok('a_kiro' in manifest.bundles);
    });

    it('removes a servers entry independently of bundles', () => {
      const manifest = {
        bundles: { a_kiro: { version: '1.0.0', files: [] } },
        servers: { git_kiro: { files: [], installedBy: [] } },
        hooks: {},
      };
      const result = removeSectionEntry(manifest, 'servers', 'git_kiro');
      assert.equal(result.removed, true);
      assert.equal(result.manifest.servers.git_kiro, undefined);
      assert.ok('a_kiro' in result.manifest.bundles);
    });
  });

  describe('addOwner()', () => {
    it('adds a bundle name to an empty list', () => {
      assert.deepEqual(addOwner(undefined, 'engineering'), ['engineering']);
      assert.deepEqual(addOwner([], 'engineering'), ['engineering']);
    });

    it('appends without duplicating an existing owner', () => {
      assert.deepEqual(addOwner(['a'], 'b'), ['a', 'b']);
      assert.deepEqual(addOwner(['a', 'b'], 'a'), ['a', 'b']);
    });

    it('does not mutate the input array', () => {
      const original = ['a'];
      addOwner(original, 'b');
      assert.deepEqual(original, ['a']);
    });
  });

  describe('removeOwner()', () => {
    it('removes the named owner', () => {
      assert.deepEqual(removeOwner(['a', 'b'], 'a'), ['b']);
    });

    it('returns an empty array when the last owner is removed', () => {
      assert.deepEqual(removeOwner(['a'], 'a'), []);
    });

    it('is a no-op when the name is not present', () => {
      assert.deepEqual(removeOwner(['a', 'b'], 'c'), ['a', 'b']);
    });

    it('handles an undefined list', () => {
      assert.deepEqual(removeOwner(undefined, 'a'), []);
    });

    it('does not mutate the input array', () => {
      const original = ['a', 'b'];
      removeOwner(original, 'a');
      assert.deepEqual(original, ['a', 'b']);
    });
  });
});
