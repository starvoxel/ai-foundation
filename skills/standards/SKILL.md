---
name: 'standards'
version: '1.0.0'
description: 'Finds the coding standards that apply to the current project by tag matching and dependency order, so they can be read before any implementation.'
---

## Purpose

Standards are acceptance criteria, so they are loaded before implementation starts. Which ones apply is deterministic — a script resolves it, not the agent.

## Inputs

- **`.aiconfig.json`** — its `standards` map (domain → tags, plus `all`) names the project's tags

## Steps

### Step 1 — Resolve

Run `node scripts/resolve.js` from this skill's directory (the harness gives its path), with the project root as the working directory so `.aiconfig.json` and `./standards` are found. It prints the matching standards' paths in load order, dependencies first. A standard matches when all of its tags are among the project's; project-local `./standards` wins over the installed copies. Options: `--domain <name>` (default `engineering`), `--config <path>`, `--json`.

### Step 2 — Read them in order

Read each listed file, dependencies first, before writing code. No output means no standards apply; proceed, and still follow standards named in the active plan or task.

## Outputs

- The ordered list of standards files, read

## Edge Cases

- **The script reports a missing dependency or a cycle** — stop and report it; a standard is broken
- **No `.aiconfig.json` or no `standards` field** — nothing matches; proceed without default standards
- **A standard conflicts with the task** — raise it with the human; never deviate silently
