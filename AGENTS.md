# AGENTS.md — AI Foundation Repo Guide

> Read this file first. It defines what this repo is, how it is structured,
> and the rules for loading its components.

---

## What This Repo Is

`ai-foundation` is a portable, harness-agnostic framework for AI-assisted software development.
It defines:

- **Who** does what — named agent roles with explicit responsibilities and prompts
- **What procedures they follow** — skills that define reusable step-by-step processes
- **What rules govern them** — steering files that enforce behaviour unconditionally
- **What reference material they draw on** — standards and knowledge files

Nothing here is tied to a specific AI harness.

---

## Directory Structure

```
ai-foundation/
├── AGENTS.md                        ← This file. Read first.
├── agents/                          ← Agent definitions (.yaml + optional .md)
├── skills/                          ← Reusable procedures (folders with SKILL.md)
├── steering/                        ← Always-on rules (global/ + {domain}/)
├── standards/                       ← Prescriptive coding/stack rules
├── servers/                         ← MCP tool server definitions
├── bundles/                         ← Install bundles (per-harness deployment)
├── projects/                        ← Per-project overrides
├── docs/                            ← Decision records
├── bin/                             ← CLI entry point (aif)
├── lib/                             ← CLI modules
└── tests/                           ← unit/, integration/, validation/
```

---

## File Loading Rules

| File type | When to load |
|---|---|
| `steering/global/**/*.md` | Every session, always |
| `steering/{domain}/**/*.md` | Based on agent's `domain` field |
| `agents/{name}.yaml` | To execute an agent role |
| `skills/{name}/SKILL.md` | When the task requires that procedure |
| `standards/{name}.md` | When working in that language/stack |
| `servers/{name}/{name}.yaml` | To understand an available tool server |

**Do not load:** `README.md` files, files starting with `_`.

**Loading order:** This file → global steering → domain steering → agent yaml → skills/standards as needed.

---

## Component Types

### Agent

A named persona with a defined role, prompt, tools, and skills.

**Lives in:** `agents/` | **Format:** `.yaml` | **Authoring:** `skill/agent-authoring`

Fields: `name`, `version`, `domain`, `description`, `prompt`, `tools`, `approved_tools`, optional `skills`

### Skill

A reusable, self-contained procedure. Defines inputs, steps, and outputs.

**Lives in:** `skills/{name}/` | **Format:** `SKILL.md` + `reference/`, `assets/`, `scripts/`  | **Authoring:** `skill/skill-authoring`

Front-matter: `name`, `version`, `description`
Body sections: Purpose, Inputs, Steps, Outputs, Edge Cases

### Steering

Always-on rules. Unconditional within scope.

**Lives in:** `steering/{scope}/` | **Format:** `.md` | **Template:** `steering/_template.md`

Front-matter: `name`, `version`, `description`, optional `file_patterns`
Scopes: `global/` (all agents) or `{domain}/` (domain agents). Agent-specific rules go in the agent's `prompt`.

### Standards / Knowledge

**Standards** (`standards/`): prescriptive rules. Deviation requires an explicit exception.
**Knowledge** (`knowledge/`): descriptive reference. Informs decisions but allows deviation.

### Server

MCP tool provider definition.

**Lives in:** `servers/{name}/` | **Format:** `.yaml`

Fields: `name`, `version`, `protocol`, `transport`, `description`, `tools`

---

## Testing

```bash
node --test "tests/unit/**/*.test.js"          # Fast, no I/O
node --test "tests/integration/**/*.test.js"   # Filesystem tests
node --test "tests/validation/**/*.test.js"    # Real repo checks
```

---

## Discovering Components

Scan directories — don't maintain a roster:

- `agents/*.yaml` | `skills/*/SKILL.md` | `steering/**/*.md` | `standards/*.md` | `servers/*/*.yaml`

Each file's `description` field tells you what it covers without loading the full content.
