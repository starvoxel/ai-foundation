# Meta-Standards Layer Implementation Plan

## Overview

This plan establishes the authoring standards and file structure for the ai-foundation framework. It defines what each type of file is, what it must contain, and how it is validated. This becomes the rulebook for all future framework additions — whether authored by humans or AI agents.

---

## File Model

Different component types use different formats based on how they are consumed:

| Type | Format | Agent Use |
|---|---|---|
| Agent | `.toml` required, `.md` optional | Harness loads `.toml` to execute |
| Server | `.toml` required, `.md` optional | Harness loads `.toml` to connect |
| Skill | `.md` required with TOML front-matter | Agent reads and follows |
| Steering | `.md` required with TOML front-matter | Agent reads and follows |
| Knowledge | `.md` (no front-matter requirement) | Agent reads for context |
| Standards | `.md` (no front-matter requirement) | Agent reads for context |
| `README.md` | Human directory guide | Must not load |

**Key principles:**
- Agents and servers use `.toml` because they are machine-executed by a harness
- Skills and steering use `.md` because they are read and followed, not parsed and run
- Knowledge and standards are pure reference — no structural requirements
- For agents/servers: `.toml` is canonical; if `.md` companion exists and conflicts, `.toml` wins
- Directory `README.md` files are human-only — agents must not load them

**Skill and steering front-matter** is minimal — just enough for an agent to identify the file:

```toml
+++
name = "decision-record"
version = "1.0.0"
description = "Produces a structured Decision Record capturing options explored and the chosen approach."
+++
```

Type is inferred from directory. Status and applicability are not tracked here — applicability lives in the agent's `skills` field.

---

## Component Types

| Type | Definition | Example |
|---|---|---|
| **Agent** | Named persona with role, process, tools, skills | `architect.toml` |
| **Skill** | Reusable atomic procedure (inputs → steps → outputs) | `decision-record.toml` |
| **Steering** | Always-on rules applied to agents (global/domain scope) | `global.toml` |
| **Knowledge** | Descriptive reference material, informational | `codebase-history.md` |
| **Standards** | Prescriptive rules, deviation requires exception | `csharp-avalonia.md` |
| **Server** | Tool provider definition (MCP or future protocols) | `filesystem.toml` |

---

## Files to Create

### 1. `AGENTS.md` *(root)*

Machine-facing entry point for AI agents dropped into this repo.

**Contains:**
- Repo purpose and structure
- Directory map (what lives where)
- File loading rules:
  - Load `.toml` files to execute
  - May read `.md` companions for context
  - Must not load `README.md` files
- Load order guidance (declarative, front-matter decides)
- Type definitions for Agent, Skill, Steering, Knowledge, Standards, Server
- TOML schema for each type:
  - Required vs optional fields
  - Concise prose descriptions (not formal JSON Schema)
  - Example front-matter blocks
- Body section guidance for when `.md` companions exist
- Versioning rules (semver)
- Specs we follow: MCP, TOML v1.0, semver
- AI self-validation checklist for authoring new files

---

### 2. `tests/validate.py`

Python validation script to ensure framework files are well-formed.

**Checks:**
- TOML front-matter parses correctly
- Required fields present per type
- Referenced paths exist (skills, steering, knowledge in agent definitions)
- Version strings follow semver format
- No circular dependencies

**Scope:**
- Starts with server validation (test MCP server definitions)
- Extensible to agents, skills, steering as needed

---

### 3. `tests/README.md`

Human-readable guide to the validation suite.

**Contains:**
- How to run `validate.py`
- What each check does
- How to add new validation rules
- Expected output format

---

### 4. `agents/_template.toml`

Annotated template for agent definitions.

**TOML fields:**
- `name` — agent identifier
- `version` — semver
- `domain` — "engineering", "product", "docs", etc. (implies steering from that domain)
- `description` — one-sentence purpose
- `prompt` — full system prompt (multi-line string)
- `tools` — array of all available tools
- `approved_tools` — subset usable without human approval
- `skills` — array of skill references (e.g. `["skill/decision-record"]`)

**Inline comments** explain each field and provide examples.

**Implicit behavior:**
- Type is inferred from directory (`agents/` → type is "agent")
- Steering is inferred from domain (e.g. `domain = "engineering"` → loads `steering/global.md` and `steering/engineering.md`)
- Knowledge/standards are available to all agents on-demand, not pre-declared

Optional companion: `agents/{name}.md` with extended documentation (process, examples, etc.)

---

### 5. `skills/_template.md`

Annotated template for skill definitions. Uses `.md` with TOML front-matter.

**Front-matter fields** (minimal):
- `name` — skill identifier
- `version` — semver
- `description` — one sentence, what the skill does

**Body sections:**
- Purpose (expanded description)
- Inputs (what the skill needs to run)
- Steps (the procedure)
- Outputs (what it produces)
- Edge Cases / Error Handling

**Inline comments** in front-matter and section headers explain what belongs where.

---

### 6. `servers/_template.toml`

Annotated template for server definitions.

**TOML fields:**
- `name`, `version`, `type`, `protocol` (e.g. "mcp")
- `description`
- `transport` (e.g. stdio, http)
- `[[tools]]` array:
  - `name`, `description`
  - `inputs` (parameters)
  - `outputs` (return type)
- `schema`

**Inline comments** guide authoring.

---

### 7. `steering/_template.md`

Annotated template for steering definitions (global/domain scope only). Uses `.md` with TOML front-matter.

**Front-matter fields** (minimal):
- `name` — steering identifier
- `version` — semver
- `description` — one sentence, what this steering enforces

**Body sections:**
- Scope (global or domain; which domain if applicable)
- Rules (enforceable checklist items)
- Rationale (why each rule exists)
- Exceptions Process (how to deviate if needed)

**Note:** Agent-level steering stays in agent files — this template is for global and domain scope only.

---

### 8. `steering/global.md`

First real global steering file. Uses `.md` with front-matter.

**Rules that apply to every agent:**
- Output formatting standards
- How to handle ambiguity (ask, don't assume)
- Never fabricate facts
- Security posture minimums
- Human escalation triggers

---

### 9. `steering/engineering.md`

Domain-level steering for all engineering agents. Uses `.md` with front-matter.

**Rules:**
- Never implement without an approved plan
- Plan IDs in all artifacts
- Security and logging requirements are never optional
- Escalate to Architect when approach is unclear
- Placeholder section for git workflow standards (content TBD)

---

### 10. Directory READMEs

Create human-readable guides in each directory:
- `agents/README.md`
- `skills/README.md`
- `steering/README.md`
- `standards/README.md`
- `servers/README.md`

**Each contains:**
- Machine-exclusion notice at the top: **"This file is for human reference only. Agents must not load this file."**
- Purpose of the directory
- How to add new files to this directory
- Examples of what belongs here

---

## Files to Update

### 11. Existing Agent Files

For each existing agent (architect, tech-lead, software-engineer, principal-engineer, test-engineer, engineering-tech-writer):

**Create:** `agents/{name}.toml`

**TOML fields:**
- `name`, `version`, `type`, `status`, `domain`
- `description` (one-sentence purpose)
- `prompt` (full system prompt inline)
- `tools` (all available tools)
- `approved_tools` (subset usable without human approval)
- `skills` (list of skill references)
- `steering` (list of steering references)
- `knowledge` (list of knowledge/standards references)
- `schema` (agent schema version)
- Gap audit as TOML comment block at bottom

**Update:** Add machine-exclusion notice to top of existing `.md` files:
```markdown
> **Note:** This file is supplementary documentation for humans.  
> The canonical agent definition is in `{name}.toml`.  
> Agents should load the `.toml` file, not this one.
```

---

### 12. Root `README.md`

Add a new **Meta-Standards** section after the existing "Standards" section.

**Contains:**
- Link to `AGENTS.md` as the machine-facing entry point
- Explanation of the `.toml` + optional `.md` file model
- Link to `tests/validate.py` and how to run it
- Brief explanation of component types (Agent, Skill, Steering, etc.)

---

## Execution Order

1. **`AGENTS.md`** — schema and rules everything else depends on
2. **Templates** — `agents/_template.toml`, `skills/_template.md`, `steering/_template.md`, `servers/_template.toml`
3. **Real steering** — `steering/global.md`, `steering/engineering.md`
4. **Directory READMEs** — `agents/`, `skills/`, `steering/`, `standards/`, `servers/`
5. **Validation suite** — `tests/validate.py`, `tests/README.md`
6. **Agent TOML files** — create `.toml` for each existing agent, add gap audit
7. **Agent MD updates** — add machine-exclusion notices to existing `.md` files
8. **Root README** — add Meta-Standards section

---

## Explicitly Out of Scope

These are noted for future work but not part of this implementation:

- Extracting embedded skills from agent files (future refactor, noted in gap audits)
- Knowledge/RAG storage layer implementation
- Git workflow standards content (slot exists in `steering/engineering.toml`, fill later)
- Actual MCP server instance files (template only, no real servers yet)
- Automated CI validation (manual `python tests/validate.py` for now)
- A2A AgentCard compliance (not pursuing at this time)

---

## Success Criteria

✅ `AGENTS.md` exists and is complete  
✅ Templates exist for agents (`.toml`), skills (`.md`), steering (`.md`), servers (`.toml`)  
✅ Global and engineering steering files exist as `.md` with front-matter  
✅ All directories have human-readable READMEs  
✅ Validation script exists and runs without errors  
✅ All existing agents have `.toml` definitions  
✅ All existing agent `.md` files have machine-exclusion notices  
✅ Root README documents the meta-standards layer  
✅ Gap audits are present in agent `.toml` files as comments  

---

## Agent TOML Schema Summary

For quick reference during implementation:

```toml
+++
name = "architect"
version = "1.0.0"
domain = "engineering"
description = "Technical decision-making agent. Explores options, produces Decision Records."

prompt = """
You are the Architect agent. Your role is to evaluate technical approaches,
explore multiple options, surface trade-offs, and produce Decision Records
that guide planning and implementation.
"""

tools = ["read", "write", "web_search", "code"]
approved_tools = ["read", "code"]

skills = ["skill/decision-record", "skill/option-analysis"]
+++

# Gap Audit (temporary, remove once addressed)
# - Missing: explicit input/output contracts in Process section of .md
# - Consider: extracting option-generation logic to reusable skill
```

**Notes:**
- Type inferred from directory (files in `agents/` are agents)
- Status dropped (not currently needed)
- Steering inferred from domain (engineering → global + engineering steering)
- Knowledge/standards available on-demand, not declared upfront
- Schema version tracking not implemented yet (add when schema evolves)

---

## Notes

- **File formats:** Agents and servers use `.toml` (machine-executed); skills and steering use `.md` with TOML front-matter (read and followed); knowledge/standards are plain `.md`
- **Minimal front-matter:** Skills/steering have only `name`, `version`, `description`. Agents have `name`, `version`, `domain`, `description`, `prompt`, `tools`, `approved_tools`, `skills`
- **Implicit behavior:** Type inferred from directory. Steering inferred from domain. Knowledge available on-demand, not pre-declared
- **Inline prompts:** Full prompt text goes in agent `.toml` for simplicity (KISS principle)
- **Directory naming:** `servers/` (not `mcp/servers/`) to future-proof against protocol changes; `protocol` field in TOML identifies the implementation
- **Optional documentation:** `.md` companions for agents/servers are always optional — create only when needed
- **Versioning:** Follow semver; patch for wording, minor for new sections, major for schema/behavior changes
- **Schema evolution:** No `schema` version field yet — add when we actually make a breaking schema change
