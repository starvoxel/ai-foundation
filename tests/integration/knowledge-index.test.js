/**
 * Integration tests for knowledge index generation (filesystem operations).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { buildKnowledgeIndex } from '../../lib/commands/index.js';

describe('integration: knowledge index', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aif-knowledge-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns empty entries for empty directory', () => {
    const index = buildKnowledgeIndex(dir);
    assert.deepEqual(index.entries, []);
    assert.ok(index.generated_at);
  });

  it('returns empty entries for non-existent directory', () => {
    const index = buildKnowledgeIndex(join(dir, 'nope'));
    assert.deepEqual(index.entries, []);
  });

  it('indexes a valid knowledge file', () => {
    writeFileSync(join(dir, 'api-schema.md'), `---
name: "api-schema"
type: "api"
tags: ["api", "rest"]
scope: "software-engineer"
description: "REST API schema."
---

## Endpoints
`, 'utf8');

    const index = buildKnowledgeIndex(dir);
    assert.equal(index.entries.length, 1);
    assert.equal(index.entries[0].name, 'api-schema');
    assert.equal(index.entries[0].type, 'api');
    assert.equal(index.entries[0].path, 'api-schema.md');
  });

  it('skips files without valid frontmatter', () => {
    writeFileSync(join(dir, 'no-front.md'), '# Just markdown\n', 'utf8');
    writeFileSync(join(dir, 'no-name.md'), `---
type: "reference"
---

Missing name.
`, 'utf8');

    const index = buildKnowledgeIndex(dir);
    assert.equal(index.entries.length, 0);
  });

  it('includes files in subdirectories with correct paths', () => {
    mkdirSync(join(dir, 'decisions'));
    writeFileSync(join(dir, 'decisions', 'auth.md'), `---
name: "auth-decision"
type: "decision"
tags: ["auth"]
description: "Auth approach."
status: "Confirmed"
---

Content.
`, 'utf8');

    const index = buildKnowledgeIndex(dir);
    assert.equal(index.entries.length, 1);
    assert.equal(index.entries[0].path, 'decisions/auth.md');
    assert.equal(index.entries[0].status, 'Confirmed');
  });

  it('skips underscore-prefixed files', () => {
    writeFileSync(join(dir, '_draft.md'), `---
name: "draft"
type: "reference"
tags: ["draft"]
description: "Should be skipped."
---
`, 'utf8');

    const index = buildKnowledgeIndex(dir);
    assert.equal(index.entries.length, 0);
  });

  it('indexes multiple files', () => {
    writeFileSync(join(dir, 'one.md'), `---
name: "one"
tags: ["a"]
description: "First."
---
`, 'utf8');
    writeFileSync(join(dir, 'two.md'), `---
name: "two"
tags: ["b"]
description: "Second."
---
`, 'utf8');

    const index = buildKnowledgeIndex(dir);
    assert.equal(index.entries.length, 2);
  });
});
