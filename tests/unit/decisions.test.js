// ------------------------------
// decisions.test.js
//
// Author: Starvoxel AI Agent - 2026-08-19
// Plan: AIF-002-014
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Unit tests for decision-record metadata parsing, index building, and
 * diffing (lib/decisions.js). All fixtures are synthetic in-memory strings —
 * no real disk I/O, per this chunk's testability requirement.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseDecisionRecord, buildDecisionIndex, diffDecisionIndex } from '../../lib/decisions.js';

function wellFormedRecord({
  id = 'AIF-ARCH-001',
  tier = 'A',
  domain = 'architecture',
  status = 'Approved',
  references = '—',
  tags = '—',
  title = 'A Well-Formed Decision',
} = {}) {
  return `# Decision Record: ${title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | ${id} |
| Project | ai-foundation |
| Tier | ${tier} |
| Domain | ${domain} |
| Status | ${status} |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2026-08-19 |
| Referenced By | — |
| References | ${references} |
| Tags | ${tags} |

---

## Problem Statement

Test fixture.
`;
}

// Legacy pre-Tier×Domain record (mirrors AIF-ARCH-001/002/003, which were
// deliberately migrated without Tier/Domain fields — chunk AIF-002-009,
// "light-touch"). Human-approved fix, no formal Plan ID, per chat approval
// 2026-08-24.
function legacyRecordMissingTierAndDomain({
  id = 'AIF-ARCH-001',
  status = 'Approved',
  title = 'A Legacy Decision',
} = {}) {
  return `# Decision Record: ${title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | ${id} |
| Project | ai-foundation |
| Status | ${status} |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2020-01-01 |
| Referenced By | — |
| References | — |
| Tags | — |

---

## Problem Statement

Test fixture. This decision predates the AIF-META-001 Tier x Domain model.
`;
}

// ── parseDecisionRecord ──────────────────────────────────────────────────

describe('unit: decisions/parseDecisionRecord', () => {
  it('extracts all fields from a well-formed Metadata table (DEC-T01)', () => {
    const content = wellFormedRecord({ references: 'AIF-ARCH-002', tags: 'orchestration, dispatch' });
    const result = parseDecisionRecord(content, 'AIF-ARCH-001.decision.md');

    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.id, 'AIF-ARCH-001');
    assert.equal(result.record.tier, 'A');
    assert.equal(result.record.domain, 'architecture');
    assert.equal(result.record.title, 'A Well-Formed Decision');
    assert.equal(result.record.status, 'Approved');
    assert.equal(result.record.path, 'AIF-ARCH-001.decision.md');
    assert.deepEqual(result.record.references, ['AIF-ARCH-002']);
    assert.deepEqual(result.record.tags, ['orchestration', 'dispatch']);
  });

  it('returns { error } when Decision ID is missing (DEC-T02)', () => {
    const content = wellFormedRecord().replace('| Decision ID | AIF-ARCH-001 |\n', '');
    const result = parseDecisionRecord(content, 'bad.decision.md');

    assert.ok(result.error);
    assert.ok(!result.record);
    assert.match(result.error, /Decision ID/);
  });

  it('returns { error } when the Metadata table is malformed (DEC-T03)', () => {
    const content = `# Decision Record: Broken Table

## Metadata

This is not a table at all.

---

## Problem Statement

Test fixture.
`;
    const result = parseDecisionRecord(content, 'broken.decision.md');

    assert.ok(result.error);
    assert.ok(!result.record);
  });

  it('treats References: — and empty References both as an empty array (DEC-T04)', () => {
    const withDash = parseDecisionRecord(wellFormedRecord({ references: '—' }), 'a.decision.md');
    const withEmpty = parseDecisionRecord(wellFormedRecord({ references: '' }), 'b.decision.md');

    assert.deepEqual(withDash.record.references, []);
    assert.deepEqual(withEmpty.record.references, []);
  });

  it('parses a legacy record missing Tier/Domain successfully with null values (DEC-T11)', () => {
    const content = legacyRecordMissingTierAndDomain();
    const result = parseDecisionRecord(content, 'AIF-ARCH-001.decision.md');

    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.id, 'AIF-ARCH-001');
    assert.equal(result.record.tier, null);
    assert.equal(result.record.domain, null);
    assert.equal(result.record.status, 'Approved');
  });

  it('parses Tags: —/empty as [] and a real value splits/trims correctly (DEC-T05)', () => {
    const withDash = parseDecisionRecord(wellFormedRecord({ tags: '—' }), 'a.decision.md');
    const withEmpty = parseDecisionRecord(wellFormedRecord({ tags: '' }), 'b.decision.md');
    const withValues = parseDecisionRecord(
      wellFormedRecord({ tags: 'orchestration, dispatch' }),
      'c.decision.md',
    );

    assert.deepEqual(withDash.record.tags, []);
    assert.deepEqual(withEmpty.record.tags, []);
    assert.deepEqual(withValues.record.tags, ['orchestration', 'dispatch']);
  });
});

// ── buildDecisionIndex ───────────────────────────────────────────────────

describe('unit: decisions/buildDecisionIndex', () => {
  it('computes referenced_by correctly by inversion across 3+ records (DEC-T06)', () => {
    const records = [
      { id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved', path: 'a.decision.md', references: ['B'], tags: [] },
      { id: 'B', tier: 'A', domain: 'architecture', title: 'B', status: 'Approved', path: 'b.decision.md', references: ['C'], tags: [] },
      { id: 'C', tier: 'A', domain: 'architecture', title: 'C', status: 'Approved', path: 'c.decision.md', references: ['B'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.deepEqual(byId.A.referenced_by, []);
    assert.deepEqual(byId.B.referenced_by.sort(), ['A', 'C']);
    assert.deepEqual(byId.C.referenced_by, ['B']);
  });

  it('produces null tier/domain index entries for legacy records, inversion still works (DEC-T12)', () => {
    const records = [
      { id: 'AIF-ARCH-001', tier: null, domain: null, title: 'Legacy A', status: 'Approved', path: 'a.decision.md', references: [], tags: [] },
      { id: 'AIF-ARCH-002', tier: null, domain: null, title: 'Legacy B', status: 'Approved', path: 'b.decision.md', references: ['AIF-ARCH-001'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.equal(byId['AIF-ARCH-001'].tier, null);
    assert.equal(byId['AIF-ARCH-001'].domain, null);
    assert.deepEqual(byId['AIF-ARCH-001'].referenced_by, ['AIF-ARCH-002']);
  });

  it('returns a valid empty index for an empty record list (DEC-T07)', () => {
    const index = buildDecisionIndex([]);
    assert.deepEqual(index.entries, []);
    assert.ok(index.generated_at);
  });
});

// ── diffDecisionIndex ────────────────────────────────────────────────────

const baseEntry = {
  id: 'A',
  tier: 'A',
  domain: 'architecture',
  title: 'A',
  status: 'Approved',
  path: 'a.decision.md',
  supersedes: [],
  superseded_by: [],
  references: [],
  referenced_by: [],
  tags: [],
};

describe('unit: decisions/diffDecisionIndex', () => {
  it('returns stale: false when entries match, ignoring generated_at (DEC-T08)', () => {
    const computed = { generated_at: '2026-08-19T00:00:00.000Z', entries: [{ ...baseEntry }] };
    const existing = { generated_at: '2020-01-01T00:00:00.000Z', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, false);
  });

  it('returns stale: true with a non-empty summary when an entry changed (DEC-T09)', () => {
    const computed = { generated_at: 'now', entries: [{ ...baseEntry, status: 'Deferred' }] };
    const existing = { generated_at: 'then', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, true);
    assert.ok(diff.summary.length > 0);
    assert.match(diff.summary, /A/);
  });

  it('returns stale: true with a non-empty summary when an entry is added', () => {
    const computed = { generated_at: 'now', entries: [{ ...baseEntry }, { ...baseEntry, id: 'B' }] };
    const existing = { generated_at: 'then', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, true);
    assert.match(diff.summary, /B/);
  });

  it('returns stale: true with a non-empty summary when an entry is removed', () => {
    const computed = { generated_at: 'now', entries: [] };
    const existing = { generated_at: 'then', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, true);
    assert.match(diff.summary, /A/);
  });

  it('returns stale: true against existing: null (DEC-T10)', () => {
    const computed = { generated_at: 'now', entries: [{ ...baseEntry }] };
    const diff = diffDecisionIndex(computed, null);
    assert.equal(diff.stale, true);
  });
});
