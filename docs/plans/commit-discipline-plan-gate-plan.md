# Explicit Commit Discipline & Plan-First-Commit Gate — Implementation Plan

> Status: Draft
> Created: 2026-08-13
> Approved by: Pending

---

## Goal

Make three things explicit and centralized in engineering steering/skills: (1) plans must be committed to git — as `Status: Draft`, updated each revision round, then `Approved` — before any implementation begins, in both project and framework repos; (2) implementation commits must be small and incremental rather than one large commit at the end; (3) the Draft/Approved/Done/Deferred commit-gate procedure and status vocabulary are defined once in a shared skill, not restated in every planning skill.

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `skills/plan-lifecycle/SKILL.md` | Create | New shared skill defining the commit-gate procedure and the canonical status vocabulary |
| `skills/plan-lifecycle/reference/status-vocabulary.md` | Create | Single source of truth: core statuses (`Draft`, `Approved`, `Done`, `Deferred`) plus documented per-artifact-type extensions (e.g. Decision Record's `Superseded`) |
| `skills/plan-lifecycle/reference/commit-gate-procedure.md` | Create | The step-by-step commit procedure other skills reference instead of restating |
| `steering/engineering/core.md` | Modify | Strengthen Rule 1, add new Rule 8 (plan-committed-first, points to `skill/plan-lifecycle`) and Rule 9 (incremental commits) |
| `steering/engineering/git-workflow-framework.md` | Modify | Add plan-commit-first rule (references `skill/plan-lifecycle` for mechanics) + commit granularity checkpoints |
| `steering/engineering/git-workflow-projects.md` | Modify | Promote existing plan-commit exception into an explicit rule referencing `skill/plan-lifecycle`; add commit granularity checkpoints |
| `skills/chunk-planning/SKILL.md` + `reference/template.md` | Modify | Status field becomes `Draft / Approved / Done / Deferred`; Step 3 references `skill/plan-lifecycle` |
| `skills/epic-planning/SKILL.md` + `reference/template.md` | Modify | Same status/reference change as chunk-planning |
| `skills/decision-record/SKILL.md` + `reference/template.md` | Modify | Status field becomes `Draft / Approved / Done / Deferred / Superseded` (was `Draft / Confirmed / Superseded`); `Confirmed By` field renamed to `Approved By`; Step 3 references `skill/plan-lifecycle` |
| `skills/ai-engineering-plan/SKILL.md` | Modify | Outputs — Tier 3 plans saved under `paths.plans`, status field `Draft / Approved / Done / Deferred`, references `skill/plan-lifecycle` |
| `skills/chunk-orchestration/SKILL.md` | Modify | Step 1 adds explicit check: Epic Plan `Status` must be `Approved` before reading `chunks.json`. New edge case for a chunk plan whose `Status` is `Deferred` (distinct handling from `Blocked`/unapproved) |
| `agents/engineering-manager.yaml` | Modify | Hard rule referencing Decision Record `Status "Confirmed"` / `"Confirmed By"` updated to `"Approved"` / `"Approved By"`; clarify that a `Deferred` chunk plan is treated like an unapproved plan for dispatch purposes (never dispatched) but is a distinct, non-blocking state |
| `docs/plans/commit-discipline-plan-gate-plan.md` (this file) | Modify | Adopts the vocabulary it defines |
| Frontmatter `version` on all modified files | Modify | Minor version bump |

---

## Approach

1. **Create `skills/plan-lifecycle`.** A shared, agent-agnostic skill (no specific plan type, no specific agent) whose sole job is: given a plan/record artifact with a status field, (a) save + commit it as `Draft` before presenting for review, (b) commit each human-requested revision as a new commit before re-presenting, (c) commit the transition to `Approved` (or `Deferred`, if the human chooses to postpone rather than approve/reject) only after explicit human decision, (d) note that dependent work may not begin until the `Approved` commit exists — a `Deferred` artifact blocks the same way an un-approved one does, it just carries an explicit, intentional reason rather than being merely unreviewed.

2. **Define the canonical status vocabulary in `skills/plan-lifecycle/reference/status-vocabulary.md`.**
   - Core (all artifact types use these four): `Draft` (still being written/iterated), `Approved` (human explicitly confirmed, gate satisfied, dependent work may proceed), `Done` (work described by the artifact is complete), `Deferred` (explicitly postponed by human decision — distinct from `Draft`, which implies active iteration, and distinct from `Blocked`/orchestration-level states, which are execution-time, not plan-approval-time).
   - `In Progress` remains dropped — orchestration state answers "is this actively being worked," not the plan's own status field.
   - Per-type extension: Decision Record adds `Superseded` (a later decision replaced this one — a terminal outcome, not a lifecycle stage). No other current artifact type needs an extension.
   - Table format: `Artifact Type | Allowed Statuses | Notes`.
   - Explicitly document: `Deferred` can apply mid-planning (e.g., an Epic or Chunk Plan shelved for later) as well as to a Decision Record. A `Deferred` artifact can be revisited and moved to `Draft` again, or later `Approved`.

3. **Define the commit-gate procedure in `skills/plan-lifecycle/reference/commit-gate-procedure.md`.** Steps: create artifact with `Status: Draft` → commit → present to human → on requested changes, edit + commit again (never amend) → repeat until the human decides `Approved` or `Deferred` → commit that status transition → only an `Approved` commit satisfies the gate for dependent work; a `Deferred` commit explicitly halts dependent work with a documented reason (not silently). Chat/verbal confirmation alone never satisfies the gate.

4. **`engineering/core.md` — Rule 1 amendment.** Add a bullet: "A plan is not 'approved' for implementation purposes until the `Approved` status has been committed to git per `skill/plan-lifecycle`. Verbal/chat confirmation alone does not satisfy this rule. A `Deferred` plan is not approved and must not be implemented."

5. **`engineering/core.md` — new Rule 8: "Plans Are Committed Artifacts, Not Chat Output."** States the principle and points to `skill/plan-lifecycle` for mechanics.

6. **`engineering/core.md` — new Rule 9: "Commit Incrementally During Implementation."** Unchanged — principle-level, defers checkpoint mechanics to the git-workflow files.

7. **`git-workflow-framework.md` / `git-workflow-projects.md` updates.** Both reference `skill/plan-lifecycle` for commit-gate mechanics instead of restating. Both add commit-granularity guidance (step 10 below). `git-workflow-projects.md` promotes its existing plans/orchestration/knowledge exception into a numbered rule.

8. **Update `chunk-planning`, `epic-planning`, `decision-record`, `ai-engineering-plan` skills.**
   - Each skill's "stop for approval" step becomes a reference: "Follow the commit-gate procedure in `skill/plan-lifecycle`."
   - Each template's `Status` field row updates to: chunk/epic `Draft / Approved / Done / Deferred`; decision-record `Draft / Approved / Done / Deferred / Superseded`; ai-engineering-plan `Draft / Approved / Done / Deferred` (gains a Metadata table since `plan-schema.md` currently has none).
   - Decision Record's `Confirmed By` field renamed `Approved By` to match the renamed status.

9. **`chunk-orchestration` + `engineering-manager` — validate and close the status-check gap.**
   - **Validated as already correct:** `chunk-orchestration` Step 2.1 ("Verify the chunk plan exists and is approved") and `engineering-manager`'s hard rule ("Never dispatch without an approved chunk plan") already gate dispatch on Chunk Plan approval. No change needed there.
   - **Gap found and closed:** `chunk-orchestration` Step 1 (Initialize) reads `chunks.json` without first explicitly verifying the parent Epic Plan's `Status` is `Approved`. Add an explicit check as Step 1.0: read the Epic Plan, confirm `Status: Approved` before proceeding; if not, stop and report rather than reading `chunks.json`.
   - **Gap found and closed:** neither `chunk-orchestration` nor `engineering-manager` currently define behavior for a Chunk Plan whose `Status` is `Deferred`. Add an edge case: treat identically to "not approved" for dispatch purposes (never dispatched), but record it distinctly in orchestration state (e.g., chunk state `Deferred`, not `Blocked`) and do not raise an escalation — deferral was an intentional human decision, not a failure.
   - Update `engineering-manager.yaml`'s hard rule referencing Decision Record `Status "Confirmed"` / `"Confirmed By"` to `"Approved"` / `"Approved By"`.

10. **Commit granularity checkpoints — recommendation + options.** Unchanged: recommend **Option A** (commit per completed plan step), with Option B (per file) and Option C (per validation checkpoint) as alternatives.

11. **Version bumps.** Minor bump on every modified file's frontmatter `version` (new skill starts at `0.1.0`).

---

## Open Questions

None remaining — prior open questions resolved: `Deferred` is now a first-class core status (not DR-only), and `chunks.json` remains untouched (confirmed out of scope; it holds dependency/assignment data, not approval status).

---

## Risks

- **Scope grew from "steering wording change" to "shared skill + 4 planning skills + orchestration skill + 1 agent definition."** Flagging per Rule 4 rather than silently expanding — this is a direct, intentional result of centralizing the convention and closing a validation gap you asked about.
- **Renaming Decision Record's `Confirmed` → `Approved`** is a terminology change to an existing convention (3 existing decision records use `Confirmed`/`Confirmed By`). Existing files are not retroactively renamed (see Out of Scope) — only template/skill wording changes going forward, and `engineering-manager.yaml`'s hard rule must be updated in lockstep so it doesn't silently stop matching new records (or start rejecting old ones — see Validation).
- **`skill/plan-lifecycle` becomes a dependency of 5+ components** (4 planning skills + orchestration references it indirectly via the status vocabulary). Mitigated by keeping it deliberately small.
- **`Deferred` chunk/epic handling is new orchestration behavior**, not just a wording change — slightly higher implementation risk than the rest of this plan, since it touches a stateful process (`chunk-orchestration`) rather than static docs. Worth explicit test/validation attention.

---

## Validation

- Read back all modified/created files, confirm frontmatter version bumps and that every reference to `skill/plan-lifecycle` resolves.
- Confirm no planning skill still contains inline "set status to Draft, wait for approval" prose duplicating the shared skill.
- Confirm `engineering-manager.yaml`'s Decision-Record-status hard rule matches the renamed `Approved` / `Approved By` fields, and that it still correctly excludes `Draft`, `Deferred`, and `Superseded` decision records.
- Trace through `chunk-orchestration` Step 1 and Step 2 manually against a hypothetical Epic with one `Deferred` chunk to confirm the new edge case behaves as described (chunk stays `Deferred`, not `Blocked`, no escalation raised, other chunks proceed normally).
- Run `npm test`; check `tests/validation/` for any assertions on skill/steering/agent content or cross-references that this touches.
- Verify the three existing `.decision.md` files under `docs/decisions/` are explicitly grandfathered (their `Confirmed`/`Confirmed By` wording is not treated as invalid by any tooling or agent rule going forward).

---

## Out of Scope

- Retroactively renaming `Confirmed` → `Approved` (or `Confirmed By` → `Approved By`) in the three existing decision records under `docs/decisions/`. Only the template/skill/agent wording changes going forward.
- Building tooling/automation to enforce the commit gate (e.g., a git hook). Steering/skill discipline only, unless requested as a follow-up.
- Touching `steering/global/core.md` or non-engineering domains.
- Changes to `chunks.json` schema (status remains out of that file; it is not a per-artifact approval record).

---

## Revision Note

Second revision. Original scope was a single steering-wording change. First revision centralized the commit-gate procedure and status vocabulary into a new `skill/plan-lifecycle`. This revision: (a) promotes `Deferred` to a first-class core status applicable to all plan types, not just Decision Records, and (b) validates and closes a gap in `chunk-orchestration`/`engineering-manager` around checking plan approval status before using `chunks.json`, plus updates `engineering-manager.yaml`'s hard-coded reference to the old `Confirmed` status wording.
