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

---

## Rationale

Framework repos are docs and plain text — low risk, easy to revert. Branching overhead isn't justified.

## Exceptions

- When a code review bot or CI is added, this file will be replaced with a PR-based workflow.
- Pushing with broken tests is only acceptable if the commit itself fixes the breakage.
