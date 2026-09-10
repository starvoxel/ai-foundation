/**
 * Unit tests for the block-command pure matching logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  globToRegex,
  matchesBlockedCommand,
} from '../../lib/harnesses/assets/block-command/logic.js';

describe('unit: block-command/globToRegex', () => {
  it('converts a trailing wildcard pattern', () => {
    const regex = globToRegex('git *');
    assert.ok(regex.test('git status'));
    assert.ok(regex.test('git '));
    assert.ok(!regex.test('git'));
    assert.ok(!regex.test('gitx status'));
  });

  it('matches an exact string with no wildcard', () => {
    const regex = globToRegex('gh');
    assert.ok(regex.test('gh'));
    assert.ok(!regex.test('gh pr list'));
  });

  it('escapes regex-special characters literally', () => {
    const regex = globToRegex('rm -rf .');
    assert.ok(regex.test('rm -rf .'));
    assert.ok(!regex.test('rm -rf x'));
  });

  it('supports a wildcard-only pattern matching anything', () => {
    const regex = globToRegex('*');
    assert.ok(regex.test('anything at all'));
    assert.ok(regex.test(''));
  });

  it('supports multiple wildcards in one pattern', () => {
    const regex = globToRegex('npm * --force*');
    assert.ok(regex.test('npm publish --force-yes'));
    assert.ok(!regex.test('npm publish'));
  });
});

describe('unit: block-command/matchesBlockedCommand', () => {
  it('returns the matching pattern for a blocked command', () => {
    assert.equal(matchesBlockedCommand('git status', ['git *', 'gh *']), 'git *');
  });

  it('returns null when no pattern matches', () => {
    assert.equal(matchesBlockedCommand('npm test', ['git *', 'gh *']), null);
  });

  it('returns null for an empty patterns array', () => {
    assert.equal(matchesBlockedCommand('git status', []), null);
  });

  it('returns null when command is empty or not a string', () => {
    assert.equal(matchesBlockedCommand('', ['git *']), null);
    assert.equal(matchesBlockedCommand(null, ['git *']), null);
    assert.equal(matchesBlockedCommand(undefined, ['git *']), null);
  });

  it('returns null when patterns is not an array', () => {
    assert.equal(matchesBlockedCommand('git status', null), null);
    assert.equal(matchesBlockedCommand('git status', undefined), null);
  });

  it('is case-sensitive', () => {
    assert.equal(matchesBlockedCommand('GIT status', ['git *']), null);
  });

  it('ignores non-string entries in the patterns array', () => {
    assert.equal(matchesBlockedCommand('git status', [null, 42, 'git *']), 'git *');
  });

  it('returns the first matching pattern when multiple match', () => {
    assert.equal(matchesBlockedCommand('git status', ['git *', 'git status']), 'git *');
  });
});
