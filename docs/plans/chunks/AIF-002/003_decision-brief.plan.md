# Chunk Plan: skill/decision-brief — New Tier B Skill (Slim Template, Lighter Gate)

## 1. Metadata

| Field | Value |
|---|---|
| Plan ID | AIF-002-003 |
| Parent Epic | AIF-002 |
| Chunk | 3 of 15 |
| Depends On | None |
| Can Parallel | 001, 002, 004, 005, 006, 007, 008, 009 (all other Wave 1 chunks) |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | AI-Engineer |
| Reviewed By | Pending |
| Created | 2026-08-14 |
| Last Updated | 2026-08-14 |
| Standards | ai-foundation declarative-component schemas (AGENTS.md) — no code standards apply; this chunk's deliverables are `skills/decision-brief/` markdown content only |

---

## 2. Goal

Author a new skill `skills/decision-brief/` — the Tier B ("Structural") Decision Record producer per AIF-META-001's Tier × Domain model: a slim skeleton (Metadata, Problem, Decision, Rationale, Impact — no Options-Explored ceremony), the same `Tier`/`Domain` metadata fields and `docs/decisions/index.json` update requirement as `skill/decision-record`, and a lighter `plan-lifecycle` gate (Draft → one human confirmation → Approved, no expected multi-round revision cycle).

---

## 3. Scope

### In Scope
- New skill folder `skills/decision-brief/`:
  - `skills/decision-brief/SKILL.md` — full five-section skill definition (Purpose, Inputs, Steps, Outputs, Edge Cases) per `skill/skill-authoring`'s schema.
  - `skills/decision-brief/reference/template.md` — the slim Tier B skeleton (Metadata, Problem, Decision, Rationale, Impact — explicitly no Options-Explored section).
- `Tier`/`Domain` metadata fields on the template, matching the field set AIF-META-001's own example record uses (Decision ID, Project, Tier, Domain, Status, Author (Agent), Approved By, Created, Referenced By, References) — see Section 5, Key Design Decision 2, and Section 13 Risk 1 for the explicit flag that this field set must be verified against chunk 002's actual `decision-record` output once both land, since the two chunks have no dependency edge and are being planned/implemented in parallel.
- Documenting, inside `decision-brief`'s own `SKILL.md`, a required Step that updates `docs/decisions/index.json` in the same commit that produces or updates a Tier B record — per AIF-META-001's Design section and Epic Plan Section 3/4.
- Documenting, inside `decision-brief`'s own `SKILL.md`, the Tier B abbreviated `plan-lifecycle` gate (Draft → one human confirmation → Approved, no expected multi-round revision cycle, though one remains available if the human requests changes) — written directly into this skill's own Step text so it is correct and self-sufficient even though chunk 004 (parallel, no dependency)
  is the chunk responsible for documenting this same gate variant inside `skill/plan-lifecycle` itself.
- ID and storage scheme, applied exactly as AIF-META-001's Design section specifies: `{ProjectID}-{DomainCode}-{###}` at `{paths.decisions}/{domain-folder}/{ID}_{ShortTitle}.decision.md`.
- Recording, in this Chunk Plan, an explicit flag (per the task's own instructions) that Tier/Domain field-naming should be verified for consistency with chunk 002's output before both are considered final — raised here for the human reviewer, not silently resolved unilaterally.

### Out of Scope
- Authoring `skill/decision-triage` (chunk 001) — this chunk assumes `decision-triage` exists as documented in the Epic Plan (dispatches to `decision-brief` once Tier B and Domain are already selected) but does not define or modify it.
- Modifying `skill/decision-record`'s own scoping/Tier-A-only restriction, metadata fields, or per-domain guidance stubs — that is chunk 002, dispatched in parallel with no dependency edge to this chunk.
- Modifying `skill/plan-lifecycle`, `reference/commit-gate-procedure.md`, or `reference/status-vocabulary.md` to document the Tier B/C variants at the `plan-lifecycle` level — that is chunk 004. This chunk only needs its own `SKILL.md` to correctly describe the Tier B cadence it follows; it does not own or edit `plan-lifecycle`'s files.
- Modifying `skills/chunk-planning/reference/template.md` or `skills/epic-planning/reference/template.md` for the Tier C inline-recording convention — that is chunk 005 and does not involve Tier B at all.
- `agents/engineering-manager.yaml` / `skill/chunk-orchestration`'s Decision Hand-off Sub-Flow — chunk 006. This chunk does not reference or depend on orchestration-specific dispatch behavior; `decision-brief` is invocable by any domain-owning agent directly, with or without orchestration in the loop.
- `skill/knowledge-authoring` Step 2 update — chunk 007. Per AIF-META-001's Domain table, only Architecture and AI-component decisions are proactively loaded via `knowledge/index.json` — most Tier B decisions from other domains will not be. This chunk does not add any `knowledge/index.json` integration.
- `.aiconfig.json` `paths.decisions` entry — chunk 008. This chunk references `{paths.decisions}` as a placeholder resolved elsewhere (falls back to `docs/decisions/` per existing convention if unset), consistent with how `skill/decision-record`'s existing `SKILL.md` already references `{paths.decisions}` today.
- Migration of any existing AIF-001–AIF-011 records (chunks 009–013) — no existing record is Tier B; migrated records are Tier A per the Epic's migration table.
- Creating `docs/decisions/index.json` itself (chunk 014) or extending `tests/validation/` to check it (chunk 015). This chunk documents the index-update step as a required Output/Step of `decision-brief`, but the index file's own creation and schema validation belong to those chunks. A sequencing note on what happens if `decision-brief` is invoked before the index exists is raised as a risk (Section 13), not resolved here.
- Creating any of the seven `docs/decisions/{domain}/` subfolders. This chunk writes no actual decision-brief instance (only the skill and its template), so no folder needs to exist yet as a result of this chunk's own work. Folder creation happens naturally the first time any agent (via `decision-record` or `decision-brief`) writes an actual record into a domain that doesn't yet have a folder — not gated to any single chunk.
- Any change to `plan-lifecycle`'s core Draft → Approved mechanics — explicitly out of scope for the whole Epic (Section 3).

---

## 4. Prerequisites

- [x] AIF-002 Epic Plan is `Approved` (verified: `docs/plans/epics/AIF-002.epic.md`, Status: Approved, Work Log entry 2026-08-14 [Approved])
- [x] AIF-META-001 Decision Record is `Approved` (verified:
      `docs/decisions/meta-process/AIF-META-001_decision-record-tiering-and-domain-ownership.decision.md`, Status: Approved)
- [x] Existing `skills/decision-record/SKILL.md` and `skills/decision-record/reference/template.md` read in full, as the closest structural precedent for a decision-producing skill
- [x] `skills/skill-authoring/SKILL.md` and `reference/schema.md` read in full, for the general skill-folder/frontmatter/five-section schema this new skill must satisfy
- [x] `skills/plan-lifecycle/SKILL.md` and its two `reference/` files read in full, to describe the Tier B cadence accurately even though chunk 004 (not this chunk) is the chunk that documents it inside `plan-lifecycle` itself
- [x] No dependency chunks — this chunk has `depends_on: []` in `chunks.json`; chunk 002 (`decision-record` Tier A scoping) is being planned/implemented in parallel with no coordination point, which is the source of the field-naming flag in Section 13

---

## 5. Architecture & Design

### Project Structure Changes
- `skills/decision-brief/SKILL.md` ← NEW
- `skills/decision-brief/reference/template.md` ← NEW
- No `assets/` or `scripts/` subfolder — nothing in this skill is deterministic/ scriptable (unlike, say, `dag-validate`); writing a Decision Brief is a judgment-driven authoring task, and the index-update step is a structured but still-judgment-involving edit (adding one JSON object) rather than a mechanical transform, consistent with how `skill/decision-record` also has no `scripts/` folder today.

### Key Design Decisions

1. **Decision**: Follow the Tier table in AIF-META-001's Design section verbatim for the slim skeleton's five sections (Metadata, Problem, Decision, Rationale, Impact) — no `## Options Explored` section, no `## Design` section, no `## Constraints & Requirements` section, and no `## Resolved Items`/`## Open Items` closing section.
   **Rationale**: AIF-META-001 explicitly enumerates exactly these five sections for Tier B ("Metadata, Problem, Decision, Rationale, Impact. No Options-Explored ceremony"). Adding any of `decision-record`'s other sections back in (even in optional/abbreviated form) would blur the Tier A/B distinction the whole Epic exists to introduce. If a future decision needs a `Resolved Items`/`Open Items` table, that is itself a signal the decision may not actually be Tier B — handled by the "escalate to Tier A" edge case in Section 6, not by quietly widening the Tier B template.

2. **Decision**: Metadata table field set mirrors AIF-META-001's own example record exactly — `Decision ID`, `Project`, `Tier`, `Domain`, `Status`, `Author (Agent)`, `Approved By`, `Created`, `Referenced By`, `References` — rather than inventing a different field order/set independently.
   **Rationale**: AIF-META-001 is itself the closest concrete precedent that already demonstrates a Tier/Domain-bearing metadata table (it is a Tier A record, but its Metadata table is exactly what both Tier A and Tier B records need to share per the Epic's explicit requirement, "same `Tier`/`Domain` metadata fields as `decision-record`"). **This is a judgment call, not a confirmed cross-chunk agreement** — chunk 002 (`decision-record` Tier A scoping) is defining `decision-record`'s actual field set in parallel, with no dependency edge between the two chunks per `chunks.json`. Per the task's explicit instruction, this is flagged here for the human reviewer:
   **verify field-naming/order consistency between this chunk's template and chunk 002's `decision-record` template before both are treated as final.** See Section 13, Risk 1.

3. **Decision**: `Author (Agent)` in the template is a placeholder (`{Domain-owning agent}`), not hardcoded to a single agent name.
   **Rationale**: Unlike `skill/decision-record`'s current template (which hardcodes `Architect` in the example row — a pre-existing artifact of Architect being the historical default author before this Epic), Tier B decisions are explicitly multi-domain and multi-author per AIF-META-001's Domain ownership table (Architect, Engineering-Manager, Tech-Lead, AI-Engineer, Principal-Engineer, Test-Engineer, or a generic/catch-all agent for Meta-process). Hardcoding one agent name in a brand-new template would misrepresent the model this Epic introduces. Whether `decision-record`'s existing hardcoded default also needs correcting is chunk 002's decision, not this chunk's to make — noted only as a consistency observation, not acted on outside this chunk's own file.

4. **Decision**: The Tier B abbreviated gate description is written directly into `decision-brief`'s own `SKILL.md` Step 4, rather than only referencing `skill/plan-lifecycle` by name and assuming the reader already knows the variant.
   **Rationale**: Chunk 004 (parallel, no dependency edge) is the chunk that adds the Tier B/C variant documentation to `plan-lifecycle` itself. Since this chunk cannot depend on chunk 004 landing first (both are Wave 1, no ordering guarantee), `decision-brief`'s own `SKILL.md` must describe the abbreviated cadence (Draft → one human confirmation → Approved, no expected multi-round revision cycle) inline, so the skill is correct and usable immediately even if chunk 004 hasn't merged yet. This does not duplicate ownership of the general gate mechanics (`plan-lifecycle` still owns Steps 1-5 and the status vocabulary) — it only states which cadence variant applies here, consistent with how `skill/decision-record`'s own SKILL.md already states "Follow `skill/plan-lifecycle`... The human confirms before it is finalized" inline today.

5. **Decision**: The index-update step is documented as a required Step (not an optional Edge Case) in `decision-brief`'s `SKILL.md`, even though `docs/decisions/index.json` will not exist yet in this repo until chunk 014 completes (Wave 3, depends on all of 009–013).
   **Rationale**: AIF-META-001's Design section and the Epic Plan (Section 3/4)
   both state the index-update is "a required output step, not a separate manual chore," for every Tier A/B record, with no carve-out for early invocations before the index exists. Silently downgrading this to optional would violate engineering-core Rule 3 (logging/required-step omissions are never optional) applied here to a required output step, and would contradict the Epic's own Error States table ("`docs/decisions/index.json` is missing... when a skill tries to update it → treat as a data-integrity failure — stop, do not silently skip"). The sequencing gap itself (this skill existing and being invocable in Wave 1, before the index exists in Wave 3) is raised as a risk in Section 13, not resolved by weakening the step.

### Patterns & Conventions Applied
- Skill folder structure and five required `SKILL.md` body sections (Purpose/Inputs/Steps/Outputs/Edge Cases) per `skill/skill-authoring`.
- Frontmatter shape (`name`/`version`/`description`) per `skill/skill-authoring/reference/schema.md` — `name: "decision-brief"`, kebab-case, matches folder name; `version: "0.1.0"` (new skill, matches the `0.1.0` starting point already used by `decision-record` and other recently-created skills in this repo's git history); one-sentence `description`.
- Commit-gate delegation pattern already used by `skill/decision-record` ("Follow `skill/plan-lifecycle`... do not treat the record as authoritative until the human's decision... is committed") — reused verbatim in spirit, with the Tier B cadence spelled out per Key Design Decision 4 above.

---

## 6. Components

### decision-brief SKILL.md

**File**: `skills/decision-brief/SKILL.md`
**Purpose**: Defines the full procedure for producing a Tier B Decision Brief:
confirm the tier fits, write the slim record, update the cross-domain index, and follow the abbreviated commit-gate.

**Full section content specification:**

*Frontmatter:*
```yaml
---
name: "decision-brief"
version: "0.1.0"
description: "Produces a slim Tier B Decision Brief for structural decisions that don't need full options-exploration ceremony."
---
```

*Purpose section:* Captures a Tier B ("Structural") decision — one with a plausible future cross-plan citation, per AIF-META-001's promotion threshold, but not a multi-option architectural trade-off — without the full options-exploration ceremony of `skill/decision-record`. Produces a durable, indexed record lighter than a Tier A Decision Record but heavier than a Tier C inline note. Normally invoked by `skill/decision-triage` once it has already selected Tier B and determined Domain; may also be invoked directly by an agent that already knows a decision is Tier B (see Edge Cases).

*Inputs section:*
- **Problem statement** — what question this decision answers
- **The decision already made** — Tier B skips options-exploration; the brief documents what was decided and why, not a menu of alternatives to evaluate
- **Domain** — one of Architecture, Process, Planning, AI-component, Quality, Testing, Meta-process, per AIF-META-001's ownership table (determines both the folder/ID prefix and, normally, the authoring agent)
- **Project context** — existing stack, standards, relevant repo patterns needed to state the Rationale/Impact accurately

*Steps section:*
- Step 1 — Confirm Tier B Fits: sanity-check against AIF-META-001's promotion threshold before writing. If a genuine multi-option trade-off with lasting cross-component impact is discovered, stop and escalate to `skill/decision-record` (Tier A) instead of force-fitting the slim skeleton.
  If actually no plausible second citation exists, escalate down to the Tier C inline convention instead (`skill/chunk-planning`/`skill/epic-planning`) — do not write a standalone file for a decision that doesn't need one.
- Step 2 — Write the Decision Brief: write the record using the template at `skills/decision-brief/reference/template.md`. Exactly five sections — Metadata (including `Tier: B` and `Domain`), Problem, Decision, Rationale, Impact. No Options Explored, Design, or Constraints & Requirements sections.
- Step 3 — Update the Cross-Domain Index: add or update this record's entry in `docs/decisions/index.json` in the same commit that produces or updates the file — per AIF-META-001's Design section schema (id, tier, domain, title, status, path, supersedes, superseded_by, references, referenced_by, tags).
  This is a required step, not optional busywork — if the index file is missing or malformed, stop and surface to the human rather than silently skipping the update (data-integrity failure, per the Epic's Error States table).
- Step 4 — Follow the Abbreviated Commit-Gate Procedure: commit the Brief with `Status: Draft` via `ai-git`, present it to the human for confirmation. On confirmation, update `Status: Approved` and the approver field, and commit that as its own commit — a lighter, expected one-shot cycle (Draft → confirm → Approved) rather than `decision-record`'s full multi-round options-exploration review, though a revision round remains available and should be followed exactly like `skill/plan-lifecycle`'s standard Step 3 if the human requests changes instead of confirming outright.

*Outputs section:*
- **Decision Brief** — markdown file following the template format
- **Location:** `{paths.decisions}/{domain-folder}/{ProjectID}-{DomainCode}-{###}_{ShortTitle}.decision.md` (from `.aiconfig.json`; falls back to `docs/decisions/` if `paths.decisions` is unset, consistent with `skill/decision-record`'s existing fallback convention)
- **Updated `docs/decisions/index.json` entry** — added/updated in the same commit as the Brief itself (Step 3)

*Edge Cases section:*
- **Decision turns out to need Options-Explored ceremony mid-write** — stop, do not force the slim skeleton; escalate to `skill/decision-record` (Tier A)
  instead.
- **Decision turns out not to need independent discoverability at all** — stop, do not create a standalone file; point back to the Tier C inline-recording convention instead.
- **Invoked directly, without going through `skill/decision-triage` first** — the invoking agent must still determine Domain per AIF-META-001's ownership table before writing; do not default to a Domain arbitrarily.
- **`docs/decisions/index.json` is missing or malformed** — stop, do not silently skip Step 3; surface to the human as a data-integrity failure (per the Epic's Error States table). This may legitimately occur for any `decision-brief` invocation before chunk 014 of this Epic creates the index file for the first time — the correct response is still to stop and surface, not to skip ahead.
- **Domain is genuinely ambiguous** — select the closest matching domain, note the ambiguity in the Impact section rather than blocking; if it materially affects who should author the record, raise it to the human (global Rule 2).
- **Human disagrees with the drafted content during confirmation** — update the Brief with their input and continue the (unexpected but not prohibited)
  revision round per `skill/plan-lifecycle` Step 3, same as Tier A.

**Key Behaviour:**
- No Options-Explored, Design, or Constraints & Requirements sections are ever produced by this skill — that is the structural line between Tier A and Tier B.
- The index-update step is never skipped, even when it would currently fail because the index doesn't exist yet (Wave 1 of this Epic, before chunk 014).

**Dependencies:**
- `skill/plan-lifecycle` — governs the commit-gate; this skill's Step 4 describes the Tier B cadence inline (Key Design Decision 4) rather than assuming chunk 004's documentation of it already exists.
- `skill/decision-triage` (chunk 001) — the normal caller; not a hard dependency for this chunk's own file content, since `decision-brief` must also work correctly if invoked directly (Edge Cases).
- AIF-META-001 — source of the Tier/Domain definitions, promotion threshold, ID/storage scheme, and index schema referenced throughout.

### decision-brief reference/template.md

**File**: `skills/decision-brief/reference/template.md`
**Purpose**: The slim Tier B skeleton document agents fill in when writing a Decision Brief.

**Full template content specification:**

```markdown
# Decision Brief: {Short Title}

## Metadata

| Field | Value |
|---|---|
| Decision ID | {ProjectID}-{DomainCode}-{###} |
| Project | {Project name} |
| Tier | B |
| Domain | {Architecture / Process / Planning / AI-component / Quality / Testing / Meta-process} |
| Status | Draft / Approved / Done / Deferred / Superseded |
| Author (Agent) | {Domain-owning agent} |
| Approved By | {human name or "Pending"} |
| Created | {YYYY-MM-DD HH:mm} |
| Referenced By | {Decision ID(s)/Epic ID(s) that cite this decision, or "None yet"} |
| References | {Decision ID(s) this decision cites, or "None"} |

---

## Problem

{One to three sentences. What question does this decision answer?}

---

## Decision

**Chosen approach**: {What was decided.}

---

## Rationale

{Two to four sentences: why this was decided, grounded in the constraints or
context that mattered. Tier B does not require an Options Explored section —
if you find yourself needing to weigh 2+ genuinely distinct alternatives with
lasting cross-component impact, this decision may actually be Tier A; escalate
to `skill/decision-record` instead of listing alternatives here.}

---

## Impact

{What this decision affects: components/plans that must reflect it, anything
explicitly ruled out, and any domain ambiguity noted per the Edge Cases in
`skill/decision-brief`'s SKILL.md.}
```

**Key Behaviour:**
- Exactly five sections, in this order: Metadata, Problem, Decision, Rationale, Impact. No sixth section is added by this template.
- `Tier` is fixed at `B` in the template (not a placeholder) — a Decision Brief is, by construction, always Tier B; if it needs to be Tier A, the correct action is to use `skill/decision-record` instead of relabeling.

**Dependencies:**
- AIF-META-001's Design section (metadata field set, ID/storage scheme).

---

## 7. Data Models

### `docs/decisions/index.json` entry (referenced, not modified by this chunk)

**Purpose**: The schema a Tier B Decision Brief's index entry must conform to when `decision-brief`'s Step 3 adds/updates it. Fully specified already by AIF-META-001's Design section; this chunk does not define, own, or modify this schema — it only documents, inside `decision-brief`'s own `SKILL.md`, that Step 3 must produce an entry matching it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | Yes | `{ProjectID}-{DomainCode}-{###}` |
| `tier` | string | Yes | `"B"` for every entry this skill produces |
| `domain` | string | Yes | lowercase domain name, e.g. `"process"` |
| `title` | string | Yes | matches the `# Decision Brief: {Short Title}` heading |
| `status` | string | Yes | `Draft`/`Approved`/`Done`/`Deferred`/`Superseded` |
| `path` | string | Yes | repo-relative path to the `.decision.md` file |
| `supersedes` | array | No | Decision IDs this record supersedes, if any |
| `superseded_by` | array | No | Decision ID(s) that superseded this one, if any |
| `references` | array | No | Decision IDs this record cites |
| `referenced_by` | array | No | Decision IDs that cite this record |
| `tags` | array | No | free-text tags for discovery |

---

## 8. Security Requirements

> This section must never be empty.

- [ ] No new attack surface — this chunk creates only markdown documentation inside `skills/decision-brief/`; it introduces no code execution paths, no credential handling, and no network-facing behavior (consistent with Epic Plan Section 6, first bullet).
- [ ] No secrets or credentials in the skill or template content — the added text references only public artifact paths (`docs/decisions/index.json`, `{paths.decisions}`) and skill/decision names, nothing environment- or credential-specific.
- [ ] This chunk grants no `WebSearch`/`WebFetch` capability to any agent and does not reference such a grant anywhere in the new skill's content — a direct carry-forward of AIF-META-001's non-negotiable ("no domain owner is granted `WebSearch`/`WebFetch` solely to support decision-authoring")
      and of Epic Plan Section 6, second bullet. `decision-brief` is a pure-authoring skill; it does not itself invoke any tool.
- [ ] The Tier B abbreviated gate is documented in a way that does not weaken the human-approval requirement — "abbreviated" refers only to the expected number of revision rounds (one-shot vs. multi-round), never to skipping human confirmation itself. Direct carry-forward of AIF-META-001's non-negotiable constraint and Epic Plan Section 6, fourth bullet (applied here to Tier B specifically, mirroring how chunk 004 applies the same constraint to `plan-lifecycle`'s own documentation).
- [ ] The index-update step (Step 3) is documented as a required step that fails loudly (stop, surface to human) rather than silently succeeding or silently skipping when `docs/decisions/index.json` is missing/ malformed — treating this as a data-integrity requirement, not a cosmetic one, per the Epic's Error States table.
- [ ] Errors/ambiguity surfaced to a human via this skill's Edge Cases (domain ambiguity, index-file failure, tier mismatch) contain no internal system details beyond what is already documented elsewhere in this repo (verified as N/A in practice for a docs-only skill).

---

## 9. Logging Requirements

> This section must never be empty.

This chunk produces static documentation content with no runtime component — `skills/decision-brief/` is read by agents as reference material and followed as a procedure, not executed as code, so there are no application log statements for this chunk itself to define. Two distinct "logging" concerns apply instead, and both are addressed below rather than left unaddressed:

1. **This chunk's own plan-level Work Log entries** (per `steering/engineering/core.md` Rule 2/Rule 9 and `skill/plan-lifecycle` Steps 1-4 commit requirements) — the only logging genuinely owned by this chunk.
2. **Runtime log actions for `decision-brief` invocations during orchestrated execution** (`decision_authored`, per chunk 006's Decision Hand-off Sub-Flow) — explicitly **not** owned by this chunk. `decision-brief` itself performs no orchestration-state logging; when Engineering-Manager dispatches or invokes `decision-brief` mid-chunk-orchestration, chunk 006's Decision Hand-off Sub-Flow (in `skill/chunk-orchestration`, not in this skill) is responsible for emitting `decision_handoff_detected`/ `decision_authored`/`decision_handoff_resolved` to `orchestration-state.json`. This is called out explicitly here so responsibility for that log action is not silently assumed by both chunks or by neither.

| Event | Level (Work Log Action) | What is logged | What is NOT logged |
|---|---|---|---|
| Plan drafted | `[Created]` | Plan ID, agent, tier assessed, summary of scope | No content of unrelated chunks/plans |
| Plan approved/deferred | `[Approved]`/`[Deferred]` | Human decision, approver name if approved | Nothing beyond the decision itself |
| Implementation commits (future, post-approval) | `[Implemented]` (one per Component in Section 6) | Files touched, brief description referencing AIF-002-003 | No secrets; N/A here since no secrets exist in this chunk |
| Orchestration-level `decision_authored` (future, if `decision-brief` is invoked mid-chunk-orchestration) | Owned by chunk 006's Decision Hand-off Sub-Flow, not this chunk | (see chunk 006 Chunk Plan) | This chunk's `SKILL.md` must not claim to emit this log action itself |

---

## 10. Testing Plan

This chunk has no executable code, so "tests" are documentation-validation checks performed during self-validation (Section 12) rather than automated unit tests. No automated schema validation currently exists in `tests/validation/` for skill folder structure (confirmed by inspection of `tests/validation/schemas.test.js`, which validates agent/server definitions only) — self-validation against `skill/skill-authoring`'s checklist is the correct and sufficient verification method for this chunk.

### decision-brief Documentation Tests

| Test ID | Description | Type | Pass Criteria |
|---|---|---|---|
| 003-T01 | `SKILL.md` frontmatter has `name`/`version`/`description`; `name` is kebab-case and matches folder name (`decision-brief`); `version` is valid semver | Manual/self-validate against `skill/skill-authoring/reference/schema.md` | All three fields present and well-formed |
| 003-T02 | `SKILL.md` has all five required body sections in order: Purpose, Inputs, Steps, Outputs, Edge Cases | Manual review | All five present, correctly ordered |
| 003-T03 | `reference/template.md` has exactly five sections (Metadata, Problem, Decision, Rationale, Impact) and no Options Explored/Design/Constraints & Requirements/Resolved-Open-Items section | Manual diff against AIF-META-001's Tier B row | Matches exactly |
| 003-T04 | Template's Metadata table field set matches AIF-META-001's own example record's field set (Decision ID, Project, Tier, Domain, Status, Author (Agent), Approved By, Created, Referenced By, References) | Manual cross-check | Field names/order match |
| 003-T05 | `Tier` field in the template is fixed at `B`, not a placeholder | Manual review | Literal `B`, no `{...}` |
| 003-T06 | ID/path scheme in `SKILL.md` Outputs matches AIF-META-001's Design section exactly (`{ProjectID}-{DomainCode}-{###}` at `{paths.decisions}/{domain-folder}/{ID}_{ShortTitle}.decision.md`) | Manual cross-check | Matches verbatim |
| 003-T07 | `SKILL.md` does not grant or reference `WebSearch`/`WebFetch` anywhere | Grep-based self-validation | Zero matches |
| 003-T08 | `SKILL.md` Edge Cases correctly describe escalation to Tier A (`decision-record`) and de-escalation to Tier C (inline convention), not silent absorption into the Tier B template | Manual review | Both escalation paths present |
| 003-T09 | Cross-chunk consistency check against chunk 002's `decision-record` template, once both chunks are implemented: field names/order in `decision-brief`'s Metadata table match `decision-record`'s Metadata table for the shared fields (`Decision ID` shape aside, since domain/tier prefixing differs by design) | Manual cross-check, deferred until both chunks implemented | No unexplained naming drift between the two Tier producers — see Section 13, Risk 1 |

---

## 11. Documentation Requirements

- [ ] Inline documentation on all sections (clear headers, no orphaned prose) — applies to markdown structure since there is no code
- [ ] File headers — not applicable in the source-code sense; `SKILL.md` uses YAML frontmatter as its structured header (name/version/description), consistent with every other skill in this repo; `reference/template.md` has no header convention, matching `skill/decision-record`'s existing `reference/template.md`. Traceability to this Chunk Plan (AIF-002-003)
      is carried via commit messages, consistent with this repo's established practice (no existing skill file embeds an in-body Plan ID reference; confirmed by inspection of `skills/decision-record/SKILL.md` and recent skill-authoring commits in git history).
- [ ] README updated if user-facing — not applicable; no README exists for skills beyond their own `SKILL.md`
- [ ] CHANGELOG entry written — deferred to the Epic-level decision (Epic Acceptance Criteria: "Epic-level CHANGELOG entry written (if this repo maintains one — confirm at implementation time)"); this chunk does not add a chunk-level CHANGELOG entry unilaterally. Confirmed by inspection:
      no top-level `CHANGELOG.md` currently exists in this repo.

---

## 12. Acceptance Criteria

- [ ] `skills/decision-brief/SKILL.md` exists with valid frontmatter and all five required body sections
- [ ] `skills/decision-brief/reference/template.md` exists with exactly the five Tier B sections (Metadata, Problem, Decision, Rationale, Impact) — no Options-Explored ceremony
- [ ] Template carries the same `Tier`/`Domain` metadata field set as AIF-META-001's own example record, with `Tier` fixed at `B`
- [ ] `SKILL.md` documents the `docs/decisions/index.json` update as a required Step (not optional), including the fail-loudly behavior when the index is missing/malformed
- [ ] `SKILL.md` documents the Tier B abbreviated `plan-lifecycle` cadence (Draft → one human confirmation → Approved) inline, without weakening the human-approval gate
- [ ] ID/storage scheme matches AIF-META-001's Design section exactly
- [ ] No `WebSearch`/`WebFetch` reference anywhere in the new skill's content
- [ ] Escalation paths (up to Tier A, down to Tier C) are documented as Edge Cases, not silently absorbed
- [ ] Field-naming/order consistency with chunk 002's `decision-record` template is explicitly flagged for human-reviewer verification before both chunks are treated as final (Section 13, Risk 1) — this chunk does not claim unilateral resolution of that open coordination point
- [ ] Security checklist (Section 8) fully satisfied
- [ ] Logging/Work-Log checklist (Section 9) fully satisfied, including the explicit non-ownership statement for `decision_authored`
- [ ] Documentation checklist (Section 11) fully satisfied
- [ ] Review approved with no CRITICAL or HIGH findings
- [ ] This Chunk Plan itself is committed with `Status: Draft` via `ai-git` before being presented for human approval, per `skill/plan-lifecycle`

---

## 13. Risks & Open Questions

| # | Risk / Question | Impact | Mitigation |
|---|---|---|---|
| 1 | This chunk's Metadata field set for `decision-brief`'s template is a best-judgment mirror of AIF-META-001's own example record, made without any coordination with chunk 002 (`decision-record` Tier A scoping), which is defining `decision-record`'s actual field set in parallel with no dependency edge in `chunks.json` | M | Explicitly flagged in Sections 3, 5 (Key Design Decision 2), 10 (Test 003-T09), and here for the human reviewer: verify field-naming/order consistency between this chunk's output and chunk 002's output before both are considered final. If they diverge, reconcile via a follow-up revision to whichever chunk's Chunk Plan is approved second, rather than silently picking one at implementation time. |
| 2 | `decision-brief` documents the `docs/decisions/index.json` update as a required Step, but that file will not exist in this repo until chunk 014 (Wave 3) completes — any real invocation of `decision-brief` before then will correctly stop at Step 3 per its own Edge Cases | L | No functional risk to this chunk's own deliverable — the skill's documented behavior (stop, surface to human) is the correct behavior for that state, not a defect. Raised here so a future implementer/reviewer does not mistake the sequencing gap for a bug in this chunk. Resolves itself automatically once chunk 014 lands; no action needed from this chunk. |
| 3 | This chunk's own `SKILL.md` inlines the Tier B abbreviated-gate description (Key Design Decision 4) rather than solely referencing `skill/plan-lifecycle`, to stay correct regardless of chunk 004's landing order. If chunk 004's eventual wording in `plan-lifecycle` differs materially from this chunk's inline description, the two could drift | L | Both describe the same AIF-META-001 Design section Tier table content, so drift risk is low by construction. Flagged for review to cross-check once both chunks 003 and 004 are implemented, similar in spirit to chunk 004's own Risk 1 regarding chunks 002/003. |
| 4 | Domain subfolder creation (`docs/decisions/{domain}/`) is not assigned to any single chunk in `chunks.json`; this chunk explicitly defers it (Out of Scope) since it writes no actual decision instance | L | No action needed by this chunk. Folders are created naturally by whichever chunk/agent first writes an actual record into a domain lacking one — consistent with git's own lack of empty-folder tracking. Not escalated as a gap since the Epic Plan already lists domain-folder creation as an Epic-level deliverable without chunk-assignment, and no chunk's correctness depends on the folder existing in advance. |

---

## 14. Work Log

[2026-08-14 00:00] [AI-Engineer] [Created] [AIF-002-003] [Self-planned Chunk 003 of Epic AIF-002 per Tech-Lead's decomposition (`chunks.json`). Read Epic Plan Sections 3/4/5/8, AIF-META-001 in full, `skill/decision-record` (SKILL.md + template.md), `skill/skill-authoring` (SKILL.md + schema.md), `skill/plan-lifecycle` (SKILL.md + both reference files), `skill/chunk-planning` (SKILL.md + template.md), and chunk 004's already-drafted Chunk Plan as a format/style precedent. Assessed Tier 2 (Standard) per `skill/complexity-tiers`: new skill following an already-established structural pattern (`skill/decision-record`), multi-file change (SKILL.md + reference/template.md), no schema changes to shared infrastructure — not Tier 1 (multi-file, new component), not Tier 3 (no cross-cutting redesign; the Tier × Domain model itself was already settled by AIF-META-001 and the Epic Plan, this chunk only implements one already-specified piece of it). Drafted full Chunk Plan following `skills/chunk-planning/reference/template.md`. Flagged an explicit open coordination point (Risk 1): Tier/Domain metadata field-naming was chosen by best judgment mirroring AIF-META-001's own example record, since chunk 002 (`decision-record` Tier A scoping) has no dependency edge to this chunk and is being planned/implemented in parallel — needs human-reviewer verification for consistency once both chunks land. Saving as Status: Draft per `skill/plan-lifecycle` before presenting for human approval. No implementation performed.]
