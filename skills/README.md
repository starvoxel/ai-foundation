# Skills

> **This file is for human reference only. Agents must not load this file.**

Skills are reusable procedures that agents invoke. Each skill is a self-contained folder with a procedure definition and optional supporting material.

## Structure

```
skills/{name}/
├── SKILL.md              ← Procedure definition (entry point)
├── reference/            ← Material the agent reads during execution
├── assets/               ← Files used in output or by scripts
└── scripts/              ← Deterministic operations (validation, generation)
```

## Adding a new skill

1. Load `skill/skill-authoring` for the full procedure
2. Or: create `skills/{name}/SKILL.md` following the schema in AGENTS.md
3. Run tests: `npm test`

## What belongs here

- Self-contained procedures with clear inputs, steps, and outputs
- Reference material in `reference/` (schemas, examples, format specs)
- Output templates and boilerplate in `assets/`
- Deterministic scripts in `scripts/` (validation, transforms, generation)

## What doesn't belong here

- Agent-specific rules (go in the agent's prompt)
- Always-on constraints (go in `steering/`)
- References to specific projects or agents (skills must be reusable)
