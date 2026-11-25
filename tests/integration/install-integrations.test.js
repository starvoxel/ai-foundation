// ------------------------------
// install-integrations.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Plan: aif-project-integrations (Milestone 3). `aif install -I` writes the project-side files,
 * is idempotent, never overwrites an edited file without --force, records what it wrote in
 * `.aif/.installs.yaml`, and `--update` and `--check` keep and report them. Everything runs in
 * temporary directories: the ai-foundation root is a copy holding only the templates.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';

import { runInstall } from '../../lib/commands/install.js';
import { INTEGRATIONS } from '../../lib/integrations.js';
import { resolvePin } from '../../lib/commands/install-integrations.js';

const REAL_ROOT = resolve(import.meta.dirname, '../..');
const PIN = { pin: 'a'.repeat(40), 'pin-version': 'v0.6.0' };
const NEWER_PIN = { pin: 'b'.repeat(40), 'pin-version': 'v0.7.0' };
const noExecBit = process.platform === 'win32' && 'Windows has no POSIX executable bit';
const noSymlinks =
  process.platform === 'win32' && 'creating a symlink needs a privilege Windows CI does not grant';

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

describe('integration: install -I', () => {
  let aif;
  let project;

  beforeEach(() => {
    aif = mkdtempSync(join(tmpdir(), 'aif-root-'));
    writeFileSync(join(aif, 'package.json'), JSON.stringify({ version: '9.9.9' }));
    for (const dir of [
      'lib/integrations/assets',
      'projects/_template/.githooks',
      'projects/_template/scripts',
    ]) {
      cpSync(join(REAL_ROOT, dir), join(aif, dir), { recursive: true });
    }
    project = mkdtempSync(join(tmpdir(), 'aif-integrations-'));
    writeFileSync(join(project, '.aiconfig.json'), '{}\n');
  });

  afterEach(() => {
    rmSync(aif, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });

  const run = (args) =>
    capture(() => runInstall({ args: { ...PIN, ...args }, positional: [] }, aif, project));
  const read = (target) => readFileSync(join(project, ...target.split('/')), 'utf8');
  const manifest = () => YAML.parse(read('.aif/.installs.yaml'));

  describe('on an empty project', () => {
    it('writes every file of every integration', () => {
      const { code } = run({ integration: 'all' });
      assert.equal(code, 0);
      for (const integration of Object.values(INTEGRATIONS)) {
        for (const file of integration.files)
          assert.ok(existsSync(join(project, ...file.target.split('/'))), file.target);
      }
    });

    it('pins the workflows to the given release', () => {
      run({ integration: 'all' });
      assert.match(
        read('.github/workflows/aif-checks.yml'),
        new RegExp(`checks@${PIN.pin} # v0.6.0`),
      );
      assert.match(
        read('.github/workflows/aif-update.yml'),
        new RegExp(`update-bundles.yml@${PIN.pin} # v0.6.0`),
      );
    });

    it('sets the executable bit on scripts', { skip: noExecBit }, () => {
      run({ integration: 'hooks,session-start' });
      assert.ok(statSync(join(project, '.githooks', 'commit-msg')).mode & 0o100);
      assert.ok(statSync(join(project, 'scripts', 'session-start.sh')).mode & 0o100);
    });

    it('records each file and the aif version in .aif/.installs.yaml, with relative paths', () => {
      run({ integration: 'hooks,checks' });
      const { integrations } = manifest();
      assert.deepEqual(Object.keys(integrations).sort(), ['checks', 'hooks']);
      assert.equal(integrations.checks.version, '9.9.9');
      assert.equal(integrations.checks.files[0].path, '.github/workflows/aif-checks.yml');
      assert.match(integrations.checks.files[0].hash, /^sha256:/);
      assert.ok(!JSON.stringify(manifest()).includes(project), 'no machine path');
    });

    it('is idempotent: a second run reports every file current and changes nothing', () => {
      run({ integration: 'all' });
      const before = read('.aif/.installs.yaml');
      const mtime = statSync(join(project, '.githooks', 'refresh-index')).mtimeMs;
      const { output } = run({ integration: 'all' });
      assert.equal(output.match(/already current/g).length, 8);
      assert.doesNotMatch(output, /new file|updated|⚠/);
      assert.equal(read('.aif/.installs.yaml'), before);
      assert.equal(statSync(join(project, '.githooks', 'refresh-index')).mtimeMs, mtime);
    });

    it('works with -B in the same command, and with the -I short flag through the parser', () => {
      const { code, output } = run({
        integration: 'hooks',
        bundle: 'no-such-bundle',
        harness: 'claude',
      });
      assert.equal(code, 1, 'the bundle half still fails');
      assert.match(output, /hooks: \.githooks\/commit-msg \(new file\)/);
    });

    it('prints what to add to the files the project owns, and edits none of them', () => {
      const { output } = run({ integration: 'checks,session-start' });
      assert.match(output, /\.github\/dependabot\.yml is yours/);
      assert.match(output, /\.claude\/settings\.json is yours/);
      assert.equal(existsSync(join(project, '.github', 'dependabot.yml')), false);
      assert.equal(existsSync(join(project, '.claude', 'settings.json')), false);
    });
  });

  describe('on a partly set up project', () => {
    it('records a file that already matches without rewriting it', () => {
      mkdirSync(join(project, '.githooks'));
      const template = readFileSync(
        join(aif, 'projects/_template/.githooks/refresh-index'),
        'utf8',
      );
      writeFileSync(join(project, '.githooks', 'refresh-index'), template);
      const { output } = run({ integration: 'hooks' });
      assert.match(output, /refresh-index \(already matches; now recorded/);
      assert.ok(
        manifest().integrations.hooks.files.some((f) => f.path === '.githooks/refresh-index'),
      );
    });

    it('leaves a file it did not install alone and says so', () => {
      mkdirSync(join(project, 'scripts'));
      writeFileSync(join(project, 'scripts', 'session-start.sh'), '#!/bin/sh\necho mine\n');
      const { code, output } = run({ integration: 'session-start' });
      assert.equal(code, 0);
      assert.match(
        output,
        /⚠ session-start: scripts\/session-start\.sh \(exists and was not installed by aif\)/,
      );
      assert.equal(read('scripts/session-start.sh'), '#!/bin/sh\necho mine\n');
    });
  });

  describe('on a project with edited files', () => {
    beforeEach(() => {
      run({ integration: 'hooks' });
      writeFileSync(join(project, '.githooks', 'refresh-index'), '#!/bin/sh\necho edited\n');
    });

    it('never overwrites an edited file without --force', () => {
      const { output } = run({ integration: 'hooks' });
      assert.match(output, /⚠ hooks: \.githooks\/refresh-index \(modified locally\)/);
      assert.equal(read('.githooks/refresh-index'), '#!/bin/sh\necho edited\n');
    });

    it('overwrites it with --force', () => {
      const { output } = run({ integration: 'hooks', force: true });
      assert.match(output, /overwritten with --force/);
      assert.notEqual(read('.githooks/refresh-index'), '#!/bin/sh\necho edited\n');
    });

    it('keeps the old record, so the file is still reported as locally modified', () => {
      run({ integration: 'hooks' });
      const { output } = run({ check: true });
      assert.match(output, /modified locally: \.githooks\/refresh-index \(hooks\)/);
    });
  });

  describe('pins belong to Dependabot', () => {
    it('does not touch a workflow whose pin was bumped, and reports it current', () => {
      run({ integration: 'checks' });
      const bumped = read('.github/workflows/aif-checks.yml')
        .replaceAll(PIN.pin, NEWER_PIN.pin)
        .replaceAll('v0.6.0', 'v0.7.0');
      writeFileSync(join(project, '.github', 'workflows', 'aif-checks.yml'), bumped);
      const { output } = run({ integration: 'checks', ...NEWER_PIN });
      assert.match(output, /already current/);
      assert.equal(read('.github/workflows/aif-checks.yml'), bumped);
      assert.doesNotMatch(run({ check: true }).output, /differ/);
    });
  });

  describe('--check', () => {
    it('is clean straight after an install', () => {
      run({ integration: 'all' });
      const { code, output } = run({ check: true });
      assert.equal(code, 0);
      assert.match(output, /✓ integrations \(checks, update, hooks, session-start\): current/);
    });

    it('reports a missing file and never fails', () => {
      run({ integration: 'hooks' });
      rmSync(join(project, '.githooks', 'post-merge'));
      const { code, output } = run({ check: true });
      assert.equal(code, 0);
      assert.match(output, /missing: \.githooks\/post-merge \(hooks\)/);
    });

    it('raises a warning annotation in GitHub Actions', () => {
      run({ integration: 'hooks' });
      rmSync(join(project, '.githooks', 'post-merge'));
      process.env.GITHUB_ACTIONS = 'true';
      try {
        assert.match(run({ check: true }).output, /::warning::AIF integrations differ/);
      } finally {
        delete process.env.GITHUB_ACTIONS;
      }
    });

    it('lists integrations that exist but are not installed', () => {
      run({ integration: 'hooks' });
      const { output } = run({ check: true });
      assert.match(output, /available, not installed: checks, update, session-start/);
    });

    it('says nothing about integrations in a project that has none', () => {
      assert.doesNotMatch(run({ check: true }).output, /integrations/);
    });
  });

  describe('--update', () => {
    it('refreshes a script whose template changed, when the file is unedited', () => {
      run({ integration: 'hooks' });
      writeFileSync(
        join(aif, 'projects/_template/.githooks/refresh-index'),
        '#!/bin/sh\necho v2\n',
      );
      const { output } = run({ update: true });
      assert.match(output, /↻ hooks: \.githooks\/refresh-index \(template updated\)/);
      assert.equal(read('.githooks/refresh-index'), '#!/bin/sh\necho v2\n');
    });

    it('leaves an edited script alone', () => {
      run({ integration: 'hooks' });
      writeFileSync(join(project, '.githooks', 'refresh-index'), 'mine\n');
      writeFileSync(
        join(aif, 'projects/_template/.githooks/refresh-index'),
        '#!/bin/sh\necho v2\n',
      );
      const { output } = run({ update: true });
      assert.match(output, /⚠ hooks: \.githooks\/refresh-index \(modified locally; left alone\)/);
      assert.equal(read('.githooks/refresh-index'), 'mine\n');
    });

    it('never rewrites a workflow, and points at the command that does', () => {
      run({ integration: 'checks' });
      const before = read('.github/workflows/aif-checks.yml');
      writeFileSync(
        join(aif, 'lib/integrations/assets/aif-checks.yml'),
        readFileSync(join(aif, 'lib/integrations/assets/aif-checks.yml'), 'utf8').replace(
          'name: AIF checks',
          'name: AIF checks v2',
        ),
      );
      const { output } = run({ update: true });
      assert.match(
        output,
        /↷ checks: \.github\/workflows\/aif-checks\.yml has a newer template; run `aif install -I checks`/,
      );
      assert.equal(read('.github/workflows/aif-checks.yml'), before);
    });

    it('refreshes a workflow through `-I`, advancing a pin that is older than the release in hand', () => {
      run({ integration: 'checks' });
      writeFileSync(
        join(aif, 'lib/integrations/assets/aif-checks.yml'),
        readFileSync(join(aif, 'lib/integrations/assets/aif-checks.yml'), 'utf8').replace(
          'name: AIF checks',
          'name: AIF checks v2',
        ),
      );
      const { output } = run({ integration: 'checks', ...NEWER_PIN });
      assert.match(output, /\(template updated\)/);
      const text = read('.github/workflows/aif-checks.yml');
      assert.match(text, /name: AIF checks v2/);
      assert.match(text, new RegExp(`@${NEWER_PIN.pin} # v0.7.0`), 'an older pin is advanced');
    });

    it('does nothing in a project with no integrations', () => {
      assert.doesNotMatch(run({ update: true }).output, /integrations/);
      assert.equal(existsSync(join(project, '.aif')), false);
    });
  });

  describe('files that must not be written through a symlink', () => {
    /** Run body with a scratch directory outside the project, always removed after. */
    const withOutside = (body) => {
      const outside = mkdtempSync(join(tmpdir(), 'aif-outside-'));
      try {
        body(outside);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    };

    it(
      'refuses a directory symlink that leaves the project, writing nothing outside',
      { skip: noSymlinks },
      () => {
        withOutside((outside) => {
          symlinkSync(outside, join(project, '.githooks'), 'dir');
          const { code, output } = run({ integration: 'hooks' });
          assert.equal(code, 1);
          assert.match(
            output,
            /✗ hooks: \.githooks\/commit-msg \(\.githooks is a symlink; refused\)/,
          );
          assert.deepEqual(readdirSync(outside), [], 'nothing was written through the link');
        });
      },
    );

    it(
      'refuses a dangling file symlink instead of creating its target',
      { skip: noSymlinks },
      () => {
        withOutside((outside) => {
          mkdirSync(join(project, '.githooks'));
          symlinkSync(join(outside, 'bashrc'), join(project, '.githooks', 'commit-msg'));
          assert.equal(run({ integration: 'hooks' }).code, 1);
          assert.equal(existsSync(join(outside, 'bashrc')), false);
        });
      },
    );

    it('refuses even with --force', { skip: noSymlinks }, () => {
      withOutside((outside) => {
        symlinkSync(outside, join(project, 'scripts'), 'dir');
        assert.equal(run({ integration: 'session-start', force: true }).code, 1);
        assert.deepEqual(readdirSync(outside), []);
      });
    });

    it('installs the other files and records only those', { skip: noSymlinks }, () => {
      withOutside((outside) => {
        symlinkSync(outside, join(project, 'scripts'), 'dir');
        assert.equal(run({ integration: 'hooks,session-start' }).code, 1);
        assert.ok(existsSync(join(project, '.githooks', 'commit-msg')));
        assert.equal(manifest().integrations['session-start'], undefined);
      });
    });

    it(
      '--check and --update report a symlinked target and leave it alone',
      { skip: noSymlinks },
      () => {
        run({ integration: 'hooks' });
        withOutside((outside) => {
          rmSync(join(project, '.githooks'), { recursive: true });
          symlinkSync(outside, join(project, '.githooks'), 'dir');
          assert.match(
            run({ check: true }).output,
            /\.githooks is a symlink: \.githooks\/commit-msg \(hooks\)/,
          );
          assert.match(run({ update: true }).output, /\.githooks is a symlink; left alone/);
          assert.deepEqual(readdirSync(outside), []);
        });
      },
    );

    it('does not mind a symlink that is not on the way to a target', { skip: noSymlinks }, () => {
      withOutside((outside) => {
        symlinkSync(outside, join(project, 'docs'), 'dir');
        assert.equal(run({ integration: 'hooks' }).code, 0);
      });
    });
  });

  describe('the manifest itself must not be written through a symlink', () => {
    const withOutside = (body) => {
      const outside = mkdtempSync(join(tmpdir(), 'aif-outside-'));
      try {
        body(outside);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    };

    it('refuses a symlinked .aif directory, writing nothing outside', { skip: noSymlinks }, () => {
      withOutside((outside) => {
        symlinkSync(outside, join(project, '.aif'), 'dir');
        for (const args of [{ integration: 'hooks' }, { update: true }]) {
          const { code, output } = run(args);
          assert.equal(code, 1);
          assert.match(output, /\.aif is a symlink; refused/);
        }
        assert.deepEqual(readdirSync(outside), []);
        assert.match(run({ check: true }).output, /\.aif is a symlink/);
      });
    });

    it(
      'refuses a symlinked manifest file, leaving its target untouched',
      { skip: noSymlinks },
      () => {
        withOutside((outside) => {
          const victim = join(outside, 'bashrc');
          writeFileSync(victim, 'precious\n');
          mkdirSync(join(project, '.aif'));
          symlinkSync(victim, join(project, '.aif', '.installs.yaml'));
          const { code, output } = run({ integration: 'hooks' });
          assert.equal(code, 1);
          assert.match(output, /\.aif\/\.installs\.yaml is a symlink; refused/);
          assert.equal(readFileSync(victim, 'utf8'), 'precious\n');
          assert.equal(
            existsSync(join(project, '.githooks')),
            false,
            'nothing was installed either',
          );
        });
      },
    );
  });

  describe('line endings', () => {
    it('writes LF even when the template in the checkout has CRLF', () => {
      const template = join(aif, 'projects/_template/.githooks/refresh-index');
      writeFileSync(template, readFileSync(template, 'utf8').replaceAll('\n', '\r\n'));
      run({ integration: 'hooks' });
      assert.ok(!read('.githooks/refresh-index').includes('\r'));
    });

    it('treats a CRLF copy as current, leaves it as the checkout made it, and records the Linux hash', () => {
      run({ integration: 'hooks' });
      const hashOf = () =>
        manifest().integrations.hooks.files.find((f) => f.path === '.githooks/refresh-index').hash;
      const linuxHash = hashOf();
      const crlf = read('.githooks/refresh-index').replaceAll('\n', '\r\n');
      writeFileSync(join(project, '.githooks', 'refresh-index'), crlf);
      const { output } = run({ integration: 'hooks' });
      assert.match(output, /refresh-index \(already current/);
      assert.equal(read('.githooks/refresh-index'), crlf);
      assert.equal(hashOf(), linuxHash);
      assert.doesNotMatch(run({ check: true }).output, /differ/);
    });
  });

  describe('a manifest the user has damaged', () => {
    it('explains an unparseable file and stops, without a stack trace', () => {
      mkdirSync(join(project, '.aif'));
      writeFileSync(join(project, '.aif', '.installs.yaml'), 'integrations: [unclosed\n');
      for (const args of [{ integration: 'hooks' }, { update: true }]) {
        const { code, output } = run(args);
        assert.equal(code, 1);
        assert.match(output, /\.aif\/\.installs\.yaml is unreadable/);
        assert.doesNotMatch(output, /at .*\(.*:\d+:\d+\)/);
      }
      const check = run({ check: true });
      assert.equal(check.code, 0, '--check only warns');
      assert.match(check.output, /unreadable/);
    });

    it('ignores an entry that is null, or a file entry with no path', () => {
      mkdirSync(join(project, '.aif'));
      writeFileSync(
        join(project, '.aif', '.installs.yaml'),
        'integrations:\n  hooks: null\n  checks:\n    files:\n      - hash: sha256:x\n',
      );
      assert.equal(run({ integration: 'hooks' }).code, 0);
      assert.equal(run({ update: true }).code, 0);
      assert.equal(run({ check: true }).code, 0);
    });

    it('ignores names that are not integrations, however they are spelled', () => {
      run({ integration: 'hooks' });
      const raw = YAML.parse(read('.aif/.installs.yaml'));
      raw.integrations.toString = { files: [] };
      raw.integrations.retired = { files: [{ path: 'x', hash: 'sha256:y' }] };
      writeFileSync(join(project, '.aif', '.installs.yaml'), YAML.stringify(raw));
      assert.equal(run({ update: true }).code, 0);
      assert.equal(run({ check: true }).code, 0);
      // An entry this aif does not know may come from a newer aif: it is kept, never deleted.
      assert.deepEqual(Object.keys(manifest().integrations).sort(), [
        'hooks',
        'retired',
        'toString',
      ]);
    });

    it('drops a file the registry no longer ships on the next write, without failing', () => {
      run({ integration: 'hooks' });
      const raw = YAML.parse(read('.aif/.installs.yaml'));
      raw.integrations.hooks.files.push({ path: '.githooks/retired', hash: 'sha256:z' });
      writeFileSync(join(project, '.aif', '.installs.yaml'), YAML.stringify(raw));
      assert.equal(run({ update: true }).code, 0);
      assert.ok(!manifest().integrations.hooks.files.some((f) => f.path === '.githooks/retired'));
    });
  });

  describe('details', () => {
    it('keeps a pin Dependabot bumped when the template changes', () => {
      run({ integration: 'checks' });
      const bumped = '9'.repeat(40);
      writeFileSync(
        join(project, '.github', 'workflows', 'aif-checks.yml'),
        read('.github/workflows/aif-checks.yml')
          .replaceAll(PIN.pin, bumped)
          .replaceAll('v0.6.0', 'v0.9.0'),
      );
      const template = join(aif, 'lib/integrations/assets/aif-checks.yml');
      writeFileSync(
        template,
        readFileSync(template, 'utf8').replace('name: AIF checks', 'name: AIF checks v2'),
      );
      run({ integration: 'checks', ...NEWER_PIN });
      const text = read('.github/workflows/aif-checks.yml');
      assert.match(text, /name: AIF checks v2/);
      assert.match(text, new RegExp(`checks@${bumped} # v0.9.0`), 'the bumped pin is kept');
      assert.doesNotMatch(text, new RegExp(NEWER_PIN.pin));
    });

    it('does not bring back a file the user deleted; --update says so and -I restores it', () => {
      run({ integration: 'hooks' });
      rmSync(join(project, '.githooks', 'post-rewrite'));
      const { output } = run({ update: true });
      assert.match(output, /post-rewrite is missing; run `aif install -I hooks`/);
      assert.equal(existsSync(join(project, '.githooks', 'post-rewrite')), false);
      run({ integration: 'hooks' });
      assert.ok(existsSync(join(project, '.githooks', 'post-rewrite')));
    });

    it('restores a lost executable bit without rewriting the file', { skip: noExecBit }, () => {
      run({ integration: 'hooks' });
      const hook = join(project, '.githooks', 'refresh-index');
      chmodSync(hook, 0o644);
      const { output } = run({ integration: 'hooks' });
      assert.match(output, /refresh-index \(already current; executable bit restored\)/);
      assert.ok(statSync(hook).mode & 0o100);
    });

    it(
      'adds execute only where the file is readable, never widening access',
      { skip: noExecBit },
      () => {
        run({ integration: 'hooks' });
        const hook = join(project, '.githooks', 'refresh-index');
        chmodSync(hook, 0o600);
        run({ integration: 'hooks' });
        assert.equal(statSync(hook).mode & 0o777, 0o700);
      },
    );

    it(
      'does not re-enable a hook someone disabled, when run as --update',
      { skip: noExecBit },
      () => {
        run({ integration: 'hooks' });
        const hook = join(project, '.githooks', 'refresh-index');
        chmodSync(hook, 0o644);
        run({ update: true });
        assert.equal(statSync(hook).mode & 0o111, 0);
      },
    );

    it('never changes the mode of a file it did not install', { skip: noExecBit }, () => {
      mkdirSync(join(project, 'scripts'));
      const mine = join(project, 'scripts', 'session-start.sh');
      writeFileSync(mine, 'mine\n');
      chmodSync(mine, 0o644);
      run({ integration: 'session-start' });
      assert.equal(statSync(mine).mode & 0o777, 0o644);
    });

    it('does not record an integration whose every file was skipped', () => {
      mkdirSync(join(project, 'scripts'));
      writeFileSync(join(project, 'scripts', 'session-start.sh'), 'mine\n');
      run({ integration: 'session-start' });
      assert.equal(existsSync(join(project, '.aif', '.installs.yaml')), false);
    });

    it('keeps the recorded version while a pinned file is still on an older template', () => {
      run({ integration: 'checks,hooks' });
      writeFileSync(join(aif, 'package.json'), JSON.stringify({ version: '10.0.0' }));
      const template = join(aif, 'lib/integrations/assets/aif-checks.yml');
      writeFileSync(
        template,
        readFileSync(template, 'utf8').replace('name: AIF checks', 'name: AIF checks v2'),
      );
      run({ update: true });
      const { integrations } = manifest();
      assert.equal(integrations.checks.version, '9.9.9', 'checks is behind');
      assert.equal(integrations.hooks.version, '10.0.0', 'hooks is current');
    });

    it('with -B, still installs the integrations when the bundle half fails, and says which half failed', () => {
      const { code, output } = run({
        integration: 'hooks',
        bundle: 'no-such-bundle',
        harness: 'claude',
      });
      assert.equal(code, 1);
      assert.ok(existsSync(join(project, '.githooks', 'commit-msg')));
      assert.match(output, /no-such-bundle|not found|Unknown|No bundle/i);
    });
  });

  describe('refusals', () => {
    it('rejects --scope global and writes nothing', () => {
      const { code, output } = run({ integration: 'all', scope: 'global' });
      assert.equal(code, 1);
      assert.match(output, /project scope only/);
      assert.equal(existsSync(join(project, '.githooks')), false);
    });

    it('rejects an unknown name, listing what is available', () => {
      const { code, output } = run({ integration: 'hooks,nope' });
      assert.equal(code, 1);
      assert.match(output, /Unknown integration: nope\. Available: .*all\./);
      assert.equal(existsSync(join(project, '.githooks')), false, 'nothing is half-installed');
    });

    it('rejects names that exist on every object, with the usual message', () => {
      for (const name of ['constructor', 'toString', '__proto__']) {
        const { code, output } = run({ integration: name });
        assert.equal(code, 1, name);
        assert.match(output, new RegExp(`Unknown integration: ${name}\\. Available:`));
        assert.doesNotMatch(output, /TypeError|Cannot read/);
      }
    });

    it('rejects -I with no name', () => {
      const { code, output } = run({ integration: true });
      assert.equal(code, 1);
      assert.match(output, /Missing integration name/);
    });

    it('rejects -I together with --update or --check', () => {
      assert.equal(run({ integration: 'hooks', update: true }).code, 1);
      assert.equal(run({ integration: 'hooks', check: true }).code, 1);
    });

    it('refuses to install workflows without a pin, and writes nothing', () => {
      const { code, output } = capture(() =>
        runInstall({ args: { integration: 'checks' }, positional: [] }, aif, project),
      );
      assert.equal(code, 1);
      assert.match(output, /Could not read release tags|No release tag/);
      assert.equal(existsSync(join(project, '.github')), false);
    });

    it('needs no pin for integrations without workflows', () => {
      const { code } = capture(() =>
        runInstall({ args: { integration: 'hooks' }, positional: [] }, aif, project),
      );
      assert.equal(code, 0);
    });

    it('fails outside a project, like every project-scope command', () => {
      rmSync(join(project, '.aiconfig.json'));
      const { code, output } = run({ integration: 'hooks' });
      assert.equal(code, 1);
      assert.match(output, /No project found/);
    });
  });
});

describe('resolvePin', () => {
  const sha = 'c'.repeat(40);

  it('uses the latest release tag and the commit it points to', () => {
    const calls = [];
    const git = (root, args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return `${root}\n`;
      return args[0] === 'tag' ? 'v0.4.0\nv0.10.0\nlegacy/process-v1\n' : `${sha}\n`;
    };
    assert.deepEqual(resolvePin('/aif', {}, git), { sha, version: 'v0.10.0' });
    assert.deepEqual(calls.at(-1), ['rev-parse', 'v0.10.0^{commit}']);
  });

  it('prefers explicit flags and runs no git', () => {
    const git = () => assert.fail('git must not run');
    assert.deepEqual(resolvePin('/aif', { pin: sha, 'pin-version': 'v1.2.3' }, git), {
      sha,
      version: 'v1.2.3',
    });
  });

  it('explains how to proceed when there is no tag', () => {
    const git = (root, args) =>
      args[1] === '--show-toplevel' ? `${root}\n` : 'legacy/process-v1\n';
    assert.throws(() => resolvePin('/aif', {}, git), /--pin <sha> --pin-version/);
  });

  it('explains how to proceed when git fails', () => {
    const git = () => {
      throw new Error('not a git repository');
    };
    assert.throws(() => resolvePin('/aif', {}, git), /Could not read release tags.*--pin/);
  });

  it('refuses a checkout with no git repository of its own, whose tags would belong to a parent repository', () => {
    const git = (_root, args) => {
      if (args[1] === '--show-toplevel') return '/somewhere/else\n';
      return assert.fail('must not read tags or resolve a commit from another repository');
    };
    assert.throws(
      () => resolvePin('/aif', {}, git),
      /not a git checkout of its own.*--pin <sha> --pin-version/,
    );
  });

  it('ignores a tag named like a git option, and never passes it as an argument', () => {
    const calls = [];
    const git = (root, args) => {
      calls.push(args);
      if (args[1] === '--show-toplevel') return `${root}\n`;
      return args[0] === 'tag' ? '--upload-pack=touch x\nv0.3.0\n' : `${sha}\n`;
    };
    assert.equal(resolvePin('/aif', {}, git).version, 'v0.3.0');
    assert.ok(calls.every((args) => !args.some((arg) => arg.startsWith('--upload'))));
  });
});
