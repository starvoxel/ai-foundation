
## Scope

All agents, all sessions.

---

## Rules

### Rule: Load Matching Standards Before Implementing

- Before writing code, run `skill/standards` and read the standards it lists, in order. It matches the tags in `.aiconfig.json`, so do not pick standards by hand
- Never deviate from a loaded standard, and never substitute your own conventions, without explicit human approval. If a standard conflicts with the task, raise it
- This applies to every implementation, however simple the task seems

**Rationale:** Standards are acceptance criteria; code that violates them fails review. Per-agent conventions are what they exist to prevent.

**Exceptions:** No `.aiconfig.json` or no `standards` field means none apply by default; still follow any standard the plan or your prompt names.

---

## Enforcement

Skipped standards or an unapproved deviation is caught in review (MEDIUM); the code is returned for correction.
