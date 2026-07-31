---
name: "epic-planning"
version: "0.1.0"
description: "Produces a structured Epic Plan describing a complete feature at a human-reviewable level."
---

## Purpose

Translates a goal (human request, PRD, or Decision Record) into a structured Epic Plan
that describes a full feature at a level a developer can review and give feedback on.
Does not contain implementation detail — that lives in Chunk Plans.

---

## Inputs

- **Goal** — human request, PRD, or Decision Record describing what to build
- **Project standards** — from `projects/{name}/project-standards.md`
- **Language standards** — from `standards/{stack}.md`
- **Decision Records** — any relevant prior decisions (check before writing)

---

## Steps

### Step 1 — Read Inputs

Read all available context. If a Decision Record exists, the Epic must not contradict it.
Identify ambiguities or conflicts to raise as open questions.

### Step 2 — Write Epic Plan

Follow the template at `skills/epic-planning/reference/template.md`. Key sections:
- Section 4 (Feature Description) is the main reviewable content — be thorough
- Section 5 (Architecture Overview) stays high-level — no method signatures
- Section 7 (Open Questions) captures anything needing human input
- Section 8 (Chunk Decomposition) is left empty until after approval

Set status to Draft.

### Step 3 — Stop for Human Approval

Do not decompose into chunks. Do not proceed until the human approves.

### Step 4 — Decompose into Chunks

After approval, fill in Section 8:
- Identify natural boundaries (data layer, service layer, UI, tests, docs)
- Map dependencies between chunks explicitly
- Identify which chunks can run in parallel
- Assign appropriate agent(s) to each chunk

---

## Outputs

- **Epic Plan** — markdown file following the template
- **Location:** `plans/{ProjectName}/epics/{YYYY-MM-DD}_{###}_{ShortTitle}.epic.md`

---

## Edge Cases

- **PRD conflicts with Decision Record** — raise as a HIGH priority open question. Do not silently resolve.
- **Scope too large to decompose cleanly** — suggest splitting into multiple Epics.
- **No Out of Scope items** — the iteration is too large. Find something to defer.
