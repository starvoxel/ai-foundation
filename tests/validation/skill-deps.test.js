// ------------------------------
// skill-deps.test.js
//
// Author: Starvoxel AI Agent - 2026-10-06
// Plan: AIF-006
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runValidate } from '../../lib/commands/validate.js';
import { resolveBundle } from '../../lib/resolver.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Runs `aif validate [target]` on the real repo, capturing console output. */
function validate(target) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  let code;
  try {
    code = runValidate({ args: {}, positional: target ? [target] : [] }, ROOT);
  } finally {
    console.log = original;
  }
  return { code, output: lines.join('\n') };
}

describe('validation: skill-deps — real repo', () => {
  it('skill-deps reports zero errors and zero warnings', () => {
    const { code, output } = validate('skill-deps');
    assert.equal(code, 0, output);
    assert.doesNotMatch(output, /warning/i);
  });

  it('default validate (includes skill-deps) reports zero errors and zero warnings', () => {
    const { code, output } = validate();
    assert.equal(code, 0, output);
    assert.match(output, /✓ skill-deps/);
    assert.doesNotMatch(output, /warning/i);
  });
});

describe('validation: bundle skill closure — real repo', () => {
  it('engineering bundle installs plan-lifecycle and adr-authoring', () => {
    const skills = resolveBundle('engineering', ROOT).skills;
    assert.ok(skills.includes('plan-lifecycle'), 'plan-lifecycle missing');
    assert.ok(skills.includes('adr-authoring'), 'adr-authoring missing');
  });

  it('generic-only bundle installs steering-authoring', () => {
    const skills = resolveBundle('generic', ROOT).skills;
    assert.ok(skills.includes('steering-authoring'), 'steering-authoring missing');
  });
});
