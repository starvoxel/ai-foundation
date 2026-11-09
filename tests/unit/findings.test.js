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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import {
  buildMap,
  effortClass,
  formatBatch,
  formatLine,
  lookup,
  main,
  parseRepoSlug,
  parseBatchOptions,
  parseBody,
  planBatch,
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

describe('unit: findings batch', () => {
  const withEffort = (number, files, effort, severity = 'low') => {
    const i = issue(number, files, `R${number}`, severity);
    return { ...i, body: effort ? `${i.body}\neffort: ${effort}` : i.body };
  };
  const numbers = (batch) => batch.map((cluster) => cluster.map((e) => e.n));

  it('classifies effort, counting a missing effort as M', () => {
    assert.equal(effortClass({ effort: 's' }), 'S');
    assert.equal(effortClass({ effort: 'L' }), 'L');
    assert.equal(effortClass({ effort: 'M' }), 'M');
    assert.equal(effortClass({ effort: '' }), 'M');
  });

  it('parses options with defaults and rejects bad numbers', () => {
    assert.deepEqual(parseBatchOptions([]), { max: 5, maxSimple: 15, includeLarge: false });
    assert.deepEqual(parseBatchOptions(['--max', '2', '--max-simple', '4', '--include-large']), {
      max: 2,
      maxSimple: 4,
      includeLarge: true,
    });
    assert.throws(() => parseBatchOptions(['--max', '0']), /--max needs a positive integer/);
    assert.throws(() => parseBatchOptions(['--max-simple', 'x']), /--max-simple/);
  });

  it('returns nothing for no findings', () => {
    assert.deepEqual(planBatch(buildMap([])), []);
    assert.equal(formatBatch([]), '');
  });

  it('skips L unless includeLarge, then counts it in the M group', () => {
    const map = buildMap([withEffort(1, 'a/x.js', 'L', 'high'), withEffort(2, 'b/y.js', 'M')]);
    assert.deepEqual(numbers(planBatch(map)), [[2]]);
    assert.deepEqual(numbers(planBatch(map, { includeLarge: true })), [[1], [2]]);
    assert.deepEqual(numbers(planBatch(map, { includeLarge: true, max: 1 })), [[1]]);
  });

  it('takes M severity first then oldest, up to max', () => {
    const map = buildMap([
      withEffort(1, 'a/1.js', 'M', 'low'),
      withEffort(2, 'b/2.js', 'M', 'high'),
      withEffort(3, 'c/3.js', 'M', 'high'),
      withEffort(4, 'd/4.js', 'M', 'critical'),
    ]);
    assert.deepEqual(numbers(planBatch(map, { max: 3 })), [[4], [2], [3]]);
  });

  it('fills the main group with M or smaller, so S findings can take its slots', () => {
    const map = buildMap([
      withEffort(1, 'a/1.js', 'M', 'low'),
      withEffort(2, 'b/2.js', 'S', 'low'),
      withEffort(3, 'c/3.js', 'S', 'low'),
    ]);
    assert.deepEqual(numbers(planBatch(map, { max: 2, maxSimple: 1 })), [[1], [2]]);
  });

  it('adds S findings in the same areas as picked ones, up to maxSimple', () => {
    const map = buildMap([
      withEffort(1, 'lib/a.js', 'M', 'high'),
      withEffort(2, 'lib/b.js', 'S', 'low'),
      withEffort(3, 'other/c.js', 'S', 'critical'),
      withEffort(4, 'lib/d.js', 'S', 'medium'),
      withEffort(5, 'lib/e.js', 'S', 'low'),
      withEffort(6, 'far/f.js', 'S', 'medium'),
    ]);
    assert.deepEqual(numbers(planBatch(map, { max: 2, maxSimple: 1 })), [[3], [1], [4]]);
    assert.deepEqual(numbers(planBatch(map, { max: 2, maxSimple: 9 })), [[3], [1], [4], [2], [5]]);
  });

  it('gives an S-only backlog the main group plus the extra allowance, oldest first', () => {
    const map = buildMap(Array.from({ length: 22 }, (_, i) => withEffort(i + 1, 'x/a.js', 'S')));
    const batch = planBatch(map);
    assert.equal(batch.length, 1);
    assert.equal(batch[0].length, 22);
    const separate = buildMap(
      Array.from({ length: 22 }, (_, i) => withEffort(i + 1, `x/${i + 1}.js`, 'S')),
    );
    assert.deepEqual(
      numbers(planBatch(separate)).flat(),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('orders by severity regardless of size, then size, then age', () => {
    const map = buildMap([
      withEffort(1, 'a/1.js', 'M', 'low'),
      withEffort(2, 'b/2.js', 'S', 'high'),
      withEffort(3, 'c/3.js', 'S', 'low'),
      withEffort(4, 'd/4.js', 'L', 'low'),
      withEffort(5, 'e/5.js', 'M', 'high'),
      withEffort(6, 'f/6.js', 'M', 'low'),
    ]);
    assert.deepEqual(numbers(planBatch(map, { includeLarge: true, max: 6 })), [
      [5],
      [2],
      [4],
      [1],
      [6],
      [3],
    ]);
  });

  it('never splits findings that share a file', () => {
    const map = buildMap([
      withEffort(1, 'a.js', 'M', 'high'),
      withEffort(2, 'a.js, b.js', 'S', 'low'),
      withEffort(3, 'b.js', 'M', 'low'),
    ]);
    const batch = planBatch(map, { max: 5 });
    assert.deepEqual(
      numbers(batch).map((c) => c.sort()),
      [[1, 2, 3]],
    );
  });

  it('skips a cluster over a cap unless it is first', () => {
    const map = buildMap([
      withEffort(1, 'a.js', 'M', 'low'),
      withEffort(2, 'a.js, b.js', 'M', 'low'),
      withEffort(3, 'c/c.js', 'M', 'low'),
    ]);
    assert.deepEqual(
      numbers(planBatch(map, { max: 1 })).map((c) => c.sort()),
      [[1, 2]],
    );
    const small = buildMap([
      withEffort(3, 'c/c.js', 'M', 'high'),
      ...[1, 2].map((n) => withEffort(n, 'a.js', 'M')),
    ]);
    assert.deepEqual(numbers(planBatch(small, { max: 2 })), [[3]]);
  });

  it('formats lines, blank-line separated clusters and a Fixes line', () => {
    const map = buildMap([withEffort(1, 'a.js', 'M', 'high'), withEffort(2, 'b.js', 'M', 'low')]);
    assert.equal(
      formatBatch(planBatch(map)),
      '#1 high a.js R1 (M)\n\n#2 low b.js R2 (M)\n\nFixes #1, Fixes #2',
    );
  });
});

describe('unit: findings batch CLI', () => {
  const run = (issues, args) => {
    const dir = mkdtempSync(join(tmpdir(), 'findings-'));
    const file = join(dir, 'issues.json');
    writeFileSync(file, JSON.stringify(issues));
    const out = [];
    const err = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...a) => out.push(a.join(' '));
    console.error = (...a) => err.push(a.join(' '));
    try {
      const code = main(['batch', ...args, '--from-file', file]);
      return { code, out: out.join('\n'), err: err.join('\n') };
    } finally {
      console.log = origLog;
      console.error = origError;
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const open = [issue(1, 'a.js', 'R1', 'high')];

  it('prints nothing and exits 0 when there are no findings', () => {
    assert.deepEqual(run([], []), { code: 0, out: '', err: '' });
  });

  it('prints the batch and a Fixes line', () => {
    const { code, out } = run(open, []);
    assert.equal(code, 0);
    assert.equal(out, '#1 high a.js R1\n\nFixes #1');
  });

  it('exits 1 with a message on an invalid --max or --max-simple', () => {
    for (const [flagName, value] of [
      ['--max', '0'],
      ['--max-simple', 'x'],
    ]) {
      const { code, out, err } = run(open, [flagName, value]);
      assert.equal(code, 1);
      assert.equal(out, '');
      assert.match(err, new RegExp(`^✗ ${flagName} needs a positive integer`));
    }
  });
});
