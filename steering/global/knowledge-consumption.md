---
name: 'knowledge-consumption'
version: '0.5.0'
description: 'Instructs agents to load relevant project knowledge before starting work and to keep architecture docs current when a change touches a building block they describe.'
file_patterns: []
---

## Scope

All agents, all sessions, in projects that have a knowledge directory.

---

## Rules

### Rule: Load Relevant Knowledge Before Implementing

- Read `{paths.architecture}/index.json` if it exists (generated and gitignored; `aif index architecture` rebuilds it), otherwise list the directory. Load the arc42 sections whose `key_files` or tags touch your work
- Also check `{paths.knowledge}` for reference files about external systems the work depends on; load those whose `scope` includes you or `all` and whose tags overlap
- Standards win over knowledge: if the two conflict, follow the standard and raise the conflict

**Rationale:** Ignoring available context produces rework and code that contradicts the architecture.

**Exceptions:** No knowledge directory means nothing to load. Under tight context, load architecture before reference material.

---

### Rule: Resolve Configured Paths With `aif config`

- Never work out a `{paths.*}` directory or other `.aiconfig.json` field yourself. Run `aif config <key>` from the project root, adding `--abs` for an absolute path: it returns the configured value or the documented default, with `{key.path}` references resolved
- Do this wherever this repo's rules and skills write `{paths.plans}`, `{paths.product}`, `{paths.architecture}`, `{paths.research}` or `{paths.knowledge}`, and pass the resolved path to any subagent that needs it
- If `aif` is not on PATH, read `.aiconfig.json` and fall back to the defaults in AGENTS.md, and say so

**Rationale:** The defaults live in code (`lib/aiconfig-defaults.js`), so every agent gets the same answer instead of its own reading of the prose.

**Exceptions:** None.

---

### Rule: Keep Architecture Docs Current

- When a task extends or removes a building block an arc42 section describes, update that section in the same task: add a `key_files` entry for a new file that extends the block, and remove the description and `key_files` entry of a file the task deletes
- A new building block no section describes gets its own section (or subsection), not a stray `key_files` entry elsewhere
- When a `key_files` change leaves the section accurate, waive it in the commit message instead (`steering/engineering/architecture-authoring.md`: "Staleness Is Computed From Git, Not Stored")
- Check this before presenting a result

**Rationale:** A doc describing what no longer exists is worse than none.

**Exceptions:** None.

---

## Enforcement

A change that contradicts relevant knowledge, or extends a described block without the doc update, is a MEDIUM finding at review.
