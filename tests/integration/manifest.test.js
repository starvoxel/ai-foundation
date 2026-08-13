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
    it('returns a normalized empty manifest when file does not exist', () => {
      const result = readManifest(repo);
      assert.deepEqual(result, { bundles: {}, servers: {}, hooks: {} });
    });

    it('reads and parses existing YAML manifest', () => {
      const data = { bundles: { engineering_kiro: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} };
      writeManifest(repo, data);

      const result = readManifest(repo);
      assert.deepEqual(result, data);
    });
  });

  describe('writeManifest()', () => {
    it('creates the file if it does not exist', () => {
      writeManifest(repo, { bundles: { test_kiro: { version: '0.1.0', files: [] } }, servers: {}, hooks: {} });

      const content = readFileSync(manifestPath(repo), 'utf8');
      assert.ok(content.includes('test_kiro'));
    });

    it('overwrites existing content', () => {
      writeManifest(repo, { bundles: { first: { version: '1.0.0', files: [] } }, servers: {}, hooks: {} });
      writeManifest(repo, { bundles: { second: { version: '2.0.0', files: [] } }, servers: {}, hooks: {} });

      const result = readManifest(repo);
      assert.equal(result.bundles.first, undefined);
      assert.deepEqual(result.bundles.second, { version: '2.0.0', files: [] });
    });
  });

  describe('getEntry()', () => {
    it('returns undefined for missing key', () => {
      const result = getEntry(repo, 'bundles', 'nonexistent');
      assert.equal(result, undefined);
    });

    it('returns the entry for an existing key', () => {
      const entry = { version: '1.0.0', files: [{ path: '/a/b.json', hash: 'abc' }] };
      setEntry(repo, 'bundles', 'engineering_kiro', entry);

      const result = getEntry(repo, 'bundles', 'engineering_kiro');
      assert.deepEqual(result, entry);
    });

    it('reads from the servers section independently of bundles', () => {
      setEntry(repo, 'servers', 'git_kiro', { files: [], installedBy: ['engineering'] });
      const result = getEntry(repo, 'servers', 'git_kiro');
      assert.deepEqual(result, { files: [], installedBy: ['engineering'] });
      assert.equal(getEntry(repo, 'bundles', 'git_kiro'), undefined);
    });
  });

  describe('setEntry()', () => {
    it('creates a new entry in an empty manifest', () => {
      const entry = { version: '1.0.0', files: [] };
      setEntry(repo, 'bundles', 'engineering_kiro', entry);

      const manifest = readManifest(repo);
      assert.deepEqual(manifest.bundles.engineering_kiro, entry);
    });

    it('updates an existing entry without affecting others', () => {
      setEntry(repo, 'bundles', 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(repo, 'bundles', 'b_kiro', { version: '2.0.0', files: [] });
      setEntry(repo, 'bundles', 'a_kiro', { version: '1.1.0', files: [{ path: '/x', hash: 'y' }] });

      const manifest = readManifest(repo);
      assert.equal(manifest.bundles.a_kiro.version, '1.1.0');
      assert.equal(manifest.bundles.b_kiro.version, '2.0.0');
    });
  });

  describe('removeEntry()', () => {
    it('returns false when key does not exist', () => {
      const result = removeEntry(repo, 'bundles', 'nonexistent');
      assert.equal(result, false);
    });

    it('removes the entry and returns true', () => {
      setEntry(repo, 'bundles', 'engineering_kiro', { version: '1.0.0', files: [] });

      const result = removeEntry(repo, 'bundles', 'engineering_kiro');
      assert.equal(result, true);
      assert.equal(getEntry(repo, 'bundles', 'engineering_kiro'), undefined);
    });

    it('does not affect other entries', () => {
      setEntry(repo, 'bundles', 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(repo, 'bundles', 'b_kiro', { version: '2.0.0', files: [] });

      removeEntry(repo, 'bundles', 'a_kiro');

      const manifest = readManifest(repo);
      assert.equal(manifest.bundles.a_kiro, undefined);
      assert.deepEqual(manifest.bundles.b_kiro, { version: '2.0.0', files: [] });
    });

    it('does not affect the servers section', () => {
      setEntry(repo, 'bundles', 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(repo, 'servers', 'git_kiro', { files: [], installedBy: ['a'] });

      removeEntry(repo, 'bundles', 'a_kiro');

      const manifest = readManifest(repo);
      assert.equal(manifest.bundles.a_kiro, undefined);
      assert.deepEqual(manifest.servers.git_kiro, { files: [], installedBy: ['a'] });
    });
  });
});
