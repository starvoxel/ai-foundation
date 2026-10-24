/**
 * Unit tests for the findings skill script (skills/findings/scripts/findings.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMap,
  formatLine,
  lookup,
  parseRepoSlug,
  parseBody,
  planFiling,
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
