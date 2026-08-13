# Explicit Commit Discipline & Plan-First-Commit Gate — Implementation Plan

> Status: Draft
> Created: 2026-08-13
> Approved by: Pending

---

## Goal

Make three things explicit and centralized in engineering steering/skills: (1) plans must be committed to git — as `Status: Draft`, updated each revision round, then `Approved` — before any implementation begins, in both project and framework repos; (2) implementation commits must be small and incremental rather than one large commit at the end; (3) the Draft → Approved commit-gate procedure and status vocabulary are defined once in a shared skill, not restated in every planning skill.

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `skills/plan-lifecycle/SKILL.md` | Create | New shared skill defining the commit-gate procedure (save as Draft → commit → revise → commit → Approve → commit) and the canonical status vocabulary |
| `skills/plan-lifecycle/reference/status-vocabulary.md` | Create | Single source of truth: core statuses (`Draft`, `Approved`, `Done`) plus documented per-artifact-type extensions (e.g. Decision Record's `Superseded`) |
| `skills/plan-lifecycle/reference/commit-gate-procedure.md` | Create | The step-by-step commit procedure other skills reference instead of restating |
| `steering/engineering/core.md` | Modify | Strengthen Rule 1, add new Rule 8 (plan-committed-first, points to `skill/plan-lifecycle`) and Rule 9 (incremental commits) |
| `steering/engineering/git-workflow-framework.md` | Modify | Add plan-commit-first rule (references `skill/plan-lifecycle` for mechanics) + commit granularity checkpoints |
| `steering/engineering/git-workflow-projects.md` | Modify | Promote existing plan-commit exception into an explicit rule referencing `skill/plan-lifecycle`; add commit granularity checkpoints |
| `skills/chunk-planning/SKILL.md` + `reference/template.md` | Modify | Status field becomes `Draft / Approved / Done`; Step 3 references `skill/plan-lifecycle` instead of restating "set status to Draft, wait for approval" |
| `skills/epic-planning/SKILL.md` + `reference/template.md` | Modify | Same status/reference change as chunk-planning |
| `skills/decision-record/SKILL.md` + `reference/template.md` | Modify | Status field becomes `Draft / Approved / Superseded` (was `Draft / Confirmed / Superseded` — renaming `Confirmed` → `Approved` for vocabulary consistency); Step 3 references `skill/plan-lifecycle` |
| `skills/ai-engineering-plan/SKILL.md` | Modify | Outputs — Tier 3 plans saved under `paths.plans`, status field `Draft / Approved / Done`, references `skill/plan-lifecycle` for the commit procedure |
| `docs/plans/commit-discipline-plan-gate-plan.md` (this file) | Modify | Add `Status: Done` value now that it's part of the canonical vocabulary this plan defines |
| Frontmatter `version` on all modified files | Modify | Minor version bump |

---

## Approach

1. **Create `skills/plan-lifecycle`.** A shared, agent-agnostic skill (no specific plan type, no specific agent) whose sole job is: given a plan/record artifact with a status field, (a) save + commit it as `Draft` before presenting for review, (b) commit each human-requested revision as a new commit before re-presenting, (c) commit the transition to `Approved` only after explicit human confirmation, (d) note that dependent work (implementation, chunk decomposition, superseding a decision) may not begin until the `Approved` commit exists. This is a procedure skill per `skill/skill-authoring` conventions — Purpose/Inputs/Steps/Outputs/Edge Cases, no agent or project specifics.

2. **Define the canonical status vocabulary in `skills/plan-lifecycle/reference/status-vocabulary.md`.**
   - Core (all artifact types use these three): `Draft` (not yet reviewed/still iterating), `Approved` (human explicitly confirmed, gate satisfied), `Done` (work described by the artifact is complete).
   - `In Progress` is dropped as a status value — "is this actively being worked" is answered by checking the orchestration state file (`paths.orchestration`), not by a status field on the plan itself. This avoids two sources of truth going stale relative to each other.
   - Per-type extension, documented explicitly rather than left as ad-hoc: Decision Record adds `Superseded` (a later decision replaced this one — not a lifecycle stage, a terminal outcome specific to decisions). No other current artifact type needs an extension.
   - Table format: `Artifact Type | Allowed Statuses | Notes`.

3. **Define the commit-gate procedure in `skills/plan-lifecycle/reference/commit-gate-procedure.md`.** Steps: create artifact with `Status: Draft` → commit → present to human → on requested changes, edit + commit again (new commit, never amend) → repeat until human explicitly approves → update `Status: Approved` (or artifact-appropriate terminal status) → commit → only this commit satisfies the gate for dependent work. Explicitly state: chat/verbal confirmation alone never satisfies the gate.

4. **`engineering/core.md` — Rule 1 amendment.** Add a bullet: "A plan is not 'approved' for implementation purposes until the `Approved` status has been committed to git per `skill/plan-lifecycle`. Verbal/chat confirmation alone does not satisfy this rule."

5. **`engineering/core.md` — new Rule 8: "Plans Are Committed Artifacts, Not Chat Output."** States the principle (every plan/record requiring human approval must go through the commit gate) and points to `skill/plan-lifecycle` for the mechanics, rather than restating them. Keeps core.md as the single normative statement of *why/when*, with the skill owning *how*.

6. **`engineering/core.md` — new Rule 9: "Commit Incrementally During Implementation."** Unchanged from prior draft — principle-level, defers checkpoint mechanics to the git-workflow files.

7. **`git-workflow-framework.md` / `git-workflow-projects.md` updates.** Both reference `skill/plan-lifecycle` for the commit-gate mechanics instead of restating Draft/Approved steps. Both add commit-granularity guidance (step 9 below). `git-workflow-projects.md` promotes its existing plans/orchestration/knowledge exception into a proper numbered rule.

8. **Update `chunk-planning`, `epic-planning`, `decision-record`, `ai-engineering-plan` skills.**
   - Each skill's "stop for approval" step is replaced with a one-line reference: "Follow the commit-gate procedure in `skill/plan-lifecycle`."
   - Each skill's template `Status` field row is updated to the vocabulary from step 2 (chunk/epic: `Draft / Approved / Done`; decision-record: `Draft / Approved / Superseded`; ai-engineering-plan: `Draft / Approved / Done`, and gains a Metadata table since `plan-schema.md` currently has none).
   - `decision-record`'s existing "Deferred" edge case (status "Deferred" for a deferred decision) needs a decision: fold into `Superseded`, or keep as a fourth allowed value. Flagged as an open question below rather than assumed.

9. **Commit granularity checkpoints — recommendation + options.** Unchanged from prior draft: recommend **Option A** (commit per completed plan step), with Option B (per file) and Option C (per validation checkpoint) presented as alternatives in the git-workflow files' guidance.

10. **Version bumps.** Minor bump on every modified file's frontmatter `version` (new skill starts at `0.1.0`).

---

## Open Questions

- **Does `decision-record`'s "Deferred" status fold into the new vocabulary, or stay as a fourth allowed value for that artifact type?** Deferred means "explicitly not decided now," which is different from `Superseded` (was decided, later replaced) and different from `Draft` (still being written). Recommendation: keep `Deferred` as a second per-type extension for Decision Records only (`Draft / Approved / Superseded / Deferred`), documented alongside `Superseded` in the status-vocabulary reference. Needs confirmation.
- **Should `skills/epic-planning`'s `chunks.json` (which currently has no status concept of its own — status lives in the Epic Plan doc) be touched at all?** Current read: no, `chunks.json` tracks chunk-level dependency/assignment data, not approval status — leave it out of scope. Confirm this reading is correct.

---

## Risks

- **Scope grew from "steering wording change" to "shared skill + 4 existing skill/template edits."** This is a direct result of your instruction to centralize rather than duplicate — flagging per Rule 4 (raise scope changes explicitly) rather than silently expanding. The original plan's Out of Scope section explicitly excluded touching chunk-planning/epic-planning/decision-record; this revision reverses that exclusion.
- **Renaming Decision Record's `Confirmed` → `Approved`** is a terminology change to an existing, already-used convention (3 existing decision records use `Confirmed`). Existing decision files won't be retroactively renamed by this plan (out of scope, see below) — only the template and skill wording change going forward, which means a transition period where old records say `Confirmed` and new ones say `Approved`. Flagging as a minor inconsistency risk, not blocking.
- **`skill/plan-lifecycle` becomes a dependency of 4+ other skills.** A future breaking change to it has wide blast radius. Mitigated by keeping it deliberately small (status vocabulary + commit procedure only, no other logic).

---

## Validation

- Read back all modified/created files, confirm frontmatter version bumps and that every reference to `skill/plan-lifecycle` resolves (skill exists, path correct).
- Confirm no planning skill still contains inline "set status to Draft, wait for approval" prose that duplicates the shared skill.
- Run `npm test`; check `tests/validation/` for any assertions on skill/steering content or cross-references that this touches.
- Verify the three existing `.decision.md` files under `docs/decisions/` still validate against the (updated) template's expectations, or confirm they're grandfathered explicitly.

---

## Out of Scope

- Retroactively renaming `Confirmed` → `Approved` in the three existing decision records under `docs/decisions/`. Only the template/skill wording changes going forward.
- Building tooling/automation to enforce the commit gate (e.g., a git hook). Steering/skill discipline only, unless requested as a follow-up.
- Touching `steering/global/core.md` or non-engineering domains.
- Changes to `chunks.json` schema/status handling (see Open Questions).

---

## Revision Note

This is a revision of the original single-file steering-wording plan, expanded per human direction to centralize the Draft/Approved commit-gate procedure and status vocabulary into a new `skill/plan-lifecycle` instead of duplicating it across `core.md`, both git-workflow files, and each planning skill individually.
