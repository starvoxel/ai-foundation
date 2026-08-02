# Steering

> **This file is for human reference only. Agents must not load this file.**

Steering files are always-on rules enforced unconditionally on agents within a scope.
They are not procedures — they define constraints, not steps.

## Structure

```
steering/
├── global/               ← Applies to all agents, every session
└── engineering/          ← Applies to all engineering-domain agents
```

## Adding a new steering file

1. Load `skill/steering-authoring` for the full procedure
2. Or: create a `.md` file in the appropriate scope directory following AGENTS.md
3. Every rule must have a rationale and an exceptions process

## How steering is loaded

Agents load steering based on their `domain` field:
1. `steering/global/**/*.md` — always loaded first
2. `steering/{domain}/**/*.md` — loaded based on agent's domain

New files added to these directories are picked up automatically.

## What belongs here

- Hard constraints that apply unconditionally
- Rules with clear rationale and enforcement mechanism

## What doesn't belong here

- Procedures with steps (go in `skills/`)
- Rules specific to one agent (go in the agent's prompt)
- Suggestions or guidelines (if it's not enforced, it's not steering)
