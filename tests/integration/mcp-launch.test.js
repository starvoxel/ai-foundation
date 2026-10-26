/**
 * Integration tests for the project-scope stdio MCP launcher: the exact
 * `.mcp.json` command aif commits finds the launcher through
 * CLAUDE_PROJECT_DIR, installs dependencies once, and runs the server with
 * stdout left to the server.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { projectStdioEntry } from '../../lib/harnesses/claude.js';
import { needsInstall, STAMP_FILE } from '../../lib/harnesses/mcp-launch/aif-launch.mjs';

const LAUNCHER = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'lib',
  'harnesses',
  'mcp-launch',
  'aif-launch.mjs',
);

describe('needsInstall', () => {
  it('installs when there is no stamp', () => {
    assert.equal(needsInstall(null, 'abc'), true);
  });

  it('installs when package.json changed since the stamp', () => {
    assert.equal(needsInstall('old\n', 'abc'), true);
  });

  it('skips when the stamp matches, ignoring surrounding whitespace', () => {
    assert.equal(needsInstall('abc\n', 'abc'), false);
  });

  it('installs for an empty stamp', () => {
    assert.equal(needsInstall('', 'abc'), true);
  });
});

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

  /** Run the committed .mcp.json command from an unrelated working directory. */
  function runEntry() {
    const { command, args } = projectStdioEntry('probe');
    return spawnSync(command, args, {
      cwd: tmpdir(),
      env: { ...process.env, CLAUDE_PROJECT_DIR: project },
      encoding: 'utf8',
      timeout: 60000,
    });
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
});
