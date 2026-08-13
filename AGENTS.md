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

Fields: `name`, `version`, `domain`, `description`, `prompt`, `tools`, `approved_tools`, optional `skills`, optional `blocked_commands`

`blocked_commands`: array of shell command glob patterns (using `*` as wildcard) that the agent is forbidden from executing directly. Each harness adapter translates these into its native denial format (e.g. Kiro `permissions.rules` deny, Claude Code `Bash()` deny rules).

### Skill

A reusable, self-contained procedure. Defines inputs, steps, and outputs.

**Lives in:** `skills/{name}/` | **Format:** `SKILL.md` + `reference/`, `assets/`, `scripts/`  | **Authoring:** `skill/skill-authoring`

Front-matter: `name`, `version`, `description`
Body sections: Purpose, Inputs, Steps, Outputs, Edge Cases

### Steering

Always-on rules. Unconditional within scope.

**Lives in:** `steering/{scope}/` | **Format:** `.md` | **Authoring:** `skill/steering-authoring`

Front-matter: `name`, `version`, `description`, optional `file_patterns`
Scopes: `global/` (all agents) or `{domain}/` (domain agents). Agent-specific rules go in the agent's `prompt`.

### Standards / Knowledge

**Standards** (`standards/`): prescriptive rules. Deviation requires an explicit exception.
**Knowledge** (`knowledge/`): descriptive reference. Informs decisions but allows deviation.

### Server

MCP tool provider definition.

**Lives in:** `servers/{name}/` | **Format:** `.yaml` | **Authoring:** `skill/server-authoring`

Fields: `name`, `version`, `protocol`, `transport`, `description`, `tools`

---

## Project Configuration

### `.aiconfig.json`

Every project that uses ai-foundation agents should have a `.aiconfig.json` file at
the repository root. This file provides project-specific configuration that agents
read before performing any path-dependent operation.

**Location:** Project repository root (where agents run)

**Resolution order:**
1. Read `.aiconfig.json` from the current working directory
2. If not found, fall back to default conventions (see below)

**Agents MUST check for `.aiconfig.json` before assuming any paths.** If the file
exists, its values override all defaults. If it does not exist, agents use the
default conventions documented in each skill.

See `projects/_template/.aiconfig.json` for the schema and default values.

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `project_name` | string | Yes | Project identifier used in file naming and human-readable metadata |
| `project_shortname` | string | No | Short project identifier (max 5 characters) used in Epic IDs and worktree paths. Falls back to `project_name` if unset. |
| `repo_type` | string | No | Repository type: `project` (default) or `framework`. Determines which git workflow and conventions apply. |
| `standards` | object | No | Map of domain → tags for tag-based standard matching. See below. |
| `project_standards` | string | No | Path to project-specific standards override |
| `ai_identity` | object | No | AI agent git identity for commits and push auth |
| `ai_identity.git_author_name` | string | No | Name used in GIT_AUTHOR_NAME and GIT_COMMITTER_NAME env vars |
| `ai_identity.git_author_email` | string | No | Email used in GIT_AUTHOR_EMAIL and GIT_COMMITTER_EMAIL env vars |
| `ai_identity.git_token_env` | string | No | Name of env var holding the PAT for push/PR ops |
| `paths` | object | No | Artifact output directories (relative to repo root) |
| `paths.plans` | string | No | Root for all plan artifacts. Default: `plans` |
| `paths.epics` | string | No | Epic plan location. Default: `plans/epics` |
| `paths.chunks` | string | No | Chunk plans and chunks.json. Default: `plans/chunks` |
| `paths.decisions` | string | No | Decision Records. Default: `knowledge/decisions` |
| `paths.orchestration` | string | No | Orchestration state files. Default: `plans/orchestration` |
| `paths.knowledge` | string | No | Knowledge directory. Default: `knowledge` |
| `paths.worktrees` | string | No | Root directory for git worktrees used by parallel agents. Default: `../worktrees/{project_shortname}` |
| `orchestration` | object | No | Orchestration behaviour configuration |
| `orchestration.max_concurrent` | number | No | Maximum parallel subagents the Engineering Manager may dispatch. Default: `4` |

#### `standards` field

A map of agent domain → array of tags for tag-based standard matching:

```json
{
  "standards": {
    "engineering": ["csharp", "avalonia"],
    "product": ["ux-design"],
    "all": []
  }
}
```

- Agents collect tags from their `domain` entry plus `"all"`
- Standards declare their own tags in YAML front-matter
- A standard loads if **ALL** of its tags are present in the project's collected tags
- `depends_on` chains are resolved automatically (dependencies load first)
- Resolution: project-local `./standards/{name}.md` first, then global installed copy

### Defaults (when `.aiconfig.json` is absent)

If no config file exists, agents fall back to:
- `project_name`: inferred from repository directory name
- `project_shortname`: same as `project_name`
- `standards`: none (agent must ask or search `standards/`)
- `paths.plans`: `plans`
- `paths.epics`: `plans/epics`
- `paths.chunks`: `plans/chunks`
- `paths.decisions`: `knowledge/decisions`
- `paths.orchestration`: `plans/orchestration`
- `paths.knowledge`: `knowledge`
- `paths.worktrees`: `../worktrees/{project_shortname}`

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
