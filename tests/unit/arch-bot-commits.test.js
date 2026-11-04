/**
 * Unit tests for bot-commit handling in the architecture staleness check (lib/architecture.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isBotAuthor, parseCommits, commitMakesStale } from '../../lib/architecture.js';

describe('isBotAuthor', () => {
  it('matches GitHub bot accounts', () => {
    assert.equal(isBotAuthor('dependabot[bot]'), true);
    assert.equal(isBotAuthor('renovate[bot]'), true);
  });

  it('does not match humans or lookalikes', () => {
    assert.equal(isBotAuthor('Jeremy Smellie'), false);
    assert.equal(isBotAuthor('robot'), false);
    assert.equal(isBotAuthor('[bot] Person'), false);
    assert.equal(isBotAuthor(undefined), false);
  });
});

describe('parseCommits', () => {
  it('splits author and multi-line message per commit', () => {
    const out = 'Ann\x1fFix\n\nbody\x1e\ndependabot[bot]\x1fBump x\x1e\n';
    assert.deepEqual(parseCommits(out), [
      { author: 'Ann', message: 'Fix\n\nbody' },
      { author: 'dependabot[bot]', message: 'Bump x' },
    ]);
  });

  it('returns nothing for empty output', () => {
    assert.deepEqual(parseCommits(''), []);
  });
});

describe('commitMakesStale', () => {
  it('ignores bot commits without a waiver', () => {
    assert.equal(commitMakesStale({ author: 'dependabot[bot]', message: 'Bump' }, '02'), false);
  });

  it('counts a human commit without a waiver', () => {
    assert.equal(commitMakesStale({ author: 'Ann', message: 'Change' }, '02'), true);
  });

  it('does not count a human commit with a waiver', () => {
    const message = 'Change\n\nArch-Unaffected: 02 — comment only';
    assert.equal(commitMakesStale({ author: 'Ann', message }, '02'), false);
  });
});
