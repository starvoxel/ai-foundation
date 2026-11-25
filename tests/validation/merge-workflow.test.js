// ------------------------------
// merge-workflow.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: merge-bot (Milestone 3). The `/merge` workflow runs on a comment from anyone, so it must
 * run only the default branch's scripts, hold the least permissions, stay a dry run, and never put
 * untrusted event data inline in a shell.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const FILE = resolve(import.meta.dirname, '../../.github/workflows/merge.yml');
const text = readFileSync(FILE, 'utf8');
const workflow = YAML.parse(text);
const job = workflow.jobs['dry-run'];

describe('.github/workflows/merge.yml', () => {
  it('triggers only on created issue comments, never pull_request_target', () => {
    assert.deepEqual(Object.keys(workflow.on), ['issue_comment']);
    assert.deepEqual(workflow.on.issue_comment.types, ['created']);
  });

  it('grants nothing by default and only read plus pull-request comments to the job', () => {
    assert.deepEqual(workflow.permissions, {});
    assert.deepEqual(job.permissions, {
      contents: 'read',
      checks: 'read',
      'pull-requests': 'write',
    });
  });

  it('only runs for a PR comment that mentions /merge', () => {
    assert.match(job.if, /github\.event\.issue\.pull_request/);
    assert.match(job.if, /\/merge/);
  });

  it('serialises runs without cancelling one in progress', () => {
    assert.equal(workflow.concurrency.group, 'merge');
    assert.equal(workflow.concurrency['cancel-in-progress'], false);
  });

  it('checks out the default branch, not the PR, without persisting credentials', () => {
    const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ github.event.repository.default_branch }}');
    assert.equal(checkout.with['persist-credentials'], false);
  });

  it('pins every action to a full commit SHA with a release comment', () => {
    for (const step of job.steps.filter((s) => 'uses' in s)) {
      assert.match(step.uses, /^[^@]+@[0-9a-f]{40}$/, `unpinned: ${step.uses}`);
      assert.match(text, new RegExp(`uses: ${step.uses} # v\\d+\\.\\d+\\.\\d+\\s*$`, 'm'));
    }
  });

  it('stays a dry run', () => {
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(decide.env.DRY_RUN, 'true');
  });

  it('keeps event data out of the shell: only env, no inline expressions in run', () => {
    for (const step of job.steps.filter((s) => 'run' in s)) {
      assert.ok(!step.run.includes('${{'), `inline expression in: ${step.run}`);
    }
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(decide.env.COMMENT_BODY, '${{ github.event.comment.body }}');
  });
});
