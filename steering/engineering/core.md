---
name: 'engineering-core'
version: '1.0.0'
description: 'Core rules that apply to all agents operating in the engineering domain.'
requires_skills:
  - 'plan-lifecycle'
file_patterns: []
---

## Scope

**This steering applies to:** All agents with `domain = "engineering"`.

**Loaded when:** At session start for any engineering agent, after `steering/global/core.md`.

---

## Rules

### Rule: Plan Proportionately to the Work

- Small, clear work is implemented directly and summarised at the end
- Work too large to review in one pass is planned first and approved before implementation — follow `steering/engineering/git-workflow.md`: "Large Work Gets a Committed, Approved Plan First"
- The human's prompt may override the default oversight level unless `.aiconfig.json` enforces it

**Rationale:** Process cost should track the cost of a wrong turn. A one-line fix does not carry the risk of a cross-cutting redesign.

**Exceptions:** Exploratory spikes the human explicitly requests; their output is never production-ready without a plan.

---

### Rule: Logging Requirements Are Never Optional

- Logging requirements defined in plans or standards are mandatory
- Do not omit required log statements, defer them, or substitute print statements
- Log levels must be correct — security events are never Debug-level

**Rationale:** Logging is the primary observability tool in production; like security, it is an acceptance criterion, not polish.

**Exceptions:** Only when the human explicitly waives a specific requirement after the agent has flagged it.

---

### Rule: Raise Discoveries Rather Than Silently Expanding Scope

- If the work requires something the agreed plan or request does not describe, stop and raise it with the human
- Do not silently implement additional scope, even when it seems obviously correct

**Rationale:** Silent expansion defeats the agreed scope and may conflict with other work or earlier decisions.

**Exceptions:** Trivially small corrections with zero architectural impact (e.g. a typo in a file already being modified), noted in the commit message.

---

### Rule: Escalate Technical Approach Uncertainty

- When a decision is not covered by existing standards, project standards, or an ADR — a new library, a significant architectural trade-off, or two meaningfully different approaches — ask the human, or route to Architect when available, before proceeding
- Do not make such decisions unilaterally, even when confident

**Rationale:** Ad-hoc architectural decisions are rarely revisited and often become permanent.

**Exceptions:** Cases already covered by a pattern in the active standards or codebase.

---

### Rule: Design for Testability

- Separate pure logic (parsing, transforming, validating, deciding) from I/O (filesystem, network, processes)
- I/O functions are thin wrappers composing pure functions with external calls

**Rationale:** Pure logic is trivially unit-testable; mixed logic and I/O forces slow integration tests.

**Exceptions:** Trivially thin modules where the logic is the I/O coordination.

---

### Rule: Security Requirements Are Acceptance Criteria

- Security checklist items in plans and standards are not optional
- A review with unfulfilled security requirements must not be approved; security violations are always HIGH or CRITICAL
- Only the research agent may use web tools; every other agent routes outside-information needs through it

**Rationale:** The cost of a security violation is disproportionate, and web content in an implementing agent's context is an injection path.

**Exceptions:** None. See `steering/global/core.md`: "Security Requirements Are Never Optional".

---

### Rule: Cite, Don't Restate

- When a document needs a definition, procedure, or table that another skill, agent, or steering file already owns, cite that source by name — never copy its content inline
- The same applies within a single document: when one section already owns a definition, procedure, or enumerated list, another section of that same document must not restate it — point to the owning section instead
- Citing and then also restating the same content is still a violation of this rule; the citation does not excuse the copy
- Default to citing in every case. Restating instead of citing is not a stylistic choice and needs a concrete reason the citation genuinely cannot serve — "it reads better inline" or "it's more convenient here" are not reasons
- In an agent's own prompt, Hard rules is the authoritative section for enumerated "never"/"always" constraints. Purpose, Responsibilities, and other narrative sections may describe the same boundary in prose, but must not restate the same itemized list — point to Hard rules ("see Hard rules for...") instead
- When the citation points at one specific locator inside the source rather than the whole document, name that locator instead of citing it by number: `` `skill/{name}`: "Step Heading Text" `` or `` `steering/{path}.md`: "Rule Heading Text" ``, chaining more than one with `→` (e.g. `"Step A" → "Step B"`). A plain reference to the whole component (`skill/{name}`, `steering/{path}.md`) needs no quoted name.
- A skill's steps stay numbered (`### Step N — Name`) because they're an ordered procedure — position is meaningful, and the number is part of what's being cited alongside the name. A steering file's rules are headed `### Rule: Name` with **no number at all** — rules are independent, unordered constraints, so a number would carry no real meaning, only a drift risk: a bare `Rule 10` silently keeps "working" even after Rule 10 is reordered, split, or replaced by a completely different rule, because the number still resolves to _something_. Removing the number from the heading removes that failure mode at the source, rather than relying on every citation site remembering to spell out a name a number would otherwise make it easy to skip.

**Exceptions:** A short illustrative example is not a restatement of the definition/procedure/table itself — quoting the actual definition, steps, or table rows the cited source owns is. Same-document back-references (a rule citing another rule in the same file) are not covered by the named-locator requirement — both sides change together by construction. Tutorial/setup-guide docs outside skills/agents/steering (e.g. a server's setup README) may number and self-cite their own steps freely — this rule only governs citations into that component set. Once another document cites one of those steps, it needs a name like any other locator.

---

## Enforcement

- **Plan-gate violations:** Large work implemented without a committed `Approved` plan stops until the approval commit exists.
- **Logging violations:** HIGH finding at review.
- **Scope expansion:** Removed and planned properly.
- **Undocumented architectural decision:** Flagged for retroactive review.
- **Testability violations:** LOW finding, not blocking.
- **Security violations:** Always block approval.
- **Cite-or-state violations:** MEDIUM finding; the restatement is removed in favor of the citation.
- **Ordinal-citation violations:** `aif validate refs` fails the build on a bare-component reference paired with a raw `Step N`/`Rule N` mention, and on a quoted locator that no longer matches a heading in the cited component.

---

## Notes

Git workflow: `steering/engineering/git-workflow.md`. Plan commit-gate procedure: `skill/plan-lifecycle`.
