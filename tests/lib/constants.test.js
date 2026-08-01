import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { homedir } from 'node:os';

import {
  SOURCE_DIRS,
  KIRO_TARGETS,
  manifestKey,
} from '../../lib/constants.js';

describe('lib/constants', () => {
  describe('SOURCE_DIRS', () => {
    it('values are relative directory names', () => {
      for (const value of Object.values(SOURCE_DIRS)) {
        assert.equal(typeof value, 'string');
        assert.ok(!value.startsWith('/'), `${value} should not be absolute`);
        assert.ok(!value.startsWith('.'), `${value} should not start with dot`);
      }
    });
  });

  describe('KIRO_TARGETS', () => {
    it('all paths are under ~/.kiro', () => {
      const kiroBase = join(homedir(), '.kiro');
      for (const [key, value] of Object.entries(KIRO_TARGETS)) {
        assert.ok(
          value.startsWith(kiroBase),
          `KIRO_TARGETS.${key} should be under ~/.kiro, got ${value}`
        );
      }
    });
  });

  describe('manifestKey()', () => {
    it('joins bundle and harness with underscore', () => {
      assert.equal(manifestKey('engineering', 'kiro'), 'engineering_kiro');
    });

    it('preserves kebab-case in both parts', () => {
      assert.equal(manifestKey('my-bundle', 'claude-code'), 'my-bundle_claude-code');
    });
  });
});
