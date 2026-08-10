---
name: "git-workflow-projects"
version: "0.1.0"
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

11. **Set git identity env vars for all git operations.** When `.aiconfig.json` defines `ai_identity`, agents must set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` env vars to the configured values before any commit or push. The system git config (user.name/user.email) stays untouched — env vars are per-process only.
12. **Authenticate with the AI token for push and PR operations.** Read the PAT from the environment variable named in `ai_identity.git_token_env`. Use `gh` CLI with `GH_TOKEN` set to this value for all push and PR operations (e.g. `GH_TOKEN=<token> gh pr create ...`).
13. **Require `gh` CLI.** If `gh` is not installed or the token env var is not set, the agent must stop and report the missing prerequisite. Do not fall back to the human's credentials.
14. **Never log or echo the token value.** Reference it by env var name only.

---

## Rationale

Branches contain blast radius. Human-only merges ensure nothing ships without oversight. Separate AI identity and credentials ensure PRs clearly show AI-authored work and enforce that a different user (the human) must review and approve.

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
