import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  manifestPath,
  readManifest,
  writeManifest,
  getEntry,
  setEntry,
  removeEntry,
} from '../../lib/manifest.js';
import { MANIFEST_FILENAME } from '../../lib/constants.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

describe('lib/manifest', () => {
  let repo;

  beforeEach(() => {
    repo = createTempRepo();
  });

  afterEach(() => {
    destroyTempRepo(repo);
  });

  describe('manifestPath()', () => {
    it('returns repo root joined with manifest filename', () => {
      const result = manifestPath('/some/repo');
      assert.equal(result, join('/some/repo', MANIFEST_FILENAME));
    });
  });

  describe('readManifest()', () => {
    it('returns empty object when file does not exist', () => {
      const result = readManifest(repo);
      assert.deepEqual(result, {});
    });

    it('reads and parses existing YAML manifest', () => {
      const data = { engineering_kiro: { version: '1.0.0', files: [] } };
      writeManifest(repo, data);

      const result = readManifest(repo);
      assert.deepEqual(result, data);
    });
  });

  describe('writeManifest()', () => {
    it('creates the file if it does not exist', () => {
      writeManifest(repo, { test_kiro: { version: '0.1.0', files: [] } });

      const content = readFileSync(manifestPath(repo), 'utf8');
      assert.ok(content.includes('test_kiro'));
    });

    it('overwrites existing content', () => {
      writeManifest(repo, { first: { version: '1.0.0', files: [] } });
      writeManifest(repo, { second: { version: '2.0.0', files: [] } });

      const result = readManifest(repo);
      assert.equal(result.first, undefined);
      assert.deepEqual(result.second, { version: '2.0.0', files: [] });
    });
  });

  describe('getEntry()', () => {
    it('returns undefined for missing key', () => {
      const result = getEntry(repo, 'nonexistent');
      assert.equal(result, undefined);
    });

    it('returns the entry for an existing key', () => {
      const entry = { version: '1.0.0', files: [{ path: '/a/b.json', hash: 'abc' }] };
      setEntry(repo, 'engineering_kiro', entry);

      const result = getEntry(repo, 'engineering_kiro');
      assert.deepEqual(result, entry);
    });
  });

  describe('setEntry()', () => {
    it('creates a new entry in an empty manifest', () => {
      const entry = { version: '1.0.0', files: [] };
      setEntry(repo, 'engineering_kiro', entry);

      const manifest = readManifest(repo);
      assert.deepEqual(manifest.engineering_kiro, entry);
    });

    it('updates an existing entry without affecting others', () => {
      setEntry(repo, 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(repo, 'b_kiro', { version: '2.0.0', files: [] });
      setEntry(repo, 'a_kiro', { version: '1.1.0', files: [{ path: '/x', hash: 'y' }] });

      const manifest = readManifest(repo);
      assert.equal(manifest.a_kiro.version, '1.1.0');
      assert.equal(manifest.b_kiro.version, '2.0.0');
    });
  });

  describe('removeEntry()', () => {
    it('returns false when key does not exist', () => {
      const result = removeEntry(repo, 'nonexistent');
      assert.equal(result, false);
    });

    it('removes the entry and returns true', () => {
      setEntry(repo, 'engineering_kiro', { version: '1.0.0', files: [] });

      const result = removeEntry(repo, 'engineering_kiro');
      assert.equal(result, true);
      assert.equal(getEntry(repo, 'engineering_kiro'), undefined);
    });

    it('does not affect other entries', () => {
      setEntry(repo, 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(repo, 'b_kiro', { version: '2.0.0', files: [] });

      removeEntry(repo, 'a_kiro');

      const manifest = readManifest(repo);
      assert.equal(manifest.a_kiro, undefined);
      assert.deepEqual(manifest.b_kiro, { version: '2.0.0', files: [] });
    });
  });
});
