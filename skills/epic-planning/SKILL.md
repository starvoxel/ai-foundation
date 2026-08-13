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
- **Project config** — `.aiconfig.json` at project root (for paths, project name/shortname, standards reference)
- **Project standards** — from `projects/{name}/project-standards.md` or path in `.aiconfig.json`
- **Language standards** — from `standards/{stack}.md` (stack identified by `.aiconfig.json` or ask)
- **Decision Records** — any relevant prior decisions (check before writing)

---

## Steps

### Step 1 — Read Inputs

Read all available context. If a Decision Record exists, the Epic must not contradict it.
Identify ambiguities or conflicts to raise as open questions.

### Step 2 — Determine Epic ID

Epic IDs follow the format `{ProjectShortName}-{###}` (e.g. `MYAPP-001`), an
ever-incrementing, zero-padded 3-digit number — no date segment.

1. Read `project_shortname` from `.aiconfig.json` (falls back to `project_name` if unset)
2. Scan `{paths.epics}/` for existing epic files matching `{ProjectShortName}-*.epic.md`
3. Take the highest existing `###` and increment by 1 (zero-padded to 3 digits)
4. If no existing epics are found, start at `001`

### Step 3 — Write Epic Plan

Follow the template at `skills/epic-planning/reference/template.md`. Key sections:
- Section 4 (Feature Description) is the main reviewable content — be thorough
- Section 5 (Architecture Overview) stays high-level — no method signatures
- Section 7 (Open Questions) captures anything needing human input
- Section 8 (Chunk Decomposition) is left empty until after approval

Set status to Draft.

### Step 4 — Stop for Human Approval

Do not decompose into chunks. Do not proceed until the human approves.

### Step 5 — Decompose into Chunks

After approval, produce the `chunks.json` file:
1. Copy the template from `skills/epic-planning/assets/chunks.json`
2. Set `epic_id` to this epic's ID
3. Identify natural boundaries (data layer, service layer, UI, tests, docs)
4. Define each chunk with explicit `depends_on` references
5. Assign appropriate agent(s) to each chunk
6. Run `dag-validate` against the file

If `dag-validate` fails:
- Read the errors (cycles, missing refs, schema issues)
- Fix the `chunks.json` and re-validate
- Retry up to 3 times
- If still invalid after 3 attempts, stop and escalate to the human with the validation errors

Once valid, update Section 8 of the epic plan with a summary (chunk count, wave count,
parallelization notes) and a reference to the `chunks.json` file.

---

## Outputs

- **Epic Plan** — markdown file following the template
- **Location:** `{paths.epics}/{EpicID}.epic.md` (from `.aiconfig.json`, default: `plans/epics/`)
- **Chunk Decomposition** — `chunks.json` file (produced after approval, validated by `dag-validate`)
- **Location:** `{paths.chunks}/{EpicID}/chunks.json` (from `.aiconfig.json`, default: `plans/chunks/`)

---

## Edge Cases

- **PRD conflicts with Decision Record** — raise as a HIGH priority open question. Do not silently resolve.
- **Scope too large to decompose cleanly** — suggest splitting into multiple Epics.
- **No Out of Scope items** — the iteration is too large. Find something to defer.
- **DAG validation fails after 3 retries** — stop and escalate to the human. Present the validation errors and the current `chunks.json` state. Do not proceed with an invalid dependency graph.
