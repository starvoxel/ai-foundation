---
name: 'git-workflow'
version: '1.1.1'
description: 'Git workflow for every repo — atomic incremental commits, ai-git usage, branch + PR landing, the required-CI gate, and when a plan needs a committed approval.'
requires_skills:
  - 'pr-authoring'
  - 'pr-stewardship'
  - 'feature-planning'
file_patterns: []
---

## Scope

All agents, in every repository.

---

## Rules

### Rule: Commit Small, Verified Increments

- One logical change per commit, imperative mood, under 70 characters (merge commits exempt)
- Commit each increment once verified; never batch a whole task into one commit

**Rationale:** Small commits make review, bisection, and recovery cheap.

**Exceptions:** None. Split a step that is too big to commit atomically.

---

### Rule: Use `ai-git` for All Git and GitHub Operations

- Never use `git` or `gh` directly; `ai-git` injects the AI identity from `.aiconfig.json` and authenticates push and PR operations
- On a git identity error use `ai-git`. Never supply, infer, or ask for a git name or email, or set one via `git config`, `git -c user.*`, or `GIT_AUTHOR_*`/`GIT_COMMITTER_*`
- Never log or echo the token value; refer to it by env var name
- If `ai-git` reports a missing prerequisite, stop and report it
- In a Claude Code cloud session use `ai-git gh-api` (REST); `gh pr …` and `gh repo view` are unavailable — see `skill/pr-stewardship`

**Rationale:** Commits must carry the AI identity, never the human's, and the token must never leak.

**Exceptions:** None.

---

### Rule: Land Work Through a Branch and PR

- Work on a branch, never on `main`; open a PR when ready. The human merges; no agent merges to `main`
- Never force-push, and never amend or rebase a pushed commit — add a new one

**Rationale:** The PR is the human's review point, and rewriting pushed commits invalidates CI results and review context.

**Exceptions:** None. Branch names are free-form but should describe the work.

---

### Rule: Required CI Checks Gate Main — Never Bypass Them

- `main` only accepts commits whose required checks passed. No admin override, ruleset bypass, or disabling, weakening, renaming, or skipping a required check
- If a check fails for a valid reason (pre-existing breakage, infrastructure fault, a wrong check), do not work around it; escalate to the human with the check, the reason, and what you need

**Rationale:** A bypassed gate makes every later green meaningless.

**Exceptions:** None.

---

### Rule: An Agent That Opens a PR Drives It to Green

- Write the PR per `skill/pr-authoring`, then follow `skill/pr-stewardship` until the PR is green and mergeable, or one specific blocker has been reported. Never leave a red or conflicted PR unattended

**Rationale:** A red or conflicted PR is a stalled task.

**Exceptions:** The human says to stop.

---

### Rule: Large Work Gets a Committed, Approved Plan First

- Work too large to review in one pass needs a plan committed as `Draft`, then committed as `Approved` after the human explicitly confirms, before implementation begins — follow `skill/feature-planning`
- Small work needs no plan commit; a summary at the end is enough

**Rationale:** The approval commit makes "approved" checkable in `git log` where a wrong turn is expensive.

**Exceptions:** None for large work.

---

## Enforcement

Non-atomic or batched commits are LOW. Raw `git`/`gh` or a supplied identity is HIGH; an echoed token is CRITICAL. A direct push to `main`, an agent merge, a history rewrite, bypassed CI, or an abandoned red PR is HIGH. Large work without a committed `Approved` plan stops until the approval commit exists.
