---
name: "standards-loading"
version: "0.3.0"
description: "Instructs agents how to resolve and load standards files for a project using tag-based matching."
file_patterns: []
---

## Scope

All agents, all sessions. Standards apply across every domain.

---

## Rules

### Standards Are Not Optional

- **Do not begin implementation without loading your project's standards.**
- **Never deviate from a loaded standard without explicit human approval.** If a standard conflicts with the task requirements, raise it — do not silently ignore the standard.
- **Never substitute your own conventions** when a standard defines the convention.
  The standard exists precisely to prevent per-agent inconsistency.
- **Never skip loading standards** because a task seems simple. Standards apply to all implementation work regardless of scope or complexity.

Standards are acceptance criteria. Code that violates the active standards will not pass review regardless of other quality.

### Standards Resolution — Tag Matching

The project's `.aiconfig.json` declares tags (not filenames) in its `standards` field:

```json
{
  "standards": {
    "engineering": ["csharp", "avalonia"],
    "product": ["ux-design"],
    "all": []
  }
}
```

Each standards file declares its own tags in YAML front-matter:

```yaml
---
name: csharp_avalonia
tags: [csharp, avalonia]
depends_on: [csharp_base]
---
```

**Resolution procedure:**

1. Read `.aiconfig.json` and collect the tags for your agent's `domain` plus `"all"`
2. Scan available standards files and read their front-matter
3. A standard matches if **ALL** of its `tags` are present in the collected project tags
4. For each matched standard, resolve its `depends_on` chain — add dependencies even if they were not in the initial matched set
5. Load in dependency order (dependencies first, then dependents)

**Example:** Project tags `["csharp", "avalonia"]` with these standards:

| Standard | Tags | Depends on | Loaded? |
|---|---|---|---|
| `csharp_base` | `[csharp]` | — | ✓ (has `csharp`) |
| `csharp_avalonia` | `[csharp, avalonia]` | `csharp_base` | ✓ (has both) |
| `csharp_unity` | `[csharp, unity]` | `csharp_base` | ✗ (missing `unity`) |

Load order: `csharp_base` → `csharp_avalonia`

### File Location

Standards are resolved from:

1. Project-local: `./standards/{name}.md`
2. Global install: `{{standards_path}}/{name}.md`

The first match wins. Project-local standards override global ones.

### Agent-Specific Standards

Individual agents may reference additional standards by name in their prompts.
These follow the same file location resolution (project-local first, then global)
and their `depends_on` chains are also resolved.

---

## Rationale

Tag-based resolution means projects declare *what they use* (e.g. "csharp", "avalonia")
rather than memorising exact standard filenames. Adding a new layered standard (e.g. `csharp_avalonia_reactiveui`) automatically loads for projects with matching tags — no `.aiconfig.json` changes needed. The ALL-of matching ensures standards only load when all their prerequisites are relevant to the project.

## Exceptions

- If no `.aiconfig.json` exists or it has no `standards` field, agents proceed without default standards but may still load standards referenced in their own prompts.
