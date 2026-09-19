---
name: 'engineering-core'
version: '0.5.0'
description: 'Core rules that apply to all agents operating in the engineering domain.'
file_patterns: []
---

## Scope

**This steering applies to:** All agents with `domain = "engineering"`.

**Loaded when:** At session start for any engineering agent, after `steering/global/core.md`.

---

## Rules

### Rule: Never Implement Without an Approved Plan

- No code may be written until a Chunk Plan exists and has been approved by a human
- "Approved" means the human has explicitly confirmed — not just reviewed
- A plan is not "approved" for implementation purposes until the `Approved` status has been committed to git per `skill/plan-lifecycle`. Verbal/chat confirmation alone does not satisfy this rule. Any other status, including `Deferred`, is not approved and must not be implemented
- If a plan does not exist, the engineering agent must stop and route to Tech-Lead to create one

**Rationale:** Implementing before planning leads to scope creep, rework, and code that doesn't fit the larger architecture. The planning gate exists precisely to catch problems before they are expensive. Requiring the approval itself to be a git commit (not just a conversational "yes") makes the gate objectively checkable instead of relying on memory of a conversation.

**Exceptions:** Exploratory spikes and proof-of-concept code — but only when explicitly requested by the human, and the spike output must never be treated as production-ready without a proper plan.

---

### Rule: Every Artifact Must Reference Its Plan ID

- Source files, work log entries, review reports, and test results must include the Plan ID they belong to
- File header comments must include the Plan ID
- This applies to new files and to files meaningfully modified as part of a plan

**Rationale:** Plan IDs provide traceability from code back to intent. Without them, debugging and auditing become significantly harder, especially when multiple plans are running in parallel.

**Exceptions:** Files modified incidentally (e.g. a typo fix not part of any plan) do not require Plan IDs. The threshold is "meaningfully modified as part of planned work."

---

### Rule: Logging Requirements Are Never Optional

- Logging requirements defined in plans, standards, or project-standards files are mandatory
- The agent must not omit log statements defined as required, defer them to "later," or substitute print statements
- Log levels must be correct — security events are never Debug-level

**Rationale:** Logging is the primary observability tool in production. Missing logs make production issues significantly harder to diagnose. Like security, logging is an acceptance criterion, not polish.

**Exceptions:** Only when the human explicitly waives a specific logging requirement after the agent has flagged it. The waiver must be documented in the plan.

---

### Rule: Raise Discoveries Rather Than Silently Expanding Scope

- If the agent discovers that a task requires work not described in the current plan, it must stop and raise it as an open question on the parent Epic
- The agent must not silently implement additional scope, even if the addition seems obviously correct
- Out-of-scope work discovered during implementation is either deferred or planned explicitly

**Rationale:** Silent scope expansion undermines the planning gate. Even well-intentioned additions may conflict with other planned work, introduce dependencies, or violate architectural decisions already made.

**Exceptions:** Trivially small corrections (e.g. fixing an obvious typo in a file already being modified) that have zero architectural impact. These should still be noted in the work log.

---

### Rule: Escalate Technical Approach Uncertainty to Architect

- When a task requires a technical decision that is not covered by existing standards, project standards, or a Decision Record, the agent must route to Architect before proceeding
- This includes: new libraries or technologies, significant architectural trade-offs, cases where two or more meaningfully different approaches exist
- The agent must not make architectural decisions unilaterally, even when confident

**Rationale:** Architectural decisions made ad-hoc during implementation are rarely revisited and often become permanent. Architect exists to structure these decisions before they are locked in.

**Exceptions:** Decisions that are clearly within the established patterns of the active standards files. If a pattern already exists in the codebase or standards for this exact case, the agent follows it without escalation.

---

### Rule: Design for Testability

- Separate pure logic (parsing, transforming, validating, deciding) from I/O (filesystem, network, processes)
- Pure functions take data in and return data out — no side effects, no hidden dependencies
- I/O functions become thin wrappers that compose pure functions with external calls
- This structure enables fast, deterministic unit tests on the logic without mocking infrastructure

**Rationale:** Code that mixes logic with I/O can only be tested via slow integration tests that require real filesystems, temp directories, or mocked services. Separating concerns makes the interesting logic trivially testable and keeps integration tests focused on actual I/O coordination.

**Exceptions:** Trivially thin modules where the logic _is_ the I/O coordination (e.g. a function that reads a file and returns its content unchanged). Do not add abstraction layers that provide no testability benefit.

---

### Rule: Security Requirements Are Acceptance Criteria

- Security checklist items in plans and standards files are not optional
- A review with unfulfilled security requirements must not be approved regardless of other code quality
- Security violations are always HIGH or CRITICAL severity — never lower

**Rationale:** Security requirements exist because the cost of a violation is disproportionately high. Treating them as polish leads to deferred vulnerabilities.

**Exceptions:** None. See `steering/global/core.md`: "Security Requirements Are Never Optional" for the global security escalation process.

---

### Rule: Plans Are Committed Artifacts, Not Chat Output

- Every plan or record requiring human approval (Chunk Plan, Epic Plan, Decision Record, or a Tier 3 `ai-engineering-plan`) must be saved to the repository and committed with `Status: Draft` before being presented for review
- Each round of human-requested revision is committed as a new commit (never amended or squashed) before re-presenting, preserving the full Draft → feedback → Draft → ... history
- Once the human gives an explicit decision, the agent updates the status field (`Approved` or `Deferred`) and commits that change as its own commit, separate from the revision history and from any implementation commit
- This applies uniformly in framework and project repos — see `skill/plan-lifecycle` for the full procedure, and the repo-type-specific git-workflow steering for branch/direct-commit mechanics

**Rationale:** Ties directly to "Never Implement Without an Approved Plan": makes "approved" objectively checkable via `git log` instead of relying on conversational memory. Centralizing the procedure in `skill/plan-lifecycle` means every planning skill follows the same mechanics without restating them.

**Exceptions:** None. If a repo has no formal plan path configured, fall back to the default documented in `skill/plan-lifecycle` rather than skipping the commit gate.

---

### Rule: Commit Incrementally During Implementation

- Implementation of an approved plan must be committed in small, logically atomic increments as work progresses — not accumulated into a single commit at the end
- The recommended checkpoint is one commit per completed plan step (or per completed task in a Chunk Plan's task list), once that step's work is verified
- Exact mechanics and alternative checkpoint options are defined in the repo-type-specific git-workflow steering (`steering/engineering/git-workflow-framework.md` or `steering/engineering/git-workflow-projects.md`)

**Rationale:** Small commits make review, bisection, and recovery from a bad step far cheaper than a single large commit at the end. Batching everything into one commit defeats the purpose of the atomic-commit rules already required by the git-workflow steering.

**Exceptions:** None. If a step turns out to be too large to commit atomically, split the step rather than skipping the commit.

---

### Rule: Cite, Don't Restate

- When a document needs a definition, procedure, or table that another skill, agent, or steering file already owns, cite that source by name — never copy its content inline
- Citing and then also restating the same content is still a violation of this rule; the citation does not excuse the copy
- Default to citing in every case. Restating instead of citing is not a stylistic choice and needs a concrete reason the citation genuinely cannot serve — "it reads better inline" or "it's more convenient here" are not reasons
- When the citation points at one specific locator inside the source rather than the whole document, name that locator instead of citing it by number: `` `skill/{name}`: "Step Heading Text" `` or `` `steering/{path}.md`: "Rule Heading Text" ``, chaining more than one with `→` (e.g. `"Step A" → "Step B"`). A plain reference to the whole component (`skill/{name}`, `steering/{path}.md`) needs no quoted name.
- A skill's steps stay numbered (`### Step N — Name`) because they're an ordered procedure — position is meaningful, and the number is part of what's being cited alongside the name. A steering file's rules are headed `### Rule: Name` with **no number at all** — rules are independent, unordered constraints, so a number would carry no real meaning, only a drift risk: a bare `Rule 10` silently keeps "working" even after Rule 10 is reordered, split, or replaced by a completely different rule, because the number still resolves to _something_. Removing the number from the heading removes that failure mode at the source, rather than relying on every citation site remembering to spell out a name a number would otherwise make it easy to skip.

**Exceptions:** A short illustrative example is not a restatement of the definition/procedure/table itself — quoting the actual definition, steps, or table rows the cited source owns is. Same-document back-references (a rule citing another rule in the same file) are not covered by the named-locator requirement — both sides change together by construction. A tutorial or setup-guide document outside the governed component set (skills/agents/steering) — e.g. a server's setup README with its own `## Step N` walkthrough — may number its own steps and cite them by number, same-document, without following this rule: it isn't part of the citation graph this rule protects, since nothing outside it cites into its steps by name, and a reader works through it start-to-end the same way a skill's numbered Steps are meant to be read. The moment another document starts citing a specific step of it, that step needs a name like any other cited locator.

---

## Enforcement

- **No-plan violations:** The agent stops work and routes to Tech-Lead. No exceptions.
- **Plan ID violations:** Caught during Principal-Engineer review. Missing Plan IDs are a MEDIUM finding.
- **Logging violations:** Caught during Principal-Engineer review. Missing required logs are a HIGH finding.
- **Scope expansion violations:** Caught during review or human inspection. Silently added scope is removed and planned properly.
- **Architectural escalation violations:** If an agent makes an undocumented architectural decision, it is flagged for Architect review retroactively.
- **Testability violations:** Caught during review. Pure logic buried in I/O code without separation is a LOW finding. Refactoring recommended but not blocking.
- **Security violations:** Always block approval. See Principal-Engineer review process.
- **Uncommitted-approval violations:** If an agent begins implementation without a committed `Approved` status on the governing plan, work stops immediately and the approval commit is created before continuing.
- **Batched-commit violations:** Caught during review. A single large commit covering multiple plan steps is a LOW finding; the agent should have split it.
- **Cite-or-state violations:** Caught during Principal-Engineer review. A document that both cites and restates the same content is a MEDIUM finding; the restatement is removed in favor of the citation.
- **Ordinal-citation violations:** Caught automatically — `aif validate refs` fails the build on a bare-component reference paired with a raw `Step N`/`Rule N` mention (steering headings carry no number at all, so any such mention next to a cited steering file is always wrong), and on a quoted locator name that no longer matches a heading in the cited component. Fix by naming the locator (or updating the citation to the locator's current name) before merging.

---

## Notes

These rules exist because the most common and expensive engineering failures are:

1. Building the wrong thing (prevented by "Never Implement Without an Approved Plan" and "Raise Discoveries Rather Than Silently Expanding Scope")
2. Building it in an unmaintainable way (prevented by "Logging Requirements Are Never Optional", "Escalate Technical Approach Uncertainty to Architect", "Design for Testability", and "Security Requirements Are Acceptance Criteria")
3. Losing track of why things were done (prevented by "Every Artifact Must Reference Its Plan ID")
4. Losing the record of what was actually approved and when (prevented by "Plans Are Committed Artifacts, Not Chat Output" and "Commit Incrementally During Implementation")

When a rule feels like it is slowing things down, that is usually a sign that planning was skipped, not that the rule is wrong.

**Git Workflow Standards:** See `steering/engineering/git-workflow-framework.md` (this repo) and `steering/engineering/git-workflow-projects.md` (project repos).

**Plan Lifecycle:** See `skill/plan-lifecycle` for the commit-gate procedure and status vocabulary referenced in Rules 1, 8, and 9.
