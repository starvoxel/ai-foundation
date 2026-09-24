/**
 * Unit tests for lib/aiconfig.js — deterministic .aiconfig.json resolution.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  loadAiConfig,
  resolveConfigValue,
  getConfigValue,
  getConfigPath,
  findProjectRoot,
} from '../../lib/aiconfig.js';

describe('unit: aiconfig', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'aiconfig-test-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  describe('loadAiConfig()', () => {
    it('returns {} when .aiconfig.json is absent', () => {
      assert.deepEqual(loadAiConfig(projectRoot), {});
    });

    it('parses an existing .aiconfig.json', () => {
      writeFileSync(join(projectRoot, '.aiconfig.json'), JSON.stringify({ project_name: 'x' }));
      assert.deepEqual(loadAiConfig(projectRoot), { project_name: 'x' });
    });

    it('throws a descriptive error for invalid JSON', () => {
      writeFileSync(join(projectRoot, '.aiconfig.json'), '{ not json');
      assert.throws(() => loadAiConfig(projectRoot), /not valid JSON/);
    });
  });

  describe('resolveConfigValue() / getConfigValue()', () => {
    it('returns the configured value when set', () => {
      const config = { paths: { plans: 'docs/plans' } };
      assert.equal(resolveConfigValue(config, 'paths.plans', projectRoot), 'docs/plans');
    });

    it('falls back to a literal default when unset', () => {
      assert.equal(resolveConfigValue({}, 'paths.plans', projectRoot), 'plans');
    });

    it('never mutates or writes back to the config object', () => {
      const config = {};
      resolveConfigValue(config, 'paths.plans', projectRoot);
      assert.deepEqual(config, {});
    });

    it('throws for an unknown field with no default', () => {
      assert.throws(() => resolveConfigValue({}, 'not_a_real_field', projectRoot), /Unknown/);
    });

    it('getConfigValue loads .aiconfig.json and resolves a field', () => {
      writeFileSync(
        join(projectRoot, '.aiconfig.json'),
        JSON.stringify({ paths: { chunks: 'custom/chunks' } }),
      );
      assert.equal(getConfigValue(projectRoot, 'paths.chunks'), 'custom/chunks');
      assert.equal(getConfigValue(projectRoot, 'paths.epics'), 'plans/epics');
    });

    describe('derived defaults', () => {
      it('paths.decisions defaults to "{resolved paths.knowledge}/decisions"', () => {
        assert.equal(resolveConfigValue({}, 'paths.decisions', projectRoot), 'knowledge/decisions');
      });

      it('a configured paths.knowledge shifts the paths.decisions default with it', () => {
        const config = { paths: { knowledge: 'notes' } };
        assert.equal(resolveConfigValue(config, 'paths.decisions', projectRoot), 'notes/decisions');
      });

      it('an explicit paths.decisions overrides the derived default entirely', () => {
        const config = { paths: { knowledge: 'notes', decisions: 'archive/decisions' } };
        assert.equal(
          resolveConfigValue(config, 'paths.decisions', projectRoot),
          'archive/decisions',
        );
      });

      it('project_shortname defaults to the resolved project_name', () => {
        const config = { project_name: 'Widget' };
        assert.equal(resolveConfigValue(config, 'project_shortname', projectRoot), 'Widget');
      });

      it('project_name defaults to the project root directory name', () => {
        assert.equal(
          resolveConfigValue({}, 'project_name', projectRoot),
          projectRoot.split('/').pop(),
        );
      });

      it('paths.worktrees defaults using the resolved project_shortname', () => {
        const config = { project_shortname: 'wid' };
        assert.equal(
          resolveConfigValue(config, 'paths.worktrees', projectRoot),
          '../worktrees/wid',
        );
      });
    });
  });

  describe('getConfigPath()', () => {
    it('joins the resolved value onto projectRoot', () => {
      assert.equal(getConfigPath(projectRoot, 'paths.knowledge'), join(projectRoot, 'knowledge'));
    });

    it('reflects a configured override', () => {
      writeFileSync(
        join(projectRoot, '.aiconfig.json'),
        JSON.stringify({ paths: { decisions: 'archive/decisions' } }),
      );
      assert.equal(
        getConfigPath(projectRoot, 'paths.decisions'),
        join(projectRoot, 'archive/decisions'),
      );
    });
  });

  describe('findProjectRoot()', () => {
    it('returns the start directory when it directly contains .aiconfig.json', () => {
      writeFileSync(join(projectRoot, '.aiconfig.json'), '{}');
      assert.equal(findProjectRoot(projectRoot), projectRoot);
    });

    it('walks up parent directories to find .aiconfig.json', () => {
      writeFileSync(join(projectRoot, '.aiconfig.json'), '{}');
      const nested = join(projectRoot, 'a', 'b', 'c');
      mkdirSync(nested, { recursive: true });
      assert.equal(findProjectRoot(nested), projectRoot);
    });

    it('returns null when no ancestor has .aiconfig.json', () => {
      const nested = join(projectRoot, 'a', 'b');
      mkdirSync(nested, { recursive: true });
      assert.equal(findProjectRoot(nested), null);
    });
  });
});
