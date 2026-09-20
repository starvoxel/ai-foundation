# Scope Which Subagent Types an Agent May Dispatch — Implementation Plan

> Status: Draft
> Created: 2026-09-20
> Approved by: Pending

---

## Overview

Add a per-agent `allowed_subagents` field that restricts which named agent types an agent may dispatch via the `subagent` tool, and translate it into Claude Code's native `Agent(name1, name2)` allowlist syntax. Today any agent holding `subagent` in `tools` can dispatch literally any installed agent type — the restrictions agents state about themselves in their own prompts (e.g. "only dispatch Engineering Researcher") are prose conventions the model is trusted to follow, not something the harness enforces.

## Background / Trigger

Claude Code supports a documented allowlist syntax for the `Agent` tool itself, confirmed directly against the official docs:

- **Frontmatter allowlist** (`code.claude.com/docs/en/sub-agents.md`, "Restrict which subagents can be spawned"): `tools: Agent(worker, researcher), Read, Bash` restricts that agent's Agent tool to only the named subagent types. Bare `Agent` (current behavior) is unrestricted; omitting `Agent` blocks dispatch entirely.
- **Settings deny-list** (`code.claude.com/docs/en/permissions.md`, "Agent (subagents)"): `"permissions": {"deny": ["Agent(Explore)"]}` blocks a specific named agent globally.

`lib/harnesses/claude.js`'s `TOOL_MAP` currently expands the generic `subagent` tool to bare `['Agent', 'ListAgents', 'SendMessage']` unconditionally — there is no mechanism to narrow it. This plan adds one.

## Design Decisions

### `allowed_subagents` field (per-agent, optional)

```yaml
allowed_subagents:
  - 'engineering-researcher'
```

- Optional `string[]` of agent names, matching `agents/{name}.yaml` basenames
- Only meaningful when `subagent` is present in that agent's `tools` — validation error if set without it (mirrors the existing `approved_tools`-must-be-subset-of-`tools` check already in `lib/commands/validate.js`)
- Absent → unrestricted (current behavior preserved exactly, bare `Agent`)
- Present → allowlist; only the named types may be dispatched via the Agent/subagent tool

### Harness translation

| Harness     | Behavior                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `allowed_subagents: [a, b]` → the tools frontmatter emits `Agent(a, b)` in place of bare `Agent`. `ListAgents`/`SendMessage` stay unscoped — no documented scoping syntax for those tools.                                |
| Kiro        | No native equivalent. Field is accepted by schema/validation but has no effect on Kiro's output — same "verified absent, not unresearched" precedent as `blocked_commands` on Copilot, with a code comment recording why. |

### Known limitations (documented, not solved by this plan)

- Claude Code's own docs describe the frontmatter allowlist as applying "when an agent runs as the main thread with `claude --agent`." It is not documented as taking effect when the restricted agent is itself invoked as a nested subagent by another orchestrator. Our agents are typically installed as directly-selectable personas (the common case this framework targets), so this covers normal usage, but it is not a watertight guarantee across every possible nesting depth. Recorded here so it isn't mistaken for a stronger guarantee than it is.
- This does **not** implement "requires human confirmation before this specific dispatch." `Agent(...)` is a binary allow/deny boundary, not an ask-every-time gate. The confirmation behavior already documented in `architect.yaml`, `software-engineer.yaml`, and `engineering-manager.yaml` (e.g. "every dispatch of Engineering Researcher requires explicit human confirmation") remains exactly as it is today: prose-enforced, not tooling-enforced. Out of scope here.
- `approved_tools` remains unimplemented for the Claude Code adapter (`claude.js` never reads it — a pre-existing gap, confirmed while investigating this plan, not created or worsened by it).

### Concrete first rollout

The three agents that currently hold `subagent` in `tools`, using each one's own already-stated prompt text as the source of truth for its allowlist (verified by reading each prompt, not assumed):

| Agent                      | `allowed_subagents`                                                          | Basis                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architect.yaml`           | `[engineering-researcher]`                                                   | Prompt: "dispatch Engineering Researcher as a subagent... rather than fetching" — no other dispatch target is named anywhere in the prompt.                                                       |
| `software-engineer.yaml`   | `[engineering-researcher]`                                                   | Prompt: same pattern — "dispatch Engineering Researcher as a subagent (gated...)".                                                                                                                |
| `engineering-manager.yaml` | `[software-engineer, architect, engineering-researcher, principal-engineer]` | Prompt names all four as dispatch targets: routine Software-Engineer dispatch; gated Architect/Engineering-Researcher dispatch; Principal-Engineer dispatched for review, per its own Hard rules. |

`engineering-researcher.yaml` and `principal-engineer.yaml` hold no `subagent` tool today and are unaffected by this plan.

## Scope

- `lib/component-defs.js` — add `allowed_subagents` to the `AgentDef` typedef (optional `string[]`)
- `lib/commands/validate.js`:
  - schema check: `allowed_subagents`, if present, must be an array of strings
  - schema check: `allowed_subagents` present but `subagent` absent from `tools` → error
  - refs check: each name in `allowed_subagents` must resolve to an existing `agents/{name}.yaml`
- `lib/harnesses/claude.js` — `mapAgentTools`/`transformAgent`: when `agent.allowed_subagents` is set, emit `Agent(name1, name2, ...)` instead of bare `Agent` in the expanded tool list
- `lib/harnesses/kiro.js` — explicit no-op with a documenting comment (mirrors the `blocked_commands`/Copilot precedent)
- `AGENTS.md` — add `allowed_subagents` to the Agent fields table
- `docs/architecture/05_02_harness_adapters.md` — note the new field/behavior in the adapter contract
- Update `architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml` with the concrete allowlists above
- `tests/unit/claude-adapter.test.js` — new cases: with/without `allowed_subagents`, verify emitted tools string
- Kiro adapter test — verify output unaffected by the field
- Validation tests — reject an `allowed_subagents` entry that doesn't resolve to a real agent; reject `allowed_subagents` set without `subagent` in `tools`

## Out of Scope

- Solving the "requires human confirmation per-dispatch" semantic — stays prose-enforced
- Any guarantee of enforcement when an agent is invoked as a nested subagent rather than the Claude Code main thread
- Kiro/Copilot native equivalents (none exist)
- Applying `allowed_subagents` to any agent that doesn't currently hold `subagent` in `tools`
- Changes to `approved_tools` handling in the Claude Code adapter (separate, pre-existing gap)

## Tasks

1. Schema: add `allowed_subagents` to `component-defs.js`
2. Validation: schema + refs checks in `lib/commands/validate.js`
3. Claude Code adapter: scoped `Agent(...)` emission in `lib/harnesses/claude.js`
4. Kiro adapter: explicit no-op + comment in `lib/harnesses/kiro.js`
5. Apply concrete allowlists to `architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`
6. Tests: unit tests for adapter + validation behavior
7. Docs: `AGENTS.md`, `docs/architecture/05_02_harness_adapters.md`
8. Full validation pass (`format:check`, `validate`, `snapshot --check`, `lint`, `test`), regenerate snapshot, commit
