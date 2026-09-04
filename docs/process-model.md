# Process Model — Efficiency Rework

> Status: Draft
> Created: 2026-09-03
> Approved by: Pending

Target-state description of a lighter process, plus the transition plan to reach it.
Replaces the Epic→Chunk model and the tiered Decision-Record system.

---

## Goal

Proportionate ceremony. Current-state docs instead of accreting records. Coarser work
units. A tracker that surfaces state. Git holds history; agent context holds only what
is binding and current.

---

## Target model

### Work hierarchy

| Level | Was | Definition | Artifact | Gate |
|---|---|---|---|---|
| **Capability** | — (new) | A large-scale product function. Lifecycle: `Proposed → Active → Delivered → Deprecated → Removed`. | Index entry (name, one-paragraph charter, status, features, doc link) + `docs/product/{cap}.md`. | None — status change only. |
| **Feature** | Epic | A small, definable piece of a Capability, reviewable by a human in one pass. | Feature Plan. | One committed human approval. |
| **Task** | Chunk | One execution unit of a Feature. Same DAG / wave / worktree / pipeline machinery. | Row in `tasks.json` (+ optional short plan for software-track work). | Covered by the Feature's approval. |

- Capability is optional — a project that defines none has Features standing alone.
- Feature keeps today's Epic mechanics; Task keeps today's Chunk mechanics. Rename only.

### Task sizing

- A Task is a unit of review — roughly a focused half-day to a day, reviewable in one
  sitting — not the smallest mergeable diff.
- Split a Feature into multiple Tasks only for real parallelism, a hard dependency
  boundary, or an SE/AI track boundary. "Different files" is not a reason.
- Sequential work inside one Task is fine. Small Features may be a single Task, or skip
  `tasks.json` and go straight to implementation.

### Reference docs (current truth, not history)

- `docs/architecture/*` — one file per long-lived technical subsystem. Stable set.
- `docs/product/*` — one file per Capability. Churns with the capability lifecycle;
  archived when the capability is Deprecated.
- Each ~1 page. Outgrowing a page means the subsystem/capability should split.
- `aif index` generates a nav index for both, scoped like `knowledge/index.json`.
- Updating the affected doc is an acceptance criterion of any Feature that changes
  behavior, checked in review alongside tests.
- Bodies stay in git. Owners: `engineering-tech-writer` (architecture), product writer
  (product).

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, flat counter `AIF-ADR-001`, full options format |
| How the system / product works | The relevant `docs/architecture` or `docs/product` file |
| Process / tooling / convention change | No record — edit the skill/steering file; the commit + CHANGELOG line is the record |

- ADR scoped to one Capability is archived with it; foundational or cross-cutting ADRs
  attach to an architecture subsystem so they outlive any one capability.
- `complexity-tiers` and `plan-lifecycle` stay (trimmed). `decision-record` shrinks to
  the ADR-only format.

### Context rules

- Agents load the relevant reference-doc file(s) and index entries for their work area —
  always.
- Agents do not auto-load full ADR bodies, superseded reasoning, or historical narration.
- Decision records leave `knowledge/index.json` — one discovery index.
- No migration tables, "supersedes X because…", or point-in-time proposals in any
  artifact body. Those belong in commit messages.

### YouTrack (after the above lands)

- **Owns:** Capability/Feature/Task status, activity log (replaces the hand-authored
  orchestration log), hierarchy, dependency links for the board, PR links, escalations,
  dashboards and reports.
- **Does not own:** `tasks.json`, reference-doc bodies, ADR bodies, the nav index — all
  stay in git. A generated one-way Article mirrors the repo nav index for in-tracker
  navigation.
- Self-approval prevention: a YouTrack workflow rule if the free tier supports it, else a
  CI check that rejects an `Approved` flip authored by the AI identity.
- Prerequisite: verify free-tier custom fields + JS workflow rules on a throwaway
  instance before migrating.

---

## Existing artifacts

| Artifact | Disposition |
|---|---|
| `AIF-001`, `AIF-002`, `AIF-003` epics + their chunk plans | Done. Leave in place as history — no migration, no rename. |
| `AIF-004` (Draft — planning redesign) | Superseded by this document. Still-valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll into the work below. Mark `Superseded`. |
| Freeform `docs/plans/*.md` (`cli-plan`, `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-*`, `tech-lead-subagent-dispatch`, …) | Triage each: Done → move to `docs/plans/completed/`; real upcoming work → becomes a Feature; process/tooling change → fold into the skill/steering edit and delete; stale → delete. No new freeform plans after this. |
| `ai-engineering-plan` skill / "Tier 3 plan" concept | Retired. Small AI-component work runs under `complexity-tiers` (1/2); larger becomes a Feature. |
| 15 decision records | `ARCH-001/005/006` → fold into `docs/architecture/`, then archive. `ARCH-002/003/007` → keep as ADRs. `ARCH-004` → keep (live open ADR). `PROC-001/005` → move to `steering/`. `PROC-002/003/004/006` → absorb into orchestration skill text, archive. `PLAN-001` → close (already Deferred). `META-001/002` → survivors into `decision-record` skill, archive. |

Archived records and plans move to an `archive/` subfolder with status noted — not
deleted. Git plus a browsable trail is the audit record.

---

## Agent changes

Beyond a vocabulary sweep, several charters shift.

| Agent | Change |
|---|---|
| `architect` | Authors ADRs only (rare forks). `decision-triage` / tier / domain routing removed from the prompt. May contribute to `docs/architecture/*`. |
| `tech-lead` | Epic/Chunk decomposition → Feature planning + Task sizing (coarser). Per-Task detailed-plan authoring dropped. Capability awareness added. |
| `engineering-manager` | `AIF-META-001` Process-domain decision-authoring charter removed — process changes are no longer decisions. Orchestration prompt: chunk → task. |
| `engineering-tech-writer` | Gains explicit ownership of `docs/architecture/*` upkeep, enforced as a Feature acceptance gate. |
| `principal-engineer` | Review criteria add "affected reference doc updated". "Governing plan" wording → Feature Plan. |
| `test-engineer` | Test modes renamed: epic-acceptance → feature-acceptance, chunk-level → task-level. |
| `software-engineer` / `ai-engineer` | Task vocabulary. `ai-engineer`'s Tier 3 / `ai-engineering-plan` path removed. |
| Product-doc owner | `docs/product/*` and the Capability index need an owning agent — an existing one or a new product writer (the reserved "Project-Manager" slot). Decided in step 2. |

`skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` also get a pass
for stale decision-system references.

---

## Implementation checks

| # | Check |
|---|---|
| 1 | `docs/architecture/` and `docs/product/` exist, each with an index and a one-page file template. |
| 2 | `aif index` emits a nav index for architecture + product docs, scoped like `knowledge/index.json`. |
| 3 | Capability index format is defined (name, charter, status, features, doc link) with the four-state status vocabulary. |
| 4 | `epic-planning` becomes `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 5 | `chunk-orchestration`: `chunks.json` → `tasks.json`, per-Task plan gate removed, pipeline shape read from tier. |
| 6 | DAG server + `lib` renamed chunk→task; wave output is identical for an equivalent graph. |
| 7 | `decision-triage`, `decision-brief`, `chunk-planning`, `ai-engineering-plan` skills deleted and all references removed. |
| 8 | `decision-record` reduced to the flat ADR format; `plan-lifecycle` and `complexity-tiers` trimmed. |
| 9 | `steering/engineering/core.md` Rules 1/8/9 reworded to "governing Feature Plan"; `knowledge-consumption.md` drops decision-record loading; doc-update acceptance gate added. |
| 10 | Agent YAMLs updated per the Agent changes table — vocabulary, removed skill pointers, and charter shifts. |
| 11 | Product-doc + Capability-index ownership assigned to an agent (existing or new); `skill/agent-authoring` and the extraction-candidates file swept. |
| 12 | Existing decision records dispositioned per the table above; archive location created. |
| 13 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 14 | `tests/validation/` cross-reference check passes against the new skill/doc set; `npm test` green. |
| 15 | `bundles/engineering/snapshot.json` regenerated. |
| 16 | `README.md`, `PLAN.md`, `AGENTS.md`, `install.ps1` updated for the new model. |

---

## Sequencing

1. Land the reference-doc structure + `aif index` extension (checks 1–3).
2. Vocabulary + skill + agent sweep in one pass — feature/task rename, skill deletions,
   steering rewrites, agent charter changes, product-doc owner decision (checks 4–11, 14–16).
3. Disposition existing records and plans (checks 12–13).
4. YouTrack — verify free-tier capability, then migrate Capability/Feature/Task tracking.
   Grandfather `AIF-001/002/003`.

Steps 1–3 are the "start being efficient" core and do not depend on YouTrack.
