---
name: "git-workflow-projects"
version: "0.2.0"
description: "Git workflow for project repositories where agents produce code."
file_patterns: []
---

## Scope

All agents working in repositories where `.aiconfig.json` specifies `"repo_type": "project"` (this is the default when `repo_type` is not set).

---

## Rules

### Branching

1. **All work happens on a branch.** Never commit directly to `main`.
2. **Branch naming:** `{plan-id}/{short-description}` (e.g. `PROJ-001/add-user-service`).
3. **One chunk plan per branch.** Do not mix unrelated work.

### Commits

4. **Commits must be atomic.** One logical change per commit. Imperative mood, <70 chars.
5. **Never force push.** No `--force` or `--amend` on pushed commits.
6. **Include Plan ID** in the first commit message on a branch.

### Merging

7. **Main is always deployable.** Do not merge broken code.
8. **Squash merge preferred.** Keeps main history clean.
9. **Delete branch after merge.**
10. **Human reviews and merges every PR.** No agent may merge to main.

### AI Identity

11. **Use `ai-git` for all git and GitHub operations.** Never use `git` or `gh` directly. `ai-git` reads `.aiconfig.json`, injects identity env vars, and authenticates push/PR operations automatically. If `ai-git` reports a missing prerequisite (no `.aiconfig.json`, no token env var), the agent must stop and report it to the human.
12. **Never log or echo the token value.** Reference it by env var name only.

---

## Rationale

Branches contain blast radius. Human-only merges ensure nothing ships without oversight. `ai-git` ensures all agent git operations use a separate AI identity and credentials, so PRs clearly show AI-authored work and enforce that a different user (the human) must review and approve.

## Exceptions

- Trivial fixes (typos, comment corrections) may use a branch without a full plan but still require a PR and human merge.
- **Plans, orchestration state, and knowledge are committed directly to main.** Files under
  `paths.plans`, `paths.orchestration`, and `paths.knowledge` are planning and reference
  artifacts, not deployable code. They do NOT require a branch or PR. Rules:
  - Commit and push each version to main BEFORE presenting it to the human for review.
    This preserves full revision history in git (e.g. draft → feedback → approved).
  - Atomic commits: one plan or one logical change per commit.
  - Include the Plan ID or document name in the commit message.
  - The human approval step is the review conversation, not a PR merge.
