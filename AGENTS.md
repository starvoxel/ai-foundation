# AGENTS.md — AI Foundation Repo Guide

> This file is the entry point for AI agents working in this repository.
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

Nothing here is tied to a specific AI harness. Agents, skills, and steering are plain files
that any harness (Kiro, Cursor, Copilot, LangGraph, AutoGen) can load.

---

## Directory Structure

```
ai-foundation/
├── AGENTS.md                        ← This file. Read first.
├── README.md                        ← Human-facing overview. Do not load.
│
├── agents/                          ← Agent definitions (.yaml + optional .md)
│
├── skills/                          ← Reusable procedures agents can invoke
│   ├── skill-authoring/             ← How to create new skills
│   ├── agent-authoring/             ← How to create new agents
│   └── {name}/                      ← Each skill is a folder with SKILL.md
│
├── steering/                        ← Always-on rules applied to agents
│   ├── _template.md                 ← Template for new steering files
│   ├── global/                      ← Applies to all agents
│   └── {domain}/                    ← Applies to agents in that domain
│
├── standards/                       ← Prescriptive coding/stack rules
│
├── servers/                         ← Tool server definitions (MCP or other protocols)
│
├── bundles/                         ← Install bundles (what to deploy per harness)
│
├── projects/                        ← Per-project overrides and standards
│
├── docs/                            ← Decision records and documentation
│
├── bin/                             ← CLI entry point (aif)
├── lib/                             ← CLI modules
└── tests/                           ← Unit, integration, and validation tests
```

---

## File Loading Rules

### What to load and when

| File type | When to load |
|---|---|
| `agents/{name}.yaml` | Load to understand and execute an agent role |
| `agents/{name}.md` | Load for deeper context on an agent when needed |
| `skills/{name}/SKILL.md` | Load when an agent needs to execute that skill |
| `steering/global/**/*.md` | Load at the start of every session |
| `steering/{domain}/**/*.md` | Load based on the agent's domain |
| `standards/{name}.md` | Load when working in that language/stack |
| `projects/{name}/project-standards.md` | Load when working on that project |
| `servers/{name}/{name}.yaml` | Load to understand an available tool server |

### What not to load

- `README.md` files in any directory — human reference only
- Files starting with `_` — templates/internal, not operational

### Recommended loading order

1. `AGENTS.md` — this file
2. `steering/global/**/*.md` — always
3. `steering/{your-domain}/**/*.md` — based on your agent's domain
4. Your agent's `.yaml` file — your role definition
5. Relevant skills — load as needed for the task
6. Relevant standards — load as needed for the task

---

## Component Types

### Agent

A named persona with a defined role, prompt, tools, and skills.

**Format:** `.yaml` required, `.md` optional companion.
**Lives in:** `agents/`
**Authoring guide:** `skill/agent-authoring`

Required fields: `name`, `version`, `domain`, `description`, `prompt`, `tools`, `approved_tools`
Optional fields: `skills`

---

### Skill

A reusable, self-contained procedure. Defines inputs, steps, and outputs.

**Format:** Folder containing `SKILL.md` with YAML front-matter.
**Lives in:** `skills/{skill-name}/`
**Authoring guide:** `skill/skill-authoring`

Structure:
```
skills/{name}/
├── SKILL.md              ← Procedure definition (entry point)
├── reference/            ← Material the agent reads during execution
├── assets/               ← Files used in output or by scripts
└── scripts/              ← Deterministic operations (validation, generation)
```

Required front-matter: `name`, `version`, `description`
Required body sections: Purpose, Inputs, Steps, Outputs, Edge Cases

---

### Steering

Always-on rules that apply unconditionally within a scope.

- **Global** (`steering/global/`) — every agent, every session
- **Domain** (`steering/{domain}/`) — all agents in that domain
- **Agent-level** — hard rules stay in the agent's `prompt` field

**Format:** `.md` with YAML front-matter.
**Lives in:** `steering/{scope}/`
**Template:** `steering/_template.md`

Required front-matter: `name`, `version`, `description`
Optional front-matter: `file_patterns` (defaults to `[]` — always loaded)

---

### Standards

Prescriptive rules for a language, stack, or methodology. Deviation requires an
explicit exception noted in the plan.

**Format:** `.md` with YAML front-matter.
**Lives in:** `standards/`

---

### Knowledge

Descriptive reference material. Describes how things are, not how they must be.

**Format:** `.md` with YAML front-matter.
**Lives in:** `knowledge/`

---

### Server

A tool provider definition. Describes an MCP server, its tools, and how to connect.

**Format:** `.yaml` required, `.md` optional.
**Lives in:** `servers/{server-name}/`

Required fields: `name`, `version`, `protocol`, `transport`, `description`, `tools`

---

## Schemas

Full schema documentation lives in the authoring skills. Below are concise summaries
for quick reference.

### Agent (`agents/{name}.yaml`)

```yaml
name: "agent-name"            # kebab-case, matches filename
version: "0.1.0"             # semver
domain: "engineering"        # determines steering scope
description: "One sentence."
prompt: |
  Direct instruction to the agent.
tools: ["read", "write", "shell", "grep", "glob"]
approved_tools: ["read", "grep", "glob"]
skills: ["skill/decision-record"]
```

Full schema and authoring procedure: load `skill/agent-authoring`

### Skill (`skills/{name}/SKILL.md`)

```yaml
name: "skill-name"            # kebab-case, matches folder
version: "0.1.0"             # semver
description: "One sentence."
```

Full schema and authoring procedure: load `skill/skill-authoring`

### Steering (`steering/{scope}/{name}.md`)

```yaml
name: "steering-name"         # kebab-case
version: "0.1.0"             # semver
description: "One sentence."
file_patterns: []            # [] = always | ["glob"] = conditional
```

Body sections: Scope, Rules (with Rationale + Exceptions), Enforcement

### Server (`servers/{name}/{name}.yaml`)

```yaml
name: "server-name"
version: "0.1.0"
protocol: "mcp"
transport: "stdio"
description: "One sentence."
tools:
  - name: "tool-name"
    description: "What it does."
    inputs:
      - "param (type): description"
    outputs: "What is returned."
```

---

## Testing

Tests use Node.js's built-in test runner (Node 20+):

```bash
node --test "tests/unit/**/*.test.js"          # Fast, no I/O
node --test "tests/integration/**/*.test.js"   # Filesystem tests
node --test "tests/validation/**/*.test.js"    # Real repo checks
node --test "tests/**/*.test.js"               # Everything
```

Run after creating or modifying any agent, skill, or server definition.

---

## Specs We Follow

- **YAML:** [YAML 1.2](https://yaml.org)
- **Semver:** [semver.org](https://semver.org) — all version fields
- **MCP:** [Model Context Protocol](https://modelcontextprotocol.io/docs/specification/server) — server definitions

---

## Discovering Available Components

Scan directories rather than maintaining a roster:

- **Agents** — `agents/*.yaml`
- **Skills** — `skills/*/SKILL.md`
- **Steering** — `steering/**/*.md` (exclude `_template.md`)
- **Standards** — `standards/*.md`
- **Servers** — `servers/*/*.yaml`

Each file's `description` field tells you what it covers without loading the full content.
