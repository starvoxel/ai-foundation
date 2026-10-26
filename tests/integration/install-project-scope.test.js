// ------------------------------
// install-project-scope.test.js
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Integration tests for `aif install --scope project`: files land in the
 * project, are free of machine-specific paths, the manifest is committed with
 * relative paths, and update, uninstall, status, --check and --skip-project
 * honour the scope.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import YAML from 'yaml';

import { runInstall } from '../../lib/commands/install.js';
import { runUninstall } from '../../lib/commands/uninstall.js';
import { runStatus } from '../../lib/commands/status.js';
import {
  TARGETS as CLAUDE_TARGETS,
  PROJECT_HOOK_SCRIPT,
  projectStdioEntry,
} from '../../lib/harnesses/claude.js';
import { TARGETS as KIRO_TARGETS } from '../../lib/harnesses/kiro.js';
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

describe('integration: install --scope project', () => {
  let repo;
  let project;
  let claudeBefore;
  let kiroBefore;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        {
          name: 'guarded',
          version: '0.1.0',
          domain: 'eng',
          description: 'Agent with blocked commands.',
          prompt: 'You are guarded.',
          tools: ['read', 'shell'],
          approved_tools: ['read'],
          skills: ['skill/test-skill'],
          blocked_commands: ['git *'],
        },
      ],
      skills: ['test-skill'],
      steering: { global: ['core.md'], eng: ['rules.md'] },
      servers: ['local'],
      bundles: [
        { name: 'eng', version: '1.0.0', description: 'Test bundle.', domain: 'eng' },
        { name: 'with-local', version: '1.0.0', description: 'Stdio server.', servers: ['local'] },
        { name: 'with-web', version: '1.0.0', description: 'HTTP server.', servers: ['web'] },
      ],
    });
    mkdirSync(join(repo, 'servers', 'web'), { recursive: true });
    writeFileSync(
      join(repo, 'servers', 'web', 'web.yaml'),
      YAML.stringify({
        name: 'web',
        version: '0.1.0',
        protocol: 'mcp',
        transport: 'http',
        url: 'https://example.test/mcp',
        description: 'web server',
        tools: [],
      }),
    );
    project = mkdtempSync(join(tmpdir(), 'aif-project-'));
    claudeBefore = { ...CLAUDE_TARGETS };
    kiroBefore = { ...KIRO_TARGETS };
  });

  afterEach(() => {
    destroyTempRepo(repo);
    rmSync(project, { recursive: true, force: true });
  });

  const install = (args) =>
    capture(() =>
      runInstall({ args: { scope: 'project', ...args }, positional: [] }, repo, project),
    );

  it('writes every Claude component under the project and leaves global targets alone', () => {
    const { code } = install({ bundle: 'eng', harness: 'claude' });
    assert.equal(code, 0);
    for (const rel of [
      '.claude/agents/guarded.md',
      '.claude/rules/global-core.md',
      '.claude/rules/eng-rules.md',
      '.claude/skills/test-skill/SKILL.md',
      '.claude/scripts/block-command/cli.js',
      '.claude/.installs.yaml',
    ]) {
      assert.ok(existsSync(join(project, ...rel.split('/'))), `${rel} exists`);
    }
    assert.deepEqual({ ...CLAUDE_TARGETS }, claudeBefore, 'targets restored after install');
  });

  it('writes no machine-specific path into the agent or the manifest', () => {
    install({ bundle: 'eng', harness: 'claude' });
    const agent = readFileSync(join(project, '.claude', 'agents', 'guarded.md'), 'utf8');
    const manifest = readFileSync(join(project, '.claude', '.installs.yaml'), 'utf8');
    for (const text of [agent, manifest]) {
      assert.ok(!text.includes(project), 'no project path');
      assert.ok(!text.includes(homedir()), 'no home path');
      assert.ok(!text.includes(process.execPath), 'no node path');
    }
    assert.ok(agent.includes('.claude/scripts/block-command/cli.js'));
    const frontmatter = YAML.parse(agent.split('---')[1]);
    assert.equal(
      frontmatter.hooks.PreToolUse[0].hooks[0].command,
      `node "${PROJECT_HOOK_SCRIPT}" "git *"`,
    );
    const stored = YAML.parse(manifest).bundles.eng_claude.files.map((f) => f.path);
    assert.ok(stored.includes('.claude/agents/guarded.md'));
  });

  it('reinstalls on every run, and update reinstalls from the project manifest', () => {
    install({ bundle: 'eng', harness: 'claude' });
    const again = install({ bundle: 'eng', harness: 'claude' });
    assert.ok(!again.output.includes('already current'));
    const update = install({ update: true });
    assert.equal(update.code, 0);
    assert.ok(update.output.includes('eng → claude: updating'));
  });

  it('uninstalls only the project install', () => {
    install({ bundle: 'eng', harness: 'claude' });
    const { code } = capture(() =>
      runUninstall(
        { args: { bundle: 'eng', harness: 'claude', scope: 'project' }, positional: [] },
        repo,
        project,
      ),
    );
    assert.equal(code, 0);
    assert.ok(!existsSync(join(project, '.claude', 'agents', 'guarded.md')));
    assert.ok(!existsSync(join(project, '.claude', 'scripts', 'block-command', 'cli.js')));
  });

  it('reports project status separately from global status', () => {
    install({ bundle: 'eng', harness: 'claude' });
    const project_ = capture(() =>
      runStatus({ args: { scope: 'project' }, positional: [] }, repo, project),
    );
    assert.ok(project_.output.includes('eng → claude'));
    const global = capture(() => runStatus({ args: {}, positional: [] }, repo, project));
    assert.ok(global.output.includes('Nothing installed at global scope'));
  });

  it('--check reports a clean install, then changed, missing and retired files, and exits 0', () => {
    install({ bundle: 'eng', harness: 'claude' });
    const clean = install({ check: true });
    assert.equal(clean.code, 0);
    assert.ok(clean.output.includes('project install is current'), clean.output);

    appendFileSync(join(project, '.claude', 'agents', 'guarded.md'), 'edited\n');
    unlinkSync(join(project, '.claude', 'rules', 'eng-rules.md'));
    unlinkSync(join(repo, 'steering', 'global', 'core.md'));
    const drift = install({ check: true });
    assert.equal(drift.code, 0);
    assert.ok(drift.output.includes('changed: .claude/agents/guarded.md'), drift.output);
    assert.ok(drift.output.includes('missing: .claude/rules/eng-rules.md'), drift.output);
    assert.ok(drift.output.includes('retired: .claude/rules/global-core.md'), drift.output);
  });

  it('--check with no project install says so', () => {
    const { code, output } = install({ check: true });
    assert.equal(code, 0);
    assert.ok(output.includes('No project-scope install found'));
  });

  it('--check is refused outside project scope', () => {
    const { code } = capture(() =>
      runInstall({ args: { check: true }, positional: [] }, repo, project),
    );
    assert.equal(code, 1);
  });

  it('--skip-project skips a global install of a bundle the project already installs', () => {
    install({ bundle: 'eng', harness: 'claude' });
    const { code, output } = capture(() =>
      runInstall(
        { args: { bundle: 'eng', harness: 'claude', 'skip-project': true }, positional: [] },
        repo,
        project,
      ),
    );
    assert.equal(code, 0);
    assert.ok(output.includes('installed at project scope, skipping'));
    assert.ok(!existsSync(join(repo, '.installs.yaml')), 'nothing installed globally');
  });

  it('rejects an unknown scope', () => {
    const { code, output } = install({ bundle: 'eng', harness: 'claude', scope: 'user' });
    assert.equal(code, 1);
    assert.ok(output.includes('Unknown scope: user'));
  });

  it('writes Kiro components under .kiro with a relative manifest', () => {
    const { code } = install({ bundle: 'eng', harness: 'kiro' });
    assert.equal(code, 0);
    assert.ok(existsSync(join(project, '.kiro', 'agents', 'guarded.json')));
    assert.ok(existsSync(join(project, '.kiro', 'steering', 'global-core.md')));
    assert.ok(existsSync(join(project, '.kiro', 'skills', 'test-skill', 'SKILL.md')));
    const manifest = readFileSync(join(project, '.kiro', '.installs.yaml'), 'utf8');
    assert.ok(!manifest.includes(project));
    assert.deepEqual({ ...KIRO_TARGETS }, kiroBefore, 'targets restored after install');
  });

  it('installs a Claude stdio server with its launcher and a portable .mcp.json entry', () => {
    const { code, output } = install({ bundle: 'with-local', harness: 'claude' });
    assert.equal(code, 0, output);
    const dir = join(project, '.claude', 'servers', 'local');
    assert.ok(existsSync(join(dir, 'local.yaml')));
    assert.ok(existsSync(join(dir, 'aif-launch.mjs')));
    assert.equal(
      readFileSync(join(dir, '.gitignore'), 'utf8'),
      'node_modules/\n.aif-install.lock\n',
    );
    assert.ok(!existsSync(join(dir, 'node_modules')), 'dependencies are not installed by aif');

    const mcp = readFileSync(join(project, '.mcp.json'), 'utf8');
    assert.deepEqual(JSON.parse(mcp).mcpServers.local, projectStdioEntry('local'));
    assert.ok(!mcp.includes(project) && !mcp.includes(homedir()), 'no machine path');

    const manifest = YAML.parse(readFileSync(join(project, '.claude', '.installs.yaml'), 'utf8'));
    assert.ok(manifest.servers.local_claude.files.some((f) => f.path.endsWith('aif-launch.mjs')));
    assert.ok(install({ check: true }).output.includes('project install is current'));

    capture(() =>
      runUninstall(
        { args: { bundle: 'with-local', harness: 'claude', scope: 'project' }, positional: [] },
        repo,
        project,
      ),
    );
    assert.ok(!existsSync(dir));
    assert.equal(
      JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf8')).mcpServers.local,
      undefined,
    );
  });

  it('leaves a Kiro stdio server skipped and unowned: not recorded, checked or uninstalled', () => {
    const { code, output } = install({ bundle: 'with-local', harness: 'kiro' });
    assert.equal(code, 0);
    assert.ok(output.includes('server: local skipped'), output);
    const manifest = YAML.parse(readFileSync(join(project, '.kiro', '.installs.yaml'), 'utf8'));
    assert.deepEqual(manifest.servers, {});
    assert.deepEqual(manifest.bundles['with-local_kiro'].servers, []);

    // The project adds its own server of the same name.
    const mcpPath = join(project, '.kiro', 'settings', 'mcp.json');
    mkdirSync(join(project, '.kiro', 'settings'), { recursive: true });
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { local: { command: 'mine' } } }));
    mkdirSync(join(project, '.kiro', 'servers', 'local'), { recursive: true });

    const check = install({ check: true });
    assert.ok(check.output.includes('project install is current'), check.output);
    capture(() =>
      runUninstall(
        { args: { bundle: 'with-local', harness: 'kiro', scope: 'project' }, positional: [] },
        repo,
        project,
      ),
    );
    assert.equal(JSON.parse(readFileSync(mcpPath, 'utf8')).mcpServers.local.command, 'mine');
    assert.ok(existsSync(join(project, '.kiro', 'servers', 'local')));
  });

  it('--check compares only aif-owned entries in .mcp.json', () => {
    install({ bundle: 'with-web', harness: 'claude' });
    const mcpPath = join(project, '.mcp.json');
    const settings = JSON.parse(readFileSync(mcpPath, 'utf8'));
    assert.equal(settings.mcpServers.web.url, 'https://example.test/mcp');

    settings.mcpServers.mine = { type: 'http', url: 'https://mine.test' };
    writeFileSync(mcpPath, JSON.stringify(settings, null, 4));
    const clean = install({ check: true });
    assert.ok(clean.output.includes('project install is current'), clean.output);

    settings.mcpServers.web.url = 'https://stale.test/mcp';
    writeFileSync(mcpPath, JSON.stringify(settings));
    const drift = install({ check: true });
    assert.ok(drift.output.includes('changed: .mcp.json#web'), drift.output);
    assert.ok(!drift.output.includes('#mine'), drift.output);
  });

  it('--check ignores entries a project adds to Kiro mcp.json', () => {
    install({ bundle: 'with-web', harness: 'kiro' });
    const mcpPath = join(project, '.kiro', 'settings', 'mcp.json');
    const settings = JSON.parse(readFileSync(mcpPath, 'utf8'));
    settings.mcpServers.mine = { url: 'https://mine.test' };
    writeFileSync(mcpPath, JSON.stringify(settings));
    const { output } = install({ check: true });
    assert.ok(output.includes('kiro (with-web): project install is current'), output);
  });

  it('refuses --skip-project with --scope project', () => {
    const { code } = install({ bundle: 'eng', harness: 'claude', 'skip-project': true });
    assert.equal(code, 1);
  });

  it('rejects an unknown scope in uninstall and status', () => {
    const args = { bundle: 'eng', harness: 'claude', scope: 'user' };
    assert.equal(capture(() => runUninstall({ args, positional: [] }, repo, project)).code, 1);
    assert.equal(
      capture(() => runStatus({ args: { scope: 'user' }, positional: [] }, repo, project)).code,
      1,
    );
  });

  it('restores targets after a failing install', () => {
    const { code } = install({ bundle: 'no-such-bundle', harness: 'claude' });
    assert.equal(code, 1);
    assert.deepEqual({ ...CLAUDE_TARGETS }, claudeBefore);
  });
});
