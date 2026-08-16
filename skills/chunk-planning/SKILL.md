---
name: "chunk-planning"
version: "0.2.0"
description: "Produces a Chunk Plan with enough detail for an agent to implement without ambiguity."
---

## Purpose

Decomposes one piece of an approved Epic into a fully specified Chunk Plan. Contains everything an implementing agent needs: components, interfaces, security requirements, logging requirements, test cases, and acceptance criteria.

---

## Inputs

- **Approved Epic Plan** — parent epic with Section 8 chunk decomposition filled in
- **Language standards** — from `standards/{stack}.md`
- **Project standards** — from `projects/{name}/project-standards.md`
- **Dependency chunks** — any chunks this one depends on (for interface contracts)

---

## Steps

### Step 1 — Determine Scope from Epic

Read the Epic's Section 8 to understand this chunk's boundaries, dependencies, and parallelization constraints.

### Step 2 — Write Chunk Plan

Follow the template at `skills/chunk-planning/reference/template.md`.

Standards composition order (later overrides earlier):
1. The template (universal structure)
2. Language/stack standards
3. Project standards

Key rules:
- Section 8 (Security) and Section 9 (Logging) must never be empty
- Section 6 (Components) must be detailed enough to implement without questions
- Write interfaces/contracts before considering implementation

### Step 3 — Follow the Commit-Gate Procedure

Follow `skill/plan-lifecycle` to save the plan with `Status: Draft`, commit it, and present it for human approval. Do not begin implementation. Do not proceed until the human's decision (`Approved` or `Deferred`) is committed.

---

## Outputs

- **Chunk Plan** — markdown file following the template
- **Location:** `{paths.chunks}/{EpicID}/{###}_{ShortTitle}.plan.md` (from `.aiconfig.json`, default: `plans/chunks/`)

---

## Edge Cases

- **Discovers work not in the Epic** — stop and raise as an open question on the parent Epic. Do not expand scope.
- **Dependency chunk not complete** — write the plan assuming the dependency's documented interfaces. Note the assumption.
- **Security/logging requirements unclear** — raise as a risk in Section 13. Never leave Sections 8-9 empty.
