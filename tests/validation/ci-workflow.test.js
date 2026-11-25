// ------------------------------
// ci-workflow.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * The version check reads VERSION_POLICY from its environment, so the workflow has to put it in the
 * environment of the right step. A copy of the line in another step, which an earlier edit made, leaves
 * the check on the original rule with nothing failing, so this reads the wiring itself.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const FILE = resolve(import.meta.dirname, '../../.github/workflows/ci.yml');
const workflow = YAML.parse(readFileSync(FILE, 'utf8'));
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
const withPolicy = steps.filter((step) => step.env && 'VERSION_POLICY' in step.env);

describe('.github/workflows/ci.yml version policy', () => {
  it('gives VERSION_POLICY to the version-bump step', () => {
    const step = steps.find((candidate) => candidate.name === 'Check: version bump');
    assert.ok(step, 'the "Check: version bump" step must exist');
    assert.equal(
      step.env.VERSION_POLICY,
      "${{ vars.MERGE_BOT_LIVE == 'true' && 'bot' || 'hand' }}",
    );
  });

  it('gives it to no other step', () => {
    assert.deepEqual(
      withPolicy.map((step) => step.name),
      ['Check: version bump'],
    );
  });

  it('keeps the inputs the version-bump step already reads', () => {
    const step = steps.find((candidate) => candidate.name === 'Check: version bump');
    for (const name of ['EVENT_NAME', 'REF_NAME', 'HEAD_REF', 'BEFORE_SHA']) {
      assert.ok(name in step.env, `${name} missing from the version-bump step`);
    }
  });
});
