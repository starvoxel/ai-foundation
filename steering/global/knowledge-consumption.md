---
name: 'knowledge-consumption'
version: '0.1.1'
description: 'Instructs agents how to discover and load project knowledge before starting work.'
file_patterns: []
---

## Scope

All agents, all sessions. Knowledge consumption applies across every domain.

---

## Rules

### Before Starting Work

When beginning a task in a project that has a `knowledge/` directory:

1. Check if `knowledge/index.json` exists
2. If it does, read the index and identify entries relevant to your task:
   - Match entries where `scope` includes your agent name, your domain, or `all`
   - Match entries where `tags` overlap with the components or concepts you are working on
3. Load the matching knowledge files before proceeding

If no `knowledge/index.json` exists, scan `knowledge/` directory listings to discover relevant files by name. Prefer loading the index when available — it is faster and provides descriptions for relevance assessment without reading full files.

**Do not begin implementation without first checking for relevant knowledge.** Failing to load available knowledge leads to rework, contradicted decisions, and code that does not fit the existing architecture.

### What to Load

- **Never skip:** entries with `scope: "all"` and tags matching your current task
- **Never ignore:** confirmed Decision Records that relate to your work area
- **Load if relevant:** entries scoped to your domain or agent name
- **May skip:** entries scoped to other domains/agents with no tag overlap to your task
- **Never reference:** a Decision Record that is not in the `Approved` status — these are not authoritative

### When Knowledge Conflicts with Standards

Standards are prescriptive rules. Knowledge is descriptive reference.
If knowledge describes a pattern that conflicts with the active standards file, follow the standards. Raise the conflict as a finding — do not silently ignore either source.

---

## Rationale

Agents produce worse output when they ignore available context. Without knowledge consumption, agents reinvent settled decisions, miss constraints, contradict prior architecture choices, and produce code that must be reworked. The index enables efficient discovery without loading every file into context.

## Exceptions

- If no `knowledge/` directory exists, skip knowledge loading entirely.
- If context budget is severely constrained, prioritize: decisions > architecture > api > reference > business-rule. Never drop decisions.
