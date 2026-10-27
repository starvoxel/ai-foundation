/**
 * Integration tests for the init command (filesystem operations).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runInit } from '../../lib/commands/init.js';

describe('integration: init command', () => {
  let workDir;
  let originalCwd;
  let originalIsTTY;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'aif-init-'));
    originalCwd = process.cwd();
    originalIsTTY = process.stdin.isTTY;
    // Force non-TTY so interactive mode doesn't trigger in tests
    process.stdin.isTTY = false;
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.stdin.isTTY = originalIsTTY;
    rmSync(workDir, { recursive: true, force: true });
  });

  async function quiet(fn) {
    const origLog = console.log;
    const origErr = console.error;
    const output = [];
    console.log = (...args) => output.push(args.join(' '));
    console.error = (...args) => output.push(args.join(' '));
    try {
      const code = await fn();
      return { code, output };
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  }

  it('requires --name', async () => {
    const { code } = await quiet(() => runInit({ args: {}, positional: [] }));
    assert.equal(code, 1);
  });

  it('installs nothing at project scope without --with-default-bundles', async () => {
    await quiet(() => runInit({ args: { name: 'plain' }, positional: [] }));
    assert.ok(!existsSync(join(workDir, 'plain', '.claude', '.installs.yaml')));
    assert.ok(!existsSync(join(workDir, 'plain', '.claude', 'agents')));
  });

  it('installs the default bundles at project scope with --with-default-bundles', async () => {
    const { code, output } = await quiet(() =>
      runInit({ args: { name: 'with-defaults', 'with-default-bundles': true }, positional: [] }),
    );
    assert.equal(code, 0, output.join('\n'));
    const claude = join(workDir, 'with-defaults', '.claude');
    assert.ok(existsSync(join(claude, 'agents', 'engineer.md')));
    const manifest = readFileSync(join(claude, '.installs.yaml'), 'utf8');
    assert.ok(manifest.includes('engineering_claude'));
    assert.ok(!manifest.includes('ai-engineering_claude'), 'non-default bundle not installed');
  });

  it('creates the project directory', async () => {
    const { code } = await quiet(() => runInit({ args: { name: 'test-project' }, positional: [] }));
    assert.equal(code, 0);
    assert.ok(existsSync(join(workDir, 'test-project')));
  });

  it('creates .aiconfig.json with the project name and no retired fields', async () => {
    await quiet(() => runInit({ args: { name: 'my-app' }, positional: [] }));
    const config = JSON.parse(readFileSync(join(workDir, 'my-app', '.aiconfig.json'), 'utf8'));
    assert.equal(config.project_name, 'my-app');
    assert.equal(config.repo_type, undefined);
    assert.equal(config.language, undefined);
  });

  it('creates knowledge directory structure', async () => {
    await quiet(() => runInit({ args: { name: 'test' }, positional: [] }));
    assert.ok(existsSync(join(workDir, 'test', 'knowledge', 'research', '.gitkeep')));
    assert.ok(existsSync(join(workDir, 'test', 'knowledge', 'architecture', '.gitkeep')));
    assert.ok(existsSync(join(workDir, 'test', 'knowledge', 'research', '.gitkeep')));
    assert.ok(existsSync(join(workDir, 'test', 'knowledge', 'example.md')));
    assert.ok(!existsSync(join(workDir, 'test', 'knowledge', 'product')));
  });

  it('creates plans directory structure', async () => {
    await quiet(() => runInit({ args: { name: 'test' }, positional: [] }));
    assert.ok(existsSync(join(workDir, 'test', 'plans', '.gitkeep')));
    assert.ok(!existsSync(join(workDir, 'test', 'plans', 'features')));
    assert.ok(!existsSync(join(workDir, 'test', 'knowledge', 'decisions')));
  });

  it('seeds the standards tags from --language, and --standards wins', async () => {
    await quiet(() => runInit({ args: { name: 'a', language: 'CSharp' }, positional: [] }));
    const read = (n) => JSON.parse(readFileSync(join(workDir, n, '.aiconfig.json'), 'utf8'));
    assert.deepEqual(read('a').standards.engineering, ['csharp']);
    await quiet(() =>
      runInit({
        args: { name: 'b', language: 'csharp', standards: 'csharp,avalonia' },
        positional: [],
      }),
    );
    assert.deepEqual(read('b').standards.engineering, ['csharp', 'avalonia']);
  });

  it('does not scaffold project-standards.md (an optional override)', async () => {
    await quiet(() => runInit({ args: { name: 'my-app' }, positional: [] }));
    assert.ok(!existsSync(join(workDir, 'my-app', 'project-standards.md')));
  });

  it('fails if directory already exists without --force', async () => {
    mkdirSync(join(workDir, 'existing'));
    const { code, output } = await quiet(() =>
      runInit({ args: { name: 'existing' }, positional: [] }),
    );
    assert.equal(code, 1);
    assert.ok(output.some((l) => l.includes('already exists')));
  });

  it('succeeds with --force when directory exists', async () => {
    mkdirSync(join(workDir, 'existing'));
    const { code } = await quiet(() =>
      runInit({ args: { name: 'existing', force: true }, positional: [] }),
    );
    assert.equal(code, 0);
    assert.ok(existsSync(join(workDir, 'existing', '.aiconfig.json')));
  });

  it('rejects invalid project names', async () => {
    const { code, output } = await quiet(() =>
      runInit({ args: { name: '.bad-name' }, positional: [] }),
    );
    assert.equal(code, 1);
    assert.ok(output.some((l) => l.includes('Invalid')));
  });

  it('sets project_shortname when --shortname provided', async () => {
    await quiet(() => runInit({ args: { name: 'my-app', shortname: 'myapp' }, positional: [] }));
    const config = JSON.parse(readFileSync(join(workDir, 'my-app', '.aiconfig.json'), 'utf8'));
    assert.equal(config.project_shortname, 'myapp');
  });

  it('falls back project_shortname to project_name when --shortname omitted', async () => {
    await quiet(() => runInit({ args: { name: 'my-app' }, positional: [] }));
    const config = JSON.parse(readFileSync(join(workDir, 'my-app', '.aiconfig.json'), 'utf8'));
    assert.equal(config.project_shortname, 'my-app');
  });

  it('rejects a project short name over 5 characters', async () => {
    const { code, output } = await quiet(() =>
      runInit({ args: { name: 'my-app', shortname: 'toolongname' }, positional: [] }),
    );
    assert.equal(code, 1);
    assert.ok(output.some((l) => l.includes('Invalid project short name')));
  });

  it('scaffolds git hooks and a session-start hook that keep the architecture index fresh', async () => {
    await quiet(() => runInit({ args: { name: 'hooked' }, positional: [] }));
    const root = join(workDir, 'hooked');
    for (const f of ['refresh-index', 'post-merge', 'post-checkout', 'post-rewrite']) {
      const mode = statSync(join(root, '.githooks', f)).mode;
      assert.ok(mode & 0o100, `.githooks/${f} must be executable`);
    }
    assert.ok(statSync(join(root, 'scripts', 'session-start.sh')).mode & 0o100);
    assert.match(
      readFileSync(join(root, '.gitignore'), 'utf8'),
      /^knowledge\/architecture\/index\.json$/m,
    );
    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8'));
    assert.match(settings.hooks.SessionStart[0].hooks[0].command, /scripts\/session-start\.sh/);
    assert.equal(settings.agent, 'engineer');
  });
});
