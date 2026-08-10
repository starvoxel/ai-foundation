---
name: "git-workflow-framework"
version: "0.2.0"
description: "Git workflow for framework-style repositories (direct commits to main)."
file_patterns: []
---

## Scope

All agents working in repositories where `.aiconfig.json` specifies `"repo_type": "framework"`.

---

## Rules

1. **Direct commits to main are permitted.** No branch or PR required.
2. **Commits must be atomic.** One logical change per commit. Imperative mood, <70 chars.
3. **Never force push main.** Use `git revert` to undo mistakes.
4. **Tests must pass before pushing.** Run `npm test` first.

### AI Identity

5. **Set git identity env vars for all git operations.** When `.aiconfig.json` defines `ai_identity`, agents must set `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL` env vars to the configured values before any commit or push. The system git config (user.name/user.email) stays untouched — env vars are per-process only.
6. **Authenticate with the AI token for push operations.** Read the PAT from the environment variable named in `ai_identity.git_token_env`. Use `gh` CLI with `GH_TOKEN` set to this value for push operations.
7. **Require `gh` CLI.** If `gh` is not installed or the token env var is not set, the agent must stop and report the missing prerequisite. Do not fall back to the human's credentials.
8. **Never log or echo the token value.** Reference it by env var name only.

---

## Rationale

Framework repos are docs and plain text — low risk, easy to revert. Branching overhead isn't justified. Separate AI identity and credentials keep agent commits clearly attributable and prevent agents from acting under the human's identity.

## Exceptions

- When a code review bot or CI is added, this file will be replaced with a PR-based workflow.
- Pushing with broken tests is only acceptable if the commit itself fixes the breakage.
