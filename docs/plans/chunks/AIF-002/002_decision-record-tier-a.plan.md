# Chunk Plan: skill/decision-record — Scope to Tier A, Tier/Domain Metadata, Index-Update Step, Per-Domain Guidance

## 1. Metadata

| Field | Value |
|---|---|
| Plan ID | AIF-002-002 |
| Parent Epic | AIF-002 |
| Chunk | 2 of 15 |
| Depends On | None |
| Can Parallel | AIF-002-001, AIF-002-003, AIF-002-004, AIF-002-005, AIF-002-006, AIF-002-007, AIF-002-008, AIF-002-009 |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | AI-Engineer |
| Reviewed By | Pending |
| Created | 2026-08-14 21:40 |
| Last Updated | 2026-08-14 21:40 |
| Standards | AGENTS.md declarative-component schemas (no code standards apply — this chunk touches only `skills/` markdown) |

---

## 2. Goal

Scope `skills/decision-record/` explicitly to Tier A ("Researched") decisions,
add `Tier`/`Domain` metadata fields and a required index-update step to its
template and workflow, and add per-domain `Design`/`Impact on Planning` guidance
stubs for all 7 decision domains — establishing the stable Tier A template
contract that Wave 2 migration chunks (010–013) will reformat the 8 full-reformat
legacy records against.

> Requirement traceability: AIF-002 Epic Plan §3 ("`skills/decision-record/` —
> scope explicitly to Tier A only...") and §5 (Architecture Overview, New
> Components table). Implements AIF-META-001 §"Impact on Planning" bullet 1.

---

## 3. Scope

### In Scope
- `skills/decision-record/SKILL.md`:
  - Update `description` front-matter and Purpose section to state this skill
    is scoped explicitly to **Tier A** decisions, invoked by `skill/decision-triage`
    (or directly, by an agent that already knows it needs Tier A).
  - Add a new Step ("Confirm Tier A and Determine Domain") before option
    generation, that (a) confirms Tier A applies (redirecting to
    `skill/decision-triage` if the invoking agent has not already triaged), and
    (b) determines the Domain per AIF-META-001's Domain ownership table, loading
    the matching guidance stub from the new `reference/domain-guidance.md`.
  - Add a new Step ("Update the Decision Index") after the Commit-Gate step,
    documenting `docs/decisions/index.json` update as a required Output, with an
    explicit edge case for the interim period before the index exists (see
    Section 5).
  - Update the `Outputs` section: add the index-update artifact, and correct the
    stale default location (`knowledge/decisions/`) to match this repo's actual
    convention (`docs/decisions/`) and the new per-domain path shape.
  - Add/adjust `Edge Cases` for: index.json missing/malformed when this step
    runs (treat as data-integrity failure, per Epic §4 Error States); a decision
    that doesn't clearly belong to exactly one domain.
- `skills/decision-record/reference/template.md`:
  - Add `Tier` and `Domain` fields to the Metadata table, in the exact field
    order specified in Section 6 below (matches the precedent already set by
    `AIF-META-001`'s own Metadata table).
  - Add a `References` field alongside the existing `Referenced By` field (see
    Section 5, Key Design Decision 2, for why this is in scope even though the
    Epic bullet names only `Tier`/`Domain`).
  - Update the `Decision ID` row's placeholder to the new
    `{ProjectID}-{DomainCode}-{###}` scheme.
  - Update the `Author (Agent)` row's placeholder from the hardcoded `Architect`
    default to reflect domain-owner authorship.
- **New file** `skills/decision-record/reference/domain-guidance.md`: per-domain
  `Design`/`Impact on Planning` guidance stubs for all 7 domains (Architecture,
  Process, Planning, AI-component, Quality, Testing, Meta-process), each paired
  with its Domain Code and default owning agent, per AIF-META-001's Domain
  ownership table.
- Self-validation: `npm test` (existing validation suite has no skill-schema
  checks today, so this chunk's own review is the primary gate — see Section 10);
  manual verification that every internal reference (`SKILL.md` →
  `reference/template.md`, `SKILL.md` → `reference/domain-guidance.md`) resolves.

### Out of Scope
- Creating or backfilling `docs/decisions/index.json` itself (chunk 014,
  depends on all migration chunks completing first).
- Adding `paths.decisions` to `.aiconfig.json` (chunk 008, parallel Wave 1
  chunk — this chunk documents the fallback default independently and does not
  block on 008 landing first).
- `skills/decision-triage/` itself (chunk 001, parallel Wave 1 chunk) — this
  chunk only documents that `decision-record` expects to be invoked by it (or
  directly by an agent that already knows it needs Tier A); it does not define
  triage's own dispatch logic.
- `skills/decision-brief/` (Tier B producer, chunk 003) — no changes to that
  skill are made here.
- Migrating any of the 11 existing Decision Records to the new template shape
  (chunks 009–013) — this chunk only establishes the shape they will be
  migrated against.
- Extending `tests/validation/` to add automated schema checks for
  `skills/decision-record/` itself — no such check exists for any skill today
  (confirmed by reading `tests/validation/schemas.test.js`, which validates
  agents and servers only) and adding one is not in this chunk's Epic-scoped
  bullet. Not raised as a discovery since it is a pre-existing gap orthogonal to
  this chunk's deliverable, not new scope this chunk creates.

---

## 4. Prerequisites

- [x] AIF-002 Epic Plan `Status: Approved` (verified — see `docs/plans/epics/AIF-002.epic.md` §1)
- [x] AIF-META-001 Decision Record `Status: Approved` (verified — provides the
      Tier/Domain model, Domain ownership table, and ID/storage scheme this
      chunk implements)
- [x] Current `skills/decision-record/SKILL.md` and
      `skills/decision-record/reference/template.md` read and understood
- [ ] None of this chunk's file changes are blocked on any other Wave 1 chunk
      landing first (all Wave 1 chunks touch disjoint files except 006, which
      does not overlap this chunk)

---

## 5. Architecture & Design

### Project Structure Changes
- `skills/decision-record/SKILL.md` ← MODIFIED
- `skills/decision-record/reference/template.md` ← MODIFIED
- `skills/decision-record/reference/domain-guidance.md` ← NEW

### Key Design Decisions

1. **Decision**: Metadata table field order is
   `Decision ID, Project, Tier, Domain, Status, Author (Agent), Approved By,
   Created, Referenced By, References`.
   **Rationale**: This exact order and field set already exists as a real,
   human-approved precedent in `AIF-META-001`'s own Metadata table (see
   `docs/decisions/meta-process/AIF-META-001_...decision.md` lines 3-16). Reusing
   it verbatim — rather than inventing a new order — gives Wave 2 migration
   chunks (010–013) a contract that is already proven against a real record,
   and avoids a second, competing "canonical shape" existing in the repo.

2. **Decision**: Add a `References` field to the template, not just `Tier`/
   `Domain` as the Epic bullet names explicitly.
   **Rationale**: The Epic's own migration-treatment text (§3: "updating every
   `Referenced By`/`References` field to the new ID scheme") and AIF-META-001's
   own record (which carries both fields) both already assume `References`
   exists as a template field — the current template only has `Referenced By`.
   The index-update step this chunk *is* explicitly scoped to add depends on
   bidirectional `references`/`referenced_by` data (AIF-META-001 Design section,
   `index.json` schema) — a record cannot correctly populate its own outbound
   `references` in the index without a place to record them. This is treated as
   necessary infrastructure for the explicitly-scoped index-update step, not an
   independent scope expansion, since the Epic text already presumes the field's
   existence. Flagged here for transparency rather than silently added.

3. **Decision**: Domain metadata field value is the lowercase domain-folder
   name (`architecture`, `process`, `planning`, `ai-component`, `quality`,
   `testing`, `meta-process`), not the capitalized domain label or the 3-4
   letter Domain Code.
   **Rationale**: Matches `AIF-META-001`'s own `Domain` field value
   (`meta-process`) and the `index.json` schema's `"domain"` field example
   (`"process"`) exactly. The Domain Code (`ARCH`, `PROC`, etc.) appears only
   inside the Decision ID string, not as a separate metadata row — one value
   per concept, no duplicate encoding.

4. **Decision**: Per-domain `Design`/`Impact on Planning` guidance lives in a
   new standalone reference file (`reference/domain-guidance.md`), not inlined
   into `template.md` or duplicated per-domain template variants.
   **Rationale**: `template.md` remains a single universal skeleton (per
   AIF-META-001 Design: "`Design` and `Impact on Planning` content is shaped by
   domain-specific guidance... rather than a forked template"). A standalone
   reference file keeps the template itself short and lets `SKILL.md` Step 1
   point any domain-owning agent at the matching stub without maintaining 7
   near-duplicate template files.

5. **Decision**: The index-update step is documented as unconditionally
   required going forward, with an explicit interim edge case rather than a
   conditional step.
   **Rationale**: Per task instruction — `docs/decisions/index.json` does not
   exist yet (created in chunk 014, which depends on all migration chunks
   completing). Wave 2 migration chunks (010–013) will run before 014 lands.
   Making the step unconditionally required, with a documented "if the index
   doesn't exist yet, skip and note it — this is temporary" edge case, avoids
   the skill silently omitting the step forever once the index does exist, and
   avoids blocking migration chunks that legitimately predate the index.

### Patterns & Conventions Applied
- AGENTS.md declarative-component schema for skills (`SKILL.md` front-matter +
  Purpose/Inputs/Steps/Outputs/Edge Cases structure) — unchanged, only content
  within existing sections is edited/added.
- `skill/plan-lifecycle` commit-gate procedure, referenced (not modified) by
  `decision-record`'s existing Step 4 (renumbered, unchanged in substance).

---

## 6. Components

### `skills/decision-record/SKILL.md` — Tier A scoping, domain determination, index-update step

**File**: `skills/decision-record/SKILL.md`
**Purpose**: Entry-workflow documentation for producing a Tier A Decision Record.

**Content changes**:

Front-matter `description` becomes:
```
"Produces a structured Tier A ('Researched') Decision Record capturing options explored and the chosen approach. Invoked by skill/decision-triage, or directly by an agent that already knows it needs Tier A."
```

Purpose section gains an explicit opening statement:
```
This skill is scoped to Tier A ("Researched") decisions only — see
AIF-META-001's Tier definitions. Tier B ("Structural") decisions use
skill/decision-brief; Tier C ("Embedded") decisions are recorded inline per
skill/chunk-planning / skill/epic-planning and never reach this skill. This
skill is normally invoked by skill/decision-triage after it has already
selected Tier A and determined the Domain; an agent that already knows with
certainty it needs a Tier A record for a specific Domain may invoke this skill
directly.
```

Steps become (renumbered; new steps marked NEW):

- **Step 1 (NEW) — Confirm Tier A and Determine Domain**: If not already
  triaged via `skill/decision-triage`, confirm Tier A genuinely applies (a
  genuine multi-option trade-off with lasting cross-component impact — the
  AIF-META-001 promotion-threshold test #1). Determine the Domain from
  AIF-META-001's Domain ownership table (Architecture/`ARCH`,
  Process/`PROC`, Planning/`PLAN`, AI-component/`AIC`, Quality/`QA`,
  Testing/`TEST`, Meta-process/`META`) and load the matching stub from
  `reference/domain-guidance.md` for use when writing `Design`/`Impact on
  Planning` in Step 5. If the decision doesn't clearly belong to exactly one
  domain, select the closest match and note the ambiguity in `Impact on
  Planning`/`Design` rather than blocking (see Edge Cases).
- **Step 2 — Generate Options** (was Step 1, unchanged in substance)
- **Step 3 — Recommend** (was Step 2, unchanged in substance)
- **Step 4 — Write the Decision Record** (was Step 3): writes the record using
  `reference/template.md`, applying the domain guidance loaded in Step 1 to the
  `Design`/`Impact on Planning` sections.
- **Step 5 — Follow the Commit-Gate Procedure** (was Step 4, unchanged in
  substance): `skill/plan-lifecycle`, `Status: Draft` → human confirmation →
  `Approved`/`Deferred`.
- **Step 6 (NEW) — Update the Decision Index**: In the same commit that
  produces or updates the record (once it reaches a state — Draft or later —
  that belongs in the index; see AIF-META-001 Design section for the
  `index.json` entry schema), add or update this record's entry in
  `docs/decisions/index.json`: `id`, `tier`, `domain`, `title`, `status`,
  `path`, `supersedes`, `superseded_by`, `references`, `referenced_by`, `tags`.
  This is a required output step, not an optional chore. **Interim edge case**:
  if `docs/decisions/index.json` does not yet exist in the repo, skip this step
  and note in the Work Log that it was skipped because the index does not exist
  yet (this is expected and temporary prior to AIF-002 chunk 014 — the index is
  created and backfilled there). Once the index exists, this step is mandatory,
  unconditionally, for every new or updated Tier A record.

`Outputs` section becomes:
```
- **Decision Record** — markdown file following the template format
- **Location:** `{paths.decisions}/{domain-folder}/{ID}_{ShortTitle}.decision.md`
  (`paths.decisions` from `.aiconfig.json`, default `docs/decisions/` if unset;
  `{domain-folder}` is the lowercase Domain value — `architecture/`, `process/`,
  `planning/`, `ai-component/`, `quality/`, `testing/`, `meta-process/`; `{ID}`
  is `{ProjectID}-{DomainCode}-{###}`, e.g. `AIF-ARCH-004`, `AIF-PROC-002`,
  counter scoped per `(project, domain)` pair)
- **Index entry** — this record's entry added/updated in
  `docs/decisions/index.json` (required once that file exists; see Step 6)
```

`Edge Cases` gains:
```
- **`docs/decisions/index.json` is missing or malformed when Step 6 runs, and
  the file is expected to already exist (i.e. AIF-002 chunk 014 has landed)** —
  treat as a data-integrity failure: stop, do not silently skip, surface to the
  human. Do not confuse this with the documented interim case (index does not
  exist yet at all, pre-chunk-014) in Step 6, which is expected and not an
  error.
- **Decision doesn't clearly belong to exactly one domain** — select the
  closest matching domain per Step 1 and note the ambiguity in `Impact on
  Planning`/`Design`. If genuinely unclear and materially affects who should
  author the record, raise to the human rather than guessing (global Rule 2).
```

**Dependencies**:
- `skills/decision-record/reference/template.md` — for the record skeleton
- `skills/decision-record/reference/domain-guidance.md` (NEW, this chunk) — for
  per-domain `Design`/`Impact on Planning` guidance
- `skill/plan-lifecycle` — for the commit-gate procedure (unchanged reference)
- `skill/decision-triage` (AIF-002-001, parallel chunk) — upstream caller;
  no hard dependency, since this skill documents accepting direct invocation
  too

---

### `skills/decision-record/reference/template.md` — Tier/Domain/References metadata fields

**File**: `skills/decision-record/reference/template.md`
**Purpose**: Canonical Tier A record skeleton every `decision-record` output
follows, and the shape Wave 2 migration chunks (010–013) reformat existing
records against.

**Exact target Metadata table** (replaces the current table, lines 3-14 today):

```
| Field | Value |
|---|---|
| Decision ID | {ProjectID}-{DomainCode}-{###} |
| Project | {Project name} |
| Tier | A |
| Domain | {architecture / process / planning / ai-component / quality / testing / meta-process} |
| Status | Draft / Approved / Done / Deferred / Superseded |
| Author (Agent) | {Domain owner agent — see reference/domain-guidance.md} |
| Approved By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Referenced By | {Decision ID(s) that cite this record, or "—"} |
| References | {Decision ID(s) this record cites, or "—"} |
```

No other section of `template.md` changes (Problem Statement, Constraints &
Requirements, Options Explored, Decision, Design, Impact on Planning,
Resolved/Open Items all remain structurally as-is — only the Metadata table
changes).

**Key Behaviour**:
- `Tier` is always literally `A` in this template (Tier B/C never reach this
  file — enforced by which skill is invoked, not by validation here).
- `Domain` value must be one of the 7 lowercase domain-folder names; no
  free-text domain names.
- `Decision ID` and `Domain` must agree — the Domain Code embedded in the ID
  (`ARCH`, `PROC`, `PLAN`, `AIC`, `QA`, `TEST`, `META`) must correspond to the
  `Domain` field's folder name.

**Dependencies**: None (this is the leaf template file).

---

### `skills/decision-record/reference/domain-guidance.md` — per-domain Design/Impact-on-Planning stubs (NEW)

**File**: `skills/decision-record/reference/domain-guidance.md`
**Purpose**: Per-domain guidance for what belongs in a Tier A record's `Design`
and `Impact on Planning` sections, keyed by Domain/Domain Code, derived from
AIF-META-001's Domain ownership table.

**Content** (full text to be written verbatim as this chunk's deliverable):

```markdown
# Decision Record — Per-Domain Guidance

Guidance for the `Design` and `Impact on Planning` sections of a Tier A
Decision Record, by Domain. Loaded in `skill/decision-record` Step 1 once the
Domain has been determined. Derived from AIF-META-001's Domain ownership table
— see that record for the authoritative source if this stub and AIF-META-001
ever appear to disagree.

| Domain | Domain Code | Folder | Default Owner |
|---|---|---|---|
| Architecture | `ARCH` | `architecture/` | Architect |
| Process | `PROC` | `process/` | Engineering-Manager |
| Planning | `PLAN` | `planning/` | Tech-Lead |
| AI-component | `AIC` | `ai-component/` | AI-Engineer |
| Quality | `QA` | `quality/` | Principal-Engineer |
| Testing | `TEST` | `testing/` | Test-Engineer |
| Meta-process | `META` | `meta-process/` | Generic/catch-all agent (name "Project-Manager" reserved for a future dedicated agent) |

## Architecture (`ARCH`)
**Design**: Schemas, component boundaries, system-structure diagrams — the
concrete shape of what's being built or changed.
**Impact on Planning**: What Tech-Lead must know when decomposing an Epic that
depends on this decision — components that will/won't exist, constraints on
file/module boundaries, options explicitly ruled out.

## Process (`PROC`)
**Design**: Dispatch/pipeline flow changes, orchestration-state effects —
sequence diagrams or state-transition tables for how work moves between agents.
**Impact on Planning**: Effects on chunk/wave sequencing, blocking/unblocking
mechanics, or agent dispatch order that Tech-Lead or Engineering-Manager must
account for in future Epic/Chunk decomposition.

## Planning (`PLAN`)
**Design**: Chunk/Epic Plan shape changes, worklog structure, plan-lifecycle
mechanics — template diffs or new required sections/fields.
**Impact on Planning**: How this changes what a Chunk Plan or Epic Plan must
contain going forward; whether existing plans need any retroactive note (they
are not rewritten, per Epic-level precedent, but the gap should be named).

## AI-component (`AIC`)
**Design**: Agent/skill/steering/schema impact — which declarative components
change shape, new fields, new cross-reference requirements.
**Impact on Planning**: What AI-Engineer (or Tech-Lead decomposing an Epic that
touches AI components) must know about new/changed schemas before authoring or
modifying agents, skills, or steering files.

## Quality (`QA`)
**Design**: Review-criteria and severity-gate changes — what moves a finding
from LOW to HIGH, what becomes a new blocking check.
**Impact on Planning**: Which existing review checklists (Principal-Engineer's)
change, and whether any currently-passing work would now fail review under the
new criteria.

## Testing (`TEST`)
**Design**: Test-execution/coverage-strategy changes — new required test
types, changed pass/fail criteria, new tooling in the test pipeline.
**Impact on Planning**: What Test-Engineer (or a Chunk Plan's Testing Plan
section) must include going forward as a result of this decision.

## Meta-process (`META`)
**Design**: Effect on `skill/decision-record` and related skills/steering
themselves — this is the domain for decisions *about* the decision-system.
**Impact on Planning**: What every other domain's decision-authoring agent
must know changed about how decisions themselves are tiered, owned, stored, or
indexed — since a Meta-process decision can ripple into every other domain's
authoring workflow (as AIF-META-001 itself does).
```

**Dependencies**: None (leaf reference file). Referenced by
`skills/decision-record/SKILL.md` Step 1.

---

## 7. Data Models

### Decision Record Metadata (template contract)

**Purpose**: The exact field set and order every Tier A record's Metadata
table must follow — the contract Wave 2 migration chunks (010–013) build
against.

| Field | Type | Required | Notes |
|---|---|---|---|
| Decision ID | string | Yes | `{ProjectID}-{DomainCode}-{###}`, e.g. `AIF-ARCH-004` |
| Project | string | Yes | Project name, e.g. `ai-foundation` |
| Tier | string | Yes | Always `A` for records produced by this skill |
| Domain | string | Yes | One of `architecture`, `process`, `planning`, `ai-component`, `quality`, `testing`, `meta-process` |
| Status | string | Yes | One of `Draft`, `Approved`, `Done`, `Deferred`, `Superseded` (per `skill/plan-lifecycle` status vocabulary) |
| Author (Agent) | string | Yes | Domain owner agent name (see `reference/domain-guidance.md`) |
| Approved By | string | Yes | Human name or `Pending` |
| Created | datetime string | Yes | `YYYY-MM-DD HH:mm` |
| Referenced By | string | Yes | Decision ID(s) that cite this record, or `—` |
| References | string | Yes | Decision ID(s) this record cites, or `—` |

---

## 8. Security Requirements

> This section must never be empty.

- [ ] All external inputs validated before use — N/A, this chunk produces only
      static markdown documentation/reference content; no external input is
      parsed or executed.
- [ ] No secrets or credentials in source code or logs — verified; no
      credential-shaped content is introduced by this chunk.
- [ ] Errors exposed to users contain no internal system details — N/A, no
      runtime error paths are introduced (documentation only).
- [ ] No `WebSearch`/`WebFetch` grant is introduced or implied by this chunk —
      this chunk does not touch any agent's tool grants at all (that is chunk
      006's scope, for Engineering-Manager only); explicitly verified as
      out of scope here to guard against accidental drift given AIF-META-001's
      non-negotiable on this point.
- [ ] The `docs/decisions/index.json` interim edge case (Step 6) must not be
      interpreted as license to silently skip the index-update step once the
      file exists — the Work Log note requirement (documented in Step 6) exists
      specifically so a real "index missing and should exist" data-integrity
      failure is never mistaken for the expected pre-chunk-014 gap. This is a
      data-integrity safeguard, not a UX nicety, given AIF-002 Epic §6's
      explicit requirement that migration preserve referential integrity.

---

## 9. Logging Requirements

> This section must never be empty.

This chunk produces only static documentation/reference artifacts consumed by
agents at plan/record-authoring time — it introduces no runtime software
component, so there is no application log stream to define events for.
Logging requirements applicable here are the ones already mandated by
`skill/plan-lifecycle`'s Work Log convention and (once orchestrated execution
lands, outside this chunk's scope) `skill/chunk-orchestration`'s log actions:

| Event | Level (Work Log equivalent) | What is logged | What is NOT logged |
|---|---|---|---|
| Chunk Plan Draft committed | Work Log entry, this file's §14 | Timestamp, Agent, Action=`Created`, Plan ID, one-line summary | No file contents duplicated into the log entry |
| Chunk Plan revised (if any) | Work Log entry, this file's §14 | Timestamp, Agent, Action=`Revised`, Plan ID, what changed and why | — |
| Chunk Plan Approved/Deferred | Work Log entry, this file's §14 | Timestamp, Agent, Action=`Approved`/`Deferred`, Plan ID, approver name | — |
| `skill/decision-record` Step 6 skipped (interim, index.json not yet created) | Work Log note on the *decision record itself*, once this chunk's changes are in use (chunk 010+) | That the index-update step was skipped and why (index does not exist yet, pre-AIF-002-014) | — |

---

## 10. Testing Plan

This chunk has no executable code — "testing" here means self-validation of
the produced markdown artifacts.

### `skills/decision-record/` Tests

| Test ID | Description | Type | Pass Criteria |
|---|---|---|---|
| DR-T01 | `SKILL.md` front-matter still parses as valid YAML after edits | Manual/self-validate | Front-matter block parses cleanly; no broken YAML syntax |
| DR-T02 | Every internal reference in `SKILL.md` resolves to a real file | Manual/self-validate | `reference/template.md` and `reference/domain-guidance.md` both exist at the paths `SKILL.md` cites |
| DR-T03 | `template.md`'s Metadata table matches the Section 6/7 contract exactly (field names, order) | Manual/self-validate | Diff against Section 7's Data Model table shows no discrepancy |
| DR-T04 | `domain-guidance.md` covers all 7 domains with matching Domain Code/Folder/Owner values as AIF-META-001's Domain ownership table | Manual/self-validate | Side-by-side comparison against AIF-META-001 lines 236-245 shows no discrepancy |
| DR-T05 | `npm test` (repo-wide validation suite) still passes after these changes | Automated | Exit code 0, no new failures introduced |

---

## 11. Documentation Requirements

- [ ] Inline documentation on all public members — N/A (markdown skill files,
      not source code)
- [ ] File headers on all new source files — N/A; per Rule 2's own text,
      "file header comments" apply to source files. This chunk's new file
      (`reference/domain-guidance.md`) is a markdown reference doc; its opening
      `# Decision Record — Per-Domain Guidance` heading plus this Chunk Plan's
      Work Log entry (Rule 2) provide the Plan ID traceability instead of an
      embedded comment, consistent with how the sibling `reference/template.md`
      is treated today (no file-header comment either).
- [ ] README updated if user-facing — N/A, no README references
      `skills/decision-record/` internals directly
- [ ] CHANGELOG entry written — to confirm at Epic-level sign-off per AIF-002
      Acceptance Criteria (does this repo maintain one); not duplicated per
      chunk

---

## 12. Acceptance Criteria

- [ ] `skills/decision-record/SKILL.md` explicitly states Tier A scope and
      `decision-triage`/direct-invocation entry points
- [ ] `skills/decision-record/SKILL.md` documents Step 1 (Confirm Tier A,
      Determine Domain) and Step 6 (Update the Decision Index, with the
      documented interim edge case)
- [ ] `skills/decision-record/reference/template.md`'s Metadata table contains
      exactly the 10 fields in the order specified in Section 6/7, including
      `Tier`, `Domain`, and `References`
- [ ] `skills/decision-record/reference/domain-guidance.md` exists and covers
      all 7 domains (Architecture, Process, Planning, AI-component, Quality,
      Testing, Meta-process) with Domain Code, folder, default owner, `Design`
      guidance, and `Impact on Planning` guidance for each
- [ ] All internal cross-references resolve (Test DR-T02)
- [ ] `npm test` passes with no new failures (Test DR-T05)
- [ ] No HIGH or CRITICAL findings open in review
- [ ] Plan committed with `Status: Draft`, presented, and `Status: Approved`
      committed as its own commit before any implementation commit, per
      `skill/plan-lifecycle`

---

## 13. Risks & Open Questions

| # | Risk / Question | Impact | Mitigation |
|---|---|---|---|
| 1 | Adding a `References` field to the template beyond the Epic bullet's explicit `Tier`/`Domain` wording could be read as scope expansion (Rule 4). | M | Documented explicitly as Key Design Decision 2 (Section 5) with rationale tracing directly to the Epic's own migration-treatment text and AIF-META-001's own record, which already assume the field exists; flagged transparently rather than silently added. If the human disagrees, this is a one-field, low-cost revert before implementation. |
| 2 | Wave 2 migration chunks (010, 011, 012, 013) depend on this chunk's exact field layout; if this plan's contract changes during revision, those chunks (not yet planned) would need to account for whichever shape lands here. | M | This plan states the exact field names/order in two places (Section 6 component spec and Section 7 Data Model table) precisely so it is unambiguous once Approved; downstream chunk authors read this Approved plan (or the resulting `template.md`) directly rather than re-deriving the shape. |
| 3 | `docs/decisions/index.json` does not exist yet when this chunk's Step 6 is first exercised (during Wave 2 migrations, before chunk 014 lands). | L | Explicit interim edge case documented in Step 6 with a Work Log note requirement, so the gap is visible and intentional rather than a silent no-op forever. |
| 4 | This chunk does not add automated schema validation for `skills/decision-record/`'s own structure (no such check exists for any skill in `tests/validation/` today). | L | Out of scope per Section 3; not a regression introduced by this chunk. If the human wants skill-schema validation added, that is a separate, cross-cutting piece of work affecting every skill, not specific to this chunk. |

---

## 14. Work Log

[2026-08-14 21:40] [AI-Engineer] [Created] [AIF-002-002] [Drafted Chunk Plan for skill/decision-record Tier A scoping, Tier/Domain metadata, index-update step, and per-domain guidance stubs. Read AIF-002 Epic Plan (Sections 3, 4, 5, 8), chunks.json, and AIF-META-001 (Approved) for the Tier/Domain model and ID/storage scheme. Assessed complexity as Tier 2 (Standard) per skill/complexity-tiers — modifying an existing skill following an established, human-approved pattern (AIF-META-001), not inventing a new one. Key contract decisions for downstream Wave 2 migration chunks (010-013): Metadata table field order (Decision ID, Project, Tier, Domain, Status, Author (Agent), Approved By, Created, Referenced By, References) reused verbatim from AIF-META-001's own precedent; Domain field value is the lowercase domain-folder name, not the Domain Code or capitalized label; added a References field alongside the existing Referenced By field as necessary infrastructure for the explicitly-scoped index-update step (flagged transparently in Section 5 and Section 13, not silently added). Not yet presented for human review.]
