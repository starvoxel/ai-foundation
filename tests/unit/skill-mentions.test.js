// ------------------------------
// skill-mentions.test.js
//
// Author: Starvoxel AI Agent - 2026-10-05
// Plan: AIF-006
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySkillMentions,
  checkSkillMentions,
  requiresSkillsLines,
  SKILL_REF_IGNORE_MARKER,
} from '../../lib/skill-mentions.js';

const classes = (line, opts) => classifySkillMentions(line, opts).map((m) => `${m.name}:${m.cls}`);

describe('unit: classifySkillMentions', () => {
  it('classifies an exact inline code span as a reference', () => {
    assert.deepEqual(classes('Follow `skill/plan-lifecycle` here.'), ['plan-lifecycle:reference']);
  });

  it('keeps a reference followed by a named-locator chain', () => {
    assert.deepEqual(classes('See `skill/worktree-management`: "Create Worktree".'), [
      'worktree-management:reference',
    ]);
  });

  it('classifies a mention inside a longer code span as an example', () => {
    assert.deepEqual(classes('Use `preload_skills: [skill/plan-lifecycle]` in YAML.'), [
      'plan-lifecycle:example',
    ]);
  });

  it('classifies a marked span as an example', () => {
    const line = `Pointer to \`skill/plan-lifecycle\`${SKILL_REF_IGNORE_MARKER} only.`;
    assert.deepEqual(classes(line), ['plan-lifecycle:example']);
  });

  it('requires the marker to follow the span immediately', () => {
    const line = `\`skill/plan-lifecycle\` ${SKILL_REF_IGNORE_MARKER}`;
    assert.deepEqual(classes(line), ['plan-lifecycle:reference']);
  });

  it('honours the marker after an unformatted mention too', () => {
    assert.deepEqual(classes(`see skill/foo${SKILL_REF_IGNORE_MARKER}`), ['foo:example']);
  });

  it('classifies plain prose as other', () => {
    assert.deepEqual(classes('Use skill/review-severity for this.'), ['review-severity:other']);
  });

  it('handles several mentions on one line independently', () => {
    const line = '`skill/a` and skill/b and `x skill/c y`';
    assert.deepEqual(classes(line), ['a:reference', 'b:other', 'c:example']);
  });

  it('never treats a skill as referencing itself', () => {
    assert.deepEqual(classes('`skill/self` and `skill/other`', { ownName: 'self' }), [
      'other:reference',
    ]);
  });

  it('ignores slash-joined word lists and longer paths', () => {
    assert.deepEqual(classes('Agent/skill/steering/schema and steering/skill/x'), []);
    assert.deepEqual(classes('`skill/a/b`'), []);
  });

  it('does not match "skills/" folder paths', () => {
    assert.deepEqual(classes('`skills/plan-lifecycle/SKILL.md`'), []);
  });

  it('supports double-backtick spans', () => {
    assert.deepEqual(classes('``skill/foo``'), ['foo:reference']);
  });
});

describe('unit: requiresSkillsLines', () => {
  it('covers block-list declarations and stops at the next key', () => {
    const content = '---\nname: x\nrequires_skills:\n  - a\n  - skill/b\nversion: 1\n---\nbody\n';
    assert.deepEqual([...requiresSkillsLines(content)], [3, 4, 5]);
  });

  it('covers an inline list and ignores files without frontmatter', () => {
    assert.deepEqual([...requiresSkillsLines('---\nrequires_skills: [a]\n---\n')], [2]);
    assert.deepEqual([...requiresSkillsLines('no frontmatter')], []);
  });
});

describe('unit: checkSkillMentions', () => {
  const existing = new Set(['a', 'b', 'c']);
  const run = (content, covered = new Set(['a']), ownName) =>
    checkSkillMentions(content, {
      label: 'f.md',
      ownName,
      covered,
      skillExists: (n) => existing.has(n),
    });

  it('accepts a covered reference', () => {
    assert.deepEqual(run('`skill/a`'), { errors: [], warnings: [] });
  });

  it('errors on an uncovered reference with file and line', () => {
    const { errors } = run('x\n`skill/b`');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /^f\.md:2: reference to skill\/b is not covered by requires_skills/);
  });

  it('errors on a reference to a nonexistent skill', () => {
    const { errors } = run('`skill/ghost`');
    assert.match(errors[0], /^f\.md:1: reference to non-existent skill\/ghost/);
  });

  it('warns, without erroring, on an unformatted mention', () => {
    const { errors, warnings } = run('Use skill/b here.');
    assert.equal(errors.length, 0);
    assert.match(warnings[0], /^f\.md:1: unformatted mention of skill\/b/);
  });

  it('ignores fenced blocks, longer spans and marked mentions', () => {
    const content = [
      '```yaml',
      'skills: [skill/b]',
      '```',
      '`skills: [skill/b]`',
      `\`skill/c\`${SKILL_REF_IGNORE_MARKER}`,
    ].join('\n');
    assert.deepEqual(run(content), { errors: [], warnings: [] });
  });

  it('does not scan the requires_skills declaration itself', () => {
    const content = '---\nrequires_skills:\n  - skill/b\n---\nbody';
    assert.deepEqual(run(content, new Set(['b'])), { errors: [], warnings: [] });
  });

  it('skips self-mentions', () => {
    assert.deepEqual(run('`skill/b`', new Set(), 'b'), { errors: [], warnings: [] });
  });
});
