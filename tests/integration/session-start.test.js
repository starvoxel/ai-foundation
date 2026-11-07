/**
 * Integration tests for scripts/session-start.sh (the cloud SessionStart hook).
 *
 * Plan: AIF-008 (Task 004). npm, node and ai-git are stubbed on PATH so the
 * tests only observe what the hook would run, without installing anything.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = resolve(import.meta.dirname, '../../scripts/session-start.sh');
const REPO_ROOT = resolve(import.meta.dirname, '../..');

// The hook is a Bash script, so the suite needs a `bash` on PATH (Git Bash on
// Windows). Skip, rather than fail, where there is none.
const HAS_BASH = spawnSync('bash', ['-c', 'true']).status === 0;

describe('scripts/session-start.sh', { skip: !HAS_BASH && 'bash not available' }, () => {
  let dir;
  let log;

  /** Replace a stub so it logs its call and then exits with `code`. */
  function stub(tool, code = 0) {
    const file = join(dir, tool);
    writeFileSync(file, `#!/bin/sh\necho "${tool} $*" >> "${log}"\nexit ${code}\n`);
    chmodSync(file, 0o755);
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'session-start-'));
    log = join(dir, 'calls.log');
    for (const tool of ['npm', 'node', 'ai-git']) stub(tool);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(env) {
    return spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        CLAUDE_PROJECT_DIR: REPO_ROOT,
        ...env,
      },
    });
  }

  function calls() {
    return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  }

  it('does nothing outside a cloud session', () => {
    const result = run({});
    assert.equal(result.status, 0);
    assert.deepEqual(calls(), []);
  });

  it('links ai-git, builds the index and runs doctor', () => {
    const result = run({ CLAUDE_CODE_REMOTE: 'true' });
    assert.equal(result.status, 0);
    assert.deepEqual(calls(), [
      'npm ci --ignore-scripts --no-audit --no-fund',
      'npm link --ignore-scripts',
      'node bin/aif.js index architecture',
      'ai-git doctor',
    ]);
  });

  it('installs no bundles even when AIF_BUNDLES is set (project scope owns them)', () => {
    run({ CLAUDE_CODE_REMOTE: 'true', AIF_BUNDLES: 'engineering,generic' });
    assert.ok(!calls().some((c) => c.includes('install')));
  });

  it('only installs its own dependencies, with --ignore-scripts', () => {
    run({ CLAUDE_CODE_REMOTE: 'true' });
    for (const call of calls().filter((c) => c.startsWith('npm '))) {
      assert.match(call, /^npm (ci|link) --ignore-scripts/);
      assert.doesNotMatch(call, / -g( |$)|--global/);
    }
  });

  it('warns and still runs the later steps when npm link fails', () => {
    stub('npm', 1);
    const result = run({ CLAUDE_CODE_REMOTE: 'true' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /npm link failed/);
    assert.deepEqual(calls(), [
      'npm ci --ignore-scripts --no-audit --no-fund',
      'npm link --ignore-scripts',
      'node bin/aif.js index architecture',
      'ai-git doctor',
    ]);
  });

  it('reports doctor problems on stderr but exits 0 (report only)', () => {
    stub('ai-git', 1);
    const result = run({ CLAUDE_CODE_REMOTE: 'true' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /ai-git doctor reported problems/);
  });

  it('warns and exits 0 when the project directory cannot be entered', () => {
    const result = run({
      CLAUDE_CODE_REMOTE: 'true',
      CLAUDE_PROJECT_DIR: join(dir, 'does-not-exist'),
    });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /cannot enter the project directory/);
    assert.deepEqual(calls(), []);
  });

  it('exits 0 with warnings when ai-git is missing and npm fails', () => {
    // A stub that behaves like a missing command (exit 127), so the test stays
    // hermetic even when a real ai-git is on the machine's PATH.
    writeFileSync(
      join(dir, 'ai-git'),
      '#!/bin/sh\necho "ai-git: command not found" >&2\nexit 127\n',
    );
    stub('npm', 1);
    const result = run({ CLAUDE_CODE_REMOTE: 'true' });
    assert.equal(result.status, 0);
    assert.match(result.stderr, /npm ci failed/);
    assert.match(result.stderr, /npm link failed/);
    assert.match(result.stderr, /ai-git doctor reported problems/);
  });

  describe('projects/_template/scripts/session-start.sh', () => {
    const TEMPLATE = resolve(
      import.meta.dirname,
      '../../projects/_template/scripts/session-start.sh',
    );

    it('builds the index but installs no bundles, even with AIF_BUNDLES set', () => {
      stub('aif');
      const result = spawnSync('bash', [TEMPLATE], {
        encoding: 'utf8',
        env: {
          PATH: `${dir}${delimiter}${process.env.PATH}`,
          CLAUDE_PROJECT_DIR: dir,
          CLAUDE_CODE_REMOTE: 'true',
          AIF_BUNDLES: 'engineering',
        },
      });
      assert.equal(result.status, 0);
      assert.deepEqual(calls(), ['aif index architecture']);
    });
  });
});
