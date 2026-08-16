---
name: "complexity-tiers"
version: "0.1.0"
description: "Assesses task complexity and scales process rigor accordingly, from a quick fix to a full approved plan."
---

## Purpose

Provides a shared framework for scaling process to the size of the work: small, clear changes move fast with minimal ceremony, while cross-cutting or ambiguous work gets a written plan and explicit human approval before implementation. This avoids two failure modes — over-processing trivial changes, and under-processing changes that quietly reshape how other components work.

Use this skill whenever an agent needs to decide how much process a task warrants before starting work.

---

## Inputs

- **Task description** — what the human is asking for
- **Affected components** — what the agent already knows will be touched, if anything
- **Human override signals, if any** — e.g. "just do it" or "plan this"

---

## Steps

### Step 1 — Assess complexity and state the tier

Before starting work, assess which tier applies and state it explicitly, with brief reasoning. The human can override the assessment up or down at any time.

### Step 2 — Tier 1 (Quick)

**Signals:** single-file change, clear intent, no new patterns, no schema changes.
**Examples:** fix a typo, update a version, add a tool to an existing agent, tweak wording.

**Process:**
1. Clarify (if anything is ambiguous — skip if intent is obvious)
2. Implement — follow the governing schema/standard exactly
3. Self-validate — run tests, verify cross-references
4. Present result

### Step 3 — Tier 2 (Standard)

**Signals:** multi-file change, new component (but straightforward), modifying an existing pattern without changing it.
**Examples:** author a new steering file, add a new skill following an established pattern, create a new server definition.

**Process:**
1. Clarify — ask questions if anything is unclear
2. Outline approach — brief paragraph or bullet list of what will be created/changed
3. **Stop. Wait for human approval before implementing.**
4. Implement — follow the governing schema/standard exactly
5. Self-validate — run tests, verify cross-references
6. Present result

### Step 4 — Tier 3 (Complex)

**Signals:** cross-cutting changes, new conventions or patterns, multi-component design, schema changes, anything that reshapes how other components work.
**Examples:** redesigning a component into multiple roles, creating a new interconnected set of components, introducing a new convention, changing a schema.

**Process:**
1. Clarify — ask focused questions to bound scope
2. Produce a written plan
3. **Stop. Wait for human approval before implementing.**
4. Implement — follow the approved plan
5. Self-validate — run tests, verify cross-references, check plan criteria
6. Present result — reference the plan, confirm all items addressed

### Step 5 — Apply tier selection rules

- State the tier and reasoning at the start of every task
- When in doubt, tier up (prefer more process over less)
- If mid-task complexity turns out higher than assessed, stop and escalate to the next tier rather than continuing under the original assessment

---

## Outputs

- **A stated tier** (1, 2, or 3) with brief reasoning
- **The process followed for that tier**, carried out as described above

---

## Edge Cases

- **Human says "just do it"** — the human is overriding to Tier 1. Acknowledge and proceed without a plan or approval gate, regardless of the agent's own assessment.
- **Human says "plan this"** — the human is overriding to Tier 3. Produce a written plan even if the work looked like Tier 1 or 2.
- **Complexity grows mid-implementation** — stop, state the new tier assessment, and follow that tier's gate (including going back for approval) before continuing. Do not finish under the original, now-incorrect tier.
- **Which plan format Tier 3 uses** — this skill defines the tiering framework, not the plan format itself. The invoking agent's own prompt or skills determine which plan artifact (e.g. Chunk Plan, Epic Plan, or a lighter Tier-3-specific plan) applies to its domain.
