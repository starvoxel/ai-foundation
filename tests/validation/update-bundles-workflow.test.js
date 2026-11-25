// ------------------------------
// update-bundles-workflow.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: aif-project-integrations (Milestone 1). The reusable update workflow runs in other
 * repositories with a Bitwarden-held token, so it must be callable, take its token as an explicit
 * secret and input, hold the least permissions, and pin every action to a full commit SHA with
 * the release in a comment.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const FILE = resolve(import.meta.dirname, '../../.github/workflows/update-bundles.yml');
const text = readFileSync(FILE, 'utf8');
const workflow = YAML.parse(text);
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);

describe('.github/workflows/update-bundles.yml', () => {
  it('is callable and takes the token as an explicit input and secret', () => {
    const call = workflow.on?.workflow_call;
    assert.ok(call, 'must trigger on workflow_call');
    assert.equal(call.inputs?.['token-secret-id']?.required, true);
    assert.equal(call.secrets?.BWS_ACCESS_TOKEN?.required, true);
  });

  it('holds read-only contents permission and no job widens it', () => {
    assert.deepEqual(workflow.permissions, { contents: 'read' });
    for (const [name, job] of Object.entries(workflow.jobs)) {
      for (const [scope, level] of Object.entries(job.permissions ?? {})) {
        assert.equal(level, 'read', `job "${name}" widens ${scope} to ${level}`);
      }
    }
  });

  it('runs one update at a time without cancelling a run in progress', () => {
    for (const [name, job] of Object.entries(workflow.jobs)) {
      assert.ok(job.concurrency?.group, `job "${name}" needs a concurrency group`);
      assert.equal(job.concurrency['cancel-in-progress'], false);
    }
  });

  it('pins every action to a full commit SHA with a release comment', () => {
    const used = steps.filter((step) => 'uses' in step);
    assert.ok(used.length > 0);
    for (const step of used) {
      assert.match(step.uses, /^[^@]+@[0-9a-f]{40}$/, `unpinned: ${step.uses}`);
      // The comment is not part of the parsed value, so look for it in the text of the file.
      const commented = new RegExp(`uses: ${step.uses} # v\\d+\\.\\d+\\.\\d+\\s*$`, 'm');
      assert.match(text, commented, `no release comment on ${step.uses}`);
    }
  });

  it('does not use a local path, which would resolve in the caller repository', () => {
    for (const step of steps) {
      assert.ok(!String(step.uses ?? '').startsWith('./'), `local action in "${step.name}"`);
    }
  });

  it('keeps no checkout credentials and never inlines the token into a script', () => {
    const checkout = steps.find((step) => String(step.uses ?? '').startsWith('actions/checkout@'));
    assert.equal(checkout.with['persist-credentials'], false);
    for (const step of steps.filter((candidate) => 'run' in candidate)) {
      assert.doesNotMatch(step.run, /\$\{\{/, `step "${step.name}" interpolates in its script`);
    }
  });

  it('fetches the token after the bundles action, which runs npm ci', () => {
    const bundles = steps.findIndex((step) => step.id === 'bundles');
    const token = steps.findIndex((step) =>
      String(step.uses ?? '').startsWith('bitwarden/sm-action@'),
    );
    assert.ok(bundles >= 0, 'the bundles step must have id: bundles');
    assert.ok(token >= 0, 'the token must come from bitwarden/sm-action');
    assert.ok(token > bundles, 'the token must be fetched after the bundles action');
  });

  it('sets `shell: bash` on every run step', () => {
    const runSteps = steps.filter((step) => 'run' in step);
    assert.ok(runSteps.length > 0);
    for (const step of runSteps) {
      assert.equal(step.shell, 'bash', `step "${step.name}" must set shell: bash`);
    }
  });

  it('checks out the default branch, not whichever ref triggered the run', () => {
    const checkout = steps.find((step) => String(step.uses ?? '').startsWith('actions/checkout@'));
    assert.match(checkout.with.ref, /default_branch/);
  });
});
