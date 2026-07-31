# Skills

> **This file is for human reference only. Agents must not load this file.**

Skills are reusable procedures that agents invoke. Each skill is a self-contained
folder with a procedure definition and optional supporting material.

## Structure

```
skills/{name}/
├── SKILL.md              ← Procedure definition (entry point)
├── reference/            ← Templates, examples, supporting docs
└── scripts/              ← Executable scripts (validation, transforms)
```

## Adding a new skill

1. Copy `_template/` to `{name}/`
2. Fill in `SKILL.md` front-matter and all sections
3. Add reference material or scripts as needed

## What belongs here

- Self-contained procedures with clear inputs, steps, and outputs
- Output templates in `reference/`
- Validation or transform scripts in `scripts/`

## What doesn't belong here

- Agent-specific rules (go in the agent's prompt)
- Always-on constraints (go in `steering/`)
- References to specific projects or agents (skills must be reusable)
