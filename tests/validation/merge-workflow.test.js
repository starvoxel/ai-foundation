// ------------------------------
// merge-workflow.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: merge-bot (Milestones 3 and 4). The `/merge` workflow runs on a comment from anyone, so it
 * must run only the default branch's scripts, hold the least permissions, stay a dry run until the
 * repository variable switches it live, and never put untrusted event data inline in a shell.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const FILE = resolve(import.meta.dirname, '../../.github/workflows/merge.yml');
const text = readFileSync(FILE, 'utf8');
const workflow = YAML.parse(text);
const job = workflow.jobs.merge;

describe('.github/workflows/merge.yml', () => {
  it('triggers only on created issue comments and finished CI runs, never pull_request_target', () => {
    assert.deepEqual(Object.keys(workflow.on), ['issue_comment', 'workflow_run']);
    assert.deepEqual(workflow.on.issue_comment.types, ['created']);
    assert.deepEqual(workflow.on.workflow_run.workflows, ['CI']);
    assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  });

  it('wakes on a finished pull-request CI run only, and passes the event name, not its payload', () => {
    assert.match(job.if, /github\.event_name == 'workflow_run'/);
    assert.match(job.if, /github\.event\.workflow_run\.event == 'pull_request'/);
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(decide.env.EVENT_NAME, '${{ github.event_name }}');
    assert.ok(
      !Object.values(decide.env).some((value) =>
        String(value).includes('github.event.workflow_run'),
      ),
      'the wake-up must not read the workflow_run payload',
    );
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
    assert.match(job.if, /github\.event_name == 'issue_comment'/);
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

  it('is a dry run unless MERGE_BOT_LIVE is exactly true', () => {
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(decide.env.DRY_RUN, "${{ vars.MERGE_BOT_LIVE == 'true' && 'false' || 'true' }}");
  });

  it('creates the App token only when live, scoped to this repository, from a variable and a secret', () => {
    const app = job.steps.find((step) => step.uses?.startsWith('actions/create-github-app-token@'));
    assert.equal(app.if, "vars.MERGE_BOT_LIVE == 'true'");
    assert.equal(app.with['client-id'], '${{ vars.MERGE_APP_CLIENT_ID }}');
    assert.equal(app.with['private-key'], '${{ secrets.MERGE_APP_PRIVATE_KEY }}');
    assert.ok(!('owner' in app.with) && !('repositories' in app.with), 'token must be repo-scoped');
  });

  it("passes ai-foundation's version directories explicitly, since an empty list disables versioning", () => {
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(
      decide.env.VERSION_PATHS,
      'agents,skills,steering,standards,servers,bundles,projects,bin,lib',
    );
  });

  it('uses the App token when there is one and the job token otherwise', () => {
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(decide.env.GITHUB_TOKEN, '${{ steps.app.outputs.token || github.token }}');
  });

  it('keeps event data out of the shell: only env, no inline expressions in run', () => {
    for (const step of job.steps.filter((s) => 'run' in s)) {
      assert.ok(!step.run.includes('${{'), `inline expression in: ${step.run}`);
    }
    const decide = job.steps.find((step) => step.run?.includes('merge.mjs'));
    assert.equal(decide.env.COMMENT_BODY, '${{ github.event.comment.body }}');
  });
});
