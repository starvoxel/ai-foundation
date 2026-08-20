---
name: "epic-planning"
version: "0.3.0"
description: "Produces a structured Epic Plan describing a complete feature at a human-reviewable level."
---

## Purpose

Translates a goal (human request, PRD, or Decision Record) into a structured Epic Plan that describes a full feature at a level a developer can review and give feedback on.
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

Epic IDs follow the format `{ProjectShortName}-{###}` (e.g. `MYAPP-001`), an ever-incrementing, zero-padded 3-digit number — no date segment.

1. Read `project_shortname` from `.aiconfig.json` (falls back to `project_name` if unset)
2. Scan `{paths.epics}/` for existing epic files matching `{ProjectShortName}-*.epic.md`
3. Take the highest existing `###` and increment by 1 (zero-padded to 3 digits)
4. If no existing epics are found, start at `001`

### Step 3 — Write Epic Plan

Follow the template at `skills/epic-planning/reference/template.md`. Key sections:
- Section 3 (Quick Summary) comes right after the Goal — keep its open-item count in sync whenever Section 8 changes
- Section 5 (Feature Description) is the main reviewable content — be thorough
- Section 6 (Architecture Overview) stays high-level — no method signatures
- Section 8 (Risks & Open Questions) captures risks and anything needing human input, merged into one table
- Section 9 (Chunk Decomposition) is left empty until after approval

### Step 4 — Follow the Commit-Gate Procedure

Follow `skill/plan-lifecycle` to save the plan with `Status: Draft`, commit it, and present it for human approval. Do not decompose into chunks. Do not proceed until the human's decision (`Approved` or `Deferred`) is committed.

### Step 5 — Decompose into Chunks

After approval, produce the `chunks.json` file:
1. Copy the template from `skills/epic-planning/assets/chunks.json`
2. Set `epic_id` to this epic's ID
3. Identify natural boundaries (data layer, service layer, UI, tests, docs)
4. Define each chunk with explicit `depends_on` references
5. Assign appropriate agent(s) to each chunk. A chunk's `agents` field determines its track and how much detail this skill needs to capture for it here:
   - **Software-track chunk** (`agents: ["Software-Engineer"]`) — unchanged. Tech-Lead still authors a detailed Chunk Plan for this chunk (via `skill/chunk-planning`) before it is dispatched.
   - **AI-track chunk** (`agents: ["AI-Engineer"]`) — this skill only needs a scope summary (what the chunk covers, e.g. as `title` in `chunks.json`) and its `depends_on` entry. Do not produce a detailed software-style Chunk-Plan breakdown for it here. AI-Engineer authors its own detailed plan for the chunk (Tier 1/2: no written plan required; Tier 3: `skill/ai-engineering-plan`), gated by `skill/plan-lifecycle` the same as any other plan, per AIF-005/AIF-010.
6. Run `dag-validate` against the file

If `dag-validate` fails:
- Read the errors (cycles, missing refs, schema issues)
- Fix the `chunks.json` and re-validate
- Retry up to 3 times
- If still invalid after 3 attempts, stop and escalate to the human with the validation errors

Once valid, update Section 9 of the epic plan with a summary (chunk count, wave count, parallelization notes) and a reference to the `chunks.json` file.

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
