# Feature Plan: Review debt ledger — durable tracking of non-blocking review findings

## 1. Metadata

| Field               | Value                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Feature ID          | AIF-014                                                                                                                       |
| Project             | ai-foundation                                                                                                                 |
| Status              | Draft                                                                                                                         |
| Author (Agent)      | Engineering Manager                                                                                                           |
| Reviewed By         | Pending                                                                                                                       |
| Created             | 2026-10-07                                                                                                                    |
| Last Updated        | 2026-10-07                                                                                                                    |
| Standards           | `javascript`, `node` (per `.aiconfig.json`)                                                                                   |
| Total Tasks         | Not yet decomposed (Draft)                                                                                                    |
| Product Requirement | None. Human request 2026-10-06 (Principal-Engineer LOW findings have nowhere durable to live)                                 |
| Depends On          | AIF-013 (Approved, in progress): Task 001 (on-demand index generation) and Task 002 (trailer parser). See Section 8, row 15   |
| ADRs                | 0005 (`ai-git` tool boundary) and 0006 (plain JS + JSDoc) apply. Section 8 rows 9 and 10 list forks that might need a new ADR |

---

## 2. Goal

A LOW finding from a review is recorded once, durably, deduplicated, and shown to the Engineering Manager and Software-Engineers when they work on the files it concerns, instead of vanishing into a merged PR's comments. It is tracked in git on a dedicated ledger branch, with no external tracker and no dependency on one. The first version (v0) is the smallest design that stays bounded and conflict-free as findings accumulate; later phases (Section 4) shrink it further only when measurements say they are needed.

> Requirement traceability: N/A. Evidence: `skills/review-severity/SKILL.md` Step 2 ("LOW findings never block and need not be fixed") defines no destination for a LOW once the PR merges; the Principal-Engineer is read-only with no network, and the Engineering Manager posts its report as a PR review.

---

## 3. Quick Summary

**Open Items:** 12 open (1 High / 6 Medium / 5 Low) — see Section 8

---

## 4. Scope

### In Scope (v0)

- An orphan ledger branch (`debt-ledger`, name configurable) holding an append-only, segmented event log (`events/NNNNNN.jsonl`) and a folded `state.json`. Its own ruleset (no force-push, no deletion, restricted updaters) and an entry in the branch-cleanup `PROTECTED_BRANCHES` list. `main`'s ruleset and the required-CI gate are not touched; no bypass is added.
- One event schema, versioned from day one, covering every event type later phases need: `found`, `fixed`, `wontfix`, `moved`, `retired`. A fingerprint specification (rule + path + anchor, never a line number) with aliases kept across `moved`.
- Writers (`aif debt` commands) that append to the highest-numbered segment, start the next segment at a soft cap of N lines, and on a rejected push re-fetch and re-append. No merges, no PRs on the ledger branch.
- A scheduled fold job (a workflow plus a script under `.github/scripts/`, like `cleanup-branches`) that, in one commit, seals the active segment, folds sealed segments into `state.json`, deletes them, resolves pending events against PR state, quarantines malformed lines, validates that history only ever appended, and logs size, status and orphan counts.
- `aif debt` commands: `found` (used by the Engineering Manager), `fixed`, `wontfix`, `move`, `retire`, `for` (capped lookup by path), and an `aif index debt` target built on AIF-013's on-demand generation: deterministic, gitignored, keyed by the ledger tip SHA, never committed.
- Commit trailers `Fixes-debt:`, `Debt-Moved:`, `Debt-Retired:`, parsed by generalizing AIF-013's `lib/arch-waivers.js` trailer handling, and turned into events by the Engineering Manager.
- Review integration: a machine-readable LOW format in `skills/review-severity/reference/template.md` (fingerprint inputs, rule cited, location, effort), outcome wording that says where LOWs go, the Principal-Engineer validating `Fixes-debt:` and `Debt-Retired:` claims, and the Engineering Manager's filing step after the approving round.
- Agent integration: the Engineering Manager attaches a capped list of known debt on a Task's files to the Software-Engineer's brief (reusing the file extraction `skill/task-orchestration` already does); the Software-Engineer queries at Task start and again over the files it actually changed; an opportunistic-fix boundary (Section 5).
- `.aiconfig.json` `debt` settings (branch, segment cap, area override), the `projects/_template/` copy, and the `AGENTS.md` field table.
- A process rule for large refactors (run `aif debt move` / `retire`), arc42 documentation of the mechanism, tests (unit, and integration against temporary git repositories with concurrent writers).

### Out of Scope (later phases, each built only when its trigger fires)

- **v1, pruning:** the fold drops closed items (`fixed`, `stale-closed`) from `state.json` after a retention window, keeping a small aggregate stats block. Trigger: `state.json` over about 200 KB or 1,000 entries, or most entries closed.
- **v2, `wontfix.jsonl`:** Won't Fix entries move out of `state.json` into a separate list the fold consults, so a suppressed fingerprint is never folded again. Trigger: about 50 Won't Fix entries, or the same suppressed item re-raised repeatedly. In v0 a `wontfix` event is recorded in `state.json` and the item is excluded from lookups.
- **Sweep:** automatic detection of orphaned entries (moved or deleted files) and automatic `moved` / `retired` events, including rename following. Trigger: the orphan count in the fold job's log line growing faster than people clear it.
- **Reviewer-side "Known / won't fix" suppression** so the Principal-Engineer stops re-reporting tracked items in PR reviews (v3).
- Automatic LOW to MEDIUM promotion, systemic roll-up of recurring findings, a triage digest, and a tracker projection (GitHub Issues or any external tracker). The event log is the interface a projection would read.
- Fuzzy fingerprint matching, cross-repository views, and `aif init` scaffolding of a ledger for downstream projects.

---

## 5. Feature Description

### User-Facing Behaviour

- **Principal-Engineer.** Reports LOWs as today, with the added structured fields. It still writes nothing and has no network. When a ledger index exists locally it may read it to confirm a `Fixes-debt:` claim; fetching the ledger is never its job.
- **Engineering Manager.** After the approving review round (never an intermediate round), appends one `found` event per LOW to the ledger. At approval it also turns `Fixes-debt:`, `Debt-Moved:` and `Debt-Retired:` trailers in the PR's commit range into events. Before dispatching a Task it looks up known debt on the files the Task outline names and includes the capped result in the Software-Engineer's brief. A concentration of debt on a Task's files is raised to the human as a possible cleanup candidate, never added to the Task.
- **Software-Engineer.** Sees known debt for its files at Task start, and queries again over `git diff --name-only` before finishing. It may fix an item only when the item's location lies inside code the Task already modifies, and then records it with a `Fixes-debt: <fingerprint>` trailer. Otherwise it leaves the item alone.
- **Human.** `aif debt wontfix <fp> --reason ... --review-by <date>`, `aif debt fixed <fp>`, `aif debt move <old> <new>`, `aif debt retire <path|fp> --reason ...`. All append events; nobody edits the ledger by hand and nobody opens a PR against it.

### Data Flow

1. The Principal-Engineer's final Review Report lists each LOW with: the rule cited, the path, an anchor (symbol, field or heading), and an effort estimate.
2. The Engineering Manager derives each fingerprint and appends a `found` event carrying the PR number and head SHA. The event is `pending`: it describes code that is not on `main` yet.
3. The same step turns the PR's debt trailers into pending `fixed`, `moved` and `retired` events.
4. The scheduled job resolves pending events: a merged PR promotes its events, a PR closed unmerged drops them, and a pending event older than the timeout is dropped.
5. The scheduled job seals the active segment (creates the next, empty segment), folds sealed segments into `state.json`, deletes them, and pushes all of it as one commit.
6. `aif index debt` fetches the ledger tip (depth 1, through `ai-git`), folds `state.json` plus any segments still present, and writes a deterministic gitignored `index.json` with `by_path`, `by_area` and `by_rule` maps, keyed by `ledger_sha`.
7. `aif debt for <paths...>` answers from that index with a capped, sorted list per path and a total count.

### Business Rules

- **Invariant:** `state.json` plus the segments present on the ledger branch is the complete truth. A segment's presence means "not yet consumed". The fold and the deletion of a segment happen in one commit, so there is no cursor or offset.
- **No lost writes, no locks.** A push from a stale checkout is rejected by git. A rejected writer re-fetches and re-evaluates which segment is active. A rejected fold job re-fetches and re-folds (sealed segments never change).
- **Append-only.** Nothing rewrites a segment, and the job never rewrites history or force-pushes. `state.json` has exactly one writer: the fold job. Humans and agents only append events.
- **Segments.** Monotonic six-digit numbers; writers append to the highest; a writer starts the next segment at N lines (soft cap, small overshoot under races is fine); the job also seals on schedule and always leaves one active segment. `state.json` records the last segment number so numbers are never reused.
- **Idempotent events.** `found` for the same fingerprint and PR, and a repeated `fixed`, are no-ops. Occurrences are a set of PR numbers, not a counter, so a replayed event cannot inflate them. Order within the log is push order, not timestamps.
- **Only what survived is debt.** `found` and `fixed` events are pending until the PR merges. A LOW fixed in a later review round, or by the author in the same PR, is never filed because the Engineering Manager files only after the approving round.
- **A finding must cite a rule.** The ledger records violations of existing requirements only; it never holds suggestions, so `skill/review-severity` Step 5 ("Never expand scope") still holds.
- **Fingerprint** is the cited rule's slug, the path, and an anchor; never a line number. A `moved` event recomputes the fingerprint and keeps the old one as an alias, so existing references and Won't Fix entries still match.
- **Ledger text is data.** Summaries are agent-written text that originated in code and PR content and is later shown to other agents. The index carries structured fields and a length-capped, sanitized summary, presented as data.
- **Unavailable is not empty.** If the ledger cannot be fetched, lookups return an explicit "unavailable" result. Agents proceed and say so; they never treat it as "no debt".
- **Credentials stay in `ai-git`** (ADR 0005). `aif debt` reads and writes the ledger by invoking `ai-git`; no token is handled in `aif debt` code.
- **Large refactors.** A change that moves or deletes many files includes `aif debt move` / `retire` for the affected entries, as `Debt-Moved:` / `Debt-Retired:` trailers. The index marks entries whose path no longer exists as `orphaned` and excludes them from lookups, which is the v0 detection until the sweep exists.

### Lifecycle and drain

How findings are worked and removed, and in which phase each mechanism arrives:

| Concern           | Mechanism                                                                                                        | Phase                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Duplicates        | Fingerprint dedupe; occurrences as a set of PRs                                                                  | v0                             |
| False debt        | File after the approving round; pending until merge; drop if the PR closes unmerged                              | v0                             |
| Consumption       | Capped per-file lookup for the Engineering Manager and Software-Engineer; fixes recorded by trailer              | v0                             |
| Won't Fix         | `wontfix` event with reason and review-by date; excluded from lookups                                            | v0 (in `state.json`); v2 split |
| Moved code        | `moved` / `retired` events from trailers or commands                                                             | v0 (manual); sweep automates   |
| State growth      | Drop closed items after a retention window                                                                       | v1                             |
| Suppression       | Fold never re-folds a `wontfix` fingerprint                                                                      | v2                             |
| Staleness         | Re-check open fingerprints against `main`, emit `stale-closed`                                                   | Sweep                          |
| Noise, promotion  | Roll up a rule recurring across an area into one systemic item; promote by age or recurrence to a blocking level | Later                          |
| Triage cadence    | Periodic digest by area for the human to schedule or Won't Fix                                                   | Later                          |
| Reviewer re-noise | Principal-Engineer skips items already tracked or Won't Fix                                                      | v3                             |

### Error States

| Scenario                                                | Expected Behaviour                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Append push rejected (non-fast-forward)                 | Re-fetch, re-evaluate the active segment, re-append, push; fail with a clear message after a bounded number of attempts |
| Fold job push rejected                                  | Re-fetch and re-fold, then push; the concurrency group prevents overlapping runs                                        |
| Malformed line in a segment                             | Move it to `quarantine.jsonl`, alert, and continue; never skip silently and never block the fold                        |
| History validation finds a non-append change            | Fail the job loudly and fold nothing until a human clears it                                                            |
| Fold produces bad state                                 | Revert the commit and re-fold; consumed segments remain in git history for replay                                       |
| Ledger branch unreachable (offline, permissions)        | `aif debt for` and `aif index debt` return an explicit "unavailable"; agents proceed and note it                        |
| Entry's path no longer exists                           | Marked `orphaned` in the index and excluded from lookups; reported in the job's log line                                |
| PR closed unmerged, or pending past the timeout         | Pending events dropped; nothing becomes debt                                                                            |
| `Fixes-debt:` names a fingerprint that is not open      | Reviewer raises a MEDIUM finding; the fold ignores a `fixed` for an unknown fingerprint and reports it                  |
| Debt-trailer reason empty or a placeholder              | Same mechanical check as AIF-013's waivers; quality is the Principal-Engineer's judgement                               |
| Two concurrent PRs raise the same LOW                   | One fingerprint, two PRs in its set, one item                                                                           |
| Segment is larger than the cap after concurrent appends | Accepted; the cap is soft and the next writer or the job rotates                                                        |

---

## 6. Architecture Overview

### New Components

| Component                               | Type                   | Responsibility                                                                                                             |
| --------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `lib/debt/` (schema, fingerprint, fold) | Pure                   | Event schema and validation, fingerprint and alias rules, folding events into state; no I/O                                |
| `lib/debt/` (ledger io)                 | Thin io                | Fetch the ledger tip and append-with-retry by invoking `ai-git`; read segments and state from a fetched tree               |
| `aif debt` command group                | Command layer          | `found`, `fixed`, `wontfix`, `move`, `retire`, `for`                                                                       |
| `aif index debt` target                 | Command layer          | Deterministic gitignored `index.json` (`ledger_sha`, `entries`, `by_path`, `by_area`, `by_rule`), via AIF-013's generator  |
| Fold workflow and script                | Workflow + script      | Seal, fold, delete, resolve pending, quarantine, validate history, log counts; `contents: write` on the ledger branch only |
| `debt-ledger` branch and ruleset        | Repository config      | Orphan branch; no force-push or deletion; restricted updaters; listed in `PROTECTED_BRANCHES`                              |
| Trailer parsing for debt trailers       | Pure + thin io         | Generalized from `lib/arch-waivers.js` (AIF-013 Task 002): match `^Fixes-debt:` etc. anywhere in a message                 |
| Review and agent prose                  | Skills, steering, yaml | LOW format, outcome wording, filing step, lookup and fix boundary, trailer validation                                      |

### Component Relationships

- Writers and the index builder share the pure schema and fold code, so the fold job, `aif index debt` and any later projection can never disagree about what an event means.
- `aif debt` and the fold job are the only code that touches the ledger branch; both go through `ai-git` for fetch and push.
- The index is a view: nothing reads `events/` directly except the fold and the index builder.

### Integration Points

- AIF-013 Task 001 — on-demand deterministic index generation, gitignored output, the `aif index <target>` shape.
- AIF-013 Task 002 — commit-trailer parsing that matches anywhere in a message, which survives the repository's squash-merge setting (`COMMIT_MESSAGES`).
- AIF-013 Task 007 — Principal-Engineer already validates waiver reasons each review; debt trailers extend the same checklist.
- `skill/task-orchestration` — the file extraction used for merge-conflict warnings is the input to the per-Task debt lookup.
- `skill/review-severity`, `skill/code-review`, `skill/ai-component-review`, `agents/principal-engineer.yaml`, `agents/engineering-manager.yaml`, `agents/software-engineer.yaml`.
- `.github/workflows/cleanup-branches.yml` — `debt-ledger` goes on the protected list.
- `ai-git` — all ledger network access; its token handling is unchanged.

---

## 7. Security Considerations

- **Ledger branch write access.** Any agent holding the AI identity token can append. Mitigations: a ruleset limiting updaters and blocking force-push and deletion, strict schema validation in the fold, an append-only history audit in every fold run, and no event in v0 that suppresses a reviewer's finding.
- **No `main` bypass.** The ledger lives off `main`; the fold job pushes to the ledger branch with the workflow's own token (`contents: write`), so no ruleset bypass or new credential is introduced. The workflow file and script are review-gated like any other CI change.
- **Agent-to-agent prompt injection.** Ledger summaries come from code and PR text and are shown to other agents. Only structured fields and a capped, sanitized summary reach an agent's context, labelled as data.
- **False closure.** A forged or mistaken `fixed` could close real debt. In v0 a `fixed` takes effect only when its PR merges, and the Principal-Engineer validates `Fixes-debt:` claims in review; Section 8 row 19 asks whether the fold should verify the trailer as well.
- **Credentials** remain inside `ai-git` (ADR 0005); `aif debt` handles none.

---

## 8. Risks & Open Questions

| #   | Risk / Question                                                                                                                                                                                                               | Type     | Impact | Source   | Raised By | Resolved                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which backend tracks debt?                                                                                                                                                                                                    | Question | H      | Request  | Human     | Yes. Decision: git, on an orphan ledger branch; no external tracker (YouTrack is not implemented and must not be depended on). **Why:** zero new infrastructure, versioned, and a tracker can later project from the log (human decision 2026-10-07). |
| 2   | Log shape and growth.                                                                                                                                                                                                         | Question | H      | Request  | Human     | Yes. Decision: append-only JSONL segmented at a size cap, with the scheduled job deleting each segment once folded. **Why:** bounds every file; no merging (human decision 2026-10-07).                                                               |
| 3   | Does the ledger need a bypass of `main`'s required-CI gate?                                                                                                                                                                   | Question | H      | Design   | EM        | Yes. Decision: no. **Why:** the orphan branch is outside `main`'s ruleset, so the gate in `git-workflow-core.md` ("Required CI Checks Gate Main") is untouched (human decision 2026-10-07, preferring the orphan branch).                             |
| 4   | Scope of the first delivery.                                                                                                                                                                                                  | Question | M      | Request  | Human     | Yes. Decision: v0 only; pruning (v1), `wontfix.jsonl` (v2) and the sweep are later phases with measurable triggers (Section 4). **Why:** avoid building for load that does not exist yet (human decision 2026-10-07).                                 |
| 5   | Who produces `fixed` events?                                                                                                                                                                                                  | Question | M      | Design   | EM        | Yes. Decision: both the Engineering Manager (from trailers) and humans (`aif debt fixed`) (human decision 2026-10-07).                                                                                                                                |
| 6   | Is the debt index committed?                                                                                                                                                                                                  | Question | M      | Design   | Human     | Yes. Decision: generated on demand and gitignored, using AIF-013's mechanism. **Why:** AIF-013 exists to stop committed generated indexes conflicting (human decision 2026-10-07).                                                                    |
| 7   | One Feature or two?                                                                                                                                                                                                           | Question | M      | Design   | EM        | Yes. Decision: one Feature. **Why:** the human accepts the size; splitting is the fallback if it goes badly (human decision 2026-10-07).                                                                                                              |
| 8   | The sweep and rename following.                                                                                                                                                                                               | Question | L      | Design   | Human     | Yes. Decision: deferred. Large refactors are handled by manual `move` / `retire` and the `orphaned` marker until the orphan count says otherwise (human decision 2026-10-07).                                                                         |
| 9   | ADR 0004 makes an MCP server the default for shared, deterministic, multi-agent tooling. Should `aif debt for` be MCP rather than a CLI?                                                                                      | Question | M      | Arch     | EM        | No. Proposal: CLI. It reads a generated local file, writes only via `ai-git` (credentials stay out), and every consumer already holds `shell`. If the human disagrees this becomes an Architect fork and an ADR.                                      |
| 10  | Where does append and fetch logic live: `aif debt` invoking `ai-git`, or an `ai-git debt` subcommand?                                                                                                                         | Question | M      | Arch     | EM        | No. Proposal: `aif debt` invoking `ai-git`. **Why:** ADR 0005 defines `ai-git` as a credential-injecting passthrough; domain logic there blurs that boundary.                                                                                         |
| 11  | Defaults for the segment cap and the fold and seal schedule.                                                                                                                                                                  | Question | L      | Design   | EM        | No. Proposal: 500 lines (about 100 KB), daily.                                                                                                                                                                                                        |
| 12  | Reviewers may emit more LOWs once they are "free". What guards against inflation?                                                                                                                                             | Risk     | M      | Design   | EM        | No. Proposal: a per-review cap on LOWs filed (value to decide), the existing "actionable" bar in `review-severity` Step 3, and LOWs per review in the job's log line.                                                                                 |
| 13  | How is "merged" decided for pending events: PR API state, or head-SHA reachability from `main`? This repository lands some work through `push-check/` branches without a PR, and squash merges make the head SHA unreachable. | Question | M      | Design   | EM        | No. Proposal: PR state from the API when a PR number exists; head-SHA reachability from `main` when it does not.                                                                                                                                      |
| 14  | Boundary for Software-Engineer opportunistic fixes.                                                                                                                                                                           | Question | M      | Design   | EM        | No. Proposal: only inside code the Task already modifies; otherwise leave the item. Reported through the `Fixes-debt:` trailer.                                                                                                                       |
| 15  | Sequencing against AIF-013. Task 005 there deletes `last_verified` and untracks both `index.json` files and is flagged for a human-chosen merge window.                                                                       | Risk     | H      | EM       | EM        | No. Proposal: dispatch Tasks only after AIF-013 Tasks 001 and 002 are merged, and keep this Feature clear of Task 005's window. This plan can be approved earlier.                                                                                    |
| 16  | What is the "anchor" in a fingerprint for non-code artifacts (agent yaml, skill, steering file, plan)?                                                                                                                        | Question | M      | Design   | EM        | No. Proposal: the nearest stable name: a yaml key, a `### Step` or `### Rule` name, or a heading. Rule names change, so the ledger keeps rule renames as aliases.                                                                                     |
| 17  | Ownership of the fold workflow: does the repository use CODEOWNERS or another required-review mechanism for `.github/`?                                                                                                       | Question | L      | Security | EM        | No. To confirm with the human; the plan assumes the workflow is review-gated.                                                                                                                                                                         |
| 18  | arc42 home for the mechanism: a new section (for example `05_06_debt_ledger.md`) or an extension of `05_04_document_indexing.md`? AIF-013's gate will require the right `key_files`.                                          | Question | L      | Docs     | EM        | No. Proposal: new section, with a pointer from 05_04 for the index target.                                                                                                                                                                            |
| 19  | Should the fold verify that a pending `fixed` event's PR actually carries the `Fixes-debt:` trailer, in addition to the reviewer's check?                                                                                     | Question | L      | Security | EM        | No. Proposal: yes if it is cheap with the PR commit list already needed to resolve merge state; otherwise leave it to review.                                                                                                                         |
| 20  | Writers re-append and push on rejection instead of merging (the earlier idea of a union-merge of both sides). Is that acceptable?                                                                                             | Question | L      | Design   | EM        | No. Proposal: yes. A union merge needs a custom merge driver that GitHub's merge button does not honor, and retry makes conflicts impossible.                                                                                                         |

> **Minor decisions made during planning.** Rows 1 to 8 record decisions the human made while shaping this Feature; they follow the convention in `skill/feature-planning`'s template, not the ADR route. Rows 9 and 10 are the two that could become forks needing an Architect decision.

---

## 9. Task Decomposition

Not yet decomposed (Draft). Per `skill/feature-planning`, this section stays empty and no `tasks.json` is produced until the human approves this plan.

---

## 10. Acceptance Criteria

- [ ] All Tasks complete and signed off
- [ ] Feature works end-to-end as described in Section 5
- [ ] No CRITICAL, HIGH, or MEDIUM findings open in any Task review
- [ ] A LOW finding in an approved review becomes a `found` event on the ledger branch, resolves to an open item once its PR merges, and never appears if the PR closes unmerged
- [ ] Two concurrent writers appending to the ledger never conflict and never lose an event (integration test against temporary git repositories)
- [ ] The scheduled job folds and deletes sealed segments in a single commit, and a rejected push is retried safely
- [ ] `aif index debt` is deterministic (same ledger tip, byte-identical output), gitignored, and reports "unavailable" rather than an empty result when the ledger cannot be fetched
- [ ] `aif debt for <paths>` returns capped, sorted results, and the Engineering Manager's Task brief and the Software-Engineer's workflow use it
- [ ] `Fixes-debt:`, `Debt-Moved:` and `Debt-Retired:` trailers are parsed anywhere in a commit message, including a squash-shaped fixture, and are validated by the Principal-Engineer
- [ ] `main`'s ruleset and required checks are unchanged, and the ledger branch has its own ruleset and is on the protected list
- [ ] `aif index architecture --check` and the PR-range gate pass, with the new arc42 documentation in place
