/**
 * Unit tests for lib/aiconfig-resolve.js — pure .aiconfig.json field
 * resolution. No filesystem access anywhere here: projectRoot is just a
 * string the defaults' basename()/template logic uses, never a real path
 * that gets created or cleaned up.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';

import { resolveConfigValue } from '../../lib/aiconfig-resolve.js';

// Any string works — resolveConfigValue never touches disk. Only the
// project_name test below cares about its actual basename.
const FAKE_ROOT = '/fake/project/root';

describe('unit: aiconfig', () => {
  describe('resolveConfigValue()', () => {
    it('returns the configured value when set', () => {
      const config = { paths: { plans: 'docs/plans' } };
      assert.equal(resolveConfigValue(config, 'paths.plans', FAKE_ROOT), 'docs/plans');
    });

    it('falls back to a literal default when unset', () => {
      assert.equal(resolveConfigValue({}, 'paths.plans', FAKE_ROOT), 'plans');
    });

    it('never mutates or writes back to the config object', () => {
      const config = {};
      resolveConfigValue(config, 'paths.plans', FAKE_ROOT);
      assert.deepEqual(config, {});
    });

    it('throws for an unknown field with no default', () => {
      assert.throws(() => resolveConfigValue({}, 'not_a_real_field', FAKE_ROOT), /Unknown/);
    });

    describe('derived defaults', () => {
      it('paths.decisions defaults to "{resolved paths.knowledge}/decisions"', () => {
        assert.equal(resolveConfigValue({}, 'paths.decisions', FAKE_ROOT), 'knowledge/decisions');
      });

      it('a configured paths.knowledge shifts the paths.decisions default with it', () => {
        const config = { paths: { knowledge: 'notes' } };
        assert.equal(resolveConfigValue(config, 'paths.decisions', FAKE_ROOT), 'notes/decisions');
      });

      it('an explicit paths.decisions overrides the derived default entirely', () => {
        const config = { paths: { knowledge: 'notes', decisions: 'archive/decisions' } };
        assert.equal(resolveConfigValue(config, 'paths.decisions', FAKE_ROOT), 'archive/decisions');
      });

      it('paths.features nests under the resolved paths.plans', () => {
        const config = { paths: { plans: 'docs/plans' } };
        assert.equal(
          resolveConfigValue(config, 'paths.features', FAKE_ROOT),
          'docs/plans/features',
        );
      });

      it('an explicit paths.features overrides its nested default entirely', () => {
        const config = { paths: { plans: 'docs/plans', features: 'roadmap/features' } };
        assert.equal(resolveConfigValue(config, 'paths.features', FAKE_ROOT), 'roadmap/features');
      });

      it('paths.architecture and paths.research nest under the resolved paths.knowledge', () => {
        const config = { paths: { knowledge: 'notes' } };
        assert.equal(
          resolveConfigValue(config, 'paths.architecture', FAKE_ROOT),
          'notes/architecture',
        );
        assert.equal(resolveConfigValue(config, 'paths.research', FAKE_ROOT), 'notes/research');
      });

      it('project_shortname defaults to the resolved project_name', () => {
        const config = { project_name: 'Widget' };
        assert.equal(resolveConfigValue(config, 'project_shortname', FAKE_ROOT), 'Widget');
      });

      it('project_name defaults to the project root directory name', () => {
        assert.equal(resolveConfigValue({}, 'project_name', FAKE_ROOT), basename(FAKE_ROOT));
      });

      it('paths.worktrees defaults using the resolved project_shortname', () => {
        const config = { project_shortname: 'wid' };
        assert.equal(resolveConfigValue(config, 'paths.worktrees', FAKE_ROOT), '../worktrees/wid');
      });
    });
  });
});
