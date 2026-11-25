// ------------------------------
// merge-integration-template.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: merge-bot-integration (Milestone 3). `aif install -I merge` copies this workflow into other
 * repositories, where it runs on a comment from anyone with the repository's App key, so the copy
 * must grant least privilege, serialise runs, be a dry run until switched live, pass nothing from the
 * event into a shell, and call the action only through the pin line Dependabot owns.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const FILE = resolve(import.meta.dirname, '../../lib/integrations/assets/aif-merge.yml');
const text = readFileSync(FILE, 'utf8');
const workflow = YAML.parse(
  text.replaceAll('{{AIF_SHA}}', 'a'.repeat(40)).replaceAll('{{AIF_VERSION}}', 'v1.0.0'),
);
const job = workflow.jobs.merge;
const step = job.steps[0];

describe('aif-merge.yml template', () => {
  it('triggers on created issue comments and finished CI runs, never pull_request_target', () => {
    assert.deepEqual(Object.keys(workflow.on), ['issue_comment', 'workflow_run']);
    assert.deepEqual(workflow.on.issue_comment.types, ['created']);
    assert.deepEqual(workflow.on.workflow_run.workflows, ['CI']);
    assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  });

  it('grants nothing by default and only read plus pull-request comments to the job', () => {
    assert.deepEqual(workflow.permissions, {});
    assert.deepEqual(job.permissions, {
      contents: 'read',
      checks: 'read',
      'pull-requests': 'write',
    });
  });

  it('runs only for a /merge comment on a PR, or a finished pull-request CI run', () => {
    assert.match(job.if, /github\.event_name == 'issue_comment'/);
    assert.match(job.if, /github\.event\.issue\.pull_request/);
    assert.match(job.if, /contains\(github\.event\.comment\.body, '\/merge'\)/);
    assert.match(job.if, /github\.event\.workflow_run\.event == 'pull_request'/);
  });

  it('serialises runs without cancelling one in progress', () => {
    assert.equal(workflow.concurrency.group, 'merge');
    assert.equal(workflow.concurrency['cancel-in-progress'], false);
  });

  it('has the action as its only step, with no checkout and no shell', () => {
    assert.equal(job.steps.length, 1);
    assert.ok(!('run' in step));
    assert.match(step.uses, /^starvoxel\/ai-foundation\/\.github\/actions\/merge@[0-9a-f]{40}$/);
  });

  it('carries the pin only on the line Dependabot owns', () => {
    assert.equal(text.match(/\{\{AIF_SHA\}\}/g).length, 1);
    assert.equal(text.match(/\{\{AIF_VERSION\}\}/g).length, 1);
    assert.match(text, /merge@\{\{AIF_SHA\}\} # \{\{AIF_VERSION\}\}\s*$/m);
  });

  it('is a dry run until MERGE_BOT_LIVE is set, and takes the App from a variable and a secret', () => {
    assert.equal(step.with.live, '${{ vars.MERGE_BOT_LIVE }}');
    assert.equal(step.with['app-client-id'], '${{ vars.MERGE_APP_CLIENT_ID }}');
    assert.equal(step.with['app-private-key'], '${{ secrets.MERGE_APP_PRIVATE_KEY }}');
  });

  it('defaults to a project without versioned releases, with no quoted empty value for a formatter to rewrite', () => {
    assert.ok(!('version-paths' in step.with));
    assert.ok(!/^\s*version-paths:/m.test(text), 'only a comment may mention it');
    assert.ok(!text.includes("''") && !text.includes('""'));
  });
});
