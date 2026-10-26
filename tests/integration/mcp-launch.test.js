// ------------------------------
// mcp-launch.test.js
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Integration tests for the project-scope stdio MCP launcher: the exact
 * `.mcp.json` command aif commits finds the launcher through
 * CLAUDE_PROJECT_DIR, installs dependencies once, and runs the server with
 * stdout left to the server.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { projectStdioEntry } from '../../lib/harnesses/claude.js';
import { LOCK_FILE, STAMP_FILE } from '../../lib/harnesses/mcp-launch/aif-launch.mjs';

const LAUNCHER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'lib',
  'harnesses',
  'mcp-launch',
  'aif-launch.mjs',
);

describe('integration: project-scope stdio launcher', () => {
  let project;
  let serverDir;

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'aif-launch-'));
    serverDir = join(project, '.claude', 'servers', 'probe');
    mkdirSync(serverDir, { recursive: true });
    copyFileSync(LAUNCHER, join(serverDir, 'aif-launch.mjs'));
    // No dependencies, so npm install works offline.
    writeFileSync(
      join(serverDir, 'package.json'),
      JSON.stringify({ name: 'probe', version: '1.0.0', private: true, type: 'module' }),
    );
    writeFileSync(
      join(serverDir, 'index.js'),
      "process.stdout.write(`argv1=${process.argv[1].endsWith('index.js')}\\n`);\n",
    );
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  /**
   * Run the committed .mcp.json command, by default from an unrelated working
   * directory with CLAUDE_PROJECT_DIR set, as Claude Code does.
   * @param {{ cwd?: string, projectDir?: string|null }} [options]
   */
  function runEntry({ cwd = tmpdir(), projectDir = project } = {}) {
    const { command, args } = projectStdioEntry('probe');
    const env = { ...process.env };
    if (projectDir === null) delete env.CLAUDE_PROJECT_DIR;
    else env.CLAUDE_PROJECT_DIR = projectDir;
    return spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60000 });
  }

  /**
   * Start the entry without waiting; resolves with its exit code and output.
   * @param {(child: import('node:child_process').ChildProcess) => void} [onReady]
   * @returns {Promise<{ code: number|null, stdout: string, stderr: string }>}
   */
  function startEntry(onReady) {
    const { command, args } = projectStdioEntry('probe');
    const child = spawn(command, args, {
      cwd: tmpdir(),
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d;
      if (onReady && stdout.includes('ready')) {
        onReady(child);
        onReady = undefined;
      }
    });
    child.stderr.on('data', (d) => (stderr += d));
    return new Promise((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })));
  }

  it('installs once, stamps the install, and runs the server as the main module', () => {
    const first = runEntry();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, 'argv1=true\n', 'only the server writes to stdout');
    assert.ok(first.stderr.includes('aif-launch: installing dependencies'));
    assert.ok(existsSync(join(serverDir, 'node_modules', STAMP_FILE)));

    const second = runEntry();
    assert.equal(second.status, 0, second.stderr);
    assert.ok(!second.stderr.includes('installing dependencies'), 'stamped install is reused');
  });

  it('reinstalls after package.json changes', () => {
    runEntry();
    writeFileSync(
      join(serverDir, 'package.json'),
      JSON.stringify({ name: 'probe', version: '1.0.1', private: true, type: 'module' }),
    );
    assert.ok(runEntry().stderr.includes('installing dependencies'));
  });

  it('exits non-zero without starting the server when npm install fails', () => {
    writeFileSync(join(serverDir, 'package.json'), '{ not json');
    const result = runEntry();
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('aif-launch: npm install failed'));
  });

  it('finds the launcher from the working directory when CLAUDE_PROJECT_DIR is unset', () => {
    const result = runEntry({ cwd: project, projectDir: null });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'argv1=true\n');
  });

  it('leaves no stamp after a failed install, so the next start retries', () => {
    writeFileSync(join(serverDir, 'package.json'), '{ not json');
    assert.notEqual(runEntry().status, 0);
    assert.ok(!existsSync(join(serverDir, 'node_modules', STAMP_FILE)));
    assert.ok(!existsSync(join(serverDir, LOCK_FILE)), 'lock released');
    writeFileSync(
      join(serverDir, 'package.json'),
      JSON.stringify({ name: 'probe', version: '1.0.0', private: true, type: 'module' }),
    );
    const retry = runEntry();
    assert.equal(retry.status, 0, retry.stderr);
    assert.ok(retry.stderr.includes('installing dependencies'));
  });

  it('forwards SIGTERM to the server and passes its exit code through', async () => {
    writeFileSync(
      join(serverDir, 'index.js'),
      "process.on('SIGTERM', () => process.exit(3));\nsetInterval(() => {}, 1000);\nprocess.stdout.write('ready\\n');\n",
    );
    const { code } = await startEntry((child) => child.kill('SIGTERM'));
    assert.equal(code, 3);
  });

  it('runs one install for concurrent first starts', async () => {
    const results = await Promise.all([startEntry(), startEntry()]);
    for (const r of results) assert.equal(r.code, 0, r.stderr);
    const installs = results.filter((r) => r.stderr.includes('installing dependencies'));
    assert.equal(installs.length, 1);
    assert.ok(!existsSync(join(serverDir, LOCK_FILE)));
  });

  it('takes over a stale install lock', () => {
    const lock = join(serverDir, LOCK_FILE);
    writeFileSync(lock, '');
    const old = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lock, old, old);
    const result = runEntry();
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stderr.includes('removing stale install lock'));
  });
});
