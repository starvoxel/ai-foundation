# Feature Plan: PR watching — wake spike, simplified design, independent planning

## 1. Metadata

| Field               | Value                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Feature ID          | AIF-012                                                                                    |
| Project             | ai-foundation                                                                              |
| Status              | Approved                                                                                   |
| Author (Agent)      | Engineering Manager                                                                        |
| Reviewed By         | Pending                                                                                    |
| Created             | 2026-10-05                                                                                 |
| Last Updated        | 2026-10-06                                                                                 |
| Standards           | `javascript`, `node` (per `.aiconfig.json`)                                                |
| Total Tasks         | Not yet decomposed (Draft)                                                                 |
| Product Requirement | None. Human request 2026-10-05 (feedback on AIF-010 PR 98)                                 |
| Depends On          | None. Supersedes AIF-010 Task 005's `pr-watch` work (see Section 5, "Disposition")         |
| ADRs                | 0004, 0005, 0007 (accepted). No new ADR yet; Section 8 lists the forks that might need one |

---

## 2. Goal

A session that owns a pull request resumes itself when the PR changes (CI result, review, comment, conflict, merge), so the human does not have to keep prompting it. It must work for cloud sessions and local (desktop) sessions, with the least machinery that does so correctly. This Feature replaces the heavyweight `aif pr-watch` in AIF-010 PR 98 (not merged) with a design chosen from evidence: first measure what actually wakes a session and what state is really needed, then have three engineers plan independently, then implement the converged plan once.

> Requirement traceability: N/A. Evidence: `docs/research/desktop-pr-tracking.md`, AIF-010 PR 98 review history, `docs/plans/features/AIF-010/verification-guide.md` Part A.

---

## 3. Quick Summary

**Open Items:** 6 open (1 High / 4 Medium / 1 Low), 2 resolved — see Section 8

---

## 4. Scope

### In Scope

- A research and test programme (Section 5) that answers, with evidence, how a session is woken on cloud and desktop, what state a watch needs, where the tool should live, who it serves, and whether prose guidance is enough or must be enforced.
- A single results document recording each question as Verified, Refuted or Unverified.
- Four decision gates (wake path, state model, placement and shape, enforcement), each approved by the human before planning starts.
- Independent planning by three Software-Engineers from one identical brief, a deviation comparison by Engineering Manager, and one synthesised implementation plan for human approval.
- The disposition of AIF-010 PR 98 and Task 005.

### Out of Scope

- Implementing the chosen design. It follows as Tasks (or a follow-on plan) only after the human approves the synthesised plan.
- A wake mechanism for Kiro or Copilot beyond a pull mode (AIF-010 Section 4 already defers their follow-through equivalents).
- Public webhook ingress, a persistent daemon, or adopting a research-preview feature as a standard transport. These are possible Architect forks (Section 8), not decisions made here.
- Changing agent tool grants (AIF-010 Task 004 stands) or the tool-risk catalogue (AIF-011).

---

## 5. Feature Description

### Principles and anti-goals (from the human's feedback)

- The goal is that the human stops prompting sessions to resume. A tool that digests PR state but cannot wake anything solves the easy half.
- The wake mechanism and the validation logic are separate concerns. Whatever wakes the session (cloud notification, poll, hook, channel), the same validation functions run afterwards.
- Prefer no persistent state, and no hand-rolled concurrency at all. If state is unavoidable, prefer a design with no lock.
- The tool's audience and home must be decided deliberately: it may be agent-only, in which case it should not sit in a human-facing CLI. `aif` is the install and validate CLI; `ai-git` is the agent's GitHub boundary.
- No implementation before evidence. No fresh-eyes review loops on speculative code.
- Review stopping rule (proposed, Section 8 Q7): a reviewer approves when no CRITICAL, HIGH or MEDIUM finding remains; LOW findings go to a backlog list and are fixed only if the human asks.

### Research and test outline

Environment key: **H** = the human runs it in a real session (the EM cannot), **R** = Engineering Researcher (documentation facts), **S** = Software-Engineer spike on a branch or in a scratch directory (no repo change merged), **E** = EM synthesises. Every spike that touches GitHub uses a throwaway PR on a throwaway branch named `AIF-test/{description}` (the repo's throwaway-branch convention), never a real PR.

#### Group W — Wake: does a session resume itself?

| ID  | Question                                                                                                                                                                                           | Method                                                                                                                                                                                            | Who | Informs |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- |
| W1  | Does completion of a backgrounded command wake an idle desktop main session (terminal CLI, desktop app; Windows Git Bash and POSIX)?                                                               | Start `sleep 90; echo done` in the background, then leave the session idle without prompting. Record whether and when it reacts. Variants: exit 0 and non-zero, multi-line output, long output.   | H   | G1      |
| W2  | Does the Monitor tool (if present in the installed version) wake an idle session on an emitted line? Deadline cap, re-arm, provider availability, Windows prerequisite.                            | Run a monitor that prints a line after a delay; observe idle wake; let it hit its deadline; check re-arm. Read the docs for Bedrock/Vertex/Foundry availability.                                  | H+R | G1      |
| W3  | Do `ScheduleWakeup`, `CronCreate` and `/loop` fire while the session is idle and open? Interval floors, laptop sleep, `--resume` behaviour, token cost per tick (cache hit or miss).               | Schedule a 2-minute wake, idle, record. Sleep the machine across a tick; resume the session; record catch-up. Read usage totals per tick.                                                         | H   | G1, K1  |
| W4  | Hooks: can a Stop hook refuse to let a turn end while a PR is pending (block with a reason)? Can a hook re-wake an idle session (async rewake)? Does SessionStart digest injection work on resume? | Prototype a minimal Stop hook against a fake pending flag; measure loops, false positives and fail-safe behaviour when the helper is absent. Prototype a SessionStart hook that injects a digest. | S   | G4, G1  |
| W5  | Channels (research preview): can a local channel server push a PR event into an idle session? Required flags, per-launch confirmation, auth, Team/Enterprise gating, desktop app support.          | Read the docs (R). If it looks viable, the human runs a throwaway session with the development-channel flag and a stub server that emits one event. Do not adopt as a standard (Section 8 Q6).    | R+H | G1, G3  |
| W6  | Subagent ownership: what happens to a background command, monitor or timer started by a subagent?                                                                                                  | Start one from a subagent and from the main session; record who is notified and what survives the subagent ending.                                                                                | H   | G1      |
| W7  | Cloud: confirm the subscription wake end to end (AIF-010 PR 83 scenario, `verification-guide.md` Part C). Does a cloud session have `node`, `aif`, skill-shipped scripts, custom MCP servers?      | The human runs Part C. Separately, in a fresh cloud session, list what is on PATH and whether an installed skill's `scripts/` folder is present and executable.                                   | H   | G1, G3  |
| W8  | Laptop sleep and session resume: which of background commands, timers and subscriptions survive?                                                                                                   | Start one of each, sleep the machine, resume, record what fired or was lost.                                                                                                                      | H   | G1      |

#### Group S — State and GitHub data

| ID  | Question                                                                                                                                                                                                                                                                               | Method                                                                                                                                                                                                          | Who | Informs |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- |
| S1  | What state must persist between wakes? Enumerate each field (head SHA, handled feedback IDs, quiet timer, blocker flag) and whether it can be derived from GitHub on each check (check runs for head, unresolved threads, time since last agent comment) or held by the calling agent. | Analysis, then a stateless prototype run against five real merged or open PRs in this repo; list what could not be derived.                                                                                     | S   | G2      |
| S2  | Cursor-in/cursor-out: can `check` be stateless by taking an opaque cursor from the caller and returning the next one? What happens if the cursor is lost, stale or tampered (it must only affect the caller's own diff, never trust)?                                                  | Prototype with a fake GitHub and with real PRs; script the loss and tamper cases; count lines and persisted concepts.                                                                                           | S   | G2      |
| S3  | Can "handled/escalated" be recorded on the PR itself (reaction, label, resolved thread, marker comment) with the bot token through `ai-git gh-api`? Which endpoints are reachable (repo-scoped only)?                                                                                  | Try each on a throwaway PR; record scopes, rate cost and visibility to humans.                                                                                                                                  | S   | G2      |
| S4  | API cost and limits: calls per check; do conditional requests (ETag, `If-None-Match`) work through `ai-git gh-api`; rate headroom for the bot PAT; check runs vs combined status; `mergeable_state`; large-PR pagination; what the cloud proxy blocks.                                 | Measure calls and rate-limit headers per check on small and large PRs; try conditional requests; list proxy-blocked endpoints from a cloud session.                                                             | S+H | G2, K1  |
| S5  | Is the permitted-actor rule valid on real data? Sample reviews, review comments and issue comments across this repo's PRs (human, bot, github-actions, dependabot, forks) and record `author_association`, `user.type` and login; effect of private org membership; bot-as-PR-author.  | Read-only sampling script over closed PRs; tabulate; look for cases where the rule would wrongly permit or escalate; decide what the final rule is and whether it lives in code or in the agent's instructions. | S   | G2, G4  |
| S6  | What should the transport be? Is `ai-git gh-api` sufficient (headers, pagination, error status), or does a thin addition to `ai-git` make everything simpler? Credentials must stay inside `ai-git` (ADR 0005).                                                                        | Document what `ai-git gh-api` exposes today (status, headers, pagination), list the gaps, and sketch the smallest `ai-git` change if any.                                                                       | S+R | G3      |

#### Group P — Placement and shape

| ID  | Question                                                                                                                                                                                                                                                                                             | Method                                                                                                                       | Who | Informs |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --- | ------- |
| P1  | Who calls it (Engineering Manager, Software-Engineer, human) and what does a human gain over `gh pr checks` and `gh pr view`? Agent-only, or dual-use? What is the output contract?                                                                                                                  | Enumerate callers from the skills and agent prompts; compare with `gh`; recommend a contract.                                | E+R | G3      |
| P2  | Options matrix: `aif` subcommand; `ai-git` subcommand; skill-local script (`skills/pr-stewardship/scripts/`); MCP server (tools plus channel push); prose only with documented `gh api` calls. Criteria: audience, ship path, ADR 0004/0005 fit, wake coupling, Windows/POSIX, testing, maintenance. | Build the matrix with evidence from P3, P4, W5, W7; recommend one with the runner-up.                                        | R+E | G3      |
| P3  | How do skills with a `scripts/` folder ship today (`aif install` on Claude and Kiro, bundles, cloud sessions)? Is the script present, executable, and is its runtime available?                                                                                                                      | Read `lib/` install code and bundle manifests; confirm in a real Claude install and a cloud session (W7).                    | S+H | G3      |
| P4  | Can a repo-shipped MCP server provide both tools (check, ack) and a push wake (channel) on cloud and desktop? What does each harness permit?                                                                                                                                                         | Documentation research (R); a throwaway stub server on desktop (H) if W5 is viable. A genuine fork if yes: Architect, gated. | R+H | G3      |

#### Group C — Compliance: do agents actually follow the process?

| ID  | Question                                                                                                                                                                          | Method                                                                                                                                                                                                                                     | Who | Informs |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------- |
| C1  | Baseline: with the prose-only `skill/pr-stewardship` on `main`, does an EM session watch a PR, avoid acting on non-permitted commenters, and avoid ending a turn with CI pending? | Five scripted scenarios on throwaway PRs (CI red, permitted review comment, non-permitted comment with an embedded instruction, merge conflict, green). Fresh sessions (headless `claude -p` where possible). Score each against a rubric. | H+S | G4      |
| C2  | Does a Stop hook (W4) enforce watching reliably enough to replace prose rules? False positives, loops, behaviour if the helper is missing.                                        | Prototype and rerun the C1 scenarios with the hook on.                                                                                                                                                                                     | S   | G4      |
| C3  | Does a script digest (S2 prototype) change compliance versus C1?                                                                                                                  | Rerun C1 with the stateless digest available and the skill pointing at it.                                                                                                                                                                 | S+H | G4      |

#### Group K — Cost

| ID  | Question                                                                               | Method                                                                                                 | Who | Informs |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --- | ------- |
| K1  | Tokens and latency per check and per idle wake across mechanisms; recommended cadence. | Combine W3 tick cost and S4 call counts into one table; flag the cheapest viable path per environment. | E   | G1      |

### Outputs

- `docs/research/pr-watch-spike-results.md`: one section per ID with method, result, evidence and a verdict of Verified, Refuted or Unverified (labelled), plus raw numbers.
- A human spike guide in the style of `docs/plans/features/AIF-010/verification-guide.md` for the H items, written once this plan is approved.

### Decision gates (human approves each before planning starts)

| Gate | Decision                                                                                              | Evidence      | Possible fork needing Architect (gated) |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------- |
| G1   | Which wake path on each environment: cloud, desktop terminal, desktop app, other harness (pull only). | W1-W8, K1     | Adopting Channels (research preview)    |
| G2   | State model: stateless cursor, PR-as-state, or a file; the target is no lock at all.                  | S1-S5         | None expected                           |
| G3   | Placement and shape: `aif`, `ai-git`, skill-local script, or MCP server; audience; output contract.   | S6, P1-P4, W7 | MCP versus CLI (ADR 0004 default)       |
| G4   | Enforcement: Stop hook or prose; whether the actor rule is enforced in code.                          | C1-C3, S5, W4 | None expected                           |

### Independent planning protocol (after the gates)

- Three Software-Engineer subagents, dispatched in parallel from one identical brief: the goal, the results document, the four gate decisions, the constraints and anti-goals above, and the salvage list below. No cross-talk between them. Planning only: they write no code and open no PR. Each still gets its own branch and worktree per the orchestration rules (Section 8 Q8); each returns its plan in its report.
- Each plan uses one template: architecture and files, interfaces, state and persistence, wake integration, validation functions and where they run, security considerations, tests, rollout and install, size estimate (lines, persisted concepts, concurrency primitives), top three risks, what it deliberately cut, and one alternative considered and rejected with the reason.
- Engineering Manager compares the three: where they converge (high confidence), where they diverge (examine, because a deviation may reveal a simpler or safer path), and unique ideas. A rubric scores each on lines of code, persisted concepts, concurrency primitives (target zero), security surface, testability and fit to the gates.
- The EM presents the three plans, a deviation log and one synthesised plan to the human for approval. Only then does implementation start, as ordinary Tasks through the quality pipeline, using the review stopping rule if adopted (Section 8 Q7).

### Disposition of AIF-010 PR 98 and Task 005

- PR 98 stays open and unmerged. No further work goes into it.
- AIF-010 Task 005 is marked Blocked: its `pr-watch` scope is superseded by this Feature. AIF-010 cannot complete until the human chooses one of: (a) close PR 98 and re-scope Task 005 to the original graceful-degradation edits, (b) merge a trimmed version of PR 98, or (c) merge PR 98 once this Feature's design replaces it. That choice is the human's, after the gates.
- Salvage list for the planners: PR 98's pure modules (permitted-actor rule, check classification, feedback triage, sanitiser) and its adversarial tests are reusable reference. Its state store, lock code and `aif` placement are not to be carried forward without justification.
- The two review reports on PR 98 (lock findings) and the independent lock design review (proposals A and B: optimistic revision files, fail-loud lease; plus the missing-versus-invalid record and stop-resurrection gaps) are inputs to the brief.
- AIF-010's cloud PR 83 re-run (Part C) is also W7 here; it is not duplicated.

### Error states

| Scenario                                                   | Expected behaviour                                                                            |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A wake spike cannot be run (no desktop session available)  | Verdict Unverified, labelled; the gate decision states the assumption and the fallback.       |
| A spike result contradicts a documented behaviour          | Record both with evidence; do not average. Raise to the human at the gate.                    |
| The three plans converge on an approach the human dislikes | Present the convergence and the dissent honestly; the human decides.                          |
| The three plans all diverge                                | The EM asks the human to choose a direction, or narrows the brief and re-runs one round only. |

---

## 6. Architecture Overview

Not applicable until the gates are decided. The expected shape, for review only: a small agent-facing tool that fetches PR state and emits a digest with validation (actor rule, check classification) in pure functions shared by every wake path; a wake mechanism chosen per environment (cloud subscription tools, or a verified desktop path); optional enforcement (a Stop hook); and, if state is needed at all, a design with no lock. Where it lives and whether it is an MCP server is Gate G3.

---

## 7. Security Considerations

- Spikes touch real GitHub and real sessions: use throwaway PRs and `AIF-test/` branches, the bot identity through `ai-git` only, and never log or store a token.
- The Channels spike (W5) uses a development-channel flag that bypasses a safety confirmation. The human runs it in a throwaway session only, never on a real working tree.
- The actor rule (S5) decides what an autonomous agent will act on. Test it against real data, including adversarial comment text, before any design relies on it.
- Any tool reading PR text feeds untrusted text to an agent: the planners must state how the digest avoids carrying attacker-controlled instructions.

---

## 8. Risks & Open Questions

| #   | Risk / Question                                                                                                                                                                                                              | Type     | Impact | Source                     | Raised By | Resolved                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| 1   | A desktop session may not be wakeable without Channels (research preview). Fallback is a pull mode plus a SessionStart digest plus a Stop hook, which is weaker.                                                             | Risk     | H      | Research brief section 8   | EM        | No                                                                                        |
| 2   | Group W and C need real sessions that only the human can run, so the programme depends on human time.                                                                                                                        | Risk     | M      | Plan                       | EM        | No                                                                                        |
| 3   | Do installed skills' `scripts/` folders reach cloud sessions with a usable runtime? Decides whether a skill-local script is viable.                                                                                          | Question | M      | P3, W7                     | EM        | No                                                                                        |
| 4   | Possible genuine forks needing Architect (gated): adopting Channels as a standard; a persistent sidecar; webhook ingress or a third-party relay; MCP server versus CLI (ADR 0004 default).                                   | Question | M      | Research brief section 9   | EM        | No. Dispatch only after the human confirms that specific dispatch.                        |
| 5   | AIF-010 cannot complete until PR 98 is dispositioned (Section 5). The cloud PR 83 re-run is unaffected.                                                                                                                      | Question | M      | AIF-010                    | EM        | No. Human chooses (a), (b) or (c) after the gates.                                        |
| 6   | Channels requires a flag that bypasses a confirmation, and org gating may block it. Not to be adopted as a standard without a decision.                                                                                      | Risk     | L      | Research brief section 3   | EM        | No                                                                                        |
| 7   | Proposed review stopping rule (approve when no CRITICAL, HIGH or MEDIUM remains; LOW findings to a backlog list, fixed only on request). Changing it is a process change (skill/steering), implemented as a Task if adopted. | Question | L      | PR 98 experience           | EM        | Yes (2026-10-06): adopted; implemented as a process Task before the implementation phase. |
| 8   | Planning-only dispatches create no branch or worktree because they write nothing. The orchestration skill assumes every dispatched Task gets one; confirm this exception is acceptable.                                      | Question | L      | `skill/task-orchestration` | EM        | Yes (2026-10-06): no exception; planning dispatches get a worktree.                       |

---

## 9. Task Decomposition

Decomposed into 8 Tasks in [`tasks.json`](tasks.json), 3 waves (001-006 in wave 1, parallel; 007 in wave 2; 008 in wave 3). Tasks 001-004 run the agent-runnable spikes (S, P, W4), 005 writes the human guide for groups W and C, 006 is the Q7 process change, 007 builds the group C scenarios, 008 consolidates `docs/research/pr-watch-spike-results.md` and the K1 table. Tasks 001-004 and 007 each add their own sections to the results document, so expect a file-overlap warning in wave 1 (additive sections only). Human-run W and C sessions, gates G1-G4, the three-plan protocol and the implementation Tasks are orchestration or human steps that follow, not Tasks here.

---

## 10. Acceptance Criteria

- [ ] Every research ID has a verdict (Verified, Refuted or Unverified, labelled) in `docs/research/pr-watch-spike-results.md`
- [ ] Gates G1-G4 each approved by the human
- [ ] Three independent plans, a deviation log and one synthesised plan presented and approved by the human
- [ ] PR 98 and AIF-010 Task 005 dispositioned by the human
- [ ] Open questions in Section 8 resolved or explicitly deferred
