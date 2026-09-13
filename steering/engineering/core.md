---
name: 'engineering-core'
version: '0.3.1'
description: 'Core rules that apply to all agents operating in the engineering domain.'
file_patterns: []
---

## Scope

**This steering applies to:** All agents with `domain = "engineering"`.

**Loaded when:** At session start for any engineering agent, after `steering/global/core.md`.

---

## Rules

### Rule 1: Never Implement Without an Approved Plan

- No code may be written until a Chunk Plan exists and has been approved by a human
- "Approved" means the human has explicitly confirmed — not just reviewed
- A plan is not "approved" for implementation purposes until the `Approved` status has been committed to git per `skill/plan-lifecycle`. Verbal/chat confirmation alone does not satisfy this rule. Any other status, including `Deferred`, is not approved and must not be implemented
- If a plan does not exist, the engineering agent must stop and route to Tech-Lead to create one

**Rationale:** Implementing before planning leads to scope creep, rework, and code that doesn't fit the larger architecture. The planning gate exists precisely to catch problems before they are expensive. Requiring the approval itself to be a git commit (not just a conversational "yes") makes the gate objectively checkable instead of relying on memory of a conversation.

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

### Rule 6: Design for Testability

- Separate pure logic (parsing, transforming, validating, deciding) from I/O (filesystem, network, processes)
- Pure functions take data in and return data out — no side effects, no hidden dependencies
- I/O functions become thin wrappers that compose pure functions with external calls
- This structure enables fast, deterministic unit tests on the logic without mocking infrastructure

**Rationale:** Code that mixes logic with I/O can only be tested via slow integration tests that require real filesystems, temp directories, or mocked services. Separating concerns makes the interesting logic trivially testable and keeps integration tests focused on actual I/O coordination.

**Exceptions:** Trivially thin modules where the logic _is_ the I/O coordination (e.g. a function that reads a file and returns its content unchanged). Do not add abstraction layers that provide no testability benefit.

---

### Rule 7: Security Requirements Are Acceptance Criteria

- Security checklist items in plans and standards files are not optional
- A review with unfulfilled security requirements must not be approved regardless of other code quality
- Security violations are always HIGH or CRITICAL severity — never lower

**Rationale:** Security requirements exist because the cost of a violation is disproportionately high. Treating them as polish leads to deferred vulnerabilities.

**Exceptions:** None. See `steering/global/core.md` Rule 3 for the global security escalation process.

---

### Rule 8: Plans Are Committed Artifacts, Not Chat Output

- Every plan or record requiring human approval (Chunk Plan, Epic Plan, Decision Record, or a Tier 3 `ai-engineering-plan`) must be saved to the repository and committed with `Status: Draft` before being presented for review
- Each round of human-requested revision is committed as a new commit (never amended or squashed) before re-presenting, preserving the full Draft → feedback → Draft → ... history
- Once the human gives an explicit decision, the agent updates the status field (`Approved` or `Deferred`) and commits that change as its own commit, separate from the revision history and from any implementation commit
- This applies uniformly in framework and project repos — see `skill/plan-lifecycle` for the full procedure, and the repo-type-specific git-workflow steering for branch/direct-commit mechanics

**Rationale:** Ties directly to Rule 1: makes "approved" objectively checkable via `git log` instead of relying on conversational memory. Centralizing the procedure in `skill/plan-lifecycle` means every planning skill follows the same mechanics without restating them.

**Exceptions:** None. If a repo has no formal plan path configured, fall back to the default documented in `skill/plan-lifecycle` rather than skipping the commit gate.

---

### Rule 9: Commit Incrementally During Implementation

- Implementation of an approved plan must be committed in small, logically atomic increments as work progresses — not accumulated into a single commit at the end
- The recommended checkpoint is one commit per completed plan step (or per completed task in a Chunk Plan's task list), once that step's work is verified
- Exact mechanics and alternative checkpoint options are defined in the repo-type-specific git-workflow steering (`steering/engineering/git-workflow-framework.md` or `steering/engineering/git-workflow-projects.md`)

**Rationale:** Small commits make review, bisection, and recovery from a bad step far cheaper than a single large commit at the end. Batching everything into one commit defeats the purpose of the atomic-commit rules already required by the git-workflow steering.

**Exceptions:** None. If a step turns out to be too large to commit atomically, split the step rather than skipping the commit.

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

---

## Notes

These rules exist because the most common and expensive engineering failures are:

1. Building the wrong thing (prevented by Rule 1 and Rule 4)
2. Building it in an unmaintainable way (prevented by Rules 3, 5, 6, and 7)
3. Losing track of why things were done (prevented by Rule 2)
4. Losing the record of what was actually approved and when (prevented by Rules 8 and 9)

When a rule feels like it is slowing things down, that is usually a sign that planning was skipped, not that the rule is wrong.

**Git Workflow Standards:** See `steering/engineering/git-workflow-framework.md` (this repo) and `steering/engineering/git-workflow-projects.md` (project repos).

**Plan Lifecycle:** See `skill/plan-lifecycle` for the commit-gate procedure and status vocabulary referenced in Rules 1, 8, and 9.
