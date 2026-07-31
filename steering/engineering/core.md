---
name: "engineering-core"
version: "0.1.0"
description: "Core rules that apply to all agents operating in the engineering domain."
---

## Scope

**This steering applies to:** All agents with `domain = "engineering"`.

**Loaded when:** At session start for any engineering agent, after `steering/global/core.md`.

---

## Rules

### Rule 1: Never Implement Without an Approved Plan

- No code may be written until a Chunk Plan exists and has been approved by a human
- "Approved" means the human has explicitly confirmed — not just reviewed
- If a plan does not exist, the engineering agent must stop and route to Tech-Lead to create one

**Rationale:** Implementing before planning leads to scope creep, rework, and code that doesn't fit the larger architecture. The planning gate exists precisely to catch problems before they are expensive.

**Exceptions:** Exploratory spikes and proof-of-concept code — but only when explicitly requested by the human, and the spike output must never be treated as production-ready without a proper plan.

---

### Rule 2: Every Artifact Must Reference Its Plan ID

- Source files, work log entries, review reports, and test results must include the Plan ID they belong to
- File header comments must include the Plan ID
- This applies to new files and to files meaningfully modified as part of a plan

**Rationale:** Plan IDs provide traceability from code back to intent. Without them, debugging and auditing become significantly harder, especially when multiple plans are running in parallel.

**Exceptions:** Files modified incidentally (e.g. a typo fix not part of any plan) do not require Plan IDs. The threshold is "meaningfully modified as part of planned work."

---

### Rule 3: Logging Requirements Are Never Optional

- Logging requirements defined in plans, standards, or project-standards files are mandatory
- The agent must not omit log statements defined as required, defer them to "later," or substitute print statements
- Log levels must be correct — security events are never Debug-level

**Rationale:** Logging is the primary observability tool in production. Missing logs make production issues significantly harder to diagnose. Like security, logging is an acceptance criterion, not polish.

**Exceptions:** Only when the human explicitly waives a specific logging requirement after the agent has flagged it. The waiver must be documented in the plan.

---

### Rule 4: Raise Discoveries Rather Than Silently Expanding Scope

- If the agent discovers that a task requires work not described in the current plan, it must stop and raise it as an open question on the parent Epic
- The agent must not silently implement additional scope, even if the addition seems obviously correct
- Out-of-scope work discovered during implementation is either deferred or planned explicitly

**Rationale:** Silent scope expansion undermines the planning gate. Even well-intentioned additions may conflict with other planned work, introduce dependencies, or violate architectural decisions already made.

**Exceptions:** Trivially small corrections (e.g. fixing an obvious typo in a file already being modified) that have zero architectural impact. These should still be noted in the work log.

---

### Rule 5: Escalate Technical Approach Uncertainty to Architect

- When a task requires a technical decision that is not covered by existing standards, project standards, or a Decision Record, the agent must route to Architect before proceeding
- This includes: new libraries or technologies, significant architectural trade-offs, cases where two or more meaningfully different approaches exist
- The agent must not make architectural decisions unilaterally, even when confident

**Rationale:** Architectural decisions made ad-hoc during implementation are rarely revisited and often become permanent. Architect exists to structure these decisions before they are locked in.

**Exceptions:** Decisions that are clearly within the established patterns of the active standards files. If a pattern already exists in the codebase or standards for this exact case, the agent follows it without escalation.

---

### Rule 6: Security Requirements Are Acceptance Criteria

- Security checklist items in plans and standards files are not optional
- A review with unfulfilled security requirements must not be approved regardless of other code quality
- Security violations are always HIGH or CRITICAL severity — never lower

**Rationale:** Security requirements exist because the cost of a violation is disproportionately high. Treating them as polish leads to deferred vulnerabilities.

**Exceptions:** None. See `steering/global/core.md` Rule 3 for the global security escalation process.

---

## Enforcement

- **No-plan violations:** The agent stops work and routes to Tech-Lead. No exceptions.
- **Plan ID violations:** Caught during Principal-Engineer review. Missing Plan IDs are a MEDIUM finding.
- **Logging violations:** Caught during Principal-Engineer review. Missing required logs are a HIGH finding.
- **Scope expansion violations:** Caught during review or human inspection. Silently added scope is removed and planned properly.
- **Architectural escalation violations:** If an agent makes an undocumented architectural decision, it is flagged for Architect review retroactively.
- **Security violations:** Always block approval. See Principal-Engineer review process.

---

## Notes

These rules exist because the most common and expensive engineering failures are:
1. Building the wrong thing (prevented by Rule 1 and Rule 4)
2. Building it in an unmaintainable way (prevented by Rules 3, 5, and 6)
3. Losing track of why things were done (prevented by Rule 2)

When a rule feels like it is slowing things down, that is usually a sign that planning was skipped, not that the rule is wrong.

**Placeholder — Git Workflow Standards:** Rules for branch naming, commit conventions, PR process, and agent-driven automation of git workflows will be added to `steering/engineering/git-workflow.md` when defined.
