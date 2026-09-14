---
name: 'chunk-planning'
version: '0.3.1'
description: 'Produces a Chunk Plan with enough detail for an agent to implement without ambiguity.'
---

## Purpose

Decomposes one piece of an approved Epic into a fully specified Chunk Plan. Contains everything an implementing agent needs: components, interfaces, security requirements, logging requirements, test cases, and acceptance criteria.

**Scope:** This skill and its Chunk Plan template apply to software-track chunks only — chunks with `agents: ["Software-Engineer"]` in `chunks.json`. See "AI-Track Chunks" below for the separate procedure that applies to `agents: ["AI-Engineer"]` chunks.

---

## Inputs

- **Approved Epic Plan** — parent epic with Section 9 chunk decomposition filled in
- **Language standards** — from `standards/{stack}.md`
- **Project standards** — from `projects/{name}/project-standards.md`
- **Dependency chunks** — any chunks this one depends on (for interface contracts)

---

## Steps

### Step 1 — Determine Scope from Epic

Read the Epic's Section 9 to understand this chunk's boundaries, dependencies, and parallelization constraints.

### Step 2 — Write Chunk Plan

Follow the template at `skills/chunk-planning/reference/template.md`.

Standards composition order (later overrides earlier):

1. The template (universal structure)
2. Language/stack standards
3. Project standards

Key rules:

- Section 10 (Security) and Section 11 (Logging) must never be empty
- Section 8 (Components) must be detailed enough to implement without questions
- Section 4 (Acceptance Criteria) and Section 3 (Quick Summary) come right after the Goal — keep Section 3's open-item count in sync whenever Section 14 (Risks & Open Questions) changes
- Write interfaces/contracts before considering implementation

### Step 3 — Follow the Commit-Gate Procedure

Follow `skill/plan-lifecycle` to save the plan with `Status: Draft`, commit it, and present it for human approval. Do not begin implementation. Do not proceed until the human's decision (`Approved` or `Deferred`) is committed.

---

## AI-Track Chunks

Chunks with `agents: ["AI-Engineer"]` in `chunks.json` do **not** use this skill's Steps 2-3 or the Chunk Plan template — Tech-Lead is not expected to write AGENTS.md-schema-level detail for declarative AI components (per AIF-004/AIF-005). For these chunks:

- Tech-Lead's Epic decomposition (Section 9) provides only a scope summary and `depends_on` for the chunk — not a detailed software-style breakdown.
- AI-Engineer authors the chunk's own detailed plan, using `skill/complexity-tiers` to determine process:
  - **Tier 1/2** — no separate written plan artifact is required.
  - **Tier 3** — a written plan is required, produced via `skill/ai-engineering-plan` (not this skill's template).
- Regardless of tier, the AI-track chunk plan (when one exists) is saved at the same standard chunk-plan path convention as software-track plans, and is gated by `skill/plan-lifecycle` exactly like a software-track Chunk Plan — `Status: Draft` committed first, no implementation until the human's `Approved` decision is committed. The human-approval gate is not weakened for either track (AIF-005 non-negotiable constraint).
- `chunk-orchestration`'s pipeline reflects this split: AI-track chunks skip Test-Engineer (AI-Engineer implements and self-validates → Principal-Engineer review → Done); software-track chunks are unchanged (Software-Engineer → Test-Engineer → Principal-Engineer).

---

## Outputs

Software-track chunks (`agents: ["Software-Engineer"]`):

- **Chunk Plan** — markdown file following the template
- **Location:** `{paths.chunks}/{EpicID}/{###}_{ShortTitle}.plan.md` (from `.aiconfig.json`, default: `plans/chunks/`)

AI-track chunks (`agents: ["AI-Engineer"]`): see "AI-Track Chunks" above — no output from this skill; AI-Engineer's own Tier 1/2/3 process produces the (optional) plan artifact at the same path convention.

---

## Edge Cases

- **Discovers work not in the Epic** — stop and raise as an open question on the parent Epic. Do not expand scope.
- **Dependency chunk not complete** — write the plan assuming the dependency's documented interfaces. Note the assumption.
- **Security/logging requirements unclear** — raise as a risk in Section 14. Never leave Sections 10-11 empty.
- **AI-track chunk boundary looks wrong (too coarse, too fine, or a missing dependency)** — this applies to AI-Engineer discovering the issue while authoring its own plan, not to this skill's authorship. AI-Engineer stops and raises it as an open question on the parent Epic per the "Discovers work not in the Epic" case above; Tech-Lead revises Section 9/`chunks.json` (per AIF-010).
