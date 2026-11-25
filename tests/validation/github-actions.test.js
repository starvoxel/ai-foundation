// ------------------------------
// github-actions.test.js
//
// Author: Starvoxel AI Agent - 2026-11-23
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plans: ci-actions-and-release (Milestone 1) and aif-project-integrations
 * (Milestone 1, the `checks` action). The reusable composite actions
 * under .github/actions/ run on consumer runners, Windows included, so each
 * must parse, be composite, take a `mode` input, set `shell: bash` on every
 * `run:` step, and stay free of third-party actions (no network beyond npm ci).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import YAML from 'yaml';

const ACTIONS_DIR = resolve(import.meta.dirname, '../../.github/actions');
// Actions that take a `mode`; `checks` runs both checks and takes no input.
const MODE_ACTIONS = ['index', 'bundles'];
const ALL_ACTIONS = readdirSync(ACTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
// `merge` and `cleanup-branches` take inputs; merge-action.test.js and
// cleanup-branches-action.test.js cover them.
const OWN_TESTS = ['merge', 'cleanup-branches'];
const actionNames = ALL_ACTIONS.filter((name) => !OWN_TESTS.includes(name));

describe('.github/actions', () => {
  it('contains the index, bundles and checks actions', () => {
    assert.ok(actionNames.includes('index'));
    assert.ok(actionNames.includes('bundles'));
    assert.ok(actionNames.includes('checks'));
    for (const name of OWN_TESTS) assert.ok(ALL_ACTIONS.includes(name), name);
  });

  for (const name of actionNames) {
    describe(name, () => {
      const file = join(ACTIONS_DIR, name, 'action.yml');
      const action = YAML.parse(readFileSync(file, 'utf8'));

      it('parses as a composite action with a name and description', () => {
        assert.equal(action.runs?.using, 'composite');
        assert.ok(action.name);
        assert.ok(action.description);
      });

      it('takes the inputs it documents', () => {
        if (MODE_ACTIONS.includes(name)) {
          assert.ok(action.inputs?.mode?.default);
          assert.equal(action.inputs.mode.required, false);
        } else {
          assert.equal(action.inputs, undefined, 'an action without a mode takes no inputs');
        }
      });

      it('sets `shell: bash` on every run step', () => {
        const runSteps = action.runs.steps.filter((step) => 'run' in step);
        assert.ok(runSteps.length > 0);
        for (const step of runSteps) {
          assert.equal(step.shell, 'bash', `step "${step.name}" must set shell: bash`);
        }
      });

      it('uses no third-party actions', () => {
        for (const step of action.runs.steps) {
          assert.equal('uses' in step, false, `step "${step.name}" must not use an action`);
        }
      });

      it('has a README documenting the caller prerequisites', () => {
        const readme = join(ACTIONS_DIR, name, 'README.md');
        assert.ok(existsSync(readme));
        assert.match(readFileSync(readme, 'utf8'), /setup-node/);
      });
    });
  }

  it('documents fetch-depth: 0 in the index README', () => {
    const readme = readFileSync(join(ACTIONS_DIR, 'index', 'README.md'), 'utf8');
    assert.match(readme, /fetch-depth: 0/);
  });

  describe('checks step order', () => {
    const { steps } = YAML.parse(
      readFileSync(join(ACTIONS_DIR, 'checks', 'action.yml'), 'utf8'),
    ).runs;
    const run = (pattern) => steps.findIndex((step) => pattern.test(step.run ?? ''));

    it('installs, then checks the index, then checks drift', () => {
      const install = run(/npm ci/);
      const index = run(/index architecture --check/);
      const drift = run(/install --scope project --check/);
      assert.ok(install >= 0 && index > install && drift > index);
    });

    it('runs the drift check after a failed index check, but not after a failed install', () => {
      const drift = steps[run(/install --scope project --check/)];
      const install = steps[run(/npm ci/)];
      assert.match(drift.if, /!cancelled\(\)/);
      assert.match(drift.if, new RegExp(`steps\\.${install.id}\\.outcome == 'success'`));
      assert.equal(steps[run(/index architecture --check/)].if, undefined);
    });
  });
});
