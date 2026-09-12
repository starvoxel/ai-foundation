# Standards

> **This file is for human reference only. Agents must not load this file.**

Standards files define prescriptive rules for a language, stack, or methodology.
Deviation requires an explicit exception noted in the plan.

## File Format

Each standards file uses this structure:

```markdown
---
name: csharp_base
version: 1.0.0
description: Core C# coding standards for all .NET projects
tags: [csharp]
depends_on: []
---

# Standards: {Display Name}

## {Section}

...
```

### Front-matter Fields

| Field         | Type     | Required | Description                                                                        |
| ------------- | -------- | -------- | ---------------------------------------------------------------------------------- |
| `name`        | string   | Yes      | Unique identifier. Matches filename without `.md`.                                 |
| `version`     | string   | Yes      | SemVer version of this standard.                                                   |
| `description` | string   | Yes      | One-line summary for discovery without loading full content.                       |
| `tags`        | string[] | Yes      | Tags used for matching against `.aiconfig.json`.                                   |
| `depends_on`  | string[] | Yes      | List of standard `name`s that must be loaded before this one. Empty array if none. |

## Tag-Based Resolution

Standards are matched to projects via tags declared in `.aiconfig.json`:

```json
{
  "standards": {
    "engineering": ["csharp", "avalonia"],
    "all": []
  }
}
```

**Matching rule:** A standard is loaded if **ALL** of its `tags` are present in the project's tag list for the agent's domain (or `"all"`).

**Examples:**

| Project tags             | Standard tags        | Loaded?              |
| ------------------------ | -------------------- | -------------------- |
| `["csharp"]`             | `[csharp]`           | ✓ All tags present   |
| `["csharp"]`             | `[csharp, avalonia]` | ✗ Missing `avalonia` |
| `["csharp", "avalonia"]` | `[csharp]`           | ✓ All tags present   |
| `["csharp", "avalonia"]` | `[csharp, avalonia]` | ✓ All tags present   |

**Dependency resolution:** After matching, resolve `depends_on` chains. Load dependencies first (topological order). If a dependency is not already in the matched set, load it anyway — dependencies are unconditional.

## Naming Convention

Files use `{stack_name}.md` with underscores for multi-word names:

- `csharp_base.md` — base C# rules (tags: `[csharp]`)
- `csharp_avalonia.md` — Avalonia UI layer (tags: `[csharp, avalonia]`)
- `typescript_node.md` — TypeScript/Node.js rules (tags: `[typescript, node]`)

## Adding a New Standard

1. Create `{stack_name}.md` in this directory
2. Add YAML front-matter with all required fields
3. Choose tags carefully — they determine when this standard loads
4. Set `depends_on` if this standard assumes another has been loaded first
5. Document rules agents must follow when working in that stack

## What Belongs Here

- Language conventions (naming, patterns, file structure)
- Framework-specific rules (MVVM, async patterns, error handling)
- Type inference and syntax preferences
- Dependency injection and architecture patterns
- Testing framework and library choices
- Logging format and requirements
- Security baseline for the stack

## What Doesn't Belong Here

- Project-specific overrides (go in `projects/{name}/project-standards.md`)
- Universal rules not tied to a stack (go in `steering/`)
- General knowledge or reference material (go in `knowledge/`)
