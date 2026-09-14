---
name: 'git-workflow-projects'
version: '0.3.1'
description: 'Git workflow for project repositories where agents produce code.'
file_patterns: []
---

## Scope

All agents working in repositories where `.aiconfig.json` specifies `"repo_type": "project"` (this is the default when `repo_type` is not set).

---

## Rules

### Plans

1. **Plans, orchestration state, and knowledge are committed directly to main, before implementation begins.** Files under `paths.plans`, `paths.orchestration`, and `paths.knowledge` are planning and reference artifacts, not deployable code — they do NOT require a branch or PR. Follow `skill/plan-lifecycle` for the full procedure:
   - Commit and push each version to main BEFORE presenting it to the human for review (Draft, each revision, and the final Approved/Deferred decision are all separate commits).
   - Atomic commits: one plan or one logical change per commit.
   - Include the Plan ID or document name in the commit message.
   - The human approval step is the review conversation; the `Approved` status commit is what actually satisfies the gate — the conversation alone does not.
2. **Implementation must not begin until the governing plan's `Approved` commit exists on main.** A `Draft` or `Deferred` plan does not satisfy this — see `steering/engineering/core.md` Rule 1 and Rule 8.

### Branching

3. **All work happens on a branch.** Never commit directly to `main` (except plans/orchestration/knowledge per Rule 1 above).
4. **Branch naming:** `{plan-id}/{short-description}` (e.g. `PROJ-001/add-user-service`).
5. **One chunk plan per branch.** Do not mix unrelated work.

### Commits

6. **Commits must be atomic.** One logical change per commit. Imperative mood, <70 chars.
7. **Commit implementation incrementally.** Do not batch an entire chunk's implementation into a single commit. Recommended checkpoint: one commit per completed plan step or task, once that step's work is verified (tests pass / self-validation done). See "Commit Granularity" below for alternative checkpoints.
8. **Never force push.** No `--force` or `--amend` on pushed commits.
9. **Include Plan ID** in the first commit message on a branch.

### Commit Granularity

Pick one checkpoint and apply it consistently within a single chunk's implementation:

- **Option A (recommended): Commit per completed plan step/task.** Each task in the Chunk Plan's task list is its own commit once verified. Directly traceable to the plan; commits naturally carry the Plan ID (Rule 6/Rule 2 of `core.md`).
- **Option B: Commit per file created/modified.** Maximal granularity, but risks splitting a file and its test into separate commits when they belong together.
- **Option C: Commit per passing validation checkpoint.** Commit whenever tests are run and pass. Guarantees every commit is in a working state, but granularity may not align with plan steps.

### Merging

10. **Main is always deployable.** Do not merge broken code.
11. **Squash merge preferred.** Keeps main history clean.
12. **Delete branch after merge.**
13. **Human reviews and merges every PR.** No agent may merge to main.

### AI Identity

14. **Use `ai-git` for all git and GitHub operations.** Never use `git` or `gh` directly. `ai-git` reads `.aiconfig.json`, injects identity env vars, and authenticates push/PR operations automatically. If `ai-git` reports a missing prerequisite (no `.aiconfig.json`, no token env var), the agent must stop and report it to the human.
15. **Never log or echo the token value.** Reference it by env var name only.

---

## Rationale

Branches contain blast radius. Human-only merges ensure nothing ships without oversight. `ai-git` ensures all agent git operations use a separate AI identity and credentials, so PRs clearly show AI-authored work and enforce that a different user (the human) must review and approve. Plans are committed ahead of implementation so the approval gate is a verifiable git artifact rather than a claim, and implementation is committed incrementally so a squash-merged PR's construction can still be reviewed commit-by-commit before it lands.

## Exceptions

- Trivial fixes (typos, comment corrections) may use a branch without a full plan but still require a PR and human merge.
