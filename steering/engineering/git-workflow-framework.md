---
name: 'git-workflow-framework'
version: '0.4.1'
description: 'Git workflow for framework-style repositories (direct commits to main).'
file_patterns: []
---

## Scope

All agents working in repositories where `.aiconfig.json` specifies `"repo_type": "framework"`.

---

## Rules

1. **Direct commits to main are permitted.** No branch or PR required.
2. **Commits must be atomic.** One logical change per commit. Imperative mood, <70 chars.
3. **A governing plan must be committed with `Status: Approved` before implementation begins.** Follow `skill/plan-lifecycle` for the full Draft → revision → Approved procedure. The plan's Approved commit and the implementation commits are still just ordinary commits to `main` — no branch/PR is implied — but the Approved commit must exist first, as its own commit, before any implementation commit that depends on it.
4. **Commit implementation incrementally.** Do not batch an entire plan's implementation into a single commit. Recommended checkpoint: one commit per completed plan step, once that step's work is verified (tests pass / self-validation done). See "Commit Granularity" below for alternative checkpoints.
5. **Never force push main.** Use `git revert` to undo mistakes.
6. **Tests must pass before pushing.** Run `npm test` first.

### Commit Granularity

Pick one checkpoint and apply it consistently within a single plan's implementation:

- **Option A (recommended): Commit per completed plan step.** Each numbered step in the plan's Approach section is its own commit once verified. Directly traceable to the plan; commits naturally carry the Plan ID (Rule 2).
- **Option B: Commit per file created/modified.** Maximal granularity, but risks splitting a file and its test into separate commits when they belong together.
- **Option C: Commit per passing validation checkpoint.** Commit whenever tests are run and pass. Guarantees every commit is in a working state, but granularity may not align with plan steps.

### AI Identity

7. **Use `ai-git` for all git and GitHub operations.** Never use `git` or `gh` directly. `ai-git` reads `.aiconfig.json`, injects identity env vars, and authenticates push operations automatically. If `ai-git` reports a missing prerequisite (no `.aiconfig.json`, no token env var), the agent must stop and report it to the human.
8. **Never log or echo the token value.** Reference it by env var name only.

---

## Rationale

Framework repos are docs and plain text — low risk, easy to revert. Branching overhead isn't justified. `ai-git` keeps agent commits clearly attributable under a separate AI identity and prevents agents from acting under the human's credentials. The plan-commit gate and incremental-commit rules exist even in a low-branching-overhead repo because the risk they mitigate (unverifiable approval, unreviewable giant commits) has nothing to do with branching — it's about the commit history being a trustworthy record on its own.

## Exceptions

- When a code review bot or CI is added, this file will be replaced with a PR-based workflow.
- Pushing with broken tests is only acceptable if the commit itself fixes the breakage.
- Trivial fixes (typos, comment corrections) with zero architectural impact do not require a governing plan — see `steering/engineering/core.md` Rule 4's exception for the same threshold.
