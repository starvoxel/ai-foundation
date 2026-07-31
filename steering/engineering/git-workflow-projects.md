---
name: "git-workflow-projects"
version: "0.1.0"
description: "Git workflow for project repositories where agents produce code."
---

## Scope

All agents working in project repositories that use the ai-foundation framework.

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

---

## Rationale

Branches contain blast radius. Human-only merges ensure nothing ships without oversight.

## Exceptions

- Trivial fixes (typos, comment corrections) may use a branch without a full plan but still require a PR and human merge.
