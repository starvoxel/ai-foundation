// ------------------------------
// merge-action.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: merge-bot-integration (Milestone 2). The `merge` action runs in other repositories with their
 * GitHub App key, on a comment from anyone, so it must read only API data from its own pinned
 * checkout, create the token only when live, pin its one third-party action, and keep event data out
 * of the shell.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const DIR = resolve(import.meta.dirname, '../../.github/actions/merge');
const text = readFileSync(resolve(DIR, 'action.yml'), 'utf8');
const action = YAML.parse(text);
const steps = action.runs.steps;
const decide = steps.find((step) => step.run?.includes('merge.mjs'));

describe('.github/actions/merge', () => {
  it('is a composite action with a name, a description and a README', () => {
    assert.equal(action.runs.using, 'composite');
    assert.ok(action.name && action.description);
    assert.ok(existsSync(resolve(DIR, 'README.md')));
  });

  it('takes exactly the documented inputs, all optional and dry by default', () => {
    assert.deepEqual(Object.keys(action.inputs), [
      'live',
      'app-client-id',
      'app-private-key',
      'version-paths',
    ]);
    for (const input of Object.values(action.inputs)) assert.equal(input.required, false);
    assert.equal(action.inputs.live.default, 'false');
    assert.equal(action.inputs['version-paths'].default, '');
  });

  it("runs merge.mjs from the action's own checkout, never the caller's workspace", () => {
    assert.equal(decide.shell, 'bash');
    assert.equal(decide.env.ACTION_PATH, '${{ github.action_path }}');
    assert.match(decide.run, /"\$ACTION_PATH\/\.\.\/\.\.\/\.\./);
    assert.match(decide.run, /\.github\/scripts\/merge\.mjs/);
    assert.ok(!/GITHUB_WORKSPACE|checkout/.test(decide.run));
  });

  it('creates the App token only when live, with the inputs, repository-scoped', () => {
    const app = steps.find((step) => step.uses?.startsWith('actions/create-github-app-token@'));
    assert.equal(app.if, "${{ inputs.live == 'true' }}");
    assert.equal(app.with['client-id'], '${{ inputs.app-client-id }}');
    assert.equal(app.with['private-key'], '${{ inputs.app-private-key }}');
    assert.ok(!('owner' in app.with) && !('repositories' in app.with), 'token must be repo-scoped');
  });

  it('pins every action to a full commit SHA with a release comment', () => {
    for (const step of steps.filter((s) => 'uses' in s)) {
      assert.match(step.uses, /^[^@]+@[0-9a-f]{40}$/, `unpinned: ${step.uses}`);
      assert.match(text, new RegExp(`uses: ${step.uses} # v\\d+\\.\\d+\\.\\d+\\s*$`, 'm'));
    }
  });

  it('is a dry run unless live is exactly true, and uses the App token only when there is one', () => {
    assert.equal(decide.env.DRY_RUN, "${{ inputs.live == 'true' && 'false' || 'true' }}");
    assert.equal(decide.env.GITHUB_TOKEN, '${{ steps.app.outputs.token || github.token }}');
  });

  it('passes event data only through environment variables, never inline in the shell', () => {
    for (const step of steps.filter((s) => 'run' in s)) {
      assert.ok(!step.run.includes('${{'), `inline expression in: ${step.run}`);
    }
    assert.equal(decide.env.EVENT_NAME, '${{ github.event_name }}');
    assert.equal(decide.env.COMMENT_BODY, '${{ github.event.comment.body }}');
    assert.equal(decide.env.VERSION_PATHS, '${{ inputs.version-paths }}');
  });

  it('is covered by Dependabot, since it pins a third-party action of its own', () => {
    const dependabot = YAML.parse(
      readFileSync(resolve(import.meta.dirname, '../../.github/dependabot.yml'), 'utf8'),
    );
    const actions = dependabot.updates.find((u) => u['package-ecosystem'] === 'github-actions');
    assert.ok(actions.directories.includes('/.github/actions/*'));
  });
});
