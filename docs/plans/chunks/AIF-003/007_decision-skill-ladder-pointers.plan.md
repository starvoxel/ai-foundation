# Chunk Plan: Point `skill/decision-record` and `skill/decision-brief` at the Ladder

## 1. Metadata

| Field | Value |
|---|---|
| Plan ID | AIF-003-007 |
| Parent Epic | AIF-003 |
| Chunk | 7 of 8 |
| Depends On | AIF-003-003, AIF-003-006 |
| Can Parallel | AIF-003-008 (wave 3) |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | AI-Engineer |
| Reviewed By | Pending |
| Created | 2026-08-25 |
| Last Updated | 2026-08-25 |
| Standards | None apply (no `standards/{stack}.md` covers declarative skill documentation). Governed instead by `skill/skill-authoring`'s five-section schema and `AIF-PROC-001`'s AI-Engineer ownership of `skills/`. AI-track chunk per `chunks.json`; this plan is produced under `skill/chunk-planning`'s "AI-Track Chunks" process, using the software-track template's structure at the launching agent's explicit request for consistency with sibling chunks AIF-003-001/002, not because this chunk crossed into Tier 3. |

---

## 2. Goal

Add a pointer from `skills/decision-record/SKILL.md` and `skills/decision-brief/SKILL.md` to the amendment-ladder documentation that AIF-003-006 adds to `skill/plan-lifecycle` (rung selection, the errata test, and the two-commit amendment gate), so an author of an `Approved` Decision Record or Brief knows where to go for a post-approval change without that content being restated or duplicated in either record skill.

---

## 3. Quick Summary

**Open Items:** 0 open (0 High / 0 Medium / 0 Low) — see Section 14

Both dependencies (AIF-003-003, AIF-003-006) are being planned in parallel with this chunk. Per `skill/chunk-planning`'s "Dependency chunk not complete" edge case, this plan is written against the two dependencies' Epic-fixed field/section names and against the existing file-level cross-reference convention already used elsewhere in this repo (see Section 7, Key Design Decision 2) — it does not invent a heading anchor inside `skill/plan-lifecycle` that AIF-003-006 has not yet committed to.

---

## 4. Acceptance Criteria

- [ ] All components in Section 8 exist and read cleanly (both files still valid per `skill/skill-authoring`'s checklist)
- [ ] All checks in Section 12 pass
- [ ] Security checklist (Section 10) fully satisfied
- [ ] Logging checklist (Section 11) fully satisfied — N/A, confirmed not silently skipped
- [ ] Documentation checklist (Section 13) fully satisfied
- [ ] Review approved with no CRITICAL or HIGH findings
- [ ] `skills/decision-record/SKILL.md` points to `skill/plan-lifecycle` for rung selection, the errata test, and the two-commit amendment gate — none of that content is copied into the file
- [ ] `skills/decision-brief/SKILL.md` carries the equivalent pointer, worded for Tier B's abbreviated-gate context
- [ ] Neither file's `Steps` or `Outputs` section gains a new procedural step that duplicates `skill/plan-lifecycle` content; the addition lives in `Edge Cases` (see Section 7)
- [ ] Neither file's front-matter `version` regresses; each is bumped per Section 7 Key Design Decision 3
- [ ] No edits made to `skills/decision-record/reference/template.md` or `skills/decision-brief/reference/template.md` — those belong to AIF-003-003
- [ ] No edits made to `skill/decision-triage` or its routing (Epic Out of Scope)
- [ ] No edits made to `skill/plan-lifecycle` or any of its `reference/` files — those belong to AIF-003-006
- [ ] `npm test` passes with no changes to any test unrelated to this chunk

---

## 5. Scope

### In Scope

- One new `Edge Cases` entry in `skills/decision-record/SKILL.md` naming the three rungs (errata / amendment / supersede) and pointing to `skill/plan-lifecycle` for rung selection, the errata test, and the two-commit amendment gate.
- One new `Edge Cases` entry in `skills/decision-brief/SKILL.md`, equivalent in substance, worded for Tier B's already-abbreviated initial-approval gate so a reader does not confuse the *initial* Draft→Approved cycle (unchanged, still in this skill) with the *post-approval* ladder (documented elsewhere).
- A one-line mention in each file of the Metadata fields/sections the ladder writes into (`Supersedes`, `Last Amended`, `## Amendments`, `## Errata`), by name only, referencing `reference/template.md` for their shape — not restating the shape.
- A patch version bump in each file's front-matter, reflecting the additive, non-breaking documentation change.

### Out of Scope

- **The templates themselves** (`skills/decision-record/reference/template.md`, `skills/decision-brief/reference/template.md`) — owned by AIF-003-003. This chunk only references what that chunk adds; it does not add the fields/sections itself.
- **The ladder documentation itself** — the rung-selection table, the errata test (including its default-deny property and worked examples), and the two-commit gate procedure live in `skill/plan-lifecycle`'s `SKILL.md` and `reference/commit-gate-procedure.md`, owned by AIF-003-006. This chunk must not copy any of that content — Epic Section 6 and Acceptance Criterion "not duplicated into the two record skills, which link to it" are explicit on this point.
- **`skill/decision-triage` routing** — Epic Out of Scope, restated here because it is the routing skill most likely to be mistaken for the right place to mention rung selection. It gains no new routing responsibility in this Epic.
- **`agents/architect.yaml`, `agents/engineering-manager.yaml`** — owned by AIF-003-008, which runs in the same wave.
- **`status-vocabulary.md`'s `Amending` status** — already added by AIF-003-004; this chunk references its existence (via the pointer to `skill/plan-lifecycle`) but does not modify it.
- **Inventing or asserting a specific heading anchor inside `skill/plan-lifecycle`** — see Section 7, Key Design Decision 2.

---

## 6. Prerequisites

- [ ] Epic `AIF-003` `Status: Approved` committed (done — commit `8c82f90`)
- [ ] This Chunk Plan `Status: Approved` committed before implementation begins
- [ ] **AIF-003-003 complete** — this chunk names `Supersedes`, `Last Amended`, `## Amendments`, `## Errata` as fields/sections that exist in both templates. These names are fixed by Epic Section 4 regardless of AIF-003-003's exact commit state, but the pointer text should not go live claiming the fields exist in the templates until AIF-003-003 has actually landed them.
- [ ] **AIF-003-006 complete** — this chunk's pointer text depends on `skill/plan-lifecycle` actually documenting the ladder, the errata test, and the two-commit gate by the time this chunk's pointer is written. If AIF-003-006 has not landed, this chunk cannot truthfully claim the target content exists yet (see Section 14, Risk 1).

---

## 7. Architecture & Design

### Project Structure Changes

```
skills/
├── decision-record/
│   └── SKILL.md                    ← MODIFIED (new Edge Cases entry, version bump)
└── decision-brief/
    └── SKILL.md                    ← MODIFIED (new Edge Cases entry, version bump)
```

No new files. No changes to either skill's `reference/` directory.

### Key Design Decisions

1. **Decision**: the pointer lives in each file's `Edge Cases` section, not as a new `Steps` entry or a new top-level section.
   **Why:** `skill/skill-authoring` requires exactly five body sections in a fixed order (Purpose, Inputs, Steps, Outputs, Edge Cases); adding a sixth section would violate that schema. `Steps` in both skills describes the sequence for authoring a *new* Draft record — a post-approval change to an *existing* `Approved` record is precisely the kind of "unusual situation relative to the skill's main purpose" `Edge Cases` exists for, so it is the correct home without deviating from the schema.

2. **Decision**: the pointer is a plain file-level reference (`skill/plan-lifecycle`, its `SKILL.md`, and `reference/commit-gate-procedure.md`) — no specific heading anchor inside those files is named or assumed.
   **Why:** this matches the existing convention already used in both files today — Step 5 of `decision-record/SKILL.md` and Step 3 of `decision-brief/SKILL.md` already say "Follow `skill/plan-lifecycle`" with no anchor, and `skill/plan-lifecycle`'s own "Decision Record Tier Variants" section is the structural precedent Epic Section 6 cites for this exact pattern. AIF-003-006's final heading text for the ladder section is not yet committed (it is being planned in parallel); a file-level reference is correct today and remains correct regardless of what AIF-003-006 ultimately names its heading, so no coordination on exact anchor text is required. See Section 14, Risk 1 and the report-back note on this point.

3. **Decision**: bump `version` in both files' front-matter (`decision-record`: `0.3.0` → `0.3.1`; `decision-brief`: `0.1.0` → `0.1.1`).
   **Why:** the change is additive and non-breaking (new Edge Cases content, no change to Inputs/Steps/Outputs contracts), so a patch bump is correct per semver and per `skill/skill-authoring`'s "`version` is valid semver" checklist item. Note this repo does not treat every doc addition as requiring a bump (e.g. commit `6cb81de` added a `plan-lifecycle` section without bumping its version) — bumping here is a Tier C style choice, not a hard rule, and is flagged as such rather than assumed to be mandatory.

> **Tier C decisions.** All three are Tier C per `skill/decision-triage` — local documentation-authoring choices inside an already-decided design (Epic Section 6 already settled *that* the two skills point at `plan-lifecycle` rather than duplicate it; this plan only settles *where in the file* and *how precisely*). None warrants a standalone record.

### Patterns & Conventions Applied

- **Pointer, not copy** (Epic Section 6, Section 9 Acceptance Criteria) — the defining constraint of this chunk.
- **File-level cross-reference convention** already used by both files for `skill/plan-lifecycle` (see Key Design Decision 2).
- **Five-section skill schema** (`skill/skill-authoring` Step 3) — preserved, not extended.

---

## 8. Components

### `skills/decision-record/SKILL.md` — Edge Cases addition

**File**: `skills/decision-record/SKILL.md`
**Purpose**: Let an author who already has an `Approved` Tier A record find the post-approval ladder without this skill restating it.

**Content to add** (new bullet, appended to the existing `## Edge Cases` list):

```
- **Record needs a change after `Approved`** — do not re-run this skill's Steps
  1-5 or treat `Approved` as immutable. Select a rung from the amendment
  ladder — errata, amendment, or supersede — documented in
  `skill/plan-lifecycle` (rung selection, the errata test, and the
  two-commit amendment gate all live there, not here). The rungs write into
  this record's own `Supersedes`, `Last Amended`, `## Amendments`, and
  `## Errata` Metadata fields/sections — see `reference/template.md` for
  their shape.
```

**Key Behaviour**:
- Does not name or assume a specific heading inside `skill/plan-lifecycle` (Section 7, Key Design Decision 2).
- Does not restate the errata test, the rung-selection table, or the two-commit gate's commit sequence — names the three rungs only, by label.
- Names the four fields/sections `Supersedes`, `Last Amended`, `## Amendments`, `## Errata` exactly as fixed by Epic Section 4, so a reader who goes to `reference/template.md` (AIF-003-003's output) finds a match.

**Dependencies**:
- `skill/plan-lifecycle` (AIF-003-006) — must document the ladder, errata test, and gate for this pointer to resolve to real content.
- `skills/decision-record/reference/template.md` (AIF-003-003) — must carry the four named fields/sections.

### `skills/decision-brief/SKILL.md` — Edge Cases addition

**File**: `skills/decision-brief/SKILL.md`
**Purpose**: Same as above, for Tier B, worded so it is not confused with the brief's own already-abbreviated *initial* approval gate (Step 3).

**Content to add** (new bullet, appended to the existing `## Edge Cases` list):

```
- **Brief needs a change after `Approved`** — this is separate from Step 3's
  abbreviated *initial* approval gate, which only covers Draft → Approved.
  Once `Approved`, select a rung from the amendment ladder — errata,
  amendment, or supersede — documented in `skill/plan-lifecycle` (rung
  selection, the errata test, and the two-commit amendment gate all live
  there, not here). The rungs write into this brief's own `Supersedes`,
  `Last Amended`, `## Amendments`, and `## Errata` Metadata fields/sections
  — see `reference/template.md` for their shape.
```

**Key Behaviour**:
- Explicitly distinguishes this from Step 3's gate, since both are about "Approved" and a reader skimming could otherwise conflate the two.
- Same non-duplication and field-naming constraints as the `decision-record` entry above.

**Dependencies**: same two as above, against `decision-brief`'s own template/plan-lifecycle copies.

---

## 9. Data Models

Not applicable. This chunk changes documentation prose only; it introduces no new data shape, schema, or field. (The four fields/sections it *names* — `Supersedes`, `Last Amended`, `## Amendments`, `## Errata` — are defined and owned by AIF-003-003's template changes, not by this chunk.)

---

## 10. Security Requirements

> This section must never be empty.

- [ ] All external inputs validated before use — N/A, no input processing; this chunk edits static markdown prose only.
- [ ] No secrets or credentials in source code or logs — N/A, no secrets involved.
- [ ] Errors exposed to users contain no internal system details — N/A, no runtime error paths introduced.
- [ ] **No self-approval implication.** The added text must not state or imply that any agent may move a record to `Approved` (initial or post-amendment) without a preceding explicit human decision. It must not soften or restate `skill/plan-lifecycle`'s gate language in a way that could be read as a shortcut — it points at the gate, it does not describe or paraphrase it (Epic Section 7).
- [ ] **No widening of authorship.** The pointer text must not state or imply that errata's "anyone may author" rule extends to amendments or supersedes — Epic Section 5 Business Rules reserves those to the domain owner. If the added text needs to mention authorship at all, it must not contradict that rule; the safer choice is to name the rungs without restating who may use each one, deferring entirely to `skill/plan-lifecycle`.

---

## 11. Logging Requirements

> This section must never be empty.

Not applicable — this chunk touches only static skill documentation (`SKILL.md` prose and front-matter). There is no runtime code path, no CLI output, and no log statement anywhere in scope.

| Event | Level | What is logged | What is NOT logged |
|---|---|---|---|
| N/A | N/A | This chunk has no executable component. Table included to satisfy the template's "never empty" requirement, not because a logging decision was made and then omitted. | N/A |

---

## 12. Testing Plan

No automated test suite in this repo currently validates `SKILL.md` prose content (`tests/validation/schemas.test.js` covers `agents/` and `servers/` front-matter/schema only, not `skills/`). Verification here is self-validation per the AI-track process (`skill/chunk-planning` "AI-Track Chunks"), performed against explicit, checkable criteria rather than left informal.

| Check ID | Description | Type | Pass Criteria |
|---|---|---|---|
| 007-C01 | `skills/decision-record/SKILL.md` retains all five required sections (Purpose, Inputs, Steps, Outputs, Edge Cases) in order | Manual (`skill/skill-authoring` checklist) | All five present, in order, none removed or renamed |
| 007-C02 | `skills/decision-brief/SKILL.md` retains all five required sections in order | Manual | Same as 007-C01 |
| 007-C03 | Front-matter `version` in both files is valid semver and strictly greater than the pre-chunk value | Manual (grep + eyeball) | `decision-record`: `0.3.1`; `decision-brief`: `0.1.1` |
| 007-C04 | No rung-selection table, errata-test wording, or two-commit gate step sequence appears verbatim in either edited file | Manual (diff review against `skill/plan-lifecycle`'s AIF-003-006 content) | Zero matches beyond the rung *names* (errata/amendment/supersede) and the four field/section *names* |
| 007-C05 | Every file/skill named in the new pointer text exists at the referenced path | Manual (`ls`/`Read`) | `skill/plan-lifecycle/SKILL.md`, `skill/plan-lifecycle/reference/commit-gate-procedure.md`, `skills/decision-record/reference/template.md`, `skills/decision-brief/reference/template.md` all resolve |
| 007-C06 | No file outside this chunk's ownership was touched | Manual (`git status`/`git diff --stat`) | Only the two `SKILL.md` files appear in the diff |
| 007-C07 | Full suite regression | Automated | `npm test` passes, no unrelated test changes |

---

## 13. Documentation Requirements

- [ ] Inline documentation on all public members — N/A, no code.
- [ ] File headers on all new source files — N/A, no new files; neither `SKILL.md` carries a "Plan:" header convention today (that convention is used in `lib/` source files, not skills), so none is added here, consistent with existing skill files in this repo.
- [ ] README updated if user-facing — not applicable.
- [ ] CHANGELOG entry written.

---

## 14. Risks & Open Questions

| # | Risk / Question | Type | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **This chunk's pointer text asserts that `skill/plan-lifecycle` documents the ladder, errata test, and two-commit gate — content owned by AIF-003-006, planned in parallel and not yet committed.** If AIF-003-006 lands with materially different terminology (e.g. it does not use the words "errata"/"amendment"/"supersede" as rung labels), this chunk's wording could read as inaccurate even though it names no specific heading. | Risk | M | Do not implement this chunk until AIF-003-006's `Status: Approved` is committed (Section 6 Prerequisites). At implementation time, read AIF-003-006's actual landed text and adjust rung-label wording if it differs from "errata / amendment / supersede" (these three labels are already fixed by Epic Section 5, so material drift is unlikely, but the implementer must verify against the real file, not this plan's assumption). |
| 2 | **Field/section names (`Supersedes`, `Last Amended`, `## Amendments`, `## Errata`) are asserted before AIF-003-003 necessarily exists.** Same class of risk as #1, but lower — these four names are fixed verbatim in Epic Section 4/6, not left to AIF-003-003's discretion. | Risk | L | Prerequisite gate in Section 6; implementer confirms the four names against the landed `reference/template.md` files before writing the pointer text, but no material change is expected. |
| 3 | **No automated test covers `SKILL.md` prose**, so duplication (copying ladder content instead of pointing to it) would not be caught by `npm test`. | Risk | M | Check 007-C04 is a mandatory manual diff review, not optional; Principal-Engineer review is the second line of defence per Epic Acceptance Criteria ("not duplicated into the two record skills, which link to it"). |
| 4 | **Version-bump convention is not formally documented** (Section 7, Key Design Decision 3, notes an existing counter-example where a doc addition did not bump `version`). | Risk | L | Accepted as a Tier C style choice for this chunk; bump anyway since it is harmless and arguably more correct, but do not treat its absence elsewhere in the repo as a defect to fix in this chunk. |

**Coordination note for AIF-003-006 (not a blocking Open Question):** this plan does not require AIF-003-006 to expose a specific heading/anchor — see Section 7, Key Design Decision 2. A plain file-level pointer to `skill/plan-lifecycle` (`SKILL.md` + `reference/commit-gate-procedure.md`) is sufficient and matches the file's own existing convention. If AIF-003-006 happens to land a clearly-named heading (e.g. something equivalent to "Amendment Ladder"), naming it explicitly in the pointer text would be a readability nicety, not a requirement — implementation should not block on it either way.

---

## 15. Work Log

[2026-08-25] [AI-Engineer] [Created] [AIF-003-007] [Chunk Plan drafted from Epic AIF-003 Section 9 (`chunks.json` scope: "Point skill/decision-record and skill/decision-brief at the ladder", `depends_on: ["003", "006"]`). Written at the launching agent's explicit request to match sibling Chunk Plans AIF-003-001/002's structure and level of detail, using `skill/chunk-planning`'s software-track template even though this is an AI-track chunk per `chunks.json` — `skill/chunk-planning`'s "AI-Track Chunks" section would otherwise only require a written plan at Tier 3, and this chunk self-assesses as Tier 2 (multi-file, low-risk, following an established pattern — the file-level `skill/plan-lifecycle` cross-reference already used in both target files). Verified against current source rather than assuming: read both target `SKILL.md` files and confirmed neither yet contains any ladder-related content, confirmed `skill/plan-lifecycle`'s current `SKILL.md`/`commit-gate-procedure.md` do not yet document the ladder (AIF-003-006 is still pending), confirmed neither template currently defines `Supersedes`/`Last Amended`/`## Amendments`/`## Errata` (AIF-003-003 still pending), and confirmed `skill/skill-authoring` fixes the five-section schema, which is why the addition targets `Edge Cases` rather than a new top-level section. Confirmed no automated test exercises `SKILL.md` content, so Section 12 is manual-check-based rather than `npm test`-based beyond the full-suite regression. Did not invent a heading anchor inside `skill/plan-lifecycle` for AIF-003-006 to guarantee — used the file's own existing anchor-free cross-reference convention instead (Section 7, Key Design Decision 2) and recorded it as a non-blocking coordination note rather than an Open Question, since it does not require an answer before this plan can be approved.]
