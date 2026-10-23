---
name: 'git-workflow'
version: '1.0.1'
description: 'Git workflow for every repo — atomic incremental commits, ai-git usage, branch + PR landing, the required-CI gate, and when a plan needs a committed approval.'
requires_skills:
  - 'pr-stewardship'
  - 'feature-planning'
file_patterns: []
---

## Scope

**This steering applies to:** All agents, in every repository.

---

## Rules

### Rule: Commit Small, Verified Increments

- One logical change per commit; imperative mood, under 70 characters (merge commits exempt)
- Commit each increment once it is verified (tests pass or the check was run) — never batch a whole task into one commit

**Rationale:** Small commits make review, bisection, and recovery cheap.

**Exceptions:** None. Split a step that is too big to commit atomically.

---

### Rule: Use `ai-git` for All Git and GitHub Operations

- Never use `git` or `gh` directly; `ai-git` reads `.aiconfig.json`, injects the AI identity, and authenticates push/PR operations
- On a git identity error, use `ai-git`. Never supply, infer, or ask for a git name or email, and never set one via `git config`, `git -c user.*`, or `GIT_AUTHOR_*`/`GIT_COMMITTER_*`
- Never log or echo the token value; reference it by env var name only
- If `ai-git` reports a missing prerequisite, stop and report it to the human
- In a Claude Code cloud session use `ai-git gh-api` (REST); `gh pr ...` and `gh repo view` are unavailable — see `skill/pr-stewardship`

**Rationale:** Commits must carry the AI identity from `.aiconfig.json`, never the human's, and the token must never leak.

**Exceptions:** None.

---

### Rule: Land Work Through a Branch and PR

- Work on a branch, never directly on `main`; open a PR when the work is ready
- The human merges. No agent merges to `main`
- Never force-push, and never amend or rebase a commit that has already been pushed — add a new commit instead

**Rationale:** The PR is the human's review point; rewriting pushed commits invalidates CI results and reviewers' context.

**Exceptions:** Branch names are free-form but should describe the work.

---

### Rule: Required CI Checks Gate Main — Never Bypass Them

- `main` only accepts commits whose required checks passed. No admin override, no ruleset bypass, and no disabling, weakening, renaming, or skipping a required check
- If a check fails for a valid reason (pre-existing breakage, infrastructure fault, a wrong check), do not work around it — escalate to the human with the check, the reason, and what you need

**Rationale:** A bypassed gate makes every later green meaningless.

**Exceptions:** None.

---

### Rule: An Agent That Opens a PR Drives It to Green

- Follow `skill/pr-stewardship` until the PR is green and mergeable, or a specific blocker has been reported once. Never leave a red or conflicted PR unattended

**Rationale:** A red or conflicted PR is a stalled task.

**Exceptions:** The human says to stop.

---

### Rule: Large Work Gets a Committed, Approved Plan First

- Work too large to review in one pass needs a plan committed with `Status: Draft`, and committed again as `Approved` after the human explicitly confirms, before implementation begins — follow `skill/feature-planning`
- Small work needs no committed plan or approval commit; a summary at the end is enough

**Rationale:** The approval commit makes "approved" checkable in `git log` for the work where a wrong turn is expensive; small work does not justify the ceremony.

**Exceptions:** None for large work.

---

## Enforcement

- **Non-atomic or batched commits:** LOW finding at review.
- **Raw `git`/`gh`, supplied identity:** HIGH finding. Echoed token: CRITICAL.
- **Direct push to `main`, agent merge, or pushed-history rewrite:** HIGH finding.
- **Bypassed CI:** HIGH finding.
- **Abandoned red or conflicted PR:** HIGH finding.
- **Large work implemented without a committed `Approved` plan:** work stops until the approval commit exists.
