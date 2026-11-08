/**
 * Integration tests for scripts/cloud-setup.sh (the cloud Setup script body).
 *
 * Plan: cloud-setup-fast-start (Milestone 1). curl, sha256sum, tar, unzip and python3
 * are stubbed on a hermetic PATH, so nothing is downloaded and no real binary is installed.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = resolve(import.meta.dirname, '../../scripts/cloud-setup.sh');

// Real utilities the script needs; everything else on PATH is a stub.
const REAL_TOOLS = ['mktemp', 'rm', 'mkdir', 'install', 'mv', 'grep', 'head', 'cat'];

const BASH = spawnSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();
// The script installs Linux release binaries into /usr/local/bin, so it is Linux-only;
// Windows Git Bash cannot run it under a hermetic PATH (POSIX bash path, no symlinks).
const IS_WINDOWS = process.platform === 'win32';
const HAS_BASH = spawnSync('bash', ['-c', 'true']).status === 0;
const HAS_TOOLS = REAL_TOOLS.every((t) => spawnSync('sh', ['-c', `command -v ${t}`]).status === 0);

describe(
  'scripts/cloud-setup.sh',
  {
    skip:
      (IS_WINDOWS && 'Linux-only script') ||
      ((!HAS_BASH || !HAS_TOOLS) && 'bash tools unavailable'),
  },
  () => {
    let dir;
    let stubs;
    let bin;
    let log;

    /** Write an executable shell stub that logs its call, then runs `body`. */
    function stub(name, body = '', where = stubs) {
      const file = join(where, name);
      writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${log}"\n${body}\n`);
      chmodSync(file, 0o755);
    }

    /** An "installed" tool in the target bin dir that reports `version`. */
    function installed(name, version) {
      stub(name, `echo "${name} ${version}"`, bin);
    }

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'cloud-setup-'));
      stubs = join(dir, 'stubs');
      bin = join(dir, 'bin');
      log = join(dir, 'calls.log');
      mkdirSync(stubs);
      mkdirSync(bin);
      for (const tool of REAL_TOOLS) {
        const found = spawnSync('sh', ['-c', `command -v ${tool}`], {
          encoding: 'utf8',
        }).stdout.trim();
        symlinkSync(found, join(stubs, tool));
      }
      // curl writes a placeholder at the -o target; the stubs below fake the extraction.
      stub('curl', 'while [ $# -gt 0 ]; do [ "$1" = -o ] && echo data > "$2"; shift; done');
      // Records its stdin (`<sha>  <file>`), and fails when it matches the STUB_SHA_FAIL glob.
      stub(
        'sha256sum',
        `input=$(cat); echo "sha256sum-input $input" >> "${log}"; case "$input" in $STUB_SHA_FAIL) exit 1;; esac`,
      );
      stub(
        'tar',
        'mkdir -p gh_2.102.0_linux_amd64/bin && printf "#!/bin/sh\\necho gh version 2.102.0\\n" > gh_2.102.0_linux_amd64/bin/gh',
      );
      stub('unzip', 'printf "#!/bin/sh\\necho bws 2.1.0\\n" > bws');
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    function run(env = {}) {
      return spawnSync(BASH, [SCRIPT], {
        encoding: 'utf8',
        env: {
          PATH: stubs,
          CLOUD_SETUP_BIN_DIR: bin,
          CLOUD_SETUP_REPOS_DIR: join(dir, 'home'),
          ...env,
        },
      });
    }

    function calls() {
      return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
    }

    it('installs gh and bws when neither is present', () => {
      const result = run();
      assert.equal(result.status, 0);
      assert.ok(existsSync(join(bin, 'gh')));
      assert.ok(existsSync(join(bin, 'bws')));
      assert.match(result.stdout, /gh 2\.102\.0: installed/);
      assert.match(result.stdout, /bws 2\.1\.0: installed/);
      assert.match(result.stdout, /done$/m);
      assert.equal(result.stderr, '');
    });

    it('skips a tool already at the pinned version and installs the other', () => {
      installed('bws', '2.1.0');
      const result = run();
      assert.equal(result.status, 0);
      assert.match(result.stdout, /bws 2\.1\.0 already installed, skipped/);
      assert.equal(calls().filter((c) => c.startsWith('curl') && c.includes('bws')).length, 0);
      assert.ok(calls().some((c) => c.startsWith('curl') && c.includes('cli/cli')));
    });

    it('replaces a tool installed at another version', () => {
      installed('bws', '1.0.0');
      const result = run();
      assert.equal(result.status, 0);
      assert.match(result.stdout, /bws 2\.1\.0: installed/);
      assert.match(readFileSync(join(bin, 'bws'), 'utf8'), /bws 2\.1\.0/);
    });

    it('is idempotent: a second run downloads nothing', () => {
      run();
      const before = calls().length;
      const second = run();
      assert.equal(second.status, 0);
      assert.equal(calls().length, before);
      assert.match(second.stdout, /gh 2\.102\.0 already installed, skipped/);
      assert.match(second.stdout, /bws 2\.1\.0 already installed, skipped/);
    });

    it('installs nothing and exits 0 on a checksum mismatch', () => {
      const result = run({ STUB_SHA_FAIL: '*' });
      assert.equal(result.status, 0);
      assert.equal(existsSync(join(bin, 'gh')), false);
      assert.equal(existsSync(join(bin, 'bws')), false);
      assert.match(result.stderr, /gh 2\.102\.0: checksum mismatch, not installed/);
      assert.match(result.stderr, /bws 2\.1\.0: checksum mismatch, not installed/);
      assert.match(result.stderr, /done with 2 failure/);
    });

    it('exits 0 and skips the tool when the download fails', () => {
      stub('curl', 'exit 22');
      const result = run();
      assert.equal(result.status, 0);
      assert.equal(existsSync(join(bin, 'bws')), false);
      assert.match(result.stderr, /bws 2\.1\.0: download failed/);
    });

    it('falls back to python3 -m zipfile when unzip is missing', () => {
      rmSync(join(stubs, 'unzip'));
      stub('python3', 'printf "#!/bin/sh\\necho bws 2.1.0\\n" > bws');
      const result = run();
      assert.equal(result.status, 0);
      assert.ok(existsSync(join(bin, 'bws')));
      assert.ok(calls().some((c) => c.startsWith('python3 -m zipfile -e bws.zip')));
    });

    it('checks each archive against its pinned sha256', () => {
      run();
      const inputs = calls().filter((c) => c.startsWith('sha256sum-input '));
      assert.deepEqual(inputs, [
        'sha256sum-input bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386  gh.tar.gz',
        'sha256sum-input ba8233c3a4aee5d43e3c73bbd04d99e9bc5aba13bbbfd06d89b073abe732b860  bws.zip',
      ]);
    });

    it('verifies each tool before extracting it, and extracts nothing that failed', () => {
      run({ STUB_SHA_FAIL: '*bws.zip' });
      const log = calls();
      assert.ok(!log.some((c) => c.startsWith('unzip')), 'bws was extracted despite a mismatch');
      assert.ok(!existsSync(join(bin, 'bws')));
      const gh = log.findIndex((c) => c.startsWith('sha256sum-input') && c.endsWith('gh.tar.gz'));
      assert.ok(
        gh >= 0 && gh < log.findIndex((c) => c.startsWith('tar')),
        'gh extracted before verify',
      );
      assert.ok(existsSync(join(bin, 'gh')));
    });

    it('never prints a token', () => {
      const result = run({
        BWS_ACCESS_TOKEN: 'super-secret-token-xyz',
        AI_GIT_TOKEN: 'super-secret-token-xyz',
      });
      assert.doesNotMatch(result.stdout + result.stderr, /super-secret-token-xyz/);
    });

    describe('AIF_AGENT override', () => {
      const settingsOf = (repo) => join(dir, 'home', repo, '.claude', 'settings.local.json');

      /** A repo directly under the scratch home; `.git` makes it a repo. */
      function repo(name, { git = true } = {}) {
        mkdirSync(join(dir, 'home', name, git ? '.git' : 'src'), { recursive: true });
      }

      beforeEach(() => {
        // Pinned versions already installed, so only the override is under test.
        installed('gh', '2.102.0');
        installed('bws', '2.1.0');
      });

      it('writes nothing when AIF_AGENT is unset', () => {
        repo('app');
        const result = run();
        assert.equal(result.status, 0);
        assert.equal(existsSync(settingsOf('app')), false);
        assert.match(result.stdout, /AIF_AGENT not set/);
      });

      it('writes the agent into each repo and skips directories that are not repos', () => {
        repo('app');
        repo('lib');
        repo('notes', { git: false });
        const result = run({ AIF_AGENT: 'reviewer' });
        assert.equal(result.status, 0);
        assert.equal(readFileSync(settingsOf('app'), 'utf8'), '{"agent":"reviewer"}\n');
        assert.equal(readFileSync(settingsOf('lib'), 'utf8'), '{"agent":"reviewer"}\n');
        assert.equal(existsSync(settingsOf('notes')), false);
        assert.match(result.stdout, /app starts as reviewer/);
        assert.equal(result.stderr, '');
      });

      it('warns, but still writes, when the repo has no such agent file', () => {
        repo('app');
        const result = run({ AIF_AGENT: 'custom' });
        assert.match(result.stdout, /warning: .*app has no \.claude\/agents\/custom\.md/);
        assert.ok(existsSync(settingsOf('app')));
      });

      it('leaves an existing settings.local.json alone', () => {
        repo('app');
        mkdirSync(join(dir, 'home', 'app', '.claude'));
        writeFileSync(settingsOf('app'), '{"agent":"mine"}\n');
        const result = run({ AIF_AGENT: 'reviewer' });
        assert.equal(readFileSync(settingsOf('app'), 'utf8'), '{"agent":"mine"}\n');
        assert.match(result.stdout, /already exists, left alone/);
      });

      it('skips a symlinked repo and a symlinked .claude', () => {
        const outside = join(dir, 'outside');
        mkdirSync(join(outside, '.git'), { recursive: true });
        mkdirSync(join(dir, 'home'), { recursive: true });
        symlinkSync(outside, join(dir, 'home', 'linked'));
        repo('app');
        symlinkSync(outside, join(dir, 'home', 'app', '.claude'));
        const result = run({ AIF_AGENT: 'reviewer' });
        assert.equal(result.status, 0);
        assert.equal(existsSync(join(outside, '.claude')), false);
        assert.equal(existsSync(join(outside, 'settings.local.json')), false);
        assert.match(result.stdout, /linked is a symlink, skipped/);
        assert.match(result.stdout, /app is a symlink, skipped/);
      });

      for (const bad of [
        '../x',
        'a b',
        '$(id)',
        'UPPER',
        '-lead',
        '"quoted"',
        'ok\n../x',
        'a'.repeat(65),
      ]) {
        it(`rejects the invalid name ${JSON.stringify(bad.slice(0, 20))} without writing`, () => {
          repo('app');
          const result = run({ AIF_AGENT: bad });
          assert.equal(result.status, 0);
          assert.equal(existsSync(settingsOf('app')), false);
          assert.match(result.stderr, /AIF_AGENT is not a valid agent name/);
          assert.match(result.stderr, /agent override not fully applied/);
          assert.doesNotMatch(result.stderr, /missing tool/);
          assert.doesNotMatch(result.stderr + result.stdout, /\$\(id\)|\.\.\/x/);
        });
      }

      it('accepts the boundary names a and 64 characters', () => {
        repo('app');
        for (const ok of ['a', 'a'.repeat(64), 'eng_1-x']) {
          rmSync(join(dir, 'home', 'app', '.claude'), { recursive: true, force: true });
          run({ AIF_AGENT: ok });
          assert.equal(readFileSync(settingsOf('app'), 'utf8'), `{"agent":"${ok}"}\n`);
        }
      });

      it('is idempotent: a second run changes nothing', () => {
        repo('app');
        run({ AIF_AGENT: 'reviewer' });
        const second = run({ AIF_AGENT: 'reviewer' });
        assert.equal(readFileSync(settingsOf('app'), 'utf8'), '{"agent":"reviewer"}\n');
        assert.match(second.stdout, /already exists, left alone/);
      });

      it('does nothing and exits 0 when the repos directory is missing', () => {
        const result = run({ AIF_AGENT: 'reviewer' });
        assert.equal(result.status, 0);
        assert.equal(result.stderr, '');
      });
    });
  },
);
