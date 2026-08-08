---
name: "decision-record"
version: "0.1.0"
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

### Step 3 — Produce Decision Record

Write the record using the template at `skills/decision-record/reference/template.md`.
Set status to Draft. The human confirms before it is finalized.

---

## Outputs

- **Decision Record** — markdown file following the template format
- **Location:** `{paths.decisions}/{YYYY-MM-DD}_{###}_{ShortTitle}.decision.md` (from `.aiconfig.json`, default: `knowledge/decisions/`)

---

## Edge Cases

- **Human disagrees with recommendation** — update the Decision Record with their choice and rationale. The record captures what was decided, not what was recommended.
- **No clear winner** — explicitly state the tie-breaking question. Do not force a recommendation without evidence.
- **Decision deferred** — still produce the record with status "Deferred" and document why.
