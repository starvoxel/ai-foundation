// ------------------------------
// default-scope.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: aif-project-integrations (Milestone 2). `aif install`, `uninstall` and `status` default to
 * project scope; outside a project they fail and point at `--scope global`; `--scope global`
 * is covered by the existing global-scope tests, which now pass it explicitly.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runInstall } from '../../lib/commands/install.js';
import { runUninstall } from '../../lib/commands/uninstall.js';
import { runStatus } from '../../lib/commands/status.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

/**
 * Run fn with console output captured.
 * @param {() => number} fn
 * @returns {{ code: number, output: string }}
 */
function capture(fn) {
  const lines = [];
  const { log, error } = console;
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  try {
    return { code: fn(), output: lines.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe('integration: default scope is project', () => {
  let repo;
  let project;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        {
          name: 'solo',
          version: '0.1.0',
          domain: 'eng',
          description: 'Agent.',
          prompt: 'You are solo.',
          tools: ['read'],
          approved_tools: ['read'],
        },
      ],
      bundles: [{ name: 'eng', version: '1.0.0', description: 'Test bundle.', domain: 'eng' }],
    });
    project = mkdtempSync(join(tmpdir(), 'aif-default-scope-'));
  });

  afterEach(() => {
    destroyTempRepo(repo);
    rmSync(project, { recursive: true, force: true });
  });

  const args = { bundle: 'eng', harness: 'claude' };
  const install = (extra = {}) =>
    capture(() => runInstall({ args: { ...args, ...extra }, positional: [] }, repo, project));

  it('installs into the project when no scope is given', () => {
    writeFileSync(join(project, '.aiconfig.json'), '{}\n');
    const { code } = install();
    assert.equal(code, 0);
    assert.ok(existsSync(join(project, '.claude', 'agents', 'solo.md')));
    assert.ok(existsSync(join(project, '.claude', '.installs.yaml')));
  });

  for (const [name, run] of [
    ['install', () => install()],
    ['uninstall', () => capture(() => runUninstall({ args, positional: [] }, repo, project))],
    ['status', () => capture(() => runStatus({ args: {}, positional: [] }, repo, project))],
  ]) {
    it(`${name} fails outside a project and points at --scope global`, () => {
      const { code, output } = run();
      assert.equal(code, 1);
      assert.match(output, /No project found/);
      assert.match(output, /--scope global/);
      assert.equal(existsSync(join(project, '.claude')), false, 'writes nothing');
    });
  }
});
