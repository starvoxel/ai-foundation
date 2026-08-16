---
name: "ai-engineering-plan"
version: "0.2.0"
description: "Produces a structured plan for complex AI component work that requires human approval before implementation."
---

## Purpose

Produces a lightweight but structured plan for Tier 3 (complex) AI engineering work.
This is not a full Epic Plan or Decision Record — it is scoped to AI component changes that are cross-cutting, introduce new patterns, or reshape how multiple components interact.

Use this skill when the ai-engineer agent assesses work at Tier 3 complexity and needs to produce a plan for human approval before implementation begins.

---

## Inputs

- **Task description** — what the human wants accomplished
- **Affected components** — which agents, skills, steering, servers, or tests are involved (discovered via investigation)
- **Current state** — what exists today (read from the repo)
- **Constraints** — any stated requirements, non-goals, or boundaries from the human

---

## Steps

### Step 1 — Investigate current state

Read the relevant components to understand what exists:
- Read affected agent definitions
- Read affected skill SKILL.md files
- Read affected steering files
- Check cross-references (which agents reference which skills, etc.)
- Identify dependencies between components

### Step 2 — Identify scope and boundaries

Determine:
- What is changing vs. what stays the same
- What new components are needed
- What existing components need modification
- What is explicitly out of scope

### Step 3 — Draft the plan

Produce a plan following the schema in `reference/plan-schema.md`. The plan must:
- Be specific enough that the human can approve or reject the approach
- Identify risks or open questions
- State what will be validated after implementation
- Be concise — no padding, no boilerplate filler

### Step 4 — Follow the Commit-Gate Procedure

Follow `skill/plan-lifecycle`: save the plan to the repo (see Outputs) with `Status: Draft` and commit it before presenting to the human. Commit each revision round as its own commit. Do not begin implementation until the human's decision (`Approved` or `Deferred`) has been committed — chat approval alone does not satisfy the gate.

---

## Outputs

- **Plan document** — structured per `reference/plan-schema.md`
- **Location:** `{paths.plans}/{short-title}-plan.md` (from `.aiconfig.json`; if `paths.plans` is unset, fall back to `docs/plans/`)

---

## Edge Cases

- **Human says "just do it"** — the human is overriding to a lower tier. Acknowledge and proceed without a plan.
- **Scope grows during investigation** — if investigation reveals the work is larger than expected, state that in the plan and ask whether to proceed or split.
- **Depends on a decision not yet made** — surface it as an open question in the plan. Do not assume the answer.
- **Plan would duplicate an existing Decision Record** — reference the DR instead of restating it. The plan covers implementation approach, not the "why" behind the decision.
- **Human requests revisions after commit** — edit and commit again per `skill/plan-lifecycle`; never amend the prior commit.
