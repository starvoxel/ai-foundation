---
name: 'git-workflow-projects'
version: '0.5.0'
description: 'Git workflow for project repositories where agents produce code.'
file_patterns: []
---

## Scope

All agents working in repositories where `.aiconfig.json` specifies `"repo_type": "project"` (this is the default when `repo_type` is not set).

**Also see `steering/engineering/git-workflow-core.md`** — atomic/incremental commit rules, `ai-git` usage, and token handling apply here unchanged and are not restated below.

---

## Rules

### Plans

1. **Plans, orchestration state, and knowledge are committed directly to main, before implementation begins.** Files under `paths.plans` (which the orchestration state file lives under, via `paths.features`) and `paths.knowledge` are planning and reference artifacts, not deployable code — they do NOT require a branch or PR. Follow `skill/plan-lifecycle` for the full procedure:
   - Commit and push each version to main BEFORE presenting it to the human for review (Draft, each revision, and the final Approved/Deferred decision are all separate commits).
   - Include the Plan ID or document name in the commit message.
   - The human approval step is the review conversation; the `Approved` status commit is what actually satisfies the gate — the conversation alone does not.
2. **Implementation must not begin until the governing plan's `Approved` commit exists on main.** A `Draft` or `Deferred` plan does not satisfy this — see `steering/engineering/core.md` Rule 1 and Rule 8.

### Branching

3. **All work happens on a branch.** Never commit directly to `main` (except plans/knowledge per Rule 1 above).
4. **Branch naming:** `{plan-id}/{short-description}` (e.g. `PROJ-001/add-user-service`).
5. **One chunk plan per branch.** Do not mix unrelated work.

### Commits

6. **Never force push.** No `--force` or `--amend` on pushed commits.
7. **Include Plan ID** in the first commit message on a branch.

### Commit Granularity — Option A (this repo type's default)

**Option A (recommended): Commit per completed plan step/task.** Each task in the Chunk Plan's task list is its own commit once verified. Directly traceable to the plan; commits naturally carry the Plan ID (`steering/engineering/core.md` Rule 2). See `git-workflow-core.md` Rule 2 for Options B and C.

### Merging

8. **Main is always deployable.** Do not merge broken code.
9. **Squash merge preferred.** Keeps main history clean.
10. **Delete branch after merge.**
11. **Human reviews and merges every PR.** No agent may merge to main.

---

## Rationale

Branches contain blast radius. Human-only merges ensure nothing ships without oversight. Plans are committed ahead of implementation so the approval gate is a verifiable git artifact rather than a claim, and implementation is committed incrementally (`git-workflow-core.md` Rule 2) so a squash-merged PR's construction can still be reviewed commit-by-commit before it lands.

## Exceptions

- Trivial fixes (typos, comment corrections) may use a branch without a full plan but still require a PR and human merge.
