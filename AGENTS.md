# AGENTS.md — AI Foundation Repo Guide

> This file is the entry point for AI agents working in this repository.
> Read this file first. It defines what this repo is, how it is structured,
> and the rules for authoring and loading its components.
>
> README.md files in subdirectories are for human reference only — do not load them.

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
├── agents/                          ← Agent definitions
│   ├── _template.yaml               ← Template for new agents
│   ├── architect.yaml               ← Canonical agent definitions (.yaml)
│   ├── architect.md                 ← Supplementary docs, optional (.md)
│   └── ...
│
├── skills/                          ← Reusable procedures agents can invoke
│   ├── _template/                   ← Template for new skills
│   │   ├── SKILL.md
│   │   └── reference/
│   └── ...                          ← Each skill is a folder
│
├── steering/                        ← Always-on rules applied to agents
│   ├── _template.md                 ← Template for new steering files
│   ├── global/
│   │   └── core.md                  ← Applies to all agents
│   ├── engineering/
│   │   └── core.md                  ← Applies to all engineering-domain agents
│   └── ...
│
├── standards/                       ← Prescriptive coding/stack rules
│   └── csharp-avalonia.md
│
├── servers/                         ← Tool server definitions (MCP or other protocols)
│   ├── _template.yaml               ← Template for new server definitions
│   └── ...
│
├── projects/                        ← Per-project overrides and standards
│   └── _template/
│       └── project-standards.md
│
└── tests/                           ← Validation scripts (human-run)
    └── validate.py
```

---

## File Loading Rules

### What to load and when

| File type | When to load |
|---|---|
| `agents/{name}.yaml` | Load to understand and execute an agent role |
| `agents/{name}.md` | Load for deeper context on an agent when needed |
| `skills/{name}.md` | Load when an agent needs to execute that skill |
| `steering/global/core.md` | Load at the start of every session |
| `steering/{domain}/core.md` | Load based on the agent's domain |
| `standards/{name}.md` | Load when working in that language/stack |
| `projects/{name}/project-standards.md` | Load when working on that project |
| `servers/{name}.yaml` | Load to understand an available tool server |

### What not to load

- `README.md` files in any directory — human reference only
- `meta-standards-plan.md` — planning artifact, not operational
- Template files (`_template.*`) — reference only when authoring new files

### Recommended loading order for a new session

This is the suggested order for an agent or harness to load context at session start:

1. `AGENTS.md` — this file (framework rules and schemas)
2. `steering/global/**/*.md` — always (all files in global folder)
3. `steering/{your-domain}/**/*.md` — based on your agent's domain
4. Your agent's `.yaml` file — for your role definition
5. Relevant skills — load as needed for the task
6. Relevant standards/knowledge — load as needed for the task

Harnesses that support automatic loading should implement steps 2-3 based on the agent's
`domain` field. Harnesses that don't should inject steering content into the agent's
initial context before the prompt.

---

## Component Types

### Agent

A named persona with a defined role, prompt, tools, and skills. Agents have a specific
job in the workflow and operate within their domain's steering rules.

**Format:** `.yaml` required, `.md` optional companion for extended documentation.

**Lives in:** `agents/`

**Steering is implicit from domain:** When an agent declares `domain`, the harness (or
agent on session init) must load all `.md` files matching `steering/global/**/*.md` then
`steering/{domain}/**/*.md` — in that order. No explicit steering list is needed in the
agent file. New files added to those directories are picked up automatically.

**Knowledge is on-demand:** Any agent may read files in `standards/` or `knowledge/`
as needed. These are not pre-declared — load what is relevant to the task.

---

### Skill

A reusable, self-contained procedure. Skills define inputs, a sequence of steps, and
outputs. They are not personas — they have no identity, no domain, no hard rules.
An agent invokes a skill when the task requires that procedure.

**Format:** Each skill is a folder containing `SKILL.md` (with YAML front-matter) and
an optional `reference/` subfolder for templates, examples, or supporting material.

**Lives in:** `skills/{skill-name}/`

**Structure:**
```
skills/{skill-name}/
├── SKILL.md              ← The procedure definition (entry point)
└── reference/            ← Optional: templates, examples, supporting docs
    └── template.md       ← e.g. output format template
```

**Applicability:** Declared by the agent in its `skills` field, not by the skill itself.

---

### Steering

Always-on rules that apply unconditionally to agents within a scope. Steering is not
a procedure — it does not have steps. It is a set of enforced constraints.

- **Global scope** (`steering/global/`) — applies to every agent, every session
- **Domain scope** (`steering/{domain}/`) — applies to all agents in that domain
- **Agent-level** — hard rules specific to one agent stay in that agent's `.yaml` prompt

**Format:** `.md` with YAML front-matter.

**Lives in:** `steering/{scope}/`

---

### Standards

Prescriptive rules for a language, stack, or methodology. Deviation requires an explicit
exception noted in the plan. These are not suggestions — they are requirements.

**Format:** `.md` (no front-matter requirement, but add it when authoring new files).

**Lives in:** `standards/`

---

### Knowledge

Descriptive reference material. Knowledge describes how things are, not how they must be.
An agent uses knowledge to inform decisions but can deviate with justification.

**Format:** `.md` with YAML front-matter.

**Lives in:** `knowledge/` (directory to be created when first knowledge file is needed)

---

### Server

A tool provider definition. Describes a server an agent can connect to, what tools it
exposes, and how to interact with it. Protocol is declared in the YAML (`protocol: "mcp"`).

**Format:** `.yaml` required, `.md` optional for detailed tool documentation.

**Lives in:** `servers/`

---

## Schemas

### Agent schema (`agents/{name}.yaml`)

```yaml
---
name: "agent-name"            # Unique identifier, kebab-case
version: "0.1.0"              # Semver — see versioning rules below
domain: "engineering"         # Determines which steering files apply — see Steering Resolution below
description: "One sentence."  # What this agent does

prompt: |
  Full system prompt. This is what the harness injects as the agent's
  instructions. Write it as if speaking directly to the agent.
  Can be as long as needed.

tools:                         # All tools available to this agent
  - "file-read"                # Use harness-specific tool names here
  - "file-write"               # These are examples — replace with actual names
  - "web-search"               # your harness provides
  - "shell-exec"

approved_tools:                # Subset usable without human approval
  - "file-read"                # Tools in `tools` but not here require
                               # human confirmation before use

skills:                        # Skills this agent can invoke
  - "skill/decision-record"    # Path relative to repo root, no extension
---
```

**Required fields:** `name`, `version`, `domain`, `description`, `prompt`, `tools`, `approved_tools`

**Optional fields:** `skills` (omit if agent uses no skills)

**Type and status** are not declared — type is inferred from directory, status is not tracked at this time.

---

### Skill schema (`skills/{name}/SKILL.md`)

```yaml
---
name: "skill-name"            # Unique identifier, kebab-case
version: "0.1.0"              # Semver
description: "One sentence."  # What this skill produces or accomplishes
---
```

Followed by markdown body with these sections:

- **Purpose** — expanded description of what the skill does and when to use it
- **Inputs** — what information the skill needs to run
- **Steps** — the ordered procedure
- **Outputs** — what the skill produces
- **Edge Cases** — how to handle failures or unusual situations

**Required front-matter fields:** `name`, `version`, `description`

**Supporting files:** Place templates, examples, or reference material in
`skills/{name}/reference/`. The skill's Steps section should reference these
files explicitly when the agent needs them.

**Required front-matter fields:** `name`, `version`, `description`

---

### Steering schema (`steering/{scope}/{name}.md`)

```yaml
---
name: "steering-name"         # Unique identifier, kebab-case
version: "0.1.0"              # Semver
description: "One sentence."  # What scope this covers and what it enforces
---
```

Followed by markdown body with these sections:

- **Scope** — which agents this applies to and when
- **Rules** — the enforced constraints, written as clear imperatives
- **Rationale** — why each rule exists (helps agents apply rules correctly in edge cases)
- **Exceptions** — the process for deviating when genuinely necessary

**Required front-matter fields:** `name`, `version`, `description`

---

### Server schema (`servers/{name}.yaml`)

```yaml
---
name: "server-name"           # Unique identifier, kebab-case
version: "0.1.0"              # Semver
protocol: "mcp"               # Protocol used (e.g. "mcp", future: others)
transport: "stdio"            # Transport layer (e.g. "stdio", "http")
description: "One sentence."  # What this server provides

tools:
  - name: "tool-name"
    description: "What this tool does."
    inputs:
      - "param1 (string): description"
      - "param2 (bool): description [optional]"
    outputs: "Description of what is returned."

  - name: "another-tool"
    description: "What this tool does."
    inputs:
      - "param1 (string): description"
    outputs: "Description of what is returned."
---
```

**Required fields:** `name`, `version`, `protocol`, `transport`, `description`, at least one entry under `tools`

---

### Standards/Knowledge schema (`.md` files)

```yaml
---
name: "file-name"             # Unique identifier, kebab-case
version: "0.1.0"              # Semver
description: "One sentence."  # What this file covers
---
```

Front-matter is required for all new standards and knowledge files. It allows agents
to scan descriptions before deciding whether to load the full content.

---

## Versioning Rules

All files use **semantic versioning** ([semver.org](https://semver.org)):

```
MAJOR.MINOR.PATCH
```

| Change type | Version bump | Examples |
|---|---|---|
| Wording fix, typo, clarification | PATCH | `1.0.0` → `1.0.1` |
| New section, new field, new rule | MINOR | `1.0.0` → `1.1.0` |
| Schema change, breaking behaviour change, field renamed/removed | MAJOR | `1.0.0` → `2.0.0` |

When a skill is updated with a breaking change (MAJOR bump), agents that declare that
skill in their `skills` field should be reviewed to confirm they still work correctly.

---

## Authoring Rules

### When creating a new agent

1. Copy `agents/_template.yaml` to `agents/{name}.yaml`
2. Fill in all required fields
3. Write the prompt as a direct instruction to the agent
4. Declare only tools the agent genuinely needs
5. Set `approved_tools` conservatively — when in doubt, require human approval
6. Reference only skills that exist in `skills/`
7. Optionally create `agents/{name}.md` for extended documentation

### When creating a new skill

1. Copy `skills/_template/` to `skills/{name}/`
2. Rename and fill in `SKILL.md` front-matter
3. Write all required body sections
4. Skills must be self-contained — no references to specific agents or projects
5. Inputs and outputs must be explicit
6. Place any output templates, examples, or reference material in `reference/`

### When creating a new steering file

1. Copy `steering/_template.md` to `steering/{name}.md`
2. Scope must be global or domain — agent-level rules stay in the agent's prompt
3. Every rule must have a rationale
4. Every rule must have an exceptions process — "no exceptions" is valid but must be stated

### When creating a new server definition

1. Copy `servers/_template.yaml` to `servers/{name}.yaml`
2. Document every tool the server exposes
3. Be precise about inputs — include types and whether optional/required
4. Optionally create `servers/{name}.md` for detailed tool documentation

---

## AI Self-Validation Checklist

Before declaring a new file complete, verify:

- [ ] Front-matter is valid YAML (no syntax errors)
- [ ] All required fields are present for this file type
- [ ] `version` follows semver format (`X.Y.Z`)
- [ ] `description` is one sentence and accurately describes the content
- [ ] For agents: all paths in `skills` exist in the `skills/` directory
- [ ] For agents: `approved_tools` is a subset of `tools`
- [ ] For agents: `prompt` is written as a direct instruction to the agent
- [ ] For skills: all five body sections are present (Purpose, Inputs, Steps, Outputs, Edge Cases)
- [ ] For steering: all rules have a rationale and an exceptions process
- [ ] For servers: every tool has name, description, inputs, and outputs documented
- [ ] No `README.md` content has been mixed into an operational file
- [ ] File is saved to the correct directory for its type

---

## Testing

Tests validate file schemas and cross-references. They use Node.js's built-in test
runner (requires Node 20+) and live co-located with the components they test.

```bash
# Run all tests
node --test "**/*.test.js"

# Run a specific test file
node --test servers/servers.test.js
```

**Test locations:**

| File | What it validates |
|---|---|
| `servers/servers.test.js` | Server `.yaml` schema: required fields, semver, kebab-case, tool entries |
| `tests/tools.test.js` | Tool availability: install script exists, agent tools documented in servers, `approved_tools ⊆ tools` |

**Dependencies:** Install with `npm install` (only runtime dependency is `yaml` for YAML parsing).

**When to run:** After creating or modifying any `.yaml` agent or server definition.

**Adding tests:** Place test files in the directory of the component they validate,
named `{component}.test.js`. The glob pattern `**/*.test.js` picks them up automatically.

---

## Specs We Follow

- **YAML:** [YAML 1.2](https://yaml.org) — used for all `.yaml` definition files and all front-matter in `.md` files
- **Semver:** [semver.org](https://semver.org) — used for all version fields
- **MCP:** [Model Context Protocol spec](https://modelcontextprotocol.io/docs/specification/server) — used for server definitions with `protocol: "mcp"`

---

## Discovering Available Components

Rather than maintaining a roster here (which would drift out of date), discover what
is available by scanning the relevant directories:

- **Agents** — list `agents/*.yaml` (exclude `_template.yaml`)
- **Skills** — list `skills/*/SKILL.md` (exclude `_template/`)
- **Steering** — list `steering/**/*.md` (exclude `_template.md` and `README.md`)
- **Standards** — list `standards/*.md` (exclude `README.md`)
- **Servers** — list `servers/*.yaml` (exclude `_template.yaml`)

Each file's front-matter `description` field tells you what it covers without
loading the full content.
