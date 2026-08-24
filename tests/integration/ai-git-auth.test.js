/**
 * Integration tests for bin/ai-git.js push/fetch auth injection.
 *
 * No Plan ID — small human-approved security bugfix (see chat approval
 * 2026-08-23) covering the push/fetch auth-injection argument-order bug
 * where `ai-git push -u origin <branch>` could echo the authenticated
 * URL (with a live token) to stdout and, in at least one observed case,
 * persist it into a worktree's local .git/config.
 *
 * These tests exercise the real CLI against a real temp git repo with a
 * fake `github.com` remote and a fake token. The actual network push
 * will fail (no real remote/network access), which is fine — the
 * regression under test is that the token must never appear in
 * anything the CLI prints or writes to disk, regardless of push
 * outcome or where -u/--set-upstream appears in the arguments.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const BIN_PATH = resolve(import.meta.dirname, '../../bin/ai-git.js');
const FAKE_TOKEN = 'super-secret-test-token-12345';

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result;
}

function setUpRepo() {
  const root = mkdtempSync(join(tmpdir(), 'ai-git-auth-test-'));

  writeFileSync(
    join(root, '.aiconfig.json'),
    JSON.stringify({
      project_name: 'test-project',
      repo_type: 'framework',
      ai_identity: {
        git_author_name: 'Test Bot',
        git_author_email: 'bot@example.com',
        git_token_env: 'AI_GIT_TOKEN_TEST',
      },
    }),
    'utf8'
  );

  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Test User']);
  runGit(root, ['config', 'user.email', 'test@example.com']);
  writeFileSync(join(root, 'file.txt'), 'hello\n', 'utf8');
  runGit(root, ['add', 'file.txt']);
  runGit(root, ['commit', '-q', '-m', 'initial commit']);
  runGit(root, ['branch', '-M', 'main']);
  // A remote that resolves DNS-wise but will fail auth/connect — that's
  // fine, we only care that nothing leaks before/during that failure.
  runGit(root, ['remote', 'add', 'origin', 'https://github.com/nonexistent-org/nonexistent-repo.git']);

  return root;
}

function tearDownRepo(root) {
  // Windows can briefly hold file handles open after a killed/exited git
  // subprocess; retry a few times rather than failing the test on cleanup.
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function runAiGit(cwd, args) {
  return spawnSync('node', [BIN_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_GIT_TOKEN_TEST: FAKE_TOKEN,
      // Force any real network attempt to fail immediately (connection
      // refused on localhost) instead of hanging on DNS/TLS against a
      // nonexistent GitHub repo. Keeps the test fast and avoids
      // orphaned git subprocesses holding file handles on Windows.
      HTTPS_PROXY: 'http://127.0.0.1:1',
      HTTP_PROXY: 'http://127.0.0.1:1',
      GIT_TERMINAL_PROMPT: '0',
    },
    timeout: 10000,
  });
}

describe('integration: ai-git push auth injection', () => {
  let repo;

  beforeEach(() => {
    repo = setUpRepo();
  });

  afterEach(() => {
    tearDownRepo(repo);
  });

  const pushOrderings = [
    ['push', '-u', 'origin', 'main'],
    ['push', 'origin', '-u', 'main'],
    ['push', 'origin', 'main', '-u'],
    ['push', '--set-upstream', 'origin', 'main'],
    ['push', 'origin', 'main'],
  ];

  for (const args of pushOrderings) {
    it(`never leaks the token to stdout/stderr for: ai-git ${args.join(' ')}`, () => {
      const result = runAiGit(repo, args);

      assert.ok(
        !result.stdout.includes(FAKE_TOKEN),
        `token leaked to stdout: ${result.stdout}`
      );
      assert.ok(
        !result.stderr.includes(FAKE_TOKEN),
        `token leaked to stderr: ${result.stderr}`
      );
    });

    it(`never persists the token into .git/config for: ai-git ${args.join(' ')}`, () => {
      runAiGit(repo, args);

      const gitConfig = readFileSync(join(repo, '.git', 'config'), 'utf8');
      assert.ok(
        !gitConfig.includes(FAKE_TOKEN),
        `token leaked into .git/config: ${gitConfig}`
      );

      // Also guard the specific historical failure mode: branch.<name>.remote
      // must remain the literal remote name "origin", never a URL.
      if (gitConfig.includes('[branch "main"]')) {
        assert.ok(
          !/remote = https?:\/\//.test(gitConfig),
          `branch.main.remote was set to a URL instead of a remote name: ${gitConfig}`
        );
      }
    });
  }

  it('never leaks the token for fetch with flags before the remote', () => {
    const result = runAiGit(repo, ['fetch', '-v', 'origin']);
    assert.ok(!result.stdout.includes(FAKE_TOKEN));
    assert.ok(!result.stderr.includes(FAKE_TOKEN));

    const gitConfig = readFileSync(join(repo, '.git', 'config'), 'utf8');
    assert.ok(!gitConfig.includes(FAKE_TOKEN));
  });
});
