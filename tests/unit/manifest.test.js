import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import {
  manifestPath,
  parseManifest,
  serializeManifest,
  getManifestEntry,
  setManifestEntry,
  removeManifestEntry,
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
    it('parses valid YAML into an object', () => {
      const yaml = 'engineering_kiro:\n  version: "1.0.0"\n  files: []\n';
      const result = parseManifest(yaml);
      assert.deepEqual(result, { engineering_kiro: { version: '1.0.0', files: [] } });
    });

    it('returns empty object for empty YAML', () => {
      assert.deepEqual(parseManifest(''), {});
    });

    it('returns empty object for null-producing YAML', () => {
      assert.deepEqual(parseManifest('---\n'), {});
    });
  });

  describe('serializeManifest()', () => {
    it('produces valid YAML string', () => {
      const data = { test_kiro: { version: '1.0.0', files: [] } };
      const result = serializeManifest(data);
      assert.ok(result.includes('test_kiro'));
      assert.ok(result.includes('1.0.0'));
    });

    it('roundtrips with parseManifest', () => {
      const data = {
        a_kiro: { version: '1.0.0', files: [{ path: '/x/y.json', hash: 'sha256:abc' }] },
        b_kiro: { version: '2.0.0', files: [] },
      };
      const roundtripped = parseManifest(serializeManifest(data));
      assert.deepEqual(roundtripped, data);
    });
  });

  describe('getManifestEntry()', () => {
    const manifest = {
      engineering_kiro: { version: '1.0.0', files: [{ path: '/a', hash: 'h1' }] },
      product_kiro: { version: '2.0.0', files: [] },
    };

    it('returns the entry for an existing key', () => {
      assert.deepEqual(getManifestEntry(manifest, 'engineering_kiro'), {
        version: '1.0.0',
        files: [{ path: '/a', hash: 'h1' }],
      });
    });

    it('returns undefined for a missing key', () => {
      assert.equal(getManifestEntry(manifest, 'nonexistent'), undefined);
    });

    it('returns undefined for empty manifest', () => {
      assert.equal(getManifestEntry({}, 'anything'), undefined);
    });
  });

  describe('setManifestEntry()', () => {
    it('adds a new entry to an empty manifest', () => {
      const entry = { version: '1.0.0', files: [] };
      const result = setManifestEntry({}, 'eng_kiro', entry);
      assert.deepEqual(result, { eng_kiro: entry });
    });

    it('adds a new entry without affecting existing ones', () => {
      const existing = { a_kiro: { version: '1.0.0', files: [] } };
      const entry = { version: '2.0.0', files: [] };
      const result = setManifestEntry(existing, 'b_kiro', entry);
      assert.deepEqual(result.a_kiro, { version: '1.0.0', files: [] });
      assert.deepEqual(result.b_kiro, entry);
    });

    it('overwrites an existing entry', () => {
      const existing = { a_kiro: { version: '1.0.0', files: [] } };
      const updated = { version: '1.1.0', files: [{ path: '/x', hash: 'y' }] };
      const result = setManifestEntry(existing, 'a_kiro', updated);
      assert.deepEqual(result.a_kiro, updated);
    });

    it('does not mutate the original manifest', () => {
      const existing = { a_kiro: { version: '1.0.0', files: [] } };
      setManifestEntry(existing, 'b_kiro', { version: '2.0.0', files: [] });
      assert.equal(existing.b_kiro, undefined);
    });
  });

  describe('removeManifestEntry()', () => {
    it('removes an existing key and returns removed: true', () => {
      const manifest = { a_kiro: { version: '1.0.0', files: [] }, b_kiro: { version: '2.0.0', files: [] } };
      const result = removeManifestEntry(manifest, 'a_kiro');
      assert.equal(result.removed, true);
      assert.equal(result.manifest.a_kiro, undefined);
      assert.deepEqual(result.manifest.b_kiro, { version: '2.0.0', files: [] });
    });

    it('returns removed: false for a missing key', () => {
      const manifest = { a_kiro: { version: '1.0.0', files: [] } };
      const result = removeManifestEntry(manifest, 'nonexistent');
      assert.equal(result.removed, false);
      assert.deepEqual(result.manifest, manifest);
    });

    it('returns removed: false for empty manifest', () => {
      const result = removeManifestEntry({}, 'anything');
      assert.equal(result.removed, false);
    });

    it('does not mutate the original manifest', () => {
      const manifest = { a_kiro: { version: '1.0.0', files: [] } };
      removeManifestEntry(manifest, 'a_kiro');
      assert.ok('a_kiro' in manifest);
    });
  });
});
