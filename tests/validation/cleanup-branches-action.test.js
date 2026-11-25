// ------------------------------
// cleanup-branches-action.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * The `cleanup-branches` action deletes branches in other repositories with their job token, so it
 * must run its script from its own pinned checkout, pass every setting through the environment
 * (never inline in the shell), and the workflows that call it must grant only what it needs and
 * pass each CLEANUP_* variable.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = resolve(ROOT, '.github/actions/cleanup-branches');
const action = YAML.parse(readFileSync(resolve(DIR, 'action.yml'), 'utf8'));
const step = action.runs.steps[0];

const template = readFileSync(resolve(ROOT, 'lib/integrations/assets/aif-cleanup.yml'), 'utf8');
const caller = YAML.parse(
  template.replaceAll('{{AIF_SHA}}', 'a'.repeat(40)).replaceAll('{{AIF_VERSION}}', 'v1.0.0'),
);
const own = YAML.parse(
  readFileSync(resolve(ROOT, '.github/workflows/cleanup-branches.yml'), 'utf8'),
);

/** CLEANUP_* variable named in the README table, and the action input it feeds. */
const VARIABLES = {
  CLEANUP_ENFORCE: 'enforce',
  CLEANUP_PROTECTED_BRANCHES: 'protected-branches',
  CLEANUP_AI_BRANCH_PREFIXES: 'ai-branch-prefixes',
  CLEANUP_THROWAWAY_WORDS: 'throwaway-words',
  CLEANUP_KEEP_EMPTY_BRANCHES: 'keep-empty-branches',
  CLEANUP_KEEP_UNRELATED_BRANCHES: 'keep-unrelated-branches',
  CLEANUP_ACTIVE_DAYS: 'active-days',
  CLEANUP_ARCHIVE_DAYS: 'archive-days',
  CLEANUP_ACTIVE_BRANCHES: 'active-branches',
  CLEANUP_ARCHIVE_BRANCHES: 'archive-branches',
};

/** The `with:` of the step that runs the action. */
const withOf = (workflow) =>
  workflow.jobs.cleanup.steps.find((s) => s.uses?.includes('cleanup-branches')).with;

describe('.github/actions/cleanup-branches', () => {
  it('is a composite action with a name, a description and a README', () => {
    assert.equal(action.runs.using, 'composite');
    assert.ok(action.name && action.description);
    assert.ok(existsSync(resolve(DIR, 'README.md')));
  });

  it('has an optional input for every CLEANUP_* variable, plus dry-run, branches and token', () => {
    assert.deepEqual(
      Object.keys(action.inputs).sort(),
      [...Object.values(VARIABLES), 'dry-run', 'branches', 'token'].sort(),
    );
    for (const input of Object.values(action.inputs)) assert.equal(input.required, false);
  });

  it('documents every variable in the README', () => {
    const readme = readFileSync(resolve(DIR, 'README.md'), 'utf8');
    for (const [name, input] of Object.entries(VARIABLES)) {
      assert.ok(readme.includes(`\`${name}\``), name);
      assert.ok(readme.includes(`\`${input}\``), input);
    }
  });

  it("runs the script from the action's own checkout, never the caller's workspace", () => {
    assert.equal(step.shell, 'bash');
    assert.equal(step.env.ACTION_PATH, '${{ github.action_path }}');
    assert.match(step.run, /"\$ACTION_PATH\/\.\.\/\.\.\/\.\."/);
    assert.match(step.run, /node "\$AIF_ROOT\/\.github\/scripts\/cleanup-branches\.mjs"/);
  });

  it('keeps every input out of the shell text', () => {
    assert.doesNotMatch(step.run, /\$\{\{/);
    assert.match(step.env.ENFORCE, /inputs\.enforce \|\| 'true'/);
  });
});

describe('the callers of the action', () => {
  it('pass every CLEANUP_* variable to its input, template and own workflow alike', () => {
    for (const workflow of [caller, own]) {
      const inputs = withOf(workflow);
      for (const [name, input] of Object.entries(VARIABLES)) {
        assert.match(inputs[input], new RegExp(`vars\\.${name}`), `${input} from ${name}`);
      }
    }
  });

  it('grant contents and pull-requests write and nothing else', () => {
    for (const workflow of [caller, own]) {
      assert.deepEqual(workflow.permissions, { contents: 'write', 'pull-requests': 'write' });
    }
  });

  it('run on a schedule and a manual dispatch, never on push', () => {
    for (const workflow of [caller, own]) {
      assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
      assert.deepEqual(workflow.on.schedule, [{ cron: '17 6 * * 1,4' }]);
    }
  });

  it('use the pin line Dependabot owns in the template, and the local action in this repo', () => {
    assert.match(
      withOf(caller) && caller.jobs.cleanup.steps[1].uses,
      /^starvoxel\/ai-foundation\/\.github\/actions\/cleanup-branches@[0-9a-f]{40}$/,
    );
    assert.equal(template.match(/\{\{AIF_SHA\}\}/g).length, 1);
    assert.equal(template.match(/\{\{AIF_VERSION\}\}/g).length, 1);
    assert.equal(own.jobs.cleanup.steps[1].uses, './.github/actions/cleanup-branches');
  });

  it('check out only what is needed', () => {
    assert.match(caller.jobs.cleanup.steps[0].with['sparse-checkout'], /^\/\.aiconfig\.json$/);
    const wanted = own.jobs.cleanup.steps[0].with['sparse-checkout'];
    for (const path of [
      '/.github/actions/cleanup-branches/',
      '/.github/scripts/',
      '/.aiconfig.json',
    ]) {
      assert.ok(wanted.includes(path), path);
    }
  });
});
