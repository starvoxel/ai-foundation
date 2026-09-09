import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SOURCE_DIRS, manifestKey } from '../../lib/constants.js';

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

  describe('manifestKey()', () => {
    it('joins bundle and harness with underscore', () => {
      assert.equal(manifestKey('engineering', 'kiro'), 'engineering_kiro');
    });

    it('preserves kebab-case in both parts', () => {
      assert.equal(manifestKey('my-bundle', 'claude-code'), 'my-bundle_claude-code');
    });
  });
});
