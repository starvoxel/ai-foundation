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

### Human Gates

7. **Epic Plan** — human approves before any chunk plans are written.
8. **Chunk Plans** — human approves before any code is written.
9. **PR review** — human reviews and merges after all agent work is complete (code, review, tests, docs).

### Merge

10. **Main is always deployable.** Do not merge broken code.
11. **Squash merge preferred.** Keeps main history clean.
12. **Delete branch after merge.**

---

## Agent Workflow on a Branch

```
Branch created → Software-Engineer implements
    → Principal-Engineer reviews → corrections if needed
    → Test-Engineer verifies → Engineering-Tech-Writer documents
    → PR opened → Human reviews and merges
```

The entire review-correction loop stays on the branch. The human sees only the final result.

---

## Rationale

Agents produce code at speed. Branches contain blast radius. Human gates at plan approval and PR review ensure nothing ships without oversight.

## Exceptions

- Trivial fixes (typos, comment corrections) may skip the full plan cycle but still require a branch and PR.
