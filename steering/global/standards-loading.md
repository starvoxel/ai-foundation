---
name: "standards-loading"
version: "0.2.0"
description: "Instructs agents how to resolve and load standards files for a project."
file_patterns: []
---

## Scope

All agents, all sessions. Standards apply across every domain.

---

## Rules

### Standards Are Not Optional

- **Do not begin implementation without loading your project's standards.**
- **Never deviate from a loaded standard without explicit human approval.** If a standard
  conflicts with the task requirements, raise it — do not silently ignore the standard.
- **Never substitute your own conventions** when a standard defines the convention.
  The standard exists precisely to prevent per-agent inconsistency.
- **Never skip loading standards** because a task seems simple. Standards apply to all
  implementation work regardless of scope or complexity.

Standards are acceptance criteria. Code that violates the active standards will not
pass review regardless of other quality.

### Standards Resolution

When loading a standard by name (e.g. "typescript-node"):

1. Check the project directory: `./standards/{name}.md`
2. If not found, read from: `{{standards_path}}/{name}.md`

The first match wins. Project-local standards override global ones.

### Default Standards

If the project has a `.aiconfig.json` with a `standards` field (a map of domain → names),
load the standards for your domain before starting work:

```json
{
  "standards": {
    "engineering": ["typescript-node", "api-design"],
    "product": ["ux-design"],
    "all": ["customer-release-notes"]
  }
}
```

- Load standards listed under your agent's `domain`
- Always load standards listed under `"all"`
- If no entry exists for your domain, load only `"all"`

### Agent-Specific Standards

Individual agents may reference additional standards by name in their prompts.
These follow the same resolution order (project-local first, then global).

---

## Rationale

Standards must be accessible to agents without living in every project repository.
Installing them globally and resolving by name keeps projects lean while giving
agents consistent rules. The domain map prevents irrelevant standards from consuming
context (e.g. a UX agent doesn't need C# coding rules).

## Exceptions

- If no `.aiconfig.json` exists or it has no `standards` field, agents proceed without
  default standards but may still load standards referenced in their own prompts.
