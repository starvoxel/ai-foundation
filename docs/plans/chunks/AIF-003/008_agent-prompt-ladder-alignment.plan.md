# Chunk Plan: Align `architect.yaml` and `engineering-manager.yaml` with the Ladder and the Set-but-Do-Not-Commit Rule

## 1. Metadata

| Field | Value |
|---|---|
| Plan ID | AIF-003-008 |
| Parent Epic | AIF-003 |
| Chunk | 8 of 8 |
| Depends On | AIF-003-006 |
| Can Parallel | AIF-003-007 (wave 3) |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | AI-Engineer |
| Reviewed By | Pending |
| Created | 2026-08-25 |
| Last Updated | 2026-08-25 |
| Standards | `skills/agent-authoring/reference/schema.md`, AGENTS.md agent schema. AI-track chunk per `AIF-PROC-001` — declarative component work owned by AI-Engineer. |

---

## 2. Goal

Update the two domain-owner agent prompts that author Decision Records — `agents/architect.yaml` and `agents/engineering-manager.yaml` — so they know the three-rung amendment ladder exists and route to it correctly, and so `architect.yaml` specifically reflects Epic Question 6's resolution: Architect may *write* `Status: Approved` (and the corresponding `Approved By`/amendment `Outcome` field) into a Decision Record once the human has explicitly decided, but must *never commit* that change — the human commits it.

---

## 3. Quick Summary

**Open Items:** 2 open (0 High / 2 Medium / 0 Low) — see Section 14

This chunk assessed at Tier 2 per `skill/complexity-tiers` (multi-file prompt edit, following an already-decided pattern, no new component or schema). It is nonetheless written as a full Chunk Plan artifact, gated by `skill/plan-lifecycle`, at the explicit direction of the task that dispatched it — matching the structure and rigor of the two software-track sibling plans (AIF-003-001, AIF-003-002) rather than `skill/chunk-planning`'s default "no separate plan artifact required" path for Tier 1/2 AI-track work. This does not change the human-approval gate itself, which was already mandatory at every tier per AIF-005.

---

## 4. Acceptance Criteria

- [ ] All components in Section 8 exist as described
- [ ] `npm test` passes (`tests/validation/schemas.test.js`, `tests/validation/tools.test.js` cover both edited files)
- [ ] Security checklist (Section 10) fully satisfied
- [ ] Logging checklist (Section 11) fully satisfied
- [ ] Documentation checklist (Section 13) fully satisfied
- [ ] Review approved with no CRITICAL or HIGH findings
- [ ] `agents/architect.yaml` permits writing `Status: Approved` (and `Approved By`/amendment `Outcome`) only after an explicit human decision, and explicitly forbids committing that write — matching Epic AIF-003 Section 10's acceptance criterion verbatim
- [ ] `agents/architect.yaml` gains no other widening of git/shell permissions: `tools`, `approved_tools`, and `blocked_commands` are unchanged
- [ ] Both files reference the amendment ladder (errata / amendment / supersede) so a domain owner checks it before recommending `Status: Superseded`
- [ ] `approved_tools` remains a subset of `tools` in both files (unchanged, since no tool lists are touched)
- [ ] Every skill added to either file's `skills:` list exists under `skills/` at plan-approval time
- [ ] `agents/engineering-manager.yaml` gains no "set but do not commit" restriction — Epic Question 6 scopes that exception to Architect only; EM continues to commit its own Decision Record status transitions per `skill/plan-lifecycle` Step 4, unchanged
- [ ] Both files' `version` fields are bumped (minor) to reflect the prompt change

---

## 5. Scope

### In Scope

- `agents/architect.yaml`: rewrite the hard rule that currently forbids Architect from ever setting `Status: Approved` or `Approved By`, replacing it with the set-but-do-not-commit rule (Epic Question 6).
- `agents/architect.yaml`: add a rule/process pointer directing Architect to consult the amendment ladder in `skill/plan-lifecycle` before recommending `Status: Superseded`.
- `agents/architect.yaml`: add `"skill/plan-lifecycle"` to the `skills:` list (currently only `skill/decision-record`).
- `agents/engineering-manager.yaml`: add a rule/process pointer directing EM to consult the amendment ladder in `skill/plan-lifecycle` before superseding a Process-domain Decision Record it authors.
- `agents/engineering-manager.yaml`: add `"skill/plan-lifecycle"` to the `skills:` list (currently `skill/chunk-orchestration`, `skill/worktree-management`, `skill/decision-triage`, `skill/decision-record`, `skill/decision-brief`).
- Version bump (minor) on both files per the changed prompt content.

### Out of Scope

- **`agents/ai-engineer.yaml`'s missing `skill/chunk-planning`/`skill/plan-lifecycle` references.** Real gap, found while reading this Epic's dependency files (AI-Engineer owns 6 of 8 chunks and therefore authors/follows Chunk Plans, but its `skills:` list has neither `skill/chunk-planning` nor `skill/plan-lifecycle`). Not named in this chunk's file ownership (`chunks.json`: `agents/architect.yaml`, `agents/engineering-manager.yaml` only) or in the Epic's Scope section. Recorded as Risk/Question 2 and reported to the human rather than silently fixed (engineering-core Rule 4).
- **Architect's shell/git access in general.** Explicitly Out of Scope in the Epic (Section 4): the Question 6 answer narrows what Architect may do to one field-write permission; broader shell/git access is a separate matter the human has flagged for later.
- **Any change to `tools`, `approved_tools`, or `blocked_commands` on either file.** The set-but-do-not-commit rule is enforced by prompt instruction, not by removing a tool — Architect's `write` tool is already outside `approved_tools` (requires runtime confirmation) and `blocked_commands` already denies `git *`/`gh *` on both files. No infra widening is needed or permitted (Epic Section 7).
- **`skills/plan-lifecycle/*` content itself.** Owned by AIF-003-006 (dependency of this chunk), not this chunk.
- **`skills/decision-record/SKILL.md` / `skills/decision-brief/SKILL.md`.** Owned by AIF-003-007 (parallel sibling in wave 3, not a dependency of this chunk).
- **Any change to Decision Record templates, `status-vocabulary.md`, or `lib/decisions.js`.** Owned by AIF-003-003, AIF-003-004/006, and AIF-003-001/002 respectively.
- **Amending `AIF-PROC-002`/`AIF-PROC-006`.** Explicitly Out of Scope for the whole Epic (tracked as `AIF-004` Open Question 1).

---

## 6. Prerequisites

- [ ] Epic `AIF-003` `Status: Approved` committed (done — commit `8c82f90`)
- [ ] This Chunk Plan `Status: Approved` committed before implementation begins
- [ ] **AIF-003-006 complete** — this chunk's prompt wording points at the ladder documentation `AIF-003-006` adds to `skill/plan-lifecycle`. See Risk 1 for the coordination point: at time of writing this plan, `AIF-003-006` is being planned in parallel and its final section/anchor names in `skills/plan-lifecycle/SKILL.md` and `reference/commit-gate-procedure.md` are not yet verified.

---

## 7. Architecture & Design

### Project Structure Changes

```
agents/
├── architect.yaml            ← MODIFIED (hard rules, skills:, version)
└── engineering-manager.yaml  ← MODIFIED (hard rules, skills:, version)
```

No new files.

### Key Design Decisions

1. **Decision**: fold the ladder pointer into a prompt rule that names `skill/plan-lifecycle` generically ("consult the amendment ladder documented in `skill/plan-lifecycle`") rather than citing a specific heading or anchor.
   **Why:** `AIF-003-006` has not landed yet and its final section names are not guaranteed. Citing a specific anchor now risks a dangling reference the moment `006` lands with different wording. `skill/plan-lifecycle` is a stable, already-existing skill folder, so pointing at the skill (not a sub-heading within it) satisfies the agent-authoring self-validation checklist item ("all entries in `skills` reference existing folders in `skills/`") without depending on `006`'s exact prose.

2. **Decision**: add `"skill/plan-lifecycle"` directly to both files' `skills:` lists, rather than relying on the transitive path through `skill/decision-record` (which `AIF-003-007` will point at the ladder).
   **Why:** this chunk depends only on `AIF-003-006`, not `AIF-003-007` (`chunks.json`: `008` → `["006"]`). Making the ladder reachable without `007` having landed keeps this chunk's own dependency graph accurate — if it relied on the `decision-record`/`decision-brief` skills for ladder-awareness, it would have an undeclared dependency on `007` that `chunks.json` does not express. It also directly satisfies the Epic's "know the ladder exists" requirement at the agent-prompt level, which is the level the Epic scope names, rather than indirectly through another skill.

3. **Decision**: the set-but-do-not-commit rule is scoped to `agents/architect.yaml` only; `agents/engineering-manager.yaml` keeps committing its own Decision Record status transitions unchanged.
   **Why:** Epic Section 5 ("Who makes the second commit") states this in the negative and the positive in the same sentence — "For most domain owners this is unchanged from `skill/plan-lifecycle` Step 4 — the agent edits and commits after the human has decided. Architect is the exception." EM is not named as an exception anywhere in the Epic; widening the restriction to EM would be an undirected scope expansion.

4. **Decision**: the rewritten Architect rule covers *both* initial approval (`Draft` → `Approved`) and amendment outcomes (`Amending` → `Approved`), not only the amendment case.
   **Why:** the current line 36 rule ("Never set ... Status to Approved") is unconditional — it already covers initial approval, and Epic Section 5 states the *same* mechanic (write, don't commit) applies to "confirming or rejecting a proposed amendment alike," explicitly generalizing beyond the amendment cycle rather than replacing the old rule with an amendment-only carve-out. Scoping the new rule to amendments only would leave initial approval governed by contradictory old wording.

> **Tier C decisions.** All four are Tier C per `skill/decision-triage` — local implementation choices inside an already-decided design (Epic Question 6, Section 5, Section 7), riding this plan's own `skill/plan-lifecycle` cycle. None warrants a standalone record.

### Patterns & Conventions Applied

- **Agent-authoring schema** (`skills/agent-authoring/reference/schema.md`): prompt is a direct instruction ("you"), hard rules stay imperative and terse, `skills:` entries use the `"skill/{name}"` format and must reference existing folders.
- **No tool/approved_tools/blocked_commands changes** — per Epic Section 7's explicit constraint that this chunk must not widen Architect's git permissions beyond the single field-write instruction.
- **Semver minor bump** on both files, consistent with how `AIF-PROC-001` Design → Required follow-up changes describes prompt-scope edits ("Minor version bump").

---

## 8. Components

### `agents/architect.yaml` — prompt hard rules and `skills:`

**File**: `agents/architect.yaml`
**Purpose**: Give Architect the set-but-do-not-commit permission for `Status: Approved` and route it to the amendment ladder before it recommends a supersede.

**Change 1 — replace the existing hard rule** (currently line 36):

Before:
```yaml
  - Never set a Decision Record's Status to "Approved" or fill in "Approved By". Only a human may approve. Always set Status to "Draft" and Approved By to "Pending".
```

After:
```yaml
  - Only a human may approve a Decision Record — never assume approval. When drafting a new record, always set Status to "Draft" and Approved By to "Pending".
  - Once the human has explicitly confirmed a decision (including confirming or rejecting a proposed amendment), you may write Status: "Approved" and the corresponding Approved By / amendment Outcome field into the record file — but you must never commit that change yourself. Stop after writing the file; the human makes that commit.
```

**Change 2 — add a ladder-routing rule**, placed near the existing "Process" numbered steps or as an additional hard rule:

```yaml
  - Before recommending Status: "Superseded", check the amendment ladder documented in skill/plan-lifecycle. If the original rationale still holds, a scoped ## Amendments entry is the correct path, not a new record.
```

**Change 3 — `skills:` list**:

Before:
```yaml
skills:
  - "skill/decision-record"
```

After:
```yaml
skills:
  - "skill/decision-record"
  - "skill/plan-lifecycle"
```

**Change 4 — version bump**: `0.3.0` → `0.4.0`.

**Key Behaviour**:
- `tools`, `approved_tools`, `blocked_commands` are byte-for-byte unchanged.
- The rewritten rule applies uniformly to initial-approval and amendment-confirmation cases — no separate rule per case (Design Decision 4).
- The rule text does not name a specific `skill/plan-lifecycle` sub-heading, only the skill itself (Design Decision 1).

**Dependencies**: `skill/plan-lifecycle` must exist as a folder under `skills/` at the time this file is validated (it already does — see Section 6 Prerequisites for the content dependency on `AIF-003-006`, which is separate from the folder's mere existence).

### `agents/engineering-manager.yaml` — prompt rule and `skills:`

**File**: `agents/engineering-manager.yaml`
**Purpose**: Give EM the same ladder-routing awareness for the Process-domain Decision Records it authors directly, with no change to its existing commit behaviour.

**Change 1 — add a ladder-routing rule**, appended to the existing Hard rules list:

```yaml
  - Before superseding a Process-domain Decision Record, check the amendment ladder documented in skill/plan-lifecycle. If the original rationale still holds, a scoped ## Amendments entry is the correct path, not a new record.
```

**Change 2 — `skills:` list**:

Before:
```yaml
skills:
  - "skill/chunk-orchestration"
  - "skill/worktree-management"
  - "skill/decision-triage"
  - "skill/decision-record"
  - "skill/decision-brief"
```

After:
```yaml
skills:
  - "skill/chunk-orchestration"
  - "skill/worktree-management"
  - "skill/decision-triage"
  - "skill/decision-record"
  - "skill/decision-brief"
  - "skill/plan-lifecycle"
```

**Change 3 — version bump**: `0.6.0` → `0.7.0`.

**Key Behaviour**:
- No existing responsibility, process step, or hard rule is altered — this is purely additive.
- EM's existing "Never resume a chunk past the decision point until it reaches Approved. Deferred never satisfies the gate." rule is untouched and continues to govern the Decision Hand-off Sub-Flow.
- `tools`, `approved_tools`, `blocked_commands` are byte-for-byte unchanged.

**Dependencies**: same as Architect's — `skill/plan-lifecycle` folder existence, content dependency on `AIF-003-006`.

---

## 9. Data Models

Not applicable — this chunk edits agent-prompt YAML (`prompt`, `skills`, `version` fields), not a data schema or index shape. No new fields are added to any runtime data structure.

---

## 10. Security Requirements

> This section must never be empty.

- [ ] **No widening of Architect's git/shell surface.** `tools`, `approved_tools`, and `blocked_commands` are unchanged on both files — `blocked_commands` still denies `git *`/`gh *` on `architect.yaml`, and `write` remains outside `approved_tools` (requires runtime human confirmation). This is the chunk's primary security-relevant constraint, per Epic Section 7: "Chunks touching `agents/architect.yaml` must not widen this beyond the single field-write permission."
- [ ] **No self-approval path introduced.** The rewritten Architect rule permits *writing* `Status: Approved` only after the human has already, explicitly decided — never as an assumption of intent — and forbids Architect from being the one to commit that write. The human's commit remains the artifact that satisfies the approval gate (`skill/plan-lifecycle` Step 4), unchanged by this chunk.
- [ ] **Audit integrity preserved.** Neither prompt change touches the append-only nature of `## Amendments`/`## Errata` rows (owned by AIF-003-003/006); this chunk only tells the agents where the rule lives.
- [ ] All external inputs validated before use — not applicable; this chunk contains no code, only static YAML prompt text validated by `tests/validation/schemas.test.js`.
- [ ] No secrets or credentials in source code or logs — not applicable; no secrets touched.
- [ ] Errors exposed to users contain no internal system details — not applicable; no runtime error paths added.

---

## 11. Logging Requirements

> This section must never be empty.

Agent `.yaml` definitions carry no runtime logging of their own — they are static configuration consumed by the harness. Nothing in this chunk adds, removes, or changes any log statement anywhere in the repo.

| Event | Level | What is logged | What is NOT logged |
|---|---|---|---|
| Architect writes `Status: Approved` into a record file (post-human-decision) | — | Nothing from this chunk's changes; any commit/audit trail is produced by the human's own commit per `skill/plan-lifecycle`, unchanged by this chunk | The write itself is not separately logged — the file diff and the human's commit message are the record |
| `npm test` validates both edited `.yaml` files | — | Existing `tests/validation/schemas.test.js`/`tools.test.js` output, unchanged format | n/a |

The audit trail this chunk relies on is git history (the human's commit), not application logging — consistent with how the rest of the amendment ladder records its own audit trail (Epic Section 7 "Audit integrity").

---

## 12. Testing Plan

No new automated test cases are added by this chunk — `tests/validation/schemas.test.js` and `tests/validation/tools.test.js` already exercise every `agents/*.yaml` file generically (schema shape, `approved_tools ⊆ tools`, skill-reference existence) and require no chunk-specific additions. Verification is self-validation against the existing generic suite plus the checklist below.

| Test ID | Description | Type | Pass Criteria |
|---|---|---|---|
| 008-T01 | `agents/architect.yaml` still parses as valid YAML and matches `skills/agent-authoring/reference/schema.md` | Validation (existing) | `tests/validation/schemas.test.js` passes for this file |
| 008-T02 | `agents/engineering-manager.yaml` still parses as valid YAML and matches the schema | Validation (existing) | `tests/validation/schemas.test.js` passes for this file |
| 008-T03 | `approved_tools ⊆ tools` still holds for both files | Validation (existing) | `tests/validation/tools.test.js` passes for both files |
| 008-T04 | Every entry in both files' `skills:` list (including the newly added `skill/plan-lifecycle`) resolves to an existing folder under `skills/` | Validation (existing, generic skill-reference check) | No dangling skill reference reported |
| 008-T05 | Manual read-through: the rewritten Architect hard rule contains no residual wording forbidding *writing* `Status: Approved`/`Approved By` post-human-decision, and explicitly forbids *committing* it | Manual | Confirmed by inspection against Epic AIF-003 Section 10's acceptance criterion, quoted verbatim in Section 4 above |
| 008-T06 | Manual read-through: `agents/engineering-manager.yaml` gained no set-but-do-not-commit restriction | Manual | Confirmed by inspection — EM's existing commit behaviour is untouched |
| 008-T07 | Full suite regression | Unit+Integration+Validation | `npm test` passes |

---

## 13. Documentation Requirements

- [ ] Inline documentation on all public members — not applicable (no code)
- [ ] File headers on all new source files — no new files; agent `.yaml` files do not carry a `Plan:` header convention (unlike `lib/decisions.js`), consistent with every other agent file in `agents/`
- [ ] README updated if user-facing — not applicable
- [ ] CHANGELOG entry written
- [ ] Both files' `version` fields bumped (minor) per Section 7 Design Decisions and reflected in the CHANGELOG entry

---

## 14. Risks & Open Questions

| # | Risk / Question | Type | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **`AIF-003-006` is being planned in parallel with this chunk, so its final section/anchor names within `skills/plan-lifecycle/SKILL.md` and `reference/commit-gate-procedure.md` are not yet verified.** Citing a specific heading now would risk a dangling reference once `006` lands. | Risk / Coordination point | M | This plan deliberately points both prompt rules at `skill/plan-lifecycle` generically (Design Decision 1), not at a specific anchor, so no fabricated anchor name is committed. Before implementation begins, confirm `AIF-003-006` has reached `Status: Approved` and briefly verify the ladder content actually lands in `skill/plan-lifecycle` (not a different skill) — if `006`'s approved plan relocates the ladder elsewhere, this chunk's prompt wording must be revised before implementation, not silently reconciled after. |
| 2 | **`agents/ai-engineer.yaml`'s `skills:` list includes `skill/ai-engineering-plan` but neither `skill/chunk-planning` nor `skill/plan-lifecycle`, despite AI-Engineer owning 6 of this Epic's 8 chunks and therefore authoring and following Chunk Plans (including this one).** This looks like a genuine agent/skill cross-reference gap, discovered while reading this chunk's required inputs. | Question | M | Not in this chunk's file ownership (`chunks.json` names only `agents/architect.yaml`, `agents/engineering-manager.yaml` for `008`) or in the Epic's Scope section — fixing it here would be undirected scope expansion (engineering-core Rule 4). Raised here and reported to the human/Tech-Lead for a decision on whether it becomes a follow-up chunk, a standalone Tier 1/2 AI-Engineer task, or is deferred. Not implemented as part of AIF-003-008. |
| 3 | Both new ladder-routing rules use identical wording across the two files ("check the amendment ladder documented in `skill/plan-lifecycle`"). If `AIF-003-007`'s ladder pointer (in `skill/decision-record`/`skill/decision-brief`) ends up phrased very differently, a future reader could see two similar-but-not-identical descriptions of the same routing decision. | Risk | L | Accepted — `007` and `008` are parallel wave-3 chunks with no dependency between them (`chunks.json`), and both point at the same source of truth (`skill/plan-lifecycle`) rather than restating the ladder's content, so drift in restatement wording carries no governance risk. No action needed. |

---

## 15. Work Log

[2026-08-25] [AI-Engineer] [Created] [AIF-003-008] [Chunk Plan drafted from Epic AIF-003 Section 9 and `chunks.json` (`008` depends on `006` only). Read both target files verbatim: confirmed `agents/architect.yaml:36` currently forbids Architect from ever setting `Status: Approved`/`Approved By` unconditionally, confirmed neither file currently lists `skill/plan-lifecycle` in `skills:`, and confirmed `agents/engineering-manager.yaml` has no equivalent set-but-do-not-commit restriction to remove or add — per Epic Section 5, that exception is scoped to Architect only. Complexity assessed as Tier 2 per `skill/complexity-tiers` (multi-file prompt edit following an already-decided pattern), but this plan is written as a full Chunk Plan artifact at the explicit direction of the dispatching task, matching AIF-003-001/002's structure rather than defaulting to `skill/chunk-planning`'s Tier 1/2 no-artifact path — noted explicitly in Section 3 rather than silently deviating from the skill's default. Deliberately avoided citing specific anchors inside `skill/plan-lifecycle` since `AIF-003-006` (this chunk's dependency) is being planned in parallel and its final section names are unverified — recorded as Risk 1 with an explicit pre-implementation coordination check. Found and reported, without fixing, a real gap in `agents/ai-engineer.yaml`'s `skills:` list (missing `skill/chunk-planning`/`skill/plan-lifecycle` despite owning most of this Epic's chunks) — recorded as Risk/Question 2, out of this chunk's file ownership per `chunks.json`.]
