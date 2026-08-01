import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  manifestPath,
  readManifest,
  writeManifest,
  getEntry,
  setEntry,
  removeEntry,
} from '../../lib/manifest.js';
import { MANIFEST_FILENAME } from '../../lib/constants.js';

describe('lib/manifest', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aif-manifest-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('manifestPath()', () => {
    it('returns repo root joined with manifest filename', () => {
      const result = manifestPath('/some/repo');
      assert.equal(result, join('/some/repo', MANIFEST_FILENAME));
    });
  });

  describe('readManifest()', () => {
    it('returns empty object when file does not exist', () => {
      const result = readManifest(tmpDir);
      assert.deepEqual(result, {});
    });

    it('reads and parses existing YAML manifest', () => {
      const data = { engineering_kiro: { version: '1.0.0', files: [] } };
      writeManifest(tmpDir, data);

      const result = readManifest(tmpDir);
      assert.deepEqual(result, data);
    });
  });

  describe('writeManifest()', () => {
    it('creates the file if it does not exist', () => {
      writeManifest(tmpDir, { test_kiro: { version: '0.1.0', files: [] } });

      const content = readFileSync(manifestPath(tmpDir), 'utf8');
      assert.ok(content.includes('test_kiro'));
    });

    it('overwrites existing content', () => {
      writeManifest(tmpDir, { first: { version: '1.0.0', files: [] } });
      writeManifest(tmpDir, { second: { version: '2.0.0', files: [] } });

      const result = readManifest(tmpDir);
      assert.equal(result.first, undefined);
      assert.deepEqual(result.second, { version: '2.0.0', files: [] });
    });
  });

  describe('getEntry()', () => {
    it('returns undefined for missing key', () => {
      const result = getEntry(tmpDir, 'nonexistent');
      assert.equal(result, undefined);
    });

    it('returns the entry for an existing key', () => {
      const entry = { version: '1.0.0', files: [{ path: '/a/b.json', hash: 'abc' }] };
      setEntry(tmpDir, 'engineering_kiro', entry);

      const result = getEntry(tmpDir, 'engineering_kiro');
      assert.deepEqual(result, entry);
    });
  });

  describe('setEntry()', () => {
    it('creates a new entry in an empty manifest', () => {
      const entry = { version: '1.0.0', files: [] };
      setEntry(tmpDir, 'engineering_kiro', entry);

      const manifest = readManifest(tmpDir);
      assert.deepEqual(manifest.engineering_kiro, entry);
    });

    it('updates an existing entry without affecting others', () => {
      setEntry(tmpDir, 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(tmpDir, 'b_kiro', { version: '2.0.0', files: [] });
      setEntry(tmpDir, 'a_kiro', { version: '1.1.0', files: [{ path: '/x', hash: 'y' }] });

      const manifest = readManifest(tmpDir);
      assert.equal(manifest.a_kiro.version, '1.1.0');
      assert.equal(manifest.b_kiro.version, '2.0.0');
    });
  });

  describe('removeEntry()', () => {
    it('returns false when key does not exist', () => {
      const result = removeEntry(tmpDir, 'nonexistent');
      assert.equal(result, false);
    });

    it('removes the entry and returns true', () => {
      setEntry(tmpDir, 'engineering_kiro', { version: '1.0.0', files: [] });

      const result = removeEntry(tmpDir, 'engineering_kiro');
      assert.equal(result, true);
      assert.equal(getEntry(tmpDir, 'engineering_kiro'), undefined);
    });

    it('does not affect other entries', () => {
      setEntry(tmpDir, 'a_kiro', { version: '1.0.0', files: [] });
      setEntry(tmpDir, 'b_kiro', { version: '2.0.0', files: [] });

      removeEntry(tmpDir, 'a_kiro');

      const manifest = readManifest(tmpDir);
      assert.equal(manifest.a_kiro, undefined);
      assert.deepEqual(manifest.b_kiro, { version: '2.0.0', files: [] });
    });
  });
});
