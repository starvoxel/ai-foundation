---
name: "decision-record"
version: "0.2.0"
description: "Produces a structured Decision Record capturing options explored and the chosen approach."
---

## Purpose

Captures a technical decision with full context: the problem, constraints, options
explored, trade-offs, and the chosen approach with rationale. Creates a durable
record that planning agents reference and humans review.

---

## Inputs

- **Problem statement** — what question needs answering
- **Constraints** — non-negotiable requirements and preferences
- **Project context** — existing stack, standards, relevant codebase patterns
- **Clarification answers** — if ambiguity was resolved via questions

---

## Steps

### Step 1 — Generate Options

Propose 2-4 genuinely distinct approaches. For each:
- Name it clearly
- Describe it in plain language
- State strengths in this specific context
- State weaknesses or costs
- Assess against relevant criteria (complexity, testability, performance, etc.)

### Step 2 — Recommend

State which option is recommended and why, grounded in the stated constraints.
If genuinely too close to call, identify the one question that would break the tie.

### Step 3 — Write the Decision Record

Write the record using the template at `skills/decision-record/reference/template.md`.

### Step 4 — Follow the Commit-Gate Procedure

Follow `skill/plan-lifecycle` to save the record with `Status: Draft`, commit it, and
present it for human confirmation. The human confirms before it is finalized — do not
treat the record as authoritative until the human's decision (`Approved`, `Deferred`,
or later `Superseded`) is committed.

---

## Outputs

- **Decision Record** — markdown file following the template format
- **Location:** `{paths.decisions}/{YYYY-MM-DD}_{###}_{ShortTitle}.decision.md` (from `.aiconfig.json`, default: `knowledge/decisions/`)

---

## Edge Cases

- **Human disagrees with recommendation** — update the Decision Record with their choice and rationale. The record captures what was decided, not what was recommended.
- **No clear winner** — explicitly state the tie-breaking question. Do not force a recommendation without evidence.
- **Decision deferred** — still produce the record, set `Status: Deferred`, and document why. See `skill/plan-lifecycle` — a `Deferred` record is not approved and must not be referenced as if it were.
