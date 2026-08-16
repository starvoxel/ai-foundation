# Chunk Plan: skill/knowledge-authoring — Domain-Scoped knowledge/index.json Decision Guidance

## 1. Metadata

| Field | Value |
|---|---|
| Plan ID | AIF-002-007 |
| Parent Epic | AIF-002 |
| Chunk | 007 of 15 |
| Depends On | None |
| Can Parallel | 001, 002, 003, 004, 005, 006, 008, 009 (all other Wave 1 chunks) |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | AI-Engineer |
| Reviewed By | Pending |
| Created | 2026-08-14 |
| Last Updated | 2026-08-14 |
| Standards | ai-foundation declarative-component schemas (AGENTS.md) — no code standards apply; this chunk's deliverable is `skills/knowledge-authoring/SKILL.md` markdown content only |

---

## 2. Goal

Update `skills/knowledge-authoring/SKILL.md` Step 2's `decision` type guidance to reflect AIF-META-001's domain-scoped `knowledge/index.json` consumption rule:
`knowledge/index.json` proactively loads only Architecture and AI-component domain decisions — the two domains without a single canonical implementing artifact that already captures the decision's effect. All other domains' decisions remain traceable via `docs/decisions/index.json` (built in a later chunk, not yet available) but are not proactively loaded as knowledge. This replaces the current blanket "use decision-record instead" guidance with the correct, domain-aware routing and rationale.

---

## 3. Scope

### In Scope
- `skills/knowledge-authoring/SKILL.md` Step 2 (`## Step 2 — Choose the type`) — replace the `decision` row's guidance text. It currently reads "Recording a technical decision with options and rationale (use decision-record skill instead)" — a blanket redirect with no domain awareness. Replace with guidance that:
  - Directs the agent to `skill/decision-triage` as the entry point for recording any decision (per this Epic's Wave 1 chunk 001), rather than naming `decision-record` directly, since `decision-triage` is what determines Tier/Domain and dispatches to `decision-record` (Tier A) or `decision-brief` (Tier B) — `knowledge-authoring` should not itself re-derive tier/domain routing logic that `decision-triage` owns.
  - States the domain-scoped consumption rule plainly: a decision is only added to `knowledge/index.json` when its Domain is Architecture or AI-component — the two domains without a single canonical implementing artifact that already captures the decision's effect. Other domains' decisions (Process, Planning, Quality, Testing, Meta-process) are never added to `knowledge/index.json`; their traceability is via `docs/decisions/index.json` instead.
- A short explanatory note immediately below the Step 2 table (or inline in the row, whichever reads more clearly once drafted) carrying the "why" — same rationale AIF-META-001 gives: knowledge is for descriptive material with no other canonical home, and most domains' decisions already have one (the skill/template/steering file the decision changed).

### Out of Scope
- Authoring `skill/decision-triage`, `skill/decision-record`'s Tier A scoping, or `skill/decision-brief` themselves — those are chunks 001, 002, and 003 respectively, dispatched in parallel with this chunk. This chunk only points to `decision-triage` as the entry point; it does not define or modify that skill's own Steps/Outputs.
- Creating or backfilling `docs/decisions/index.json` — that is chunk 014, which depends on all migration chunks (009-013) and has not been built yet. This chunk's new guidance text references that path as the eventual traceability mechanism for non-Architecture/AI-component domains, without assuming it already exists.
- Steps 1, 3, 4, 5, and 6 of `skills/knowledge-authoring/SKILL.md` — untouched.
  Step 1 ("Determine if this belongs in knowledge") and Step 3-5 (write file, choose scope, choose tags) are generic across all five `type` values and are not decision-specific.
- The `Edge Cases` section's existing "Decision Record" bullet (line 115: "use the `decision-record` skill instead. It produces a knowledge file with the correct decision format and template.") and the `Step 6` self-validation checklist's "(or `{paths.knowledge}/decisions/` for decisions)" parenthetical (line 91) both describe the same pre-AIF-META-001 model this chunk is updating in Step 2, and will read as stale/inconsistent once Step 2 changes (decisions are no longer knowledge files at all in the new model, and are never located at `{paths.knowledge}/decisions/`). This chunk's scope, per the Epic Plan Section 3, is explicitly limited to "Step 2's `decision` type guidance" — flagged as a discovery in Section 13 below rather than silently expanded into scope.

---

## 4. Prerequisites

- [x] AIF-002 Epic Plan is `Approved` (verified: `docs/plans/epics/AIF-002.epic.md`, Status: Approved, Work Log entry 2026-08-14 [Approved])
- [x] AIF-META-001 Decision Record is `Approved` (verified:
      `docs/decisions/meta-process/AIF-META-001_decision-record-tiering-and-domain-ownership.decision.md`, Status: Approved) — source of the domain-scoped `knowledge/index.json` consumption rule (Resolved Item 9, Domain table's rightmost column)
- [x] Current `skills/knowledge-authoring/SKILL.md` content read in full
- [x] No dependency chunks — this chunk has `depends_on: []` in `chunks.json`

---

## 5. Architecture & Design

### Project Structure Changes
- `skills/knowledge-authoring/SKILL.md` ← MODIFIED (Step 2 section only)
- No new files.

### Key Design Decisions

1. **Decision**: Point Step 2's `decision` row to `skill/decision-triage`, not `skill/decision-record` directly.
   **Rationale**: Per the Epic Plan's Architecture Overview (Section 5), `decision-triage` is the single entry point every agent uses to record a decision — it determines Tier and Domain and dispatches accordingly.
   `knowledge-authoring` naming `decision-record` directly would either be wrong for Tier B/C decisions or would require `knowledge-authoring` to re-explain tier selection itself, duplicating logic that belongs solely to `decision-triage`. This keeps `knowledge-authoring` as a thin, correct pointer rather than a second source of truth for decision routing.

2. **Decision**: State the domain list (Architecture, AI-component) explicitly in the guidance text rather than only linking to AIF-META-001.
   **Rationale**: `knowledge-authoring` is consulted at the moment an agent is about to write a knowledge file — it needs to be immediately actionable ("is this decision's domain Architecture or AI-component? if not, don't add it to `knowledge/index.json`") without requiring a detour into the full AIF-META-001 record to extract the rule. The record is still referenced as the source/rationale, consistent with how `skills/plan-lifecycle/` (chunk 004)
   references AIF-META-001 for the Tier definitions without re-deriving them — the same "reference the source, but state the actionable rule inline" pattern is applied here since Step 2 is itself the actionable checklist a reader follows in the moment.

3. **Decision**: Do not remove or rewrite the Step 6 checklist parenthetical or the Edge Cases "Decision Record" bullet in this chunk.
   **Rationale**: The Epic Plan's Section 3 scope for this chunk names "Step 2's `decision` type guidance" specifically as the modification target — updating those two other lines is a related but distinct correction (they describe *where* decision files used to live and *which skill* fully replaces decision-recording, both now inaccurate for a different reason than Step 2's routing text). Per `steering/engineering/core.md` Rule 4, this is raised as a discovery rather than silently folded into this chunk's scope, since it touches wording the Epic Plan did not name and a reviewer did not sign off on scoping in. See Section 13, Risk 1.

### Patterns & Conventions Applied
- Follows the same "reference the source-of-truth decision record, state the actionable rule inline, don't re-derive it" pattern already used by chunk 004 (`skill/plan-lifecycle`) for AIF-META-001's Tier definitions.
- Preserves the existing Step 2 table's row-per-type structure; the `decision` row's guidance text is replaced, the table shape itself is not restructured.

---

## 6. Components

### knowledge-authoring SKILL.md — Step 2 Decision-Type Guidance

**File**: `skills/knowledge-authoring/SKILL.md`
**Purpose**: Correct the single guidance line an agent consults when deciding whether a `decision` belongs in `knowledge/`, replacing a blanket redirect with the domain-scoped rule.

**Content changes**:
- Step 2 table, `decision` row — replace:
  `| `decision` | Recording a technical decision with options and rationale (use decision-record skill instead) |` with guidance that:
  1. Directs to `skill/decision-triage` as the entry point for recording any decision (not `decision-record` directly).
  2. States the domain-scoped `knowledge/index.json` rule: only decisions whose Domain is Architecture or AI-component are added to `knowledge/index.json`; all other domains (Process, Planning, Quality, Testing, Meta-process) are never added here — they remain traceable via `docs/decisions/index.json`.
- Add a short note (one to three sentences) immediately below the Step 2 table carrying the rationale: decisions in domains with a canonical implementing artifact (the skill/template/steering file the decision changed) don't need a second, driftable knowledge copy; Architecture and AI-component decisions lack that single canonical artifact, so they are loaded as knowledge directly.
  Cite AIF-META-001 by Decision ID as the source.

**Key Behaviour**:
- An agent reading Step 2 for a `decision`-type entry is redirected to `decision-triage`, never told to write a `knowledge-authoring`-produced decision file directly.
- An agent that already has a Tier A/B decision in hand (post-triage) and is deciding whether it *also* needs a `knowledge/index.json` entry can answer that from Step 2's guidance alone, using the decision's Domain field.
- No other Step (1, 3, 4, 5, 6) or the Inputs/Outputs/Edge Cases sections (beyond the flagged-but-out-of-scope Edge Cases bullet) changes.

**Dependencies**:
- AIF-META-001 (Decision Record) — source of the domain-scoped consumption rule, referenced not redefined.
- `skill/decision-triage` (chunk 001) — this chunk points to it by name as the entry point; since chunk 001 has no dependency edge on this chunk (both Wave 1, parallel), this chunk references `decision-triage`'s documented role per the Epic Plan/AIF-META-001 rather than its as-yet-unwritten `SKILL.md` content.

---

## 7. Data Models

Not applicable — this chunk produces markdown documentation only, no data schemas or structured artifacts.

---

## 8. Security Requirements

> This section must never be empty.

- [ ] No new attack surface — this chunk edits only markdown documentation inside `skills/knowledge-authoring/SKILL.md`; it introduces no code execution paths, no credential handling, and no network-facing behavior (consistent with Epic Plan Section 6, first bullet).
- [ ] No secrets or credentials in source content — the added text references only public artifact paths (`knowledge/index.json`, `docs/decisions/index.json`)
      and skill/decision names, nothing environment- or credential-specific.
- [ ] The updated guidance must not imply that non-Architecture/AI-component decisions are less discoverable or less legitimate than before — it must state plainly that they remain traceable via `docs/decisions/index.json`, preserving referential integrity of the overall decision system rather than silently dropping a discovery path (direct carry-forward of AIF-META-001's Problem Statement concern about interconnectivity).
- [ ] Errors/ambiguity exposed to future readers contain no internal system details beyond what is already documented elsewhere in this repo (not applicable in practice for a docs-only change, verified as N/A).

---

## 9. Logging Requirements

> This section must never be empty.

This chunk produces static documentation content with no runtime component — `skills/knowledge-authoring/SKILL.md` is read by agents as reference material, not executed as code, so there are no application log statements for this chunk to define. The table below documents the plan-level Work Log entries this chunk itself must produce, per `steering/engineering/core.md` Rule 2/Rule 9 and `skill/plan-lifecycle` Steps 1-4 commit requirements — these are the only "logging" applicable to a documentation-only chunk.

| Event | Level (Work Log Action) | What is logged | What is NOT logged |
|---|---|---|---|
| Plan drafted | `[Created]` | Plan ID, agent, tier assessed, summary of scope | No content of unrelated chunks/plans |
| Plan approved/deferred | `[Approved]`/`[Deferred]` | Human decision, approver name if approved | Nothing beyond the decision itself |
| Implementation commit (future, post-approval) | `[Implemented]` | File touched (`skills/knowledge-authoring/SKILL.md`), brief description referencing AIF-002-007 | No secrets; N/A here since no secrets exist in this chunk |

---

## 10. Testing Plan

This chunk has no executable code, so "tests" are documentation-validation checks performed during self-validation (Section 12) rather than automated unit tests.

### knowledge-authoring Documentation Tests

| Test ID | Description | Type | Pass Criteria |
|---|---|---|---|
| 007-T01 | Step 2's `decision` row no longer says "use decision-record skill instead" and instead names `skill/decision-triage` | Manual/diff review | Old blanket-redirect text is fully replaced, not left alongside the new text |
| 007-T02 | Step 2 guidance states the domain-scoped rule (Architecture and AI-component only load into `knowledge/index.json`) matching AIF-META-001's Domain table's `knowledge/index.json?` column exactly (Yes for Architecture/AI-component, No for the rest) | Manual cross-check | Domain list matches AIF-META-001 verbatim — no domain omitted or added |
| 007-T03 | New text cites AIF-META-001 by Decision ID | Manual review | Citation present and ID matches AIF-META-001's Metadata table |
| 007-T04 | No other section of `SKILL.md` (Steps 1, 3-6, Inputs, Outputs) changes wording, except the flagged-but-deferred Edge Cases/Step 6 lines noted in Section 13, which remain untouched by this chunk | Manual diff review | Diff is scoped to Step 2 plus the new explanatory note only |
| 007-T05 | Resulting Step 2 table remains valid markdown (renders correctly, no broken table syntax) | Manual render check | Table parses cleanly |

---

## 11. Documentation Requirements

- [ ] Inline documentation on the new/changed Step 2 content — clear, scannable, consistent with the rest of the file's table + prose style
- [ ] File headers — not applicable; `skills/knowledge-authoring/SKILL.md` uses YAML front-matter only, consistent with existing file structure; no new header convention introduced
- [ ] README updated if user-facing — not applicable; no README exists for this skill beyond `SKILL.md` itself, which is being updated directly
- [ ] CHANGELOG entry written — confirmed at Epic level (Acceptance Criteria item: "Epic-level CHANGELOG entry written (if this repo maintains one — confirm at implementation time)"); this chunk defers to that Epic-level decision rather than adding a chunk-level CHANGELOG entry unilaterally

---

## 12. Acceptance Criteria

- [ ] `skills/knowledge-authoring/SKILL.md` Step 2's `decision` row directs to `skill/decision-triage` (not `decision-record` directly) as the entry point for recording any decision
- [ ] Step 2 states the domain-scoped `knowledge/index.json` consumption rule:
      Architecture and AI-component only; all other domains remain traceable via `docs/decisions/index.json` but are not proactively loaded as knowledge
- [ ] New guidance cites AIF-META-001 as the source of the rule
- [ ] No wording change outside Step 2 and its new explanatory note (Steps 1, 3-6, Inputs, Outputs, Edge Cases untouched by this chunk — see Section 13 for the flagged, deferred inconsistency)
- [ ] Security checklist (Section 8) fully satisfied
- [ ] Logging/Work-Log checklist (Section 9) fully satisfied
- [ ] Documentation checklist (Section 11) fully satisfied
- [ ] Review approved with no CRITICAL or HIGH findings
- [ ] This Chunk Plan itself is committed with `Status: Draft` via `ai-git` before being presented for human approval, per `skill/plan-lifecycle`

---

## 13. Risks & Open Questions

| # | Risk / Question | Impact | Mitigation |
|---|---|---|---|
| 1 | The Epic Plan scopes this chunk to "Step 2's `decision` type guidance" specifically, but two other lines in the same file describe the same pre-AIF-META-001 model and will read as stale once Step 2 changes: the `Edge Cases` section's "Decision Record — use the `decision-record` skill instead. It produces a knowledge file with the correct decision format and template." (line 115, now inaccurate — decisions are no longer knowledge files under the new model), and the Step 6 self-validation checklist's "(or `{paths.knowledge}/decisions/` for decisions)" parenthetical (line 91, a location that never applied under the new model, where decisions live under `docs/decisions/{domain}/`, not `{paths.knowledge}/decisions/`) | M | Raised here as a discovery per `steering/engineering/core.md` Rule 4, rather than silently folded into this chunk's implementation. Recommend either: (a) the human/Tech-Lead confirms this chunk's scope should extend to those two lines for internal consistency, or (b) a small follow-up chunk/fix is tracked separately. Not blocking this chunk's own Step 2 update, since Step 2's guidance is self-contained and correct on its own even if the other two lines remain temporarily stale. |
| 2 | This chunk references `skill/decision-triage` (chunk 001) by name for its entry-point role, but chunk 001's own Chunk Plan/implementation is being authored in parallel (Wave 1, no dependency edge in `chunks.json`) | L | No functional risk — this chunk only needs `decision-triage`'s documented existence and role (already specified in the Epic Plan Section 5, Architecture Overview), not its finished `SKILL.md` content. If chunk 001 lands with a materially different entry-point name or behavior than the Epic Plan describes, that is a discrepancy for review to catch across chunks, not something this chunk can pre-empt. |
| 3 | This chunk's new text references `docs/decisions/index.json` as the traceability mechanism for non-Architecture/AI-component domains, but that file does not yet exist (created in chunk 014, which depends on all migration chunks 009-013) | L | Acceptable per the same pattern chunk 004 uses for the same file — the reference states the eventual traceability mechanism per AIF-META-001's Design section, independent of whether the file has been created yet in this Epic's sequencing. No agent following this guidance today would need `docs/decisions/index.json` to exist in order to correctly *not* add a Process/Planning/Quality/Testing/Meta-process decision to `knowledge/index.json` — the guidance is actionable immediately regardless. |

---

## 14. Work Log

[2026-08-14 00:00] [AI-Engineer] [Created] [AIF-002-007] [Self-planned Chunk 007 of Epic AIF-002 per Tech-Lead's decomposition (`chunks.json`). Read Epic Plan Sections 3/4/5/8 and AIF-META-001 in full, plus the current `skills/knowledge-authoring/SKILL.md`. Assessed Tier 1 (Quick) per `skill/complexity-tiers`: single-file change (`SKILL.md`), clear intent, no new pattern or schema change — narrower than chunk 004's Tier 2 assessment (which touched three files across a widely-depended-upon skill introducing a new gate variant); this chunk replaces one table row's guidance text with no structural change to the skill itself. Per `steering/engineering/core.md` Rule 1, a Chunk Plan is still required and gates implementation regardless of tier, since this is an Epic chunk with dependent downstream work (Acceptance Criteria item in AIF-002 Section 9). Drafted full Chunk Plan following `skills/chunk-planning/reference/template.md`. Flagged one discovery (Section 13, Risk 1): two other lines in the same file (Edge Cases' "Decision Record" bullet, Step 6's decisions-subfolder parenthetical) describe the same superseded model but are outside this chunk's Epic-defined scope — raised rather than silently expanded into scope, per Rule 4. Saving as Status: Draft per `skill/plan-lifecycle` before presenting for human approval. No implementation performed.]
