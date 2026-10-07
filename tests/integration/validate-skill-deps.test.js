// ------------------------------
// validate-skill-deps.test.js
//
// Author: Starvoxel AI Agent - 2026-10-05
// Plan: AIF-006
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { runValidate } from '../../lib/commands/validate.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';

/** Runs `aif validate [target]`, capturing console output. */
function validate(repo, target) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  let code;
  try {
    code = runValidate({ args: {}, positional: target ? [target] : [] }, repo);
  } finally {
    console.log = original;
  }
  return { code, output: lines.join('\n') };
}

describe('integration: validate skill-deps / requires_skills', () => {
  let repo;

  const write = (rel, content) => {
    const full = join(repo, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  };
  const reqLine = (requires) =>
    requires === undefined ? '' : `requires_skills: ${JSON.stringify(requires)}\n`;
  const skill = (name, { requires, body = '', extra = {} } = {}) => {
    write(
      `skills/${name}/SKILL.md`,
      `---\nname: ${name}\nversion: 1.0.0\ndescription: d\n${reqLine(requires)}---\n# ${name}\n${body}\n`,
    );
    for (const [rel, content] of Object.entries(extra)) write(`skills/${name}/${rel}`, content);
  };
  const steering = (rel, { requires, body = '' } = {}) => {
    write(
      `steering/${rel}`,
      `---\nname: s\nversion: 1.0.0\ndescription: d\n${reqLine(requires)}---\n# s\n${body}\n`,
    );
  };

  beforeEach(() => {
    repo = createTempRepo({ skills: [] });
  });
  afterEach(() => destroyTempRepo(repo));

  it('covers references through the closure and flags undeclared ones', () => {
    skill('a', { requires: ['b'], body: 'Follow `skill/b` and `skill/c`.' });
    skill('b');
    skill('c');
    skill('d', { requires: ['a'], body: 'Via closure: `skill/b`.' });
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 1, output);
    assert.match(output, /skills\/a\/SKILL\.md:\d+: reference to skill\/c is not covered/);
    assert.doesNotMatch(output, /skills\/d/);
    assert.doesNotMatch(output, /skill\/b is not covered/);
  });

  it('errors on a nonexistent requires_skills entry, naming chain and declaring file', () => {
    skill('a', { requires: ['ghost'] });
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 1);
    assert.match(
      output,
      /skills\/a\/SKILL\.md: requires_skills entry 'ghost' not found \(a → ghost → \(missing\)\)/,
    );
  });

  it('reports a missing entry in a steering file against that file', () => {
    steering('global/x.md', { requires: ['ghost'] });
    const { output } = validate(repo, 'skill-deps');
    assert.match(output, /steering\/global\/x\.md: requires_skills entry 'ghost' not found/);
  });

  it('does not crash on a missing transitive dependency (a -> b -> ghost)', () => {
    skill('a', { requires: ['b'] });
    skill('b', { requires: ['ghost'] });
    steering('global/x.md', { requires: ['a'] });
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 1);
    assert.match(output, /skills\/b\/SKILL\.md: requires_skills entry 'ghost' not found/);
    assert.doesNotMatch(output, /skills\/a\/SKILL\.md: requires_skills entry/);
    assert.doesNotMatch(output, /steering\/global\/x\.md: requires_skills entry/);
  });

  it('rejects malformed fields in the schema check (non-list, traversal, non-kebab)', () => {
    skill('a', { requires: 'b' });
    skill('b', { requires: ['../evil'] });
    skill('c', { requires: ['A_b'] });
    steering('global/x.md', { requires: ['a/b'] });
    const { code, output } = validate(repo, 'schema');
    assert.equal(code, 1);
    assert.match(output, /skills\/a\/SKILL\.md: requires_skills must be a list/);
    assert.match(output, /skills\/b\/SKILL\.md: invalid requires_skills entry "\.\.\/evil"/);
    assert.match(output, /skills\/c\/SKILL\.md: invalid requires_skills entry "A_b"/);
    assert.match(output, /steering\/global\/x\.md: invalid requires_skills entry "a\/b"/);
  });

  it('does not cascade a malformed dependency into skill-deps errors', () => {
    skill('a', { requires: ['b'] });
    skill('b', { requires: ['../evil'] });
    const { output } = validate(repo, 'skill-deps');
    assert.doesNotMatch(output, /evil/);
  });

  it('errors on a reference to a nonexistent skill, with file and line', () => {
    skill('a', { body: '\nSee `skill/ghost`.' });
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 1);
    assert.match(output, /skills\/a\/SKILL\.md:\d+: reference to non-existent skill\/ghost/);
  });

  it('scans reference/ files against the owning skill and not README.md', () => {
    skill('a', {
      requires: ['b'],
      extra: {
        'reference/r.md': 'Needs `skill/c`.\n',
        'README.md': 'Needs `skill/c` and skill/c.\n',
      },
    });
    skill('b');
    skill('c');
    const { output } = validate(repo, 'skill-deps');
    assert.match(output, /skills\/a\/reference\/r\.md:1: reference to skill\/c is not covered/);
    assert.doesNotMatch(output, /README/);
  });

  it('scans steering files and honours their closure', () => {
    skill('a', { requires: ['b'] });
    skill('b');
    skill('zzz');
    steering('engineering/x.md', { requires: ['a'], body: 'Use `skill/b` and `skill/zzz`.' });
    const { output } = validate(repo, 'skill-deps');
    assert.doesNotMatch(output, /skill\/b is not covered/);
    assert.match(
      output,
      /steering\/engineering\/x\.md:\d+: reference to skill\/zzz is not covered/,
    );
  });

  it('terminates on cycles with no error or warning', () => {
    skill('a', { requires: ['b'], body: 'Uses `skill/b`.' });
    skill('b', { requires: ['a'], body: 'Uses `skill/a`.' });
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 0, output);
    assert.doesNotMatch(output, /warning/);
  });

  it('treats other mentions as warnings that do not fail the run', () => {
    skill('a', { body: 'Mentions skill/b in prose.' });
    skill('b');
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 0, output);
    assert.match(output, /warning: skills\/a\/SKILL\.md:\d+: unformatted mention of skill\/b/);
    assert.match(output, /All validations passed\. \(1 warning\(s\)\)/);
  });

  it('ignores fenced, longer-span and marked mentions; never self-references', () => {
    skill('a', {
      body: [
        '```',
        'skill/b',
        '```',
        '`skills: [skill/b]`',
        '`skill/b`<!-- skill-ref: ignore -->',
        '`skill/a`',
      ].join('\n'),
    });
    skill('b');
    const { code, output } = validate(repo, 'skill-deps');
    assert.equal(code, 0, output);
    assert.doesNotMatch(output, /warning/);
  });

  it('is part of the default run', () => {
    skill('a', { body: 'Needs `skill/b`.' });
    skill('b');
    const { code, output } = validate(repo);
    assert.equal(code, 1, output);
    assert.match(output, /skill-deps/);
    assert.equal(validate(repo, 'skill-deps').code, 1);
  });
});

describe('integration: validate bundles — steering paths', () => {
  let repo;
  beforeEach(() => {
    repo = createTempRepo({
      bundles: [
        { name: 'b', version: '1.0.0', description: 'd', steering: ['steering/x/gone.md'] },
      ],
    });
  });
  afterEach(() => destroyTempRepo(repo));

  it('errors when a bundle lists a steering file that does not exist', () => {
    const { code, output } = validate(repo, 'bundles');
    assert.equal(code, 1);
    assert.match(
      output,
      /bundles\/b\/bundle\.yaml: steering file 'steering\/x\/gone\.md' does not exist/,
    );
  });
});
