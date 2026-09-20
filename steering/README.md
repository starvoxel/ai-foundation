# Steering

> **This file is for human reference only. Agents must not load this file.**

Steering files are always-on rules enforced unconditionally on agents within a scope.
They are not procedures — they define constraints, not steps.

## Structure

```
steering/
├── global/               ← Applies to all agents, every session
├── engineering/          ← Applies to all engineering-domain agents
└── generic/              ← Tied to a specific tool/server, not a domain — loaded via a bundle's explicit `steering:` list (e.g. gmail-irreversible-action-approval.md)
```

## Adding a new steering file

1. Load `skill/steering-authoring` for the full procedure
2. Or: create a `.md` file in the appropriate scope directory following AGENTS.md
3. Every rule must have a rationale and an exceptions process

## How steering is loaded

Most steering loads by domain-matching on an agent's `domain` field:

1. `steering/global/**/*.md` — always loaded first
2. `steering/{domain}/**/*.md` — loaded based on the agent's `domain` field

New files added to these two directories are picked up automatically.

A third kind, `steering/generic/`, is **not** domain-matched — no agent has a matching `domain` field. It loads only when a bundle's own `bundle.yaml` explicitly lists the file in its `steering:` array, tying the rule to installing that bundle's tool/server rather than to any agent's domain. A new file here needs that explicit bundle entry — it is not picked up automatically.

## What belongs here

- Hard constraints that apply unconditionally
- Rules with clear rationale and enforcement mechanism

## What doesn't belong here

- Procedures with steps (go in `skills/`)
- Rules specific to one agent (go in the agent's prompt)
- Suggestions or guidelines (if it's not enforced, it's not steering)
