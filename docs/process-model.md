# Process Model — Efficiency Rework

> Status: Draft
> Created: 2026-09-03
> Approved by: Pending

Target-state description of a lighter process, plus the transition plan to reach it.
Replaces the Epic→Chunk model, the tiered Decision-Record system, and the 8-agent
role-pipeline (architect / tech-lead / engineering-manager / software-engineer /
ai-engineer / test-engineer / principal-engineer / engineering-tech-writer).

This document merges what was originally two drafts — this one and
`docs/plans/agent-consolidation-plan.md` — because they turned out to touch the
same files (`chunk-orchestration`, `epic-planning`, `chunk-planning`, the
decision-record tier tables, agent charters) for the same underlying reason:
proportionate ceremony. `agent-consolidation-plan.md` is kept as a superseded
historical record; this document is the live one.

---

## Goal

Proportionate ceremony. Current-state docs instead of accreting records. Coarser work
units. One agent owns a task end-to-end — design, implementation, testing, and
documentation — instead of handing it through a role-pipeline that loses context at
every handoff. A tracker that surfaces state. Git holds history; agent context holds
only what is binding and current.

---

## Target model

### Work hierarchy

| Level | Was | Definition | Artifact | Gate |
|---|---|---|---|---|
| **Capability** | — (new) | A large-scale product function. Lifecycle: `Proposed → Active → Delivered → Deprecated → Removed`. | Index entry (name, one-paragraph charter, status, features, doc link) + `docs/product/{cap}.md`. | None — status change only. |
| **Feature** | Epic | A small, definable piece of a Capability, reviewable by a human in one pass. | Feature Plan. | One committed human approval. |
| **Task** | Chunk | One execution unit of a Feature, owned end-to-end by one Software-Engineer dispatch (design → implement → test → document). Same DAG / wave / worktree machinery. | Row in `tasks.json` (+ optional short plan, see Agent roster). | Covered by the Feature's approval, or a Tier 3 escalation per `complexity-tiers`. |

- Capability is optional — a project that defines none has Features standing alone.
- Feature keeps today's Epic mechanics; Task keeps today's Chunk mechanics. Rename,
  plus the pipeline-ownership change described in Agent roster below.

### Task sizing

- A Task is a unit of review — roughly a focused half-day to a day, reviewable in one
  sitting — not the smallest mergeable diff.
- Split a Feature into multiple Tasks only for real parallelism or a hard dependency
  boundary. "Different files" is not a reason, and neither is artifact type
  (product code vs. AI-component work) — one Software-Engineer dispatch handles
  either, so a Task that needs both a code change and a declarative-component
  change stays one Task unless it also needs to run in parallel with something else.
- Sequential work inside one Task is fine. Small Features may be a single Task, or skip
  `tasks.json` and go straight to implementation.

### Reference docs (current truth, not history)

- `docs/architecture/*` — one file per long-lived technical subsystem. Stable set.
- `docs/product/*` — one file per Capability. Churns with the capability lifecycle;
  archived when the capability is Deprecated.
- Each ~1 page. Outgrowing a page means the subsystem/capability should split.
- `aif index` generates a nav index for both, scoped like `knowledge/index.json`.
- Updating the affected doc is an acceptance criterion of any Feature that changes
  behavior, checked in review alongside tests.
- Bodies stay in git. Owners: Software-Engineer (architecture — absorbed from the
  former `engineering-tech-writer`, written at implementation time rather than as a
  separate after-the-fact pass), product writer (product).

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, flat counter `AIF-ADR-001`, full options format |
| How the system / product works | The relevant `docs/architecture` or `docs/product` file |
| Process / tooling / convention change | No record — edit the skill/steering file; the commit + CHANGELOG line is the record |

- ADR scoped to one Capability is archived with it; foundational or cross-cutting ADRs
  attach to an architecture subsystem so they outlive any one capability.
- `complexity-tiers` and `plan-lifecycle` stay (trimmed). `decision-record` shrinks to
  the ADR-only format. `decision-triage`'s tier/domain classification step goes away
  entirely with it — with only one record type left (ADRs, rare architectural/product
  forks), there is no domain-ownership table to route through. Any agent that spots a
  genuine fork of that kind dispatches Architect directly (see Agent roster).

### Context rules

- Agents load the relevant reference-doc file(s) and index entries for their work area —
  always.
- Agents do not auto-load full ADR bodies, superseded reasoning, or historical narration.
- Decision records leave `knowledge/index.json` — one discovery index.
- No migration tables, "supersedes X because…", or point-in-time proposals in any
  artifact body. Those belong in commit messages.

### YouTrack (after the above lands)

- **Owns:** Capability/Feature/Task status, activity log (replaces the hand-authored
  orchestration log), hierarchy, dependency links for the board, PR links, escalations,
  dashboards and reports.
- **Does not own:** `tasks.json`, reference-doc bodies, ADR bodies, the nav index — all
  stay in git. A generated one-way Article mirrors the repo nav index for in-tracker
  navigation.
- Self-approval prevention: a YouTrack workflow rule if the free tier supports it, else a
  CI check that rejects an `Approved` flip authored by the AI identity.
- Prerequisite: verify free-tier custom fields + JS workflow rules on a throwaway
  instance before migrating.

---

## Agent roster

Split by context boundary and privilege level, not by job title. One agent owns a
Task end-to-end — design, implementation, testing, documentation — because those
phases share the same rationale and lose fidelity when handed between agents.
Research (context volume + privilege) and review (blackbox verification) are the
only splits that earn a separate agent.

8 agents → 5: `Tech-Lead`, `Test-Engineer`, `Engineering-Tech-Writer`, and
`AI-Engineer` are retired as standalone agents; their charters are absorbed below.
This also closes a security gap found during the audit: `architect` and
`ai-engineer` previously held write access, shell/code execution, and open web
access simultaneously (the "lethal trifecta") at once, mitigated only by a
per-call human-confirmation gate rather than a structural boundary.

| Agent | Role | Write | Shell | Web | Subagent dispatch |
|---|---|---|---|---|---|
| **Architect** | ADRs only — rare, contested, costly-to-reverse forks (per Decisions above) | Yes, scoped to `docs/decisions/**` | **No** | Yes (`web_search`/`web_fetch`) | Callable as a subagent by Engineering Manager or Software Engineer |
| **Engineering Manager** | Absorbs Tech-Lead: PRD/request → Feature Plan → Task decomposition → dispatch → orchestration | Yes (plans, orchestration state) | Yes (`ai-git`, dag tools) | **No** | Dispatches Software Engineer, Architect (on a spotted ADR-worthy fork), Researcher |
| **Software Engineer** | Absorbs Test-Engineer + Engineering-Tech-Writer + AI-Engineer + Task-level design (part of former Tech-Lead). Owns product code and AI-component work (agents/skills/steering/servers/bundles) alike, loading whichever skill set a Task calls for. | Yes | Yes | **No** | Gated `subagent` → Researcher (excluded from `approved_tools`, human confirms each dispatch) |
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for Engineering Manager or Software Engineer | Yes, scoped to a notes/scratch path (`.md` only) | **No** | Yes | No |
| **Principal Engineer** | Review gate — standards + the Feature's outline, not full implementation history. Checklist branches by artifact type (code standards vs. AGENTS.md schema/cross-reference checks). | No (findings only) | No | No | No |

### Why AI-Engineer merges into Software-Engineer

None of the reasons to split into a separate agent apply once both have the same
privilege profile (write + shell, no web): no context-volume reason (same Task
shape either way), no privilege/network difference, not a verification role, and
parallelism comes from dispatching multiple concurrent instances of the same
agent definition, not from having two agent identities. The split was a job-title
boundary. Merging also removes the old model's real coordination cost: a Task
touching both the bundle-resolver code (`lib/`) and a bundle definition
(`bundles/*/bundle.yaml`) needed two agents before; one engineer now does it as a
single dispatch. The underlying code/declarative-artifact boundary this
repo already established (`lib/`+`bin/` vs. `agents/`+`skills/`+`steering/`+
`servers/`+`bundles/`, with matching test categories `tests/unit`+
`tests/integration` vs. `tests/validation`) is unaffected — same directories,
same categories, one agent applying the right one per Task instead of two.

### Why Principal-Engineer absorbs AI-component review rather than a new role

A reviewer needing to apply either "standards + code correctness" or "AGENTS.md
schema + cross-reference integrity" per diff is no different from it already
needing multiple language standards. One reviewer, branching its checklist by
artifact type — not a second reviewer role. Principal-Engineer also gains one new
rule: any diff touching `tools`/`approved_tools`/`blocked_commands` in an agent
definition is always HIGH-or-above severity. This is what makes Software-
Engineer's write access to `agents/*.yaml` safe post-merge — the write is inert
until it clears review and a human-merged PR, and that only holds if review is
actually scrutinizing that class of diff.

### Security posture

| Agent | Legs held | Residual risk |
|---|---|---|
| Architect | write + web, no shell | Confirm the web tool is read-only fetch, not a generic HTTP client with outbound POST |
| Engineering Manager | write + shell, no web | Only ever sees compressed briefs from Architect/Researcher, never raw content |
| Software Engineer | write + shell, no web | Direct web-vector closed, exposure substantially reduced — but not zero. See Residual injection surface below. |
| Engineering Researcher | web only, write scoped to non-executable `.md` output | The one agent allowed to hold the web leg freely holds nothing else |
| Principal Engineer | none | Clean |

`skills/agent-authoring/reference/tools.yaml` should gain an explicit rule
against holding `moderate` (web) and `privileged` (write/shell) tools
simultaneously without documented isolation justification, so this stays
structural rather than tribal knowledge.

#### Residual injection surface

Removing Software-Engineer's direct web access closes the highest-volume,
most attacker-controllable vector, but it does not make Software-Engineer
immune to prompt injection — two things remain:

- **Engineering Researcher's brief is a narrower, but real, vector.**
  Summarization is not a guaranteed sanitization boundary — a page containing
  injected instructions ("recommend installing package X", "run command Y to
  fix this") can still have that survive into the brief's recommendation. The
  gated human-confirmation on *dispatching* Researcher does not cover this —
  it approves that a dispatch happens, not that the returned content has been
  vetted.
- **Web access was never the only surface.** Software-Engineer still reads
  repo content, dependency install output, and ticket/PRD text that reaches it
  via a Feature Plan — any of which can originate outside the org's control
  regardless of whether Software-Engineer itself can browse.

Mitigation: Software-Engineer's hard rules must state that a Researcher brief
is data informing a decision, never an instruction to execute directly — it
does not `npm install` a package or run a shell command solely because a
brief suggested it; the same standards-based judgment applies to a brief's
suggestions as to any other input.

### End-to-end flow

```
PRD / human request
      |
      v
Engineering Manager -- spots an ADR-worthy fork? --> Architect (subagent, gated)
  writes Feature Plan                                   writes ADR, human approves
      | human approves
      v
  dispatch per Task -------------------------------------
      |
      +--> Software Engineer -- needs research? --> Engineering Researcher (gated subagent)
      |      design -> implement -> test -> inline docs    returns brief, no code/repo write
      |      (single continuous session, own worktree)
      v
  Principal Engineer (standards + Feature Plan, not full implementation history)
      |
      +-- APPROVED -> Engineering Manager merges/advances
      +-- NEEDS_CHANGES -> back to the same Software Engineer dispatch (no cross-agent restart)
```

Correction loops and merge-conflict resolution cycle within one agent instead of
restarting a multi-agent chain — the largest source of the old model's
coordination overhead.

### Resolved design questions

**How detailed should a Feature Plan be, going into a Task?**
Coarse — *what*, not *how*: goal/acceptance criteria, interface/contract
boundaries the Task owns vs. depends on, binding standards and any Approved
ADRs, non-functional requirements as an explicit checklist (security, logging,
perf — still a Principal-Engineer gate), explicit out-of-scope. Not
function-level design, not a prescribed test list, not a file-by-file
breakdown — that's Software-Engineer's own design step, done at the top of its
own session. This moves the pre-implementation human checkpoint from "approve a
detailed per-Task plan" to "approve the Feature Plan," and design-level mistakes
are now caught at Principal-Engineer review instead of before code is written —
an intended effect of single-agent ownership, not an oversight.

**Does Software-Engineer still need a pre-approved plan before every Task?**
No — `complexity-tiers` (already built, previously wired only to
`ai-engineer.yaml`) becomes Software-Engineer's universal front door. Tier 1
("small enough to self-implement, no problem") proceeds directly,
self-validated, no separate plan artifact. Tier 2 ("large enough to need human
verification before implementation") outlines the approach, stops for human
approval, then Software-Engineer implements it itself — unchanged from the
skill's existing behavior. Tier 3 ("too large to implement solo") no longer has
Software-Engineer write its own plan and implement it — that would quietly
reintroduce the planning split this whole redesign removes. Instead it stops
immediately and hands off:
- **Dispatched as a subagent** (Engineering Manager invoked it) → report back
  to Engineering Manager with what was discovered and why it's too large;
  Engineering Manager decomposes into new Task(s)/a Feature.
- **Standalone** (a human is driving Software-Engineer directly, no
  orchestrator present) → escalate straight to the human with the same
  information; there is no Engineering Manager to hand it to.

This orchestrated/standalone branch reuses the same shape `skills/decision-
triage/reference/handoff-signal.md` already used for its own hand-off signal,
even though that skill is being retired — the pattern (behave differently
depending on whether an orchestrator is present) is proven and worth keeping.

This *is* the "refuse if too large / needs too much research" behavior: it
already exists in the framework, it just becomes universal instead of an
AI-only case, and it means hand off, not self-plan-then-implement.

**Does a human asking "plan this" force Tier 3?**
No — it's a floor on Tier 2, not a jump to Tier 3. Tier 2 already is "stop and
get a human sign-off before implementing it myself"; a human asking for a plan
on Tier-1-sized work is asking for that checkpoint, not asking for the work to
be taken away from Software-Engineer. Tier 3 hand-off is reserved for work that
is genuinely too large for Software-Engineer to own, which is a different
claim. Wanting more rigor than Tier 2's brief outline while still having
Software-Engineer implement it is a richer outline within Tier 2, not a fourth
tier — three tiers stay sufficient. If outlining at Tier 2 reveals the work is
actually too big, the existing mid-task escalation rule already covers
stepping up to a Tier 3 hand-off from there.

**Can Software-Engineer run without Engineering Manager at all?**
Yes — once it no longer needs a pre-approved plan for Tier 1/2 work, a human
can drive Software-Engineer directly on a small fix without spinning up a
Feature Plan first. This is a first-class mode now, not a degenerate one (it's
what makes the standalone branch above necessary). One thing that does not
disappear along with Engineering Manager: **Principal-Engineer review before
merge to main is a standing gate independent of who invoked Software-Engineer**
— it is not an Engineering-Manager-orchestration mechanic, so "no Engineering
Manager" must never be read as "no review."

**Does Engineering Manager pick up anything else?**
Two things: gated `subagent` dispatch to Researcher (same mechanism as its
dispatch to Architect) so a Feature Plan's light research needs don't have to
become an ADR; and — since `decision-triage`'s domain-routing is retired along
with the tier/domain system — the judgment call of "is this an ADR-worthy fork"
moves directly into Engineering Manager's and Software Engineer's own prompts
rather than through a separate classification skill.

---

## Existing artifacts

| Artifact | Disposition |
|---|---|
| `AIF-001`, `AIF-002`, `AIF-003` epics + their chunk plans | Done. Leave in place as history — no migration, no rename. |
| `AIF-004` (Draft — planning redesign) | Superseded by this document. Still-valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll into the work above. Mark `Superseded`. |
| `docs/plans/agent-consolidation-plan.md` (Draft) | Superseded by this document — its agent-roster content is merged into Agent roster above. Mark `Superseded`, leave in place as history. |
| Freeform `docs/plans/*.md` (`cli-plan`, `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-*`, `tech-lead-subagent-dispatch`, …) | Triage each: Done → move to `docs/plans/completed/`; real upcoming work → becomes a Feature; process/tooling change → fold into the skill/steering edit and delete; stale → delete. No new freeform plans after this. |
| `ai-engineering-plan` skill / "Tier 3 plan" concept | Retired. Small work (product or AI-component) runs under `complexity-tiers` (1/2); larger becomes a Feature. |
| `agents/tech-lead.yaml`, `test-engineer.yaml`, `engineering-tech-writer.yaml`, `ai-engineer.yaml` | Retired — charters absorbed into `engineering-manager.yaml` / `software-engineer.yaml` per Agent roster above. |
| `agents/architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`, `principal-engineer.yaml` | Modified per Agent roster above (tool grants, scope). |
| `agents/engineering-researcher.yaml` | New. |
| 15 decision records | `ARCH-001/005/006` → fold into `docs/architecture/`, then archive. `ARCH-002/003/007` → keep as ADRs. `ARCH-004` → keep (live open ADR). `PROC-001` → move to `steering/` as an artifact-type (code vs. declarative) classification rule, no longer an agent-boundary decision now that one agent applies it. `PROC-005` → move to `steering/`. `PROC-002/006` (AI-track dispatch/decomposition) → moot, not absorbed — the AI-track distinction itself is retired along with the AI-Engineer/Software-Engineer split. `PROC-003/004` → absorb into orchestration skill text, archive. `PLAN-001` → close (already Deferred). `META-001/002` → survivors into `decision-record` skill, archive. |

Archived records and plans move to an `archive/` subfolder with status noted — not
deleted. Git plus a browsable trail is the audit record.

---

## Implementation checks

| # | Check |
|---|---|
| 1 | `docs/architecture/` and `docs/product/` exist, each with an index and a one-page file template. |
| 2 | `aif index` emits a nav index for architecture + product docs, scoped like `knowledge/index.json`. |
| 3 | Capability index format is defined (name, charter, status, features, doc link) with the four-state status vocabulary. |
| 4 | `epic-planning` + `chunk-planning` merge into `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 5 | `chunk-orchestration`: `chunks.json` → `tasks.json`; per-Task plan gate replaced by `complexity-tiers`; software-track/AI-track branching removed (Steps 2–3) — one pipeline shape (implement+self-test+docs → Principal-Engineer review) for every Task. |
| 6 | DAG server + `lib` renamed chunk→task; wave output is identical for an equivalent graph. |
| 7 | `decision-triage`, `decision-brief`, `chunk-planning`, `ai-engineering-plan` skills deleted and all references removed. |
| 8 | `decision-record` reduced to the flat ADR format; `plan-lifecycle` and `complexity-tiers` trimmed; `complexity-tiers` re-pointed as Software-Engineer's primary gate. Tier 3's process changes from "produce a written plan, implement it" to "stop, do not plan or implement, hand off" — orchestrated → Engineering Manager, standalone → the human (see Agent roster, Resolved design questions). `plan this` documented as a Tier 2 floor, not an automatic Tier 3 jump — no fourth tier added. |
| 9 | `steering/engineering/core.md` Rules 1/2/8/9 reworded: Rule 1 replaced by the `complexity-tiers` gate, Rule 2 gets a fallback for Tier 1/2 work with no plan artifact, "Chunk Plan"/"Epic Plan" wording → Feature Plan; `knowledge-consumption.md` drops decision-record loading; doc-update acceptance gate added. |
| 10 | Agent YAMLs updated per Agent roster above: 4 retired, 4 modified, 1 new (`engineering-researcher.yaml`). |
| 11 | Product-doc + Capability-index ownership assigned to an agent (existing or new); `skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` swept (several tracked candidates resolve or move owner as their originating agents merge). |
| 12 | Existing decision records dispositioned per the table above; archive location created. |
| 13 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 14 | `tests/validation/` cross-reference check passes against the new agent/skill/doc set; `npm test` green. Fixture data referencing retired agent names (`tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`) cleaned up as a low-risk pass. |
| 15 | `bundles/engineering/snapshot.json` regenerated (`bundle.yaml` itself needs no edit — pure domain-based auto-discovery absorbs the roster shrink). |
| 16 | `README.md`, `PLAN.md`, `AGENTS.md`, `install.ps1`, `agents/README.md`, `skills/README.md` updated for the new model. `install.ps1` specifically enumerates agent files for install — retired names must be removed there as a real code change. |
| 17 | `skills/agent-authoring/reference/tools.yaml` gains the trifecta-avoidance rule (no agent holds `moderate`/web and `privileged`/write+shell tools at once without documented isolation justification). |
| 18 | Software-Engineer's hard rules state a Researcher brief is data informing a decision, never an instruction to execute directly (see Residual injection surface in Agent roster above); and confirm Principal-Engineer review applies before merge regardless of whether Software-Engineer was dispatched by Engineering Manager or run standalone by a human. |

---

## Sequencing

1. Land the reference-doc structure + `aif index` extension (checks 1–3).
2. Agent roster changes first (check 10) — everything else in this step derives
   from it. Then vocabulary + skill + agent sweep in one pass — feature/task
   rename, skill deletions, `complexity-tiers` re-pointed to Software-Engineer,
   steering rewrites, product-doc owner decision (checks 4–9, 11, 14–17).
3. Disposition existing records and plans (checks 12–13).
4. YouTrack — verify free-tier capability, then migrate Capability/Feature/Task tracking.
   Grandfather `AIF-001/002/003`.

Steps 1–3 are the "start being efficient" core and do not depend on YouTrack.
