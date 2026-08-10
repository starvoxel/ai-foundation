/**
 * Integration tests for the init command (filesystem operations).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runInit } from '../../lib/commands/init.js';

describe('integration: init command', () => {
  let workDir;
  let originalCwd;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aif-init-'));
    originalCwd = process.cwd();
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(workDir, { recursive: true, force: true });
  });

  function quiet(fn) {
    const origLog = console.log;
    const origErr = console.error;
    const output = [];
    console.log = (...args) => output.push(args.join(' '));
    console.error = (...args) => output.push(args.join(' '));
    try { return { code: fn(), output }; }
    finally { console.log = origLog; console.error = origErr; }
  }

  it('requires --name', () => {
    const { code } = quiet(() => runInit({ args: {}, positional: [] }));
    assert.equal(code, 1);
  });

  it('creates the project directory', () => {
    const { code } = quiet(() => runInit({ args: { name: 'test-project' }, positional: [] }));
    assert.equal(code, 0);
    assert.ok(existsSync(join(workDir, 'test-project')));
  });

  it('creates .aiconfig.json with correct name', () => {
    quiet(() => runInit({ args: { name: 'my-app' }, positional: [] }));
    const config = JSON.parse(readFileSync(join(workDir, 'my-app', '.aiconfig.json'), 'utf8'));
    assert.equal(config.project_name, 'my-app');
  });

  it('creates knowledge directory structure', () => {
    quiet(() => runInit({ args: { name: 'test' }, positional: [] }));
    assert.ok(existsSync(join(workDir, 'test', 'knowledge', 'decisions', '.gitkeep')));
    assert.ok(existsSync(join(workDir, 'test', 'knowledge', 'example.md')));
  });

  it('creates plans directory structure', () => {
    quiet(() => runInit({ args: { name: 'test' }, positional: [] }));
    assert.ok(existsSync(join(workDir, 'test', 'plans', 'epics', '.gitkeep')));
    assert.ok(existsSync(join(workDir, 'test', 'plans', 'chunks', '.gitkeep')));
    assert.ok(existsSync(join(workDir, 'test', 'plans', 'orchestration', '.gitkeep')));
  });

  it('creates project-standards.md', () => {
    quiet(() => runInit({ args: { name: 'my-app' }, positional: [] }));
    const content = readFileSync(join(workDir, 'my-app', 'project-standards.md'), 'utf8');
    assert.ok(content.includes('my-app'));
  });

  it('fails if directory already exists without --force', () => {
    mkdirSync(join(workDir, 'existing'));
    const { code, output } = quiet(() => runInit({ args: { name: 'existing' }, positional: [] }));
    assert.equal(code, 1);
    assert.ok(output.some(l => l.includes('already exists')));
  });

  it('succeeds with --force when directory exists', () => {
    mkdirSync(join(workDir, 'existing'));
    const { code } = quiet(() => runInit({ args: { name: 'existing', force: true }, positional: [] }));
    assert.equal(code, 0);
    assert.ok(existsSync(join(workDir, 'existing', '.aiconfig.json')));
  });

  it('rejects invalid project names', () => {
    const { code, output } = quiet(() => runInit({ args: { name: '.bad-name' }, positional: [] }));
    assert.equal(code, 1);
    assert.ok(output.some(l => l.includes('Invalid')));
  });
});
