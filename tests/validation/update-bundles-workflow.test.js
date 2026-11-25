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

  it('holds read-only contents permission at the top level', () => {
    assert.deepEqual(workflow.permissions, { contents: 'read' });
  });

  it('pins every action to a full commit SHA with a release comment', () => {
    const uses = text.split('\n').filter((line) => /^\s*uses:/.test(line));
    assert.ok(uses.length > 0);
    for (const line of uses) {
      assert.match(line, /@[0-9a-f]{40} # v\d+\.\d+\.\d+\s*$/, `unpinned: ${line.trim()}`);
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
    const names = steps.map((step) => step.name);
    assert.ok(names.indexOf('Get update token') > names.indexOf('Update AIF bundles'));
  });
});
