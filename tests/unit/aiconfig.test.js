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
      it('paths.research defaults to "{resolved paths.knowledge}/research"', () => {
        assert.equal(resolveConfigValue({}, 'paths.research', FAKE_ROOT), 'knowledge/research');
      });

      it('a configured paths.knowledge shifts the paths.research default with it', () => {
        const config = { paths: { knowledge: 'notes' } };
        assert.equal(resolveConfigValue(config, 'paths.research', FAKE_ROOT), 'notes/research');
      });

      it('an explicit paths.research overrides the derived default entirely', () => {
        const config = { paths: { knowledge: 'notes', research: 'archive/research' } };
        assert.equal(resolveConfigValue(config, 'paths.research', FAKE_ROOT), 'archive/research');
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
    });

    describe('{key.path} references in configured values', () => {
      it('substitutes a reference to another configured field', () => {
        const config = { paths: { plans: 'docs/plans', reports: '{paths.plans}/reports' } };
        assert.equal(resolveConfigValue(config, 'paths.reports', FAKE_ROOT), 'docs/plans/reports');
      });

      it('substitutes a reference to another field default', () => {
        const config = { paths: { reports: '{paths.plans}/reports' } };
        assert.equal(resolveConfigValue(config, 'paths.reports', FAKE_ROOT), 'plans/reports');
      });

      it('resolves multiple references in one value', () => {
        const config = {
          paths: {
            plans: 'docs/plans',
            knowledge: 'docs/knowledge',
            shared: '{paths.plans}+{paths.knowledge}',
          },
        };
        assert.equal(
          resolveConfigValue(config, 'paths.shared', FAKE_ROOT),
          'docs/plans+docs/knowledge',
        );
      });

      it('resolves a reference that itself contains a reference', () => {
        const config = {
          paths: {
            plans: 'docs/plans',
            reports: '{paths.plans}/reports',
            spikes: '{paths.reports}/spikes',
          },
        };
        assert.equal(
          resolveConfigValue(config, 'paths.spikes', FAKE_ROOT),
          'docs/plans/reports/spikes',
        );
      });

      it('throws for a direct self-reference', () => {
        const config = { paths: { plans: '{paths.plans}/x' } };
        assert.throws(() => resolveConfigValue(config, 'paths.plans', FAKE_ROOT), /Circular/);
      });

      it('throws for an indirect cycle', () => {
        const config = { paths: { plans: '{paths.epics}', epics: '{paths.plans}' } };
        assert.throws(() => resolveConfigValue(config, 'paths.plans', FAKE_ROOT), /Circular/);
      });

      it('throws when a configured override creates a cycle through a derived default', () => {
        // paths.research defaults to nesting under paths.knowledge; pointing
        // paths.knowledge back at paths.research closes the loop.
        const config = { paths: { knowledge: '{paths.research}' } };
        assert.throws(() => resolveConfigValue(config, 'paths.research', FAKE_ROOT), /Circular/);
      });

      it('propagates an unknown field referenced inside a placeholder', () => {
        const config = { paths: { reports: '{paths.not_a_real_field}' } };
        assert.throws(() => resolveConfigValue(config, 'paths.reports', FAKE_ROOT), /Unknown/);
      });
    });
  });
});
