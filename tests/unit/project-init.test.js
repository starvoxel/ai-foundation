/**
 * Unit tests for project-init pure logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateProjectManifest, validateProjectName } from '../../lib/project-init.js';

// ── validateProjectName ──────────────────────────────────────────────────────

describe('unit: project-init/validateProjectName', () => {
  it('accepts a simple name', () => {
    assert.equal(validateProjectName('my-project').valid, true);
  });

  it('accepts alphanumeric with hyphens', () => {
    assert.equal(validateProjectName('app-2026').valid, true);
  });

  it('rejects empty string', () => {
    const result = validateProjectName('');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('required'));
  });

  it('rejects null', () => {
    assert.equal(validateProjectName(null).valid, false);
  });

  it('rejects leading spaces', () => {
    const result = validateProjectName(' my-project');
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('spaces'));
  });

  it('rejects trailing spaces', () => {
    assert.equal(validateProjectName('my-project ').valid, false);
  });

  it('rejects invalid filesystem characters', () => {
    const bad = ['a<b', 'a>b', 'a:b', 'a"b', 'a|b', 'a?b', 'a*b', 'a/b', 'a\\b'];
    for (const name of bad) {
      assert.equal(validateProjectName(name).valid, false, `"${name}" should be invalid`);
    }
  });

  it('rejects names starting with dot', () => {
    assert.equal(validateProjectName('.hidden').valid, false);
  });

  it('rejects names starting with underscore', () => {
    assert.equal(validateProjectName('_private').valid, false);
  });

  it('rejects names over 100 characters', () => {
    assert.equal(validateProjectName('a'.repeat(101)).valid, false);
  });

  it('accepts names exactly 100 characters', () => {
    assert.equal(validateProjectName('a'.repeat(100)).valid, true);
  });
});

// ── generateProjectManifest ──────────────────────────────────────────────────

describe('unit: project-init/generateProjectManifest', () => {
  it('returns dirs and files arrays', () => {
    const { dirs, files } = generateProjectManifest('test-project');
    assert.ok(Array.isArray(dirs));
    assert.ok(Array.isArray(files));
    assert.ok(dirs.length > 0);
    assert.ok(files.length > 0);
  });

  it('includes all required directories', () => {
    const { dirs } = generateProjectManifest('test-project');
    assert.ok(dirs.includes('knowledge/decisions'));
    assert.ok(dirs.includes('plans/epics'));
    assert.ok(dirs.includes('plans/chunks'));
    assert.ok(dirs.includes('plans/orchestration'));
  });

  it('generates .aiconfig.json with correct project name', () => {
    const { files } = generateProjectManifest('my-app');
    const config = files.find(f => f.path === '.aiconfig.json');
    assert.ok(config);
    const parsed = JSON.parse(config.content);
    assert.equal(parsed.project_name, 'my-app');
  });

  it('.aiconfig.json has standards map with engineering and all keys', () => {
    const { files } = generateProjectManifest('test');
    const parsed = JSON.parse(files.find(f => f.path === '.aiconfig.json').content);
    assert.ok(Array.isArray(parsed.standards.engineering));
    assert.ok(Array.isArray(parsed.standards.all));
  });

  it('.aiconfig.json has all required paths', () => {
    const { files } = generateProjectManifest('test');
    const parsed = JSON.parse(files.find(f => f.path === '.aiconfig.json').content);
    assert.equal(parsed.paths.plans, 'plans');
    assert.equal(parsed.paths.epics, 'plans/epics');
    assert.equal(parsed.paths.chunks, 'plans/chunks');
    assert.equal(parsed.paths.decisions, 'knowledge/decisions');
    assert.equal(parsed.paths.orchestration, 'plans/orchestration');
    assert.equal(parsed.paths.knowledge, 'knowledge');
  });

  it('generates project-standards.md with project name', () => {
    const { files } = generateProjectManifest('cool-app');
    const standards = files.find(f => f.path === 'project-standards.md');
    assert.ok(standards);
    assert.ok(standards.content.includes('cool-app'));
  });

  it('generates knowledge example file', () => {
    const { files } = generateProjectManifest('test');
    const example = files.find(f => f.path === 'knowledge/example.md');
    assert.ok(example);
    assert.ok(example.content.includes('name: "example"'));
  });
});
