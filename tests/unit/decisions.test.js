// ------------------------------
// decisions.test.js
//
// Author: Starvoxel AI Agent - 2026-08-19
// Plan: AIF-002-014, AIF-003-001, AIF-003-002
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
  supersedes = '—',
  tags = '—',
  title = 'A Well-Formed Decision',
  lastAmended = undefined,
  amendmentRows = undefined,
} = {}) {
  const lastAmendedRow = lastAmended !== undefined ? `| Last Amended | ${lastAmended} |\n` : '';
  const amendmentsSection = amendmentRows !== undefined
    ? `\n## Amendments\n\n| # | Date | Summary | Outcome |\n|---|---|---|---|\n${amendmentRows}\n`
    : '';
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
| Supersedes | ${supersedes} |
| Tags | ${tags} |
${lastAmendedRow}
---
${amendmentsSection}
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

  it('parses cleanly with Supersedes absent from the Metadata table entirely (001-T01)', () => {
    const content = wellFormedRecord().replace('| Supersedes | — |\n', '');
    const result = parseDecisionRecord(content, 'AIF-ARCH-001.decision.md');

    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.deepEqual(result.record.supersedes, []);
  });

  it('parses Supersedes: — as an empty array (001-T02)', () => {
    const result = parseDecisionRecord(wellFormedRecord({ supersedes: '—' }), 'a.decision.md');
    assert.deepEqual(result.record.supersedes, []);
  });

  it('parses a single Supersedes ID (001-T03)', () => {
    const result = parseDecisionRecord(
      wellFormedRecord({ supersedes: 'AIF-ARCH-004' }),
      'a.decision.md',
    );
    assert.deepEqual(result.record.supersedes, ['AIF-ARCH-004']);
  });

  it('parses multiple Supersedes IDs with irregular spacing, split and trimmed (001-T04)', () => {
    const result = parseDecisionRecord(
      wellFormedRecord({ supersedes: 'AIF-ARCH-004,AIF-ARCH-005 ,  AIF-ARCH-006' }),
      'a.decision.md',
    );
    assert.deepEqual(result.record.supersedes, ['AIF-ARCH-004', 'AIF-ARCH-005', 'AIF-ARCH-006']);
  });

  it('parses a legacy record with no Tier/Domain and no Supersedes (001-T10)', () => {
    const content = legacyRecordMissingTierAndDomain();
    const result = parseDecisionRecord(content, 'AIF-ARCH-001.decision.md');

    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.deepEqual(result.record.supersedes, []);
  });
});

// ── countAmendmentRows / last_amended / amendment_count ─────────────────

describe('unit: decisions/countAmendmentRows and last_amended', () => {
  it('no ## Amendments section: amendment_count is 0, no throw (002-T01)', () => {
    const result = parseDecisionRecord(wellFormedRecord(), 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 0);
  });

  it('## Amendments with header + separator + 0 data rows (002-T02)', () => {
    const content = wellFormedRecord({ amendmentRows: '' });
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 0);
  });

  it('## Amendments with 1 data row (002-T03)', () => {
    const content = wellFormedRecord({
      amendmentRows: '| 1 | 2026-09-02 | Clarified scope | Approved |',
    });
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 1);
  });

  it('## Amendments with 3 data rows, one rejected, all count (002-T04)', () => {
    const content = wellFormedRecord({
      amendmentRows: [
        '| 1 | 2026-09-02 | Clarified scope | Approved |',
        '| 2 | 2026-09-10 | Widen threshold | Rejected |',
        '| 3 | 2026-09-15 | Fix typo | Approved |',
      ].join('\n'),
    });
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 3);
  });

  it('## Amendments followed by another ## section: count stops at table end (002-T05)', () => {
    const content = `# Decision Record: With Trailing Section

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-ARCH-001 |
| Status | Approved |

---

## Amendments

| # | Date | Summary | Outcome |
|---|---|---|---|
| 1 | 2026-09-02 | Clarified scope | Approved |
| 2 | 2026-09-10 | Widen threshold | Rejected |

## Problem Statement

| Not | An amendment row |
|---|---|
| foo | bar |
`;
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 2);
  });

  it('## Amendments present but malformed (heading, no table): 0, no throw (002-T06)', () => {
    const content = `# Decision Record: Malformed Amendments

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-ARCH-001 |
| Status | Approved |

---

## Amendments

This is not a table at all.

## Problem Statement

Test fixture.
`;
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 0);
  });

  it('## Errata present with rows, no ## Amendments: count is 0, errata never surfaces (002-T07)', () => {
    const content = `# Decision Record: Record With Corrections

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-ARCH-001 |
| Status | Approved |

---

## Errata

| # | Date | Note |
|---|---|---|
| 1 | 2026-09-02 | Typo in Section 3 |
| 2 | 2026-09-05 | Broken link |

## Problem Statement

Test fixture.
`;
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 0);
    assert.ok(!JSON.stringify(result.record).includes('Errata'));
    assert.ok(!JSON.stringify(result.record).includes('Broken link'));
  });

  it('Last Amended absent: last_amended is null (002-T08)', () => {
    const result = parseDecisionRecord(wellFormedRecord(), 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.last_amended, null);
  });

  it('Last Amended present: stored verbatim, not parsed/reformatted (002-T09)', () => {
    const content = wellFormedRecord({ lastAmended: '2026-09-02 (Amendment 1)' });
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.last_amended, '2026-09-02 (Amendment 1)');
  });

  it('Last Amended present as — is treated as absent: null (002-T10)', () => {
    const content = wellFormedRecord({ lastAmended: '—' });
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.last_amended, null);
  });

  it('amendment_count: 1 with last_amended: null (rejected-only) indexes without error (002-T12)', () => {
    const content = wellFormedRecord({
      amendmentRows: '| 1 | 2026-09-02 | Widen threshold | Rejected |',
    });
    const result = parseDecisionRecord(content, 'a.decision.md');
    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.amendment_count, 1);
    assert.equal(result.record.last_amended, null);
  });

  it('REQUIRED_FIELDS regression guard: no Tier/Domain/Supersedes/Last Amended/Amendments (002-T13)', () => {
    const content = legacyRecordMissingTierAndDomain();
    const result = parseDecisionRecord(content, 'AIF-ARCH-001.decision.md');

    assert.ok(result.record, 'expected a record, got error: ' + result.error);
    assert.equal(result.record.last_amended, null);
    assert.equal(result.record.amendment_count, 0);
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

  it('inverts supersedes into superseded_by: B supersedes A (001-T05)', () => {
    const records = [
      { id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved', path: 'a.decision.md', references: [], supersedes: [], tags: [] },
      { id: 'B', tier: 'A', domain: 'architecture', title: 'B', status: 'Approved', path: 'b.decision.md', references: [], supersedes: ['A'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.deepEqual(byId.A.superseded_by, ['B']);
    assert.deepEqual(byId.B.supersedes, ['A']);
    assert.deepEqual(byId.B.superseded_by, []);
  });

  it('does not throw on a dangling Supersedes ID and contributes no superseded_by (001-T06)', () => {
    const records = [
      { id: 'C', tier: 'A', domain: 'architecture', title: 'C', status: 'Approved', path: 'c.decision.md', references: [], supersedes: ['AIF-ARCH-999'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.deepEqual(byId.C.supersedes, ['AIF-ARCH-999']);
    for (const entry of index.entries) {
      assert.deepEqual(entry.superseded_by, []);
    }
  });

  it('accumulates superseded_by from two records superseding the same predecessor (001-T07)', () => {
    const records = [
      { id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved', path: 'a.decision.md', references: [], supersedes: [], tags: [] },
      { id: 'B', tier: 'A', domain: 'architecture', title: 'B', status: 'Approved', path: 'b.decision.md', references: [], supersedes: ['A'], tags: [] },
      { id: 'C', tier: 'A', domain: 'architecture', title: 'C', status: 'Approved', path: 'c.decision.md', references: [], supersedes: ['A'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.deepEqual(byId.A.superseded_by.sort(), ['B', 'C']);
  });

  it('excludes self-reference when a record names itself in Supersedes (001-T08)', () => {
    const records = [
      { id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved', path: 'a.decision.md', references: [], supersedes: ['A'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.deepEqual(byId.A.superseded_by, []);
    assert.deepEqual(byId.A.supersedes, ['A']);
  });

  it('computes references/referenced_by correctly alongside supersedes/superseded_by (001-T09)', () => {
    const records = [
      { id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved', path: 'a.decision.md', references: ['B'], supersedes: [], tags: [] },
      { id: 'B', tier: 'A', domain: 'architecture', title: 'B', status: 'Approved', path: 'b.decision.md', references: [], supersedes: ['A'], tags: [] },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.deepEqual(byId.B.referenced_by, ['A']);
    assert.deepEqual(byId.A.referenced_by, []);
    assert.deepEqual(byId.A.superseded_by, ['B']);
    assert.deepEqual(byId.B.supersedes, ['A']);
  });

  it('emits last_amended/amendment_count on every entry, carried through from the record (002-T15-ish)', () => {
    const records = [
      {
        id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved',
        path: 'a.decision.md', references: [], supersedes: [], tags: [],
        last_amended: '2026-09-02 (Amendment 1)', amendment_count: 1,
      },
      {
        id: 'B', tier: 'A', domain: 'architecture', title: 'B', status: 'Approved',
        path: 'b.decision.md', references: [], supersedes: [], tags: [],
        last_amended: null, amendment_count: 0,
      },
    ];

    const index = buildDecisionIndex(records);
    const byId = Object.fromEntries(index.entries.map((e) => [e.id, e]));

    assert.equal(byId.A.last_amended, '2026-09-02 (Amendment 1)');
    assert.equal(byId.A.amendment_count, 1);
    assert.equal(byId.B.last_amended, null);
    assert.equal(byId.B.amendment_count, 0);
  });

  it('places last_amended/amendment_count after tags in the emitted entry key order (002-T14)', () => {
    const records = [
      {
        id: 'A', tier: 'A', domain: 'architecture', title: 'A', status: 'Approved',
        path: 'a.decision.md', references: [], supersedes: [], tags: [],
        last_amended: null, amendment_count: 0,
      },
    ];

    const index = buildDecisionIndex(records);
    const keys = Object.keys(index.entries[0]);
    const tagsIdx = keys.indexOf('tags');
    const lastAmendedIdx = keys.indexOf('last_amended');
    const amendmentCountIdx = keys.indexOf('amendment_count');

    assert.ok(tagsIdx >= 0 && lastAmendedIdx > tagsIdx && amendmentCountIdx > tagsIdx);
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
  last_amended: null,
  amendment_count: 0,
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

  it('reports a supersede-only change as stale (001-T11)', () => {
    const computed = { generated_at: 'now', entries: [{ ...baseEntry, supersedes: ['Z'] }] };
    const existing = { generated_at: 'then', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, true);
    assert.match(diff.summary, /A/);
  });

  it('reports a last_amended-only change as stale (002-T11)', () => {
    const computed = {
      generated_at: 'now',
      entries: [{ ...baseEntry, last_amended: '2026-09-02 (Amendment 1)' }],
    };
    const existing = { generated_at: 'then', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, true);
    assert.match(diff.summary, /A/);
  });

  it('reports an amendment_count-only change as stale (002-T11)', () => {
    const computed = { generated_at: 'now', entries: [{ ...baseEntry, amendment_count: 1 }] };
    const existing = { generated_at: 'then', entries: [{ ...baseEntry }] };

    const diff = diffDecisionIndex(computed, existing);
    assert.equal(diff.stale, true);
    assert.match(diff.summary, /A/);
  });
});
