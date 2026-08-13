# Explicit Commit Discipline & Plan-First-Commit Gate — Implementation Plan

> Status: Draft
> Created: 2026-08-13
> Approved by: Pending

---

## Goal

Make two things explicit and mandatory in engineering steering: (1) plans must be
committed to git — as `Status: Draft`, updated each revision round — before any
implementation begins, in both project and framework repos; (2) implementation
commits must be small and incremental rather than one large commit at the end.

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `steering/engineering/core.md` | Modify | Strengthen Rule 1, add new Rule 8 (plan-committed-first) and Rule 9 (incremental commits) |
| `steering/engineering/git-workflow-framework.md` | Modify | Add plan-commit-first rule (currently absent) + commit granularity checkpoints |
| `steering/engineering/git-workflow-projects.md` | Modify | Promote existing plan-commit exception into an explicit numbered rule; add commit granularity checkpoints |
| `skills/ai-engineering-plan/SKILL.md` | Modify | Change Outputs — Tier 3 plans must be saved under `paths.plans` and committed (Draft → revisions → Approved), not just presented inline |
| Frontmatter `version` on all 4 files above | Modify | Minor version bump (new rules added, not breaking existing ones) |

---

## Approach

1. **`engineering/core.md` — Rule 1 amendment.** Add a bullet: "A plan is not
   'approved' for implementation purposes until it has been committed to git with
   `Status: Approved`. Verbal/chat confirmation alone does not satisfy this rule."
   This closes the gap where an agent could get a "yes, go ahead" in conversation
   without the plan ever existing as a durable, reviewable artifact.

2. **`engineering/core.md` — new Rule 8: "Plans Are Committed Artifacts, Not Chat
   Output."**
   - Every plan requiring human approval (Chunk Plan, Epic Plan, or a Tier 3
     `ai-engineering-plan`) must be saved to the repo's configured plan path and
     committed with `Status: Draft` before being presented for review.
   - Each round of human-requested revision is committed as a new revision (not
     squashed/amended) before re-presenting, preserving the Draft → feedback →
     Draft → ... history.
   - Once the human explicitly approves, the agent updates `Status: Approved` and
     commits that change. That commit is the actual gate — implementation may not
     start before it exists.
   - This applies uniformly in framework and project repos (framework repos commit
     straight to main; project repos commit plans to main directly per the existing
     branch exception).
   - Rationale ties directly to Rule 1: makes "approved" objectively checkable
     (git log) instead of relying on conversational memory.

3. **`engineering/core.md` — new Rule 9: "Commit Incrementally During
   Implementation."**
   - Principle-level rule: implementation of an approved plan must be committed in
     small, logically atomic increments as work progresses — not accumulated into a
     single commit at the end.
   - Defers exact mechanics/checkpoints to the git-workflow file for the repo type,
     since framework and project repos differ (direct-to-main vs. feature branch).
   - Rationale: small commits make review, bisection, and recovery from a bad step
     far cheaper; batching everything into one commit defeats the purpose of atomic
     commits already required by the git-workflow rules.

4. **`git-workflow-framework.md` — add rule: "Plans committed before
   implementation."**
   - New rule (inserted after existing rule 1, renumbering): "Before implementing an
     approved plan, the plan file must already exist in the repo at `paths.plans`
     (or presented and committed inline as a plan doc if no formal plan path is
     configured) with `Status: Approved`. The commit implementing the plan must be
     separate from and after the plan's approval commit."
   - Add commit-granularity guidance (see step 6 for checkpoint options — same
     checkpoints apply here since framework repos still commit directly, just
     without branches/PRs).

5. **`git-workflow-projects.md` — promote plan-commit exception to a rule + add
   granularity.**
   - Move the current "Exceptions" bullet about plans/orchestration/knowledge into
     the numbered **Rules** section (it's a mandatory workflow step, not an
     edge-case exception) — e.g., new rule under a "Plans" subheading before
     "Branching."
   - Add explicit Draft/Approved status commit checkpoints matching core.md Rule 8.
   - Add commit granularity checkpoints (step 6) alongside the existing
     atomic-commit rule (rule 4), since "atomic" currently isn't tied to a concrete
     checkpoint frequency.

6. **Commit granularity checkpoints — recommendation + options.** Recommended:
   **Option A**.

   - **Option A (recommended): Commit per completed plan step.** Each numbered step
     in the approach section of the plan (or each task in a Chunk Plan's task list)
     is its own commit once that step's work is verified (tests pass /
     self-validation done for that step). Pros: directly traceable to the plan,
     natural granularity already exists, easy for agents to reason about ("done
     with step 3, commit"). Cons: some steps may still be large if the plan wasn't
     broken down finely.
   - **Option B: Commit per file created/modified.** One commit per file touched.
     Pros: maximal granularity, trivial to reason about. Cons: can produce noisy
     history where a single conceptual change spans a file and its test — those
     really belong together, so this risks non-atomic-feeling splits or awkward
     "fixup" commits.
   - **Option C: Commit per passing validation checkpoint.** Commit whenever tests
     are run and pass (unit test file + implementation together, e.g.). Pros:
     guarantees every commit is in a working state. Cons: coarser than A if a plan
     step doesn't have its own test run, finer than A if steps bundle multiple test
     cycles.

   Option A aligns best with the existing plan-first-commit gate (this plan) and
   with Rule 2 (every artifact references its Plan ID) — commits naturally map to
   plan steps, which already carry the Plan ID.

7. **Update `skills/ai-engineering-plan/SKILL.md`.** Change the Outputs section from
   "presented inline (not saved as a file unless the human requests it)" to: plan is
   saved under `paths.plans` (fallback: `docs/plans/` if unset) with
   `Status: Draft`, committed, then re-committed on each revision, and committed as
   `Status: Approved` once the human confirms — mirroring Chunk Plan status
   conventions. Add a status field/table to the plan (reusing the Chunk Plan
   template's `Status` field convention) since currently `plan-schema.md` has no
   status/metadata table at all.

8. **Version bumps.** Bump `version` in frontmatter of all 4 modified files (minor
   bump — additive rules, not removing/breaking existing ones, e.g. `core.md`
   0.2.0 → 0.3.0, `git-workflow-framework.md` 0.3.0 → 0.4.0,
   `git-workflow-projects.md` 0.2.0 → 0.3.0, `ai-engineering-plan` 0.1.0 → 0.2.0).

---

## Open Questions

- **Plan file location for `ai-engineering-plan` Tier 3 plans in repos with no
  `paths.plans` configured** (e.g., if a repo's `.aiconfig.json` omits it).
  Proposed default: `docs/plans/` if the key is absent, matching this repo's own
  convention. Flag but don't block — use `docs/plans/` as the fallback unless told
  otherwise.

---

## Risks

- **Process weight increase.** This adds a real gate (git-committed Draft/Approved
  plan) where previously a chat approval sufficed, and adds commit-checkpoint
  discipline. Intentional per human direction — noted here so it's visible in the
  artifact history, not just the conversation.
- **Cross-file consistency drift.** Because the same convention (Draft → Approved
  commit gate) is now stated in `core.md`, both git-workflow files, and the
  `ai-engineering-plan` skill, there's duplication risk if one is updated later
  without the others. Mitigated by having `core.md` state the principle once and
  the other files reference it rather than restate it fully.
- **Existing Chunk Plan template already has `Status`** — no schema conflict there.
  The only real gap being closed is that `ai-engineering-plan` (Tier 3, non-code AI
  component plans) had no status/commit convention at all.

---

## Validation

- Read back all 4 modified files, confirm frontmatter version bumps and no
  orphaned cross-references (e.g., `core.md` still correctly points to the two
  git-workflow files by name).
- Run existing test suite (`npm test`) to confirm nothing else depends on the
  current wording (unlikely, but steering files aren't typically test-covered —
  check `tests/validation/` for any steering-content assertions).
- Manually verify no contradiction between "framework repos commit directly to
  main" and the new "plan must be committed before implementation" rule (i.e., the
  plan commit and the implementation commit are still both just commits to main —
  no branch/PR implied for framework repos).

---

## Out of Scope

- Not changing the Chunk Plan / Epic Plan template or `chunk-planning`/
  `epic-planning` skills — they already have a `Status` field convention; this plan
  only extends that same convention to the previously-unstatus'd Tier 3
  `ai-engineering-plan`.
- Not building tooling/automation to enforce the commit gate (e.g., a git hook
  blocking implementation commits without a preceding Approved plan commit) — this
  is a steering/process rule enforced by agent discipline and human review, not a
  technical control, unless requested as a follow-up.
- Not touching `steering/global/core.md` or other domains (product, etc.) — scoped
  to engineering domain only, since that's where the Chunk Plan / git-workflow
  rules live.
