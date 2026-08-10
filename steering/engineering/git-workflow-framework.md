---
name: "git-workflow-framework"
version: "0.1.0"
description: "Git workflow for the ai-foundation repository."
file_patterns: []
---

## Scope

All agents working in the `ai-foundation` repository.

---

## Rules

1. **Direct commits to main are permitted.** No branch or PR required.
2. **Commits must be atomic.** One logical change per commit. Imperative mood, <70 chars.
3. **Never force push main.** Use `git revert` to undo mistakes.
4. **Tests must pass before pushing.** Run `npm test` first.
5. **Verify snapshot freshness after component changes.** After modifying any component (agent, skill, steering, server, bundle), run `aif snapshot --check`. If stale, run `aif snapshot` to regenerate only the affected bundles before committing.
6. **Keep PLAN.md in sync.** Before pushing, check if the work you completed changes the status of any item in PLAN.md. If a feature moved from 🔲 to ✅, update it. Do not push with a stale roadmap.

---

## Rationale

This repo is framework docs and plain text — low risk, easy to revert. Branching overhead isn't justified yet.

## Exceptions

- When a code review bot or CI is added, this file will be replaced with a PR-based workflow.
- Pushing with broken tests is only acceptable if the commit itself fixes the breakage.
