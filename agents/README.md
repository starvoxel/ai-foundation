# Agents

> **This file is for human reference only. Agents must not load this file.**

Agent definitions live here as `.yaml` files. Each defines a named persona with a role,
prompt, tools, and skills.

## Adding a new agent

1. Copy `_template.yaml` to `{name}.yaml`
2. Fill in all required fields (see `AGENTS.md` for schema)
3. Run tests: `npm test`

## What belongs here

- `.yaml` agent definitions (one per agent)
- Optional `.md` companions for extended documentation

## What doesn't belong here

- Steering rules (go in `steering/`)
- Skills/procedures (go in `skills/`)
- Standards (go in `standards/`)
