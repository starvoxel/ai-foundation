/**
 * Unit tests for knowledge validation and index entry construction.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateKnowledgeFrontmatter, buildIndexEntry } from '../../lib/knowledge.js';

// ── validateKnowledgeFrontmatter ─────────────────────────────────────────────

describe('unit: knowledge/validateKnowledgeFrontmatter', () => {
  it('validates a complete frontmatter object', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'api-schema',
      type: 'api',
      tags: ['api', 'rest'],
      scope: 'software-engineer',
      description: 'REST API schema.',
    });
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('returns invalid for null', () => {
    const result = validateKnowledgeFrontmatter(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes('Missing or invalid frontmatter'));
  });

  it('returns invalid for non-object', () => {
    const result = validateKnowledgeFrontmatter('string');
    assert.equal(result.valid, false);
  });

  it('requires name field', () => {
    const result = validateKnowledgeFrontmatter({
      type: 'reference',
      tags: ['test'],
      description: 'Test.',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('name')));
  });

  it('requires description field', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      tags: ['test'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('description')));
  });

  it('requires tags as non-empty array', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      description: 'Test.',
      tags: [],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('tags')));
  });

  it('requires tags to be an array', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      description: 'Test.',
      tags: 'not-array',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('tags')));
  });

  it('rejects invalid type', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      type: 'invalid-type',
      tags: ['test'],
      description: 'Test.',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid type')));
  });

  it('accepts all valid types', () => {
    const types = ['decision', 'reference', 'architecture', 'api', 'business-rule'];
    for (const type of types) {
      const result = validateKnowledgeFrontmatter({
        name: 'test',
        type,
        tags: ['test'],
        description: 'Test.',
      });
      assert.equal(result.valid, true, `Type "${type}" should be valid`);
    }
  });

  it('allows missing type (defaults later)', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      tags: ['test'],
      description: 'Test.',
    });
    assert.equal(result.valid, true);
  });

  it('allows missing scope (defaults later)', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      tags: ['test'],
      description: 'Test.',
    });
    assert.equal(result.valid, true);
  });

  it('rejects non-string scope', () => {
    const result = validateKnowledgeFrontmatter({
      name: 'test',
      tags: ['test'],
      description: 'Test.',
      scope: ['array'],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('scope')));
  });

  it('reports multiple errors at once', () => {
    const result = validateKnowledgeFrontmatter({
      type: 'bogus',
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3); // name, description, tags, type
  });
});

// ── buildIndexEntry ──────────────────────────────────────────────────────────

describe('unit: knowledge/buildIndexEntry', () => {
  it('builds a complete entry from full frontmatter', () => {
    const entry = buildIndexEntry({
      name: 'api-schema',
      type: 'api',
      tags: ['api', 'rest'],
      scope: 'software-engineer',
      description: 'REST API schema.',
    }, 'api-schema.md');

    assert.deepEqual(entry, {
      path: 'api-schema.md',
      name: 'api-schema',
      type: 'api',
      tags: ['api', 'rest'],
      scope: 'software-engineer',
      description: 'REST API schema.',
    });
  });

  it('defaults type to reference', () => {
    const entry = buildIndexEntry({
      name: 'test',
      tags: ['x'],
      description: 'Test.',
    }, 'test.md');

    assert.equal(entry.type, 'reference');
  });

  it('defaults scope to all', () => {
    const entry = buildIndexEntry({
      name: 'test',
      tags: ['x'],
      description: 'Test.',
    }, 'test.md');

    assert.equal(entry.scope, 'all');
  });

  it('includes status when present (for decisions)', () => {
    const entry = buildIndexEntry({
      name: 'auth-decision',
      type: 'decision',
      tags: ['auth'],
      description: 'Auth approach.',
      status: 'Confirmed',
    }, 'decisions/auth.md');

    assert.equal(entry.status, 'Confirmed');
    assert.equal(entry.path, 'decisions/auth.md');
  });

  it('omits status when not present', () => {
    const entry = buildIndexEntry({
      name: 'test',
      tags: ['x'],
      description: 'Test.',
    }, 'test.md');

    assert.equal(entry.status, undefined);
    assert.ok(!('status' in entry));
  });
});
