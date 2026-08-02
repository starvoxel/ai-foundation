# Agents

> **This file is for human reference only. Agents must not load this file.**

Agent definitions live here as `.yaml` files. Each defines a named persona with a role,
prompt, tools, and skills.

## Adding a new agent

1. Load `skill/agent-authoring` for the full procedure
2. Or: create `{name}.yaml` following the schema in AGENTS.md
3. Run tests: `npm test`

## What belongs here

- `.yaml` agent definitions (one per agent)
- Optional `.md` companions for extended documentation

## What doesn't belong here

- Steering rules (go in `steering/`)
- Skills/procedures (go in `skills/`)
- Standards (go in `standards/`)
