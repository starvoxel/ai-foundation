/**
 * Integration tests for bin/ai-git.js SSH commit signing.
 *
 * Plan: docs/plans/ai-git-ssh-signing.md (milestone 2)
 *
 * Uses a real throwaway ed25519 key from `ssh-keygen` (a missing
 * `ssh-keygen` fails the tests rather than skipping them) and verifies
 * signatures with `git` against an allowed-signers file built here.
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const BIN_PATH = resolve(import.meta.dirname, '../../bin/ai-git.js');
const KEY_VAR = 'AI_GIT_SIGNING_KEY_TEST';
const EMAIL = 'signer@example.com';

let keyText;
let publicKey;

// Isolate from the host's git config: a global commit.gpgsign or signing
// program would otherwise sign (or fail to sign) these commits itself.
let isolatedGitEnv = {};

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: 30000,
    ...opts,
    env: { ...process.env, ...isolatedGitEnv, ...opts.env },
  });
}

function git(cwd, args) {
  const r = run('git', args, { cwd });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function setUpRepo(aiIdentity = {}, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ai-git-signing-'));
  writeFileSync(
    join(root, '.aiconfig.json'),
    JSON.stringify({
      project_name: 'test-project',
      ai_identity: {
        git_author_name: 'Test Signer',
        git_author_email: EMAIL,
        git_signing_key_env: KEY_VAR,
        ...aiIdentity,
      },
      ...extra,
    }),
    'utf8',
  );
  git(root, ['init', '-q']);
  writeFileSync(join(root, 'file.txt'), 'hello\n', 'utf8');
  git(root, ['add', 'file.txt']);
  return root;
}

function aiGit(cwd, args, { key, tmp }) {
  const env = { ...process.env, ...isolatedGitEnv, TMPDIR: tmp, TEMP: tmp, TMP: tmp };
  delete env[KEY_VAR];
  delete env.AIF_SECRETS_WRAPPED;
  delete env.AIF_REEXEC_ARGS;
  if (key !== undefined) env[KEY_VAR] = key;
  return run('node', [BIN_PATH, ...args], { cwd, env });
}

function signatureStatus(root, signersFile) {
  return git(root, [
    '-c',
    'gpg.format=ssh',
    '-c',
    `gpg.ssh.allowedSignersFile=${signersFile}`,
    'log',
    '-1',
    '--format=%G?',
  ]);
}

describe('integration: ai-git SSH commit signing', () => {
  let repo;
  let work;
  let tmp;
  let signersFile;

  before(() => {
    const emptyConfigDir = mkdtempSync(join(tmpdir(), 'ai-git-gitconfig-'));
    const emptyConfig = join(emptyConfigDir, 'gitconfig');
    writeFileSync(emptyConfig, '', 'utf8');
    isolatedGitEnv = { GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1' };
    const dir = mkdtempSync(join(tmpdir(), 'ai-git-keygen-'));
    const keyPath = join(dir, 'key');
    const r = run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', keyPath]);
    assert.equal(r.status, 0, `ssh-keygen failed: ${r.stderr}${r.error ?? ''}`);
    keyText = readFileSync(keyPath, 'utf8');
    publicKey = readFileSync(`${keyPath}.pub`, 'utf8').trim();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'ai-git-signing-work-'));
    tmp = join(work, 'tmp');
    writeFileSync(join(work, 'signers'), `${EMAIL} namespaces="git" ${publicKey}\n`, 'utf8');
    signersFile = join(work, 'signers');
    mkdirSync(tmp);
    repo = setUpRepo();
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('produces a commit whose signature verifies, and leaves no temp key behind', () => {
    const r = aiGit(repo, ['commit', '-m', 'signed'], { key: keyText, tmp });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(signatureStatus(repo, signersFile), 'G');
    assert.deepEqual(readdirSync(tmp), []);
    assert.ok(!r.stdout.includes('PRIVATE KEY') && !r.stderr.includes('PRIVATE KEY'));
  });

  it('removes the temp key when git itself fails', () => {
    git(repo, ['reset', '-q']);
    const r = aiGit(repo, ['commit', '-m', 'nothing to commit'], { key: keyText, tmp });
    assert.notEqual(r.status, 0);
    assert.deepEqual(readdirSync(tmp), []);
  });

  it('signs with the configured key even when the host config sets another signer', () => {
    const hostConfig = join(work, 'host-gitconfig');
    writeFileSync(
      hostConfig,
      '[gpg "ssh"]\n\tprogram = definitely-not-a-signer\n[commit]\n\tgpgsign = true\n',
      'utf8',
    );
    const r = run('node', [BIN_PATH, 'commit', '-m', 'signed'], {
      cwd: repo,
      env: { GIT_CONFIG_GLOBAL: hostConfig, [KEY_VAR]: keyText, TMPDIR: tmp, TEMP: tmp, TMP: tmp },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(signatureStatus(repo, signersFile), 'G');
  });

  it('does not persist signing config in .git/config', () => {
    aiGit(repo, ['commit', '-m', 'signed'], { key: keyText, tmp });
    const config = readFileSync(join(repo, '.git', 'config'), 'utf8');
    assert.doesNotMatch(config, /signingkey|gpgsign|ssh/i);
  });

  it('spawns no secrets.run command when the key is already in the environment', () => {
    rmSync(repo, { recursive: true, force: true });
    repo = setUpRepo({}, { secrets: { run: ['definitely-not-a-real-command'] } });
    const r = aiGit(repo, ['commit', '-m', 'signed'], { key: keyText, tmp });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(signatureStatus(repo, signersFile), 'G');
    assert.doesNotMatch(r.stderr, /definitely-not-a-real-command|secrets\.run/);
  });

  it('fetches the key through secrets.run when it is missing from the environment', () => {
    const wrapper = join(work, 'wrapper.mjs');
    writeFileSync(
      wrapper,
      `import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const key = readFileSync(${JSON.stringify(join(work, 'wrapped-key'))}, 'utf8');
const [cmd, ...rest] = process.argv.slice(2);
const r = spawnSync(cmd, rest, { env: { ...process.env, ${KEY_VAR}: key }, stdio: 'inherit' });
process.exit(r.status ?? 1);
`,
      'utf8',
    );
    writeFileSync(join(work, 'wrapped-key'), keyText, 'utf8');
    rmSync(repo, { recursive: true, force: true });
    repo = setUpRepo({}, { secrets: { run: ['node', wrapper] } });
    const r = aiGit(repo, ['commit', '-m', 'signed'], { tmp });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(signatureStatus(repo, signersFile), 'G');
    assert.deepEqual(readdirSync(tmp), []);
  });

  it('fails without committing when signing is required and the key is unavailable', () => {
    const r = aiGit(repo, ['commit', '-m', 'unsigned'], { tmp });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, new RegExp(`ERROR: ${KEY_VAR} is not set`));
    assert.notEqual(run('git', ['rev-parse', '--verify', 'HEAD'], { cwd: repo }).status, 0);
  });

  it('warns and commits unsigned when signing is not required and the key is unavailable', () => {
    rmSync(repo, { recursive: true, force: true });
    repo = setUpRepo({ git_signing_required: false });
    const r = aiGit(repo, ['commit', '-m', 'unsigned'], { tmp });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, new RegExp(`WARNING: ${KEY_VAR} is not set`));
    assert.equal(signatureStatus(repo, signersFile), 'N');
  });

  it('rejects a malformed key without echoing it', () => {
    const bad = 'not-a-key-hunter2-secret';
    const r = aiGit(repo, ['commit', '-m', 'unsigned'], { key: bad, tmp });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /not a valid private key/);
    assert.ok(!r.stderr.includes('hunter2') && !r.stdout.includes('hunter2'));
    assert.deepEqual(readdirSync(tmp), []);
  });

  it('leaves commits unsigned and silent when signing is not configured', () => {
    rmSync(repo, { recursive: true, force: true });
    repo = setUpRepo({ git_signing_key_env: undefined });
    const r = aiGit(repo, ['commit', '-m', 'plain'], { key: keyText, tmp });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
    assert.equal(signatureStatus(repo, signersFile), 'N');
  });

  it('does not touch the key for non-commit subcommands', () => {
    const r = aiGit(repo, ['status', '--short'], { tmp });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  });
});
