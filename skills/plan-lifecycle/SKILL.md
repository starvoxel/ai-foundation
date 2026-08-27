---
name: "plan-lifecycle"
version: "0.2.0"
description: "Shared commit-gate procedure and status vocabulary for any artifact requiring human approval before dependent work begins."
---

## Purpose

Defines, in one place, how a human-approval-gated artifact (Chunk Plan, Epic Plan, Decision Record, or a Tier 3 `ai-engineering-plan`) moves from first draft to a state that other work is allowed to depend on. Other planning skills reference this skill instead of restating the procedure.

Use this skill whenever a skill produces an artifact with a `Status` field that a human must approve before implementation, decomposition, or any other dependent work may proceed.

---

## Inputs

- **Artifact file path** — where the plan/record lives (per the producing skill's `Outputs` section and the project's `.aiconfig.json` `paths.*` configuration)
- **Artifact type** — Chunk Plan, Epic Plan, Decision Record, or Tier 3 plan (determines which status values from `reference/status-vocabulary.md` are valid). For Decision Records specifically, the artifact's `Tier` field (assigned by `skill/decision-triage`) determines which gate variant applies — see "Decision Record Tier Variants" below.
- **Current lifecycle stage** — first draft, a revision round, or a final human decision

---

## Steps

### Step 1 — Save as Draft and commit

Write the artifact to its configured path with `Status: Draft` and, where the template has one, `Approved by: Pending` (or the artifact's equivalent field). Commit it via `ai-git` before presenting it to the human. A plan that only exists in chat is not a plan for the purposes of any steering rule that requires "an approved plan."

### Step 2 — Present for review

Present the artifact to the human for feedback. Do not begin implementation, decomposition, or any dependent work while status is `Draft`.

### Step 3 — Commit each revision

If the human requests changes, edit the artifact and commit again as a new commit (never amend, never squash the history of a plan under review). Status remains `Draft` through as many revision rounds as needed. Each revision's commit message should make clear it is a plan revision (e.g. "Revise plan: ...").

### Step 4 — Commit the human's decision

Once the human gives an explicit decision, update the `Status` field and commit that change as its own commit, separate from any implementation:

- **Approved** — the human explicitly confirmed. This is the only status that satisfies an "approved plan" gate elsewhere in steering. Update the approver field (e.g. `Approved by: {name}`) in the same commit.
  If the artifact type is a Decision Record, `Superseded` (from `reference/status-vocabulary.md`) is a state the record moves to later, not a decision made at this step.
- **Deferred** — the human explicitly chose to postpone. This is not an approval; see Edge Cases.

Verbal or chat-only confirmation never satisfies the gate — only the committed `Approved` status does.

### Step 5 — Mark Done when the described work completes

When the work the artifact describes is finished (implementation merged, decision fully acted on, etc.), update `Status: Done` and commit. This is informational — it is not itself a gate for anything downstream, but it keeps the artifact's status accurate for future readers.

---

### Decision Record Tier Variants

*(AIF-002-004)* AIF-META-001 (Decision ID) introduced three rigor Tiers for Decision Records — A (Researched), B (Structural), C (Embedded). This skill does not redefine what those Tiers mean; see AIF-META-001's Design section Tier table (`docs/decisions/meta-process/AIF-META-001_decision-record-tiering-and-domain-ownership.decision.md`) for the source of truth. What follows is how the commit-gate procedure above differs once a Tier has already been assigned (by `skill/decision-triage`):

- **Tier A** — no change. A Tier A Decision Record follows Steps 1-5 above exactly as already documented, the same as a Chunk Plan or Epic Plan.
- **Tier B** — abbreviated gate: Draft (Step 1) → present for review (Step 2) → one round of human confirmation → Approved (Step 4), with no expected multi-round revision cycle. This does not remove Step 3 (revision) — if the human requests a change, follow Step 3 exactly as for Tier A. "Abbreviated" describes the *expected* number of rounds, not a relaxation of the approval requirement itself: Step 4's committed `Approved` status is still mandatory before dependent work may proceed.
- **Tier C** — not a gate at all. A Tier C decision is never presented to this skill as a standalone artifact — it has no `Status` field of its own. It is recorded inline in the governing plan (per `skill/chunk-planning`/`skill/epic-planning`) and is fully covered by that plan's own Draft → Approved cycle; consult the governing plan's status, not a separate one.

Tier A and Tier B Decision Records must also update `{paths.decisions}/index.json` as part of producing or updating the record — see `skill/decision-record`/`skill/decision-brief` for that step's own procedure. This skill's commit-gate applies in addition to, not instead of, that requirement; `plan-lifecycle` does not own or duplicate the index-update step itself.

---

### Decision Record Amendment Ladder

*(AIF-003-006)* Scoped to Decision Records only, alongside the Tier scoping above. Once a Decision Record reaches `Approved`, not every subsequent change needs the full Draft → Approved cycle again — `AIF-META-001`/`AIF-META-002` define a three-rung ladder for post-approval change, on top of (not instead of) the Tier variants above:

- **Errata** — the change provably leaves the rendered meaning of a substantive section unchanged (e.g. a typo, a broken link, an ID renumbering where the referent is identical). Ungated: anyone may make it, in a single commit, with no `Status` change.
- **Amendment** — the change alters the record, but the original rationale still holds. Gated: domain owner only, `Status: Amending` for the duration, resolved by a two-commit sequence (propose, then confirm or reject).
- **Supersede** — the original rationale no longer holds, or the decision reverses. Neither errata nor amendment applies; this is the existing `Status: Superseded` + new record path, unchanged by this section.

The one-line test for choosing between them: does this provably leave the rendered meaning of a substantive section unchanged? If yes, errata. If no, but the original rationale still holds, amendment. If the rationale no longer holds, supersede.

`Amending` is a Decision-Record-only status (see `reference/status-vocabulary.md`, added by `AIF-003-004`). No gate anywhere special-cases it; every gate continues to check positively for `Approved` only, exactly as it already does for `Draft` and `Deferred`.

For the amendment gate's second (confirm/reject) commit: the agent commits the transition after the human decides, exactly as Step 4 already describes for every other artifact type — any agent-specific exception is documented in that agent's own definition, not here.

See `reference/commit-gate-procedure.md` → Decision Record Amendment Ladder for the rung-selection table, the errata test, and the exact two-commit sequence.

---

## Outputs

- A committed artifact whose `Status` field accurately reflects `Draft`, `Approved`, `Done`, `Deferred`, or (Decision Records only) `Superseded` at all times — see `reference/status-vocabulary.md`.
- A git history that shows the full Draft → revision → revision → Approved (or Deferred) progression as separate commits.

---

## Edge Cases

- **Human says "just do it" / approves verbally in chat only** — still requires the committed `Approved` status update before implementation starts. Do the commit first, then proceed.
- **Human wants to defer rather than approve or reject** — set `Status: Deferred` and commit. A `Deferred` artifact is not approved; nothing may treat it as satisfying an approval gate. It can later be revisited (moved back to `Draft`) or approved directly from `Deferred`.
- **Checking whether a specific piece of dependent work may proceed** — check only for `Status: Approved` on the governing artifact. Do not add special-case handling for `Deferred`, `Draft`, or any other non-`Approved` value — the absence of `Approved` is sufficient by itself to block dependent work.
- **Repo has no `paths.plans` (or equivalent) configured in `.aiconfig.json`** — fall back to `docs/plans/` for Tier 3 plans; Chunk/Epic Plans and Decision Records use their own skills' documented path defaults.
- **Framework repo (direct commits to main)** — the commit gate still applies. There is no branch/PR step, but the Draft and Approved commits must still exist as separate, real commits on `main` before implementation commits follow.
- **Decision Record with Tier B** — the abbreviated gate applies (see Decision Record Tier Variants above): commit Draft, present for one round of human confirmation, commit Approved. A multi-round revision cycle is not expected but is not prohibited if the human requests changes — if it happens, follow Steps 2-3 exactly as for Tier A.
