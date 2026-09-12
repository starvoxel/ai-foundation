/**
 * Unit tests for base harness pure functions (parseFrontmatter, hashContent).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFrontmatter,
  hashContent,
  stripSkillPrefix,
  resolvePreloadSkills,
} from '../../lib/harnesses/base.js';

// ── parseFrontmatter ─────────────────────────────────────────────────────────

describe('unit: base/parseFrontmatter', () => {
  it('parses simple key-value frontmatter', () => {
    const { frontmatter, body } = parseFrontmatter('---\nname: "test"\n---\nBody.\n');
    assert.equal(frontmatter.name, 'test');
    assert.equal(body, 'Body.\n');
  });

  it('parses frontmatter with arrays', () => {
    const content = '---\ntags: ["api", "rest"]\n---\nContent.\n';
    const { frontmatter } = parseFrontmatter(content);
    assert.deepEqual(frontmatter.tags, ['api', 'rest']);
  });

  it('parses frontmatter with multi-line arrays', () => {
    const content = '---\ntags:\n  - api\n  - rest\n---\nContent.\n';
    const { frontmatter } = parseFrontmatter(content);
    assert.deepEqual(frontmatter.tags, ['api', 'rest']);
  });

  it('returns null frontmatter when no delimiters present', () => {
    const content = '# No frontmatter\nJust text.';
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter, null);
    assert.equal(body, content);
  });

  it('returns null frontmatter for empty string', () => {
    const { frontmatter, body } = parseFrontmatter('');
    assert.equal(frontmatter, null);
    assert.equal(body, '');
  });

  it('handles empty frontmatter block', () => {
    const content = '---\n\n---\nBody here.\n';
    const { frontmatter, body } = parseFrontmatter(content);
    // Empty YAML parses as null
    assert.equal(frontmatter, null);
    assert.equal(body, 'Body here.\n');
  });

  it('handles CRLF line endings', () => {
    const content = '---\r\nname: "test"\r\n---\r\nBody.\r\n';
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter.name, 'test');
    assert.ok(body.includes('Body.'));
  });

  it('preserves body content exactly (no trimming)', () => {
    const content = '---\nname: "x"\n---\n\n  indented\n\nspaced\n';
    const { body } = parseFrontmatter(content);
    assert.equal(body, '\n  indented\n\nspaced\n');
  });

  it('handles frontmatter with all knowledge fields', () => {
    const content = `---
name: "api-schema"
type: "api"
tags: ["api", "rest", "users"]
scope: "software-engineer"
description: "User service API schema."
status: "Confirmed"
---

## Endpoints
`;
    const { frontmatter, body } = parseFrontmatter(content);
    assert.equal(frontmatter.name, 'api-schema');
    assert.equal(frontmatter.type, 'api');
    assert.deepEqual(frontmatter.tags, ['api', 'rest', 'users']);
    assert.equal(frontmatter.scope, 'software-engineer');
    assert.equal(frontmatter.description, 'User service API schema.');
    assert.equal(frontmatter.status, 'Confirmed');
    assert.ok(body.includes('## Endpoints'));
  });
});

// ── hashContent ──────────────────────────────────────────────────────────────

describe('unit: base/hashContent', () => {
  it('returns sha256-prefixed hash', () => {
    const hash = hashContent('hello');
    assert.ok(hash.startsWith('sha256:'));
    assert.equal(hash.length, 7 + 64); // "sha256:" + 64 hex chars
  });

  it('produces consistent hashes for same input', () => {
    assert.equal(hashContent('test'), hashContent('test'));
  });

  it('produces different hashes for different input', () => {
    assert.notEqual(hashContent('a'), hashContent('b'));
  });

  it('handles empty string', () => {
    const hash = hashContent('');
    assert.ok(hash.startsWith('sha256:'));
    assert.equal(hash.length, 7 + 64);
  });

  it('handles Buffer input', () => {
    const hash = hashContent(Buffer.from('hello'));
    assert.equal(hash, hashContent('hello'));
  });
});

// ── stripSkillPrefix ─────────────────────────────────────────────────────────

describe('unit: base/stripSkillPrefix', () => {
  it('strips a leading "skill/" prefix', () => {
    assert.equal(stripSkillPrefix('skill/code-review'), 'code-review');
  });

  it('passes through a ref with no prefix unchanged', () => {
    assert.equal(stripSkillPrefix('code-review'), 'code-review');
  });
});

// ── resolvePreloadSkills ─────────────────────────────────────────────────────

describe('unit: base/resolvePreloadSkills', () => {
  it('preloads nothing when preload_skills is absent', () => {
    const agent = { skills: ['skill/a', 'skill/b'] };
    assert.deepEqual(resolvePreloadSkills(agent), []);
  });

  it('preloads nothing when skills itself is absent', () => {
    assert.deepEqual(resolvePreloadSkills({}), []);
  });

  it('preloads everything in skills for the ["*"] sentinel', () => {
    const agent = { skills: ['skill/a', 'skill/b'], preload_skills: ['*'] };
    assert.deepEqual(resolvePreloadSkills(agent), ['skill/a', 'skill/b']);
  });

  it('preloads exactly the named subset otherwise', () => {
    const agent = { skills: ['skill/a', 'skill/b', 'skill/c'], preload_skills: ['skill/b'] };
    assert.deepEqual(resolvePreloadSkills(agent), ['skill/b']);
  });
});
