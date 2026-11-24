/**
 * Integration test for bin/ai-git.js: a signing temp directory left behind by a killed run
 * (SIGINT/SIGTERM skips the cleanup) is swept on the next signing command, a recent one
 * (a concurrent run) is not. Needs no key: the sweep runs before the key is read.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const BIN_PATH = resolve(import.meta.dirname, '../../bin/ai-git.js');
const KEY_VAR = 'AI_GIT_SIGNING_KEY_SWEEP_TEST';

describe('integration: ai-git sweeps stale signing temp dirs', () => {
  let repo;
  let tmp;

  const git = (args) =>
    spawnSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
    });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'ai-git-sweep-repo-'));
    tmp = mkdtempSync(join(tmpdir(), 'ai-git-sweep-tmp-'));
    writeFileSync(
      join(repo, '.aiconfig.json'),
      JSON.stringify({
        project_name: 'sweep',
        ai_identity: {
          git_author_name: 'Sweep Test',
          git_author_email: 'sweep@example.com',
          git_signing_key_env: KEY_VAR,
          git_signing_required: false,
        },
      }),
    );
    git(['init', '-q']);
    writeFileSync(join(repo, 'f.txt'), 'x\n');
    git(['add', 'f.txt']);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(tmp, { recursive: true, force: true });
  });

  it('removes an hours-old ai-git-sign-* dir and keeps a fresh one and unrelated dirs', () => {
    const old = join(tmp, 'ai-git-sign-old');
    const fresh = join(tmp, 'ai-git-sign-fresh');
    const other = join(tmp, 'unrelated');
    for (const dir of [old, fresh, other]) mkdirSync(dir);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(old, twoHoursAgo, twoHoursAgo);
    utimesSync(other, twoHoursAgo, twoHoursAgo);

    const env = {
      ...process.env,
      TMPDIR: tmp,
      TEMP: tmp,
      TMP: tmp,
      GIT_CONFIG_GLOBAL: '/dev/null',
    };
    delete env[KEY_VAR];
    delete env.AIF_SECRETS_WRAPPED;
    delete env.AIF_REEXEC_ARGS;
    const r = spawnSync('node', [BIN_PATH, 'commit', '-q', '-m', 'sweep'], {
      cwd: repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(old), false, 'stale signing dir removed');
    assert.equal(existsSync(fresh), true, 'recent signing dir kept');
    assert.equal(existsSync(other), true, 'unrelated dir kept');
  });
});
