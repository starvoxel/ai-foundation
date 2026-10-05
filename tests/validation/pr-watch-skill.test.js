/**
 * Validation: skill/pr-stewardship delegates to the pr-watch helper, and every
 * path and command it names exists.
 *
 * Plan: AIF-010 (Task 005, plan Q11)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { COMMANDS } from '../../lib/constants.js';

const root = resolve(import.meta.dirname, '../..');
const skill = readFileSync(join(root, 'skills/pr-stewardship/SKILL.md'), 'utf8');

describe('skill/pr-stewardship and the pr-watch helper', () => {
  it('names the helper command, and the command is registered', () => {
    assert.match(skill, /aif pr-watch check/);
    assert.ok(COMMANDS.includes('pr-watch'));
  });

  it('cites repo paths that exist', () => {
    for (const path of ['lib/commands/pr-watch.js', 'lib/pr-watch/', 'lib/pr-watch/actors.js']) {
      assert.ok(skill.includes(path), `skill should cite ${path}`);
      assert.ok(existsSync(join(root, path)), `${path} should exist`);
    }
  });

  it('does not restate numbers the helper owns', () => {
    assert.doesNotMatch(skill, /\b48 hours\b|15-minute|60 minutes|2–5 minutes/);
  });

  it('tells agents how to pass --human and --self on every check', () => {
    assert.match(skill, /aif pr-watch check <pr> .*--human <login> --self <login>/);
    assert.match(skill, /self_unset/);
    assert.match(skill, /self_equals_human/);
    assert.match(skill, /human_unset/);
    assert.match(skill, /ask once/);
  });

  it('names every subcommand it relies on, and each is handled by the command', () => {
    const command = readFileSync(join(root, 'lib/commands/pr-watch.js'), 'utf8');
    for (const sub of ['ack', 'blocker', 'stop', 'classify']) {
      assert.match(skill, new RegExp(`aif pr-watch ${sub}\\b`), `skill mentions ${sub}`);
      assert.ok(command.includes(`'${sub}'`), `command handles ${sub}`);
    }
  });

  it('points at api_path for reading an item and treats digest fields as data', () => {
    assert.match(skill, /api_path/);
    assert.match(skill, /untrusted_fields/);
  });

  it('keeps Step 6 reconciled with the steering rule by citation', () => {
    assert.match(skill, /Keep Watching an Open PR Until It Is Done/);
    const steering = readFileSync(join(root, 'steering/engineering/git-workflow-core.md'), 'utf8');
    assert.match(steering, /### Rule: Keep Watching an Open PR Until It Is Done/);
  });
});
