# Test Results: AIF-003-002

## Metadata

| Field | Value |
|---|---|
| Run By | Test-Engineer |
| Date | 2026-08-26 |
| Chunk Plan | AIF-003-002 |
| Outcome | Pass |
| Results | 711 passed, 0 failed, 0 blocked (19 new tests for this chunk: unit 002-T01–T14, integration 002-T15–T17, plus 002-T18 = the full-suite regression itself) |

---

## Verification Notes

Tests for this chunk were written by Software-Engineer alongside the implementation
(commits `930d151`, `08ba5e5`, `add81a9`, `c35449d`). Test-Engineer independently re-ran the
full suite and reviewed each new test against the Chunk Plan's Testing Plan (Section 12) for
correctness and coverage, per `skill/test-execution`. No test files were authored or modified
by Test-Engineer in this pass — this was an independent verification of existing test
coverage, not first-authorship.

`npm test` was run from the worktree: 711/711 tests passing (150 suites), independently
confirming the implementer's and Engineering-Manager's reported count. Pre-existing baseline
was 692 (per chunk 001's Test Results Report) → 711 = +19 new tests, exactly matching the
plan's Test IDs 002-T01 through 002-T17 (14 unit + 3 integration; DEC-IT-prefixed and
pre-existing tests in the same files were not double-counted).

Diff scope verified via `git diff origin/main...HEAD --stat`: exactly the four plan-declared
files were touched — `lib/decisions.js`, `tests/unit/decisions.test.js`,
`tests/integration/decisions-index.test.js`, `docs/decisions/index.json`. No existing
`.decision.md` file was retrofitted with the new fields (confirmed: no path under
`docs/decisions/**/*.decision.md` appears in the diff).

---

## Results by Test Case

| Test ID | Test Name | Result | Notes |
|---|---|---|---|
| 002-T01 | No `## Amendments` section | Pass | `amendment_count === 0`, no throw. |
| 002-T02 | `## Amendments` with header+separator, 0 data rows | Pass | |
| 002-T03 | `## Amendments` with 1 data row | Pass | |
| 002-T04 | `## Amendments` with 3 rows, one rejected | Pass | All 3 counted, confirming rejected rows are not excluded. |
| 002-T05 | `## Amendments` followed by another `##` section | Pass | Count stops at table end; trailing markdown table under `## Problem Statement` in the fixture is not counted. |
| 002-T06 | `## Amendments` present but malformed (no table) | Pass | `0`, no throw. |
| 002-T07 | `## Errata` present with 2 rows, no `## Amendments` | Pass | `amendment_count === 0`; asserts the serialized record contains neither `"Errata"` nor the errata row content — a genuine non-leakage check, not just a count check. |
| 002-T08 | `Last Amended` absent | Pass | `last_amended === null`. |
| 002-T09 | `Last Amended` present, verbatim string | Pass | Confirms no date parsing/reformatting. |
| 002-T10 | `Last Amended` present as `—` | Pass | Treated as absent → `null`. |
| 002-T11 | `entriesEqual` detects amendment-only change | Pass | Two separate `it` blocks: `last_amended`-only and `amendment_count`-only. Test-Engineer independently mutated `entriesEqual` to explicitly whitelist fields (excluding the two new scalars) and re-ran — both 002-T11 assertions failed as expected (`not ok`), then reverted `lib/decisions.js` to its original committed state (confirmed via `git diff` showing zero change) — satisfies the plan's explicit reviewer instruction in Risk 2 and Section 12 to confirm the test fails when the field is removed, not merely that it passes today. |
| 002-T12 | `amendment_count: 1`, `last_amended: null` (rejected-only) | Pass | Confirms this combination indexes without error, matching Section 9's "legitimate combinations" table. |
| 002-T13 | `REQUIRED_FIELDS` regression guard | Pass | Legacy fixture with no Tier/Domain/Supersedes/Last Amended/Amendments parses cleanly. Independently confirmed by reading `lib/decisions.js`: `REQUIRED_FIELDS = ['Decision ID', 'Status']`, unchanged, with an explicit comment recording why `Last Amended` is excluded. |
| 002-T14 | Entry key order | Pass | `last_amended`/`amendment_count` both appear after `tags`; independently confirmed against the real `docs/decisions/index.json` (`Object.keys` of first entry ends `..., tags, last_amended, amendment_count`). |
| 002-T15 | Integration: one amended + one non-amended record, both fields correct | Pass | `tests/integration/decisions-index.test.js`. |
| 002-T16 | Regenerated `docs/decisions/index.json` matches a fresh build | Pass | Both the plan's own integration test and Test-Engineer's independent `node bin/aif.js index -d --check` report `✓ Decision index is up to date.` |
| 002-T17 | All real records index cleanly | Pass | Independently re-verified: 15 entries (not the plan's assumed 16 — `AIF-PLAN-001` was removed by an unrelated prior chunk; the test correctly compares against `collectDecisionFiles().length` rather than a hardcoded count, so it did not need updating). Every entry `last_amended: null` except none set; every entry `amendment_count: 0` except `AIF-META-002` at `2` (see Coverage/Findings below). |
| 002-T18 | Full suite regression | Pass | `npm test`: 711/711 passing, independently confirmed (692 pre-existing + 19 new). |

---

## Coverage Gap Assessment

No coverage gaps found against the plan's Testing Plan (Section 12). All 18 test rows
(T01–T18) map to distinct, non-redundant tests: T01–T14 in `tests/unit/decisions.test.js`,
T15–T17 in `tests/integration/decisions-index.test.js`, and T18 (full suite regression) via
the independent `npm test` run above. No two test cases were found to assert the same
behaviour under different IDs.

### Edge cases called out in the dispatch brief — independently re-verified, not just read

- **`last_amended: null` when `Last Amended` absent (normal case):** 002-T08, plus 002-T17
  against all 15 real records.
- **`amendment_count: 0` when `## Amendments` absent (normal case):** 002-T01, plus 002-T17.
- **Rejected-only combination (`amendment_count: N`, `last_amended: null`) is valid, not
  flagged as an inconsistency:** 002-T12 covers it directly; Section 9's "Legitimate
  combinations" table is implemented exactly (no validation/cross-check code exists anywhere
  in `lib/decisions.js` linking the two fields — confirmed by inspection, there is no such
  code path to test against).
- **Malformed `## Amendments` table is non-fatal, counts what parses:** 002-T06 (heading, no
  table → `0`, no throw) and 002-T05 (table present, terminates correctly at end of table
  rather than over-reading). No fixture throws or aborts the whole record's parse on a
  malformed Amendments section, consistent with Section 10's security requirement.
- **A record lacking `Last Amended`/`Supersedes`/`## Amendments` entirely still parses
  (`REQUIRED_FIELDS` safety):** 002-T13, and independently confirmed by reading
  `lib/decisions.js` line 34: `REQUIRED_FIELDS = ['Decision ID', 'Status']`, unchanged from
  before this chunk, with an inline comment explaining the exclusion (Documentation
  Requirements Section 13 item satisfied).

### Findings assessment (not blocking, matches implementer's characterization)

1. **`AIF-META-002` indexes with `amendment_count: 2` despite never having been amended.**
   Independently confirmed by reading the record's raw source
   (`docs/decisions/meta-process/AIF-META-002_partial-amendment-of-approved-decisions.decision.md`,
   lines ~150–157): the record contains a fenced ` ```markdown ` code block quoting the
   `## Amendments` table format as a worked example for the templates, with 2 example data
   rows. `countAmendmentRows` does not track fence state (confirmed by reading the function —
   no fence-aware logic exists), so it matches this literal heading and counts the example
   rows. This is the exact, documented limitation from Chunk Plan Risk 1 / Epic Risk 1, and it
   is genuinely identical in kind to `parseMetadataTable`'s existing (pre-this-chunk) exposure
   to the same class of problem for `## Metadata` — confirmed by reading `parseMetadataTable`,
   which also does no fence tracking. This is an accepted, pre-existing-pattern limitation, not
   a new defect introduced by this chunk. 002-T17 asserts the value explicitly (`2`, with an
   inline comment citing Risk 1) rather than silently excluding `AIF-META-002` from the
   assertion loop, so a regression (e.g. someone editing the example table) would be caught.
2. **The previously-committed `index.json` was stale before this chunk, referencing a deleted
   record `AIF-PLAN-001`.** Independently confirmed: the regenerated `docs/decisions/index.json`
   has 15 entries and no `AIF-PLAN-001` entry (verified via direct inspection of the file). Test
   002-T17 compares `index.entries.length` against `collectDecisionFiles(decisionsDir).length`
   (a live filesystem count) rather than a hardcoded `16`, exactly as required — the test would
   not need updating if another record is added or removed in the future. Correctly
   characterized as a pre-existing staleness this chunk fixed as a side effect of its required
   regeneration (Chunk Plan acceptance criterion: "`docs/decisions/index.json` is regenerated
   via `aif index -d` and the command then reports it as up to date" — independently confirmed
   via `node bin/aif.js index -d --check` → `✓ Decision index is up to date.`).

### Other cross-checks against the plan, beyond the Testing Plan table

- `entriesEqual` includes both new scalar fields in its comparison — confirmed not just by
  reading the `...entry` spread, but by an active mutation test (see 002-T11 notes above):
  explicitly excluding the fields from the compared shape causes both 002-T11 sub-tests to
  fail, then the file was reverted to its original committed state with `git diff` showing zero
  residual change.
- `buildDecisionIndex` appends the two new fields after `tags` in the object literal —
  confirmed by inspection and by 002-T14, and independently verified against the real
  `docs/decisions/index.json`'s actual key order.
- Entry field order in the regenerated `docs/decisions/index.json` diff is additive per entry
  (two new trailing keys), not a full reorder — confirmed via `git diff origin/main...HEAD --
  docs/decisions/index.json`.
- File header provenance — confirmed `lib/decisions.js`'s header now reads
  `Plan: AIF-002-014, AIF-003-001, AIF-003-002`, preserving prior provenance per
  engineering-core Rule 2. Both test files' headers likewise carry `AIF-003-002` alongside
  their prior Plan IDs.
- `## Errata` is never read as data anywhere — confirmed by inspection of
  `countAmendmentRows` (only matches `## Amendments`, never `## Errata`) and by 002-T07's
  explicit non-leakage assertion.
- No new logging was added to `lib/decisions.js` — confirmed by inspection; the module remains
  pure with no `console.*` calls, consistent with Section 11.

One documentation-checklist item in the plan (Section 13) remains unresolved for the same
reason chunk 001 flagged it: "CHANGELOG entry written" is unchecked in the plan, and no
`CHANGELOG.md` file exists anywhere in this repository. This is a pre-existing, repo-wide
condition (not introduced or worsened by this chunk) and is flagged again here only for
consistency with chunk 001's Test Results Report — Test-Engineer cannot confirm intent and
defers to Principal-Engineer/Tech-Lead to confirm or waive explicitly, per engineering-core
Rule 3.

---

## Failures & Blocks

None.
