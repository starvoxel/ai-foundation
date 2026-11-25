// ------------------------------
// integrations.test.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  INTEGRATIONS,
  INTEGRATION_NAMES,
  SNIPPETS,
  carryPins,
  isIntegration,
  normalizeEol,
  describeDrift,
  expandIntegrationNames,
  normalizePins,
  pinlessHash,
  planFile,
  refreshedByUpdate,
  renderAsset,
} from '../../lib/integrations.js';

const ROOT = resolve(import.meta.dirname, '../..');
const PIN_A = { sha: 'a'.repeat(40), version: 'v0.6.0' };
const PIN_B = { sha: 'b'.repeat(40), version: 'v0.7.0' };

describe('registry', () => {
  const files = Object.entries(INTEGRATIONS).flatMap(([name, integration]) =>
    integration.files.map((file) => ({ name, file })),
  );

  it('offers checks, update, hooks and session-start', () => {
    assert.deepEqual([...INTEGRATION_NAMES].sort(), ['checks', 'hooks', 'session-start', 'update']);
  });

  it('has a template on disk for every file', () => {
    for (const { name, file } of files) {
      assert.ok(existsSync(join(ROOT, ...file.source.split('/'))), `${name}: ${file.source}`);
    }
  });

  it('writes only inside the project: relative targets with no .. or backslash', () => {
    for (const { name, file } of files) {
      assert.ok(!file.target.startsWith('/'), `${name}: absolute target ${file.target}`);
      assert.ok(!file.target.includes('\\'), `${name}: backslash in ${file.target}`);
      assert.ok(!file.target.split('/').includes('..'), `${name}: .. in ${file.target}`);
    }
  });

  it('never writes a target twice', () => {
    const targets = files.map(({ file }) => file.target);
    assert.equal(new Set(targets).size, targets.length);
  });

  it('names a known snippet for each one it lists', () => {
    for (const integration of Object.values(INTEGRATIONS)) {
      for (const key of integration.snippets) assert.ok(key in SNIPPETS, key);
    }
  });

  it('marks exactly the workflow files as pinned, and each carries a pin line', () => {
    for (const { name, file } of files) {
      const text = readFileSync(join(ROOT, ...file.source.split('/')), 'utf8');
      const isWorkflow = file.target.startsWith('.github/workflows/');
      assert.equal(file.pinned === true, isWorkflow, `${name}: ${file.target}`);
      if (file.pinned) assert.match(text, /@\{\{AIF_SHA\}\} # \{\{AIF_VERSION\}\}/);
    }
  });

  it('puts the pin placeholders only on pin lines, so a pin never counts as a change', () => {
    for (const { name, file } of files.filter(({ file: f }) => f.pinned)) {
      const text = readFileSync(join(ROOT, ...file.source.split('/')), 'utf8');
      assert.equal(
        normalizePins(renderAsset(text, PIN_A)),
        normalizePins(renderAsset(text, PIN_B)),
        `${name}: a placeholder sits outside a pin line`,
      );
    }
  });
});

describe('expandIntegrationNames', () => {
  it('expands all to every integration', () => {
    assert.deepEqual(expandIntegrationNames('all'), { names: [...INTEGRATION_NAMES], unknown: [] });
  });

  it('accepts a comma-separated list, once each, trimming spaces', () => {
    assert.deepEqual(expandIntegrationNames('hooks, checks,hooks'), {
      names: ['hooks', 'checks'],
      unknown: [],
    });
  });

  it('reports unknown names and keeps the known ones', () => {
    assert.deepEqual(expandIntegrationNames('hooks,nope'), { names: ['hooks'], unknown: ['nope'] });
  });

  it('treats a missing or valueless flag as no names', () => {
    assert.deepEqual(expandIntegrationNames(true), { names: [], unknown: [] });
    assert.deepEqual(expandIntegrationNames(undefined), { names: [], unknown: [] });
  });
});

describe('pins', () => {
  const line = (pin) => `uses: o/r/.github/actions/checks@${pin.sha} # ${pin.version}`;

  it('normalizePins hides every pin, not only the AIF one', () => {
    const text = `${line(PIN_A)}\nuses: actions/checkout@${'c'.repeat(40)} # v7.0.1\n`;
    assert.equal(
      normalizePins(text),
      'uses: o/r/.github/actions/checks@<pin>\nuses: actions/checkout@<pin>\n',
    );
  });

  it('does not treat a branch or tag ref as a pin', () => {
    assert.equal(normalizePins('uses: o/r@main'), 'uses: o/r@main');
  });

  it('renderAsset fills both placeholders, and leaves a template alone without a pin', () => {
    const template = 'x@{{AIF_SHA}} # {{AIF_VERSION}}';
    assert.equal(renderAsset(template, PIN_A), `x@${PIN_A.sha} # ${PIN_A.version}`);
    assert.equal(renderAsset(template, null), template);
  });

  it('pinlessHash is equal for texts that differ only in pins', () => {
    assert.equal(pinlessHash(line(PIN_A)), pinlessHash(line(PIN_B)));
    assert.notEqual(pinlessHash(line(PIN_A)), pinlessHash(`${line(PIN_A)} # changed`));
  });
});

describe('planFile', () => {
  const desired = 'new\n';
  const old = 'old\n';
  const oldHash = pinlessHash(old);
  const newHash = pinlessHash(desired);

  it('writes a file that is not there', () => {
    assert.equal(planFile({ desired, onDisk: null, recorded: null }).action, 'write');
    assert.equal(planFile({ desired, onDisk: null, recorded: oldHash }).action, 'write');
  });

  it('leaves a file that already matches, and records one that was not recorded', () => {
    assert.equal(planFile({ desired, onDisk: desired, recorded: newHash }).action, 'current');
    assert.equal(planFile({ desired, onDisk: desired, recorded: null }).action, 'adopt');
  });

  it('ignores pins: a bumped pin is still current', () => {
    const a = `uses: o/r@${PIN_A.sha} # ${PIN_A.version}\n`;
    const b = `uses: o/r@${PIN_B.sha} # ${PIN_B.version}\n`;
    assert.equal(planFile({ desired: a, onDisk: b, recorded: pinlessHash(a) }).action, 'current');
  });

  it('updates a file the user has not touched when the template moved on', () => {
    const plan = planFile({ desired, onDisk: old, recorded: oldHash });
    assert.deepEqual(plan, { action: 'write', reason: 'template updated' });
  });

  it('skips a file the user edited', () => {
    const plan = planFile({ desired, onDisk: 'mine\n', recorded: oldHash });
    assert.deepEqual(plan, { action: 'skip', reason: 'modified locally' });
  });

  it('skips a file that exists but aif never installed', () => {
    const plan = planFile({ desired, onDisk: 'mine\n', recorded: null });
    assert.deepEqual(plan, { action: 'skip', reason: 'exists and was not installed by aif' });
  });

  it('overwrites an edited or foreign file only with force', () => {
    assert.equal(
      planFile({ desired, onDisk: 'mine\n', recorded: oldHash, force: true }).action,
      'write',
    );
    assert.equal(
      planFile({ desired, onDisk: 'mine\n', recorded: null, force: true }).action,
      'write',
    );
  });
});

describe('describeDrift', () => {
  const desired = 'new\n';
  const oldHash = pinlessHash('old\n');

  it('reports nothing for a current file', () => {
    assert.equal(describeDrift({ desired, onDisk: desired, recorded: pinlessHash(desired) }), null);
  });

  it('reports a missing file', () => {
    assert.equal(describeDrift({ desired, onDisk: null, recorded: oldHash }), 'missing');
  });

  it('tells an upstream change from a local edit', () => {
    assert.equal(
      describeDrift({ desired, onDisk: 'old\n', recorded: oldHash }),
      'update available',
    );
    assert.equal(
      describeDrift({ desired, onDisk: 'mine\n', recorded: oldHash }),
      'modified locally',
    );
    assert.equal(describeDrift({ desired, onDisk: 'mine\n', recorded: null }), 'modified locally');
  });
});

describe('refreshedByUpdate', () => {
  it('refreshes files without pins and leaves workflow files to Dependabot', () => {
    assert.equal(refreshedByUpdate({ target: 'a', source: 'a' }), true);
    assert.equal(refreshedByUpdate({ target: 'a', source: 'a', pinned: true }), false);
  });
});

describe('names on the prototype chain are not integrations', () => {
  it('isIntegration accepts only registered names', () => {
    assert.equal(isIntegration('hooks'), true);
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', 'nope']) {
      assert.equal(isIntegration(name), false, name);
    }
    assert.equal(isIntegration(undefined), false);
    assert.equal(isIntegration(['hooks']), false);
  });

  it('expandIntegrationNames reports them as unknown instead of accepting them', () => {
    assert.deepEqual(expandIntegrationNames('constructor,toString,hooks'), {
      names: ['hooks'],
      unknown: ['constructor', 'toString'],
    });
  });
});

describe('line endings', () => {
  it('normalizeEol turns CRLF into LF and leaves a lone CR alone', () => {
    assert.equal(normalizeEol('a\r\nb\r\n'), 'a\nb\n');
    assert.equal(normalizeEol('a\rb'), 'a\rb');
  });

  it('pinlessHash is equal for LF and CRLF copies of one file', () => {
    assert.equal(pinlessHash('#!/bin/sh\necho hi\n'), pinlessHash('#!/bin/sh\r\necho hi\r\n'));
    assert.notEqual(pinlessHash('a\n'), pinlessHash('b\n'));
  });

  it('planFile calls a CRLF copy of the template current, not modified', () => {
    const desired = 'a\nb\n';
    const plan = planFile({ desired, onDisk: 'a\r\nb\r\n', recorded: pinlessHash(desired) });
    assert.equal(plan.action, 'current');
  });

  it('describeDrift reports a CRLF copy of the template as no drift', () => {
    const desired = 'a\nb\n';
    const drift = describeDrift({ desired, onDisk: 'a\r\nb\r\n', recorded: pinlessHash(desired) });
    assert.equal(drift, null);
  });
});

describe('carryPins', () => {
  const checkout = (sha, version) => `      - uses: actions/checkout@${sha} # ${version}`;
  const aif = (sha, version) =>
    `        uses: starvoxel/ai-foundation/.github/actions/checks@${sha} # ${version}`;
  const [a, b, c] = ['a', 'b', 'c'].map((ch) => ch.repeat(40));

  it('keeps the pins a file already has when the template is rewritten', () => {
    const desired = ['name: v2', checkout(a, 'v7.0.1'), aif(a, 'v0.6.0')].join('\n');
    const onDisk = ['name: v1', checkout(b, 'v7.1.0'), aif(c, 'v0.9.0')].join('\n');
    assert.equal(
      carryPins(desired, onDisk),
      ['name: v2', checkout(b, 'v7.1.0'), aif(c, 'v0.9.0')].join('\n'),
    );
  });

  it('gives a new uses: line the freshly rendered pin', () => {
    const desired = [checkout(a, 'v7.0.1'), '      - uses: actions/new@' + b + ' # v1.0.0'].join(
      '\n',
    );
    const onDisk = checkout(c, 'v7.2.0');
    assert.equal(
      carryPins(desired, onDisk),
      [checkout(c, 'v7.2.0'), '      - uses: actions/new@' + b + ' # v1.0.0'].join('\n'),
    );
  });

  it('leaves everything that is not a pinned uses: line alone', () => {
    assert.equal(carryPins('name: x\nrun: echo\n', 'name: y\n'), 'name: x\nrun: echo\n');
  });

  it('writes LF even when the template had CRLF', () => {
    assert.ok(!carryPins('a\r\nb\r\n', 'x\n').includes('\r'));
  });
});
