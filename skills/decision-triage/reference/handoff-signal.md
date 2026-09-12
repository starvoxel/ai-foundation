# Decision Hand-off Signal

The structured payload `decision-triage` produces when Step 4 (Check invoking agent against the domain owner) detects a mismatch — the invoking agent is not the domain owner for the Tier A/B decision it is trying to record. This is a documented signal shape for other skills/prose to follow, not a JSON Schema enforced by any script (this skill has no `scripts/` — Tier/Domain selection requires judgment, not a deterministic check).

Tier C never reaches this signal — Step 4 (and the domain-owner check) only applies to Tier A/B decisions.

---

## Fields

| Field             | Type                                            | Required | Notes                                                                                                                    |
| ----------------- | ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `domain`          | string (Domain code, e.g. `PROC`, `ARCH`)       | Yes      | From the `reference/tier-and-domain.md` Domain table                                                                     |
| `tier`            | string (`A` or `B`)                             | Yes      | Tier C never reaches this signal — no domain check applies to Tier C                                                     |
| `owning_agent`    | string (agent name, e.g. `Engineering-Manager`) | Yes      | From the `reference/tier-and-domain.md` Domain table                                                                     |
| `invoking_agent`  | string (agent name)                             | Yes      | The agent that invoked `decision-triage`                                                                                 |
| `problem_summary` | string                                          | Yes      | One to two sentences — enough for the domain owner or human to understand what decision is needed without re-deriving it |

---

## Consumption contexts

### Orchestrated context

When `decision-triage` runs as part of a chunk dispatched by `skill/chunk-orchestration`, this signal is exactly what that skill's Decision Hand-off Sub-Flow (Step 4, "Handle Blocks") reads to populate a chunk's structured `blocked_reason` (domain, tier, owning agent) per Epic AIF-002's Decision Hand-off Sub-Flow description. The chunk is marked `Blocked`, and the owning agent is dispatched (or Engineering-Manager authors directly, if it is the owner) to drive the decision to `Approved` before the chunk resumes.

This file documents the signal shape as a contract other chunks/skills build against — implementing the Decision Hand-off Sub-Flow itself (including the `decision_handoff_detected`/`decision_authored`/`decision_handoff_resolved` log actions that consume these field names) is out of this skill's scope; see `skill/chunk-orchestration`.

### Standalone context

When an agent invokes `decision-triage` outside orchestration (e.g. working directly with a human, with no dispatching orchestrator in the loop), the agent presents the same five fields as a plain-text stop-and-report message to the human: which Domain and Tier the decision was classified as, who the actual owner is, who tried to author it, and a short summary of the problem needing a decision. The agent then stops — it does not proceed to invoke `skill/decision-record`/`skill/decision-brief` on behalf of a domain it does not own.

---

## Example (illustrative only — not a schema file)

```
domain: PROC
tier: B
owning_agent: Engineering-Manager
invoking_agent: Architect
problem_summary: >
  Need to decide how orchestration should batch retries for a flaky
  integration test step — an orchestration/dispatch concern, not an
  architecture one.
```

---

<!-- Authored under AIF-002-001 -->
