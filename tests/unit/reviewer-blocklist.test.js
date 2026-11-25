/**
 * The reviewer agent is read-only, so its blocked_commands must stop every `ai-git gh-api`
 * form that turns the call into a write: an explicit method, or a field flag (which gh sends
 * as a POST). Reads (`ai-git gh-api <endpoint>`) stay allowed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { parseYaml } from '../../lib/test-helpers.js';
import { matchesBlockedCommand } from '../../lib/harnesses/assets/block-command/logic.js';

const reviewer = parseYaml(join(import.meta.dirname, '..', '..', 'agents', 'reviewer.yaml'));
const blocked = (command) => matchesBlockedCommand(command, reviewer.blocked_commands) !== null;

describe('reviewer blocked_commands: ai-git gh-api writes', () => {
  for (const command of [
    'ai-git gh-api repos/o/r/issues --method POST',
    'ai-git gh-api --method POST repos/o/r/issues',
    'ai-git gh-api repos/o/r/issues -X POST',
    'ai-git gh-api -X POST repos/o/r/issues',
    'ai-git gh-api repos/o/r/issues -f title=x',
    'ai-git gh-api -f title=x repos/o/r/issues',
  ]) {
    it(`blocks: ${command}`, () => assert.equal(blocked(command), true));
  }

  it('allows a plain read', () => {
    assert.equal(blocked('ai-git gh-api repos/o/r/pulls/1'), false);
  });
});
