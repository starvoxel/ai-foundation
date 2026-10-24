import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { manifestPath, readManifest, writeManifest } from '../../lib/manifest.js';
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
      const data = {
        bundles: { engineering_kiro: { version: '1.0.0', files: [] } },
        servers: {},
        hooks: {},
      };
      writeManifest(repo, data);

      const result = readManifest(repo);
      assert.deepEqual(result, data);
    });
  });

  describe('writeManifest()', () => {
    it('creates the file if it does not exist', () => {
      writeManifest(repo, {
        bundles: { test_kiro: { version: '0.1.0', files: [] } },
        servers: {},
        hooks: {},
      });

      const content = readFileSync(manifestPath(repo), 'utf8');
      assert.ok(content.includes('test_kiro'));
    });

    it('overwrites existing content', () => {
      writeManifest(repo, {
        bundles: { first: { version: '1.0.0', files: [] } },
        servers: {},
        hooks: {},
      });
      writeManifest(repo, {
        bundles: { second: { version: '2.0.0', files: [] } },
        servers: {},
        hooks: {},
      });

      const result = readManifest(repo);
      assert.equal(result.bundles.first, undefined);
      assert.deepEqual(result.bundles.second, { version: '2.0.0', files: [] });
    });
  });
});
