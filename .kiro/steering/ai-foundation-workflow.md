---
inclusion: always
---

## Scope

All agents working in the `ai-foundation` repository. These rules extend
the generic `git-workflow-framework` steering.

---

## Rules

5. **Verify snapshot freshness after component changes.** After modifying any component (agent, skill, steering, server, bundle), run `aif snapshot --check`. If stale, run `aif snapshot` to regenerate only the affected bundles before committing.
6. **Keep PLAN.md in sync.** Before pushing, check if the work you completed changes the status of any item in PLAN.md. If a feature moved from 🔲 to ✅, update it. Do not push with a stale roadmap.
