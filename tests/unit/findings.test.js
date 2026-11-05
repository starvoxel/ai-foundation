// ------------------------------
// findings.test.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Unit tests for the findings skill script (skills/findings/scripts/findings.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { delimiter } from 'node:path';

import {
  buildMap,
  formatLine,
  lookup,
  parseRepoSlug,
  parseBody,
  planFiling,
  resolveAiGit,
  runAiGit,
  severityOf,
  staleKeys,
} from '../../skills/findings/scripts/findings.js';

const issue = (number, files, rule, severity = 'low', extra = {}) => ({
  number,
  title: `t${number}`,
  state: 'open',
  labels: [{ name: 'finding' }, { name: `severity:${severity}` }],
  body: `files: ${files}\nrule: ${rule}\nsource: review\n\ndetail`,
  ...extra,
});

describe('unit: findings parsing', () => {
  it('parses header lines and ignores the rest', () => {
    assert.deepEqual(parseBody('files: a.js, `b.js`\nrule: R\nsource: scan\neffort: S\ntext'), {
      files: ['a.js', 'b.js'],
      rule: 'R',
      source: 'scan',
      effort: 'S',
    });
    assert.deepEqual(parseBody(null).files, []);
  });

  it('reads severity from the label', () => {
    assert.equal(severityOf({ labels: [{ name: 'severity:high' }] }), 'high');
    assert.equal(severityOf({ labels: ['severity:bogus', 'finding'] }), '');
  });
});

describe('unit: findings map', () => {
  const map = buildMap([
    issue(1, 'a.js, b.js', 'R1'),
    issue(2, 'b.js', 'R2', 'medium'),
    issue(3, 'c.js', 'R3', 'low', { pull_request: {} }),
    issue(4, 'd.js', 'R4', 'low', { state: 'closed' }),
    { number: 5, title: 'no files', state: 'open', labels: [], body: 'nothing' },
  ]);

  it('lists a multi-file finding under every file and skips PRs, closed and file-less issues', () => {
    assert.deepEqual(Object.keys(map).sort(), ['a.js', 'b.js']);
    assert.deepEqual(
      map['b.js'].map((e) => e.n),
      [1, 2],
    );
  });

  it('looks up paths de-duplicated by issue number', () => {
    assert.deepEqual(
      lookup(map, ['a.js', 'b.js']).map((e) => e.n),
      [1, 2],
    );
    assert.deepEqual(
      lookup(map, []).map((e) => e.n),
      [1, 2],
    );
    assert.deepEqual(lookup(map, ['zzz']), []);
  });

  it('flags keys for files that no longer exist', () => {
    assert.deepEqual(
      staleKeys(map, (p) => p === 'a.js'),
      ['b.js'],
    );
  });

  it('formats one compact line', () => {
    assert.equal(formatLine(map['a.js'][0]), '#1 low a.js,b.js R1');
  });
});

describe('unit: planFiling', () => {
  const map = buildMap([issue(1, 'a.js', 'R1')]);
  const base = { title: 'T', severity: 'low', source: 'review', rule: 'R1', files: ['a.js'] };

  it('comments on a finding sharing a file and rule, noting new files', () => {
    const plan = planFiling(map, { ...base, files: ['a.js', 'x.js'] });
    assert.equal(plan.action, 'comment');
    assert.equal(plan.n, 1);
    assert.deepEqual(plan.missingFiles, ['x.js']);
  });

  it('opens a new issue with labels when the rule differs', () => {
    const plan = planFiling(map, { ...base, rule: 'R9', effort: 'S', detail: 'why' });
    assert.equal(plan.action, 'create');
    assert.deepEqual(plan.labels, ['finding', 'severity:low', 'source:review']);
    assert.match(plan.body, /^files: a\.js\nrule: R9\nsource: review\neffort: S\n\nwhy$/);
  });

  it('rejects an invalid severity or an incomplete finding', () => {
    assert.throws(() => planFiling(map, { ...base, severity: 'meh' }), /Invalid severity/);
    assert.throws(() => planFiling(map, { ...base, files: [] }), /needs/);
  });
});

describe('unit: parseRepoSlug', () => {
  it('reads https and ssh remotes, keeping dots in the name', () => {
    assert.equal(parseRepoSlug('https://github.com/o/r\n'), 'o/r');
    assert.equal(parseRepoSlug('https://github.com/o/my.repo.git'), 'o/my.repo');
    assert.equal(parseRepoSlug('git@github.com:o/r.git'), 'o/r');
    assert.equal(parseRepoSlug('https://example.com/o/r'), null);
  });
});

describe('unit: findings ai-git spawning', () => {
  const shimText = String.raw`"%_prog%"  "%dp0%\node_modules\ai-foundation\bin\ai-git.js" %*`;
  const winEnv = (over = {}) => ({
    platform: 'win32',
    pathEnv: ['/other', '/npm'].join(delimiter),
    execPath: '/node',
    exists: (p) => p.endsWith('ai-git.cmd') || p.endsWith('ai-git.js'),
    readText: () => shimText,
    ...over,
  });

  it('runs ai-git by name off Windows', () => {
    assert.deepEqual(resolveAiGit(['x'], { platform: 'linux' }), {
      command: 'ai-git',
      args: ['x'],
    });
  });

  it('runs the npm shim target with node on Windows, args verbatim, no shell', () => {
    const args = ['gh-api', '-f', 'title=a "b" & c\nd'];
    const r = resolveAiGit(args, winEnv());
    assert.equal(r.command, '/node');
    assert.deepEqual(r.args.slice(1), args);
    assert.match(r.args[0], /node_modules.ai-foundation.bin.ai-git\.js$/);
  });

  it('falls back to the bare name when no shim is found', () => {
    assert.deepEqual(resolveAiGit(['x'], winEnv({ exists: () => false })), {
      command: 'ai-git',
      args: ['x'],
    });
  });

  it('includes the spawn error cause and exit status on failure', () => {
    const spawn = () => ({ status: null, error: new Error('spawnSync ai-git ENOENT') });
    assert.throws(
      () => runAiGit(['gh-api', 'x'], { spawn }),
      /ai-git gh-api failed: spawnSync ai-git ENOENT; exit status null/,
    );
  });

  it('reports stderr on a non-zero exit', () => {
    const spawn = () => ({ status: 1, stderr: 'boom\n', stdout: '' });
    assert.throws(() => runAiGit(['remote'], { spawn }), /exit status 1: boom$/);
  });

  it('returns stdout on success, forwards stdin, and uses no shell', () => {
    let seen;
    const spawn = (command, args, opts) => {
      seen = opts;
      return { status: 0, stdout: 'ok' };
    };
    const resolveCmd = (args) => ({ command: 'c', args });
    assert.equal(runAiGit(['gh-api'], { input: 'in', spawn, resolveCmd }), 'ok');
    assert.equal(seen.input, 'in');
    assert.equal(seen.shell, undefined);
  });
});
