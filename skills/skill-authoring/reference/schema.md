# Skill Schema Reference

## Frontmatter

```yaml
---
name: 'skill-name' # Required. Kebab-case. Must match folder name.
version: '0.1.1' # Required. Semver.
description: 'One sentence.' # Required. What this skill produces.
---
```

## Required Body Sections

Five sections, in this order:

1. **Purpose** — what it does, when to use it, what problem it solves
2. **Inputs** — what information is needed (`- **Name** — description and source`)
3. **Steps** — ordered procedure (`### Step N — Name`). Deterministic work → scripts, not prose.
4. **Outputs** — what is produced (`- **Name** — description and destination`)
5. **Edge Cases** — how to handle failures (`- **Situation** — what to do`)

## Folder Structure

```
skills/{name}/
├── SKILL.md              ← Entry point. Always required.
├── reference/            ← Agent reads during execution.
├── assets/               ← Used in output or by scripts.
└── scripts/              ← Deterministic operations.
```

| Question                                    | Folder       |
| ------------------------------------------- | ------------ |
| Agent reads this to understand what to do?  | `reference/` |
| Copied into output or consumed by a script? | `assets/`    |
| Code that runs deterministically?           | `scripts/`   |
