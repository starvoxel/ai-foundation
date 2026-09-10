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
| **Feature** | Epic | A small, definable piece of work, reviewable by a human in one pass. | Feature Plan. | One committed human approval. |
| **Task** | Chunk | One execution unit of a Feature, owned end-to-end by one Software-Engineer dispatch (design → implement → test → document). Same DAG / wave / worktree machinery. | Row in `tasks.json` (+ optional short plan, see Agent roster). | Covered by the Feature's approval, or a Tier 3 escalation per `complexity-tiers`. |

- Feature keeps today's Epic mechanics; Task keeps today's Chunk mechanics. Rename,
  plus the pipeline-ownership change described in Agent roster below.

### Task sizing

- A Task is a unit of review — reviewable by Principal-Engineer in one sitting —
  not the smallest mergeable diff, and not bounded by a duration estimate. Now
  that a Task is owned end-to-end (design, implement, test, document) by one
  Software-Engineer dispatch, the same reviewable scope can take longer in
  elapsed time than the old chunk model implied, simply because process that
  used to span separate SE/TE/ETW steps now runs inside a single Task. Size by
  interface/contract boundary, not by a clock estimate.
- Split a Feature into multiple Tasks only for real parallelism or a hard dependency
  boundary. "Different files" is not a reason, and neither is artifact type
  (product code vs. AI-component work) — one Software-Engineer dispatch handles
  either, so a Task that needs both a code change and a declarative-component
  change stays one Task unless it also needs to run in parallel with something else.
- Sequential work inside one Task is fine. Small Features may be a single Task, or skip
  `tasks.json` and go straight to implementation.

### Reference docs (current truth, not history)

- `docs/architecture/*` — one file per long-lived technical subsystem. Stable set.
- `docs/product/*` — one file per product area. Stable set; archived manually when
  a product area is retired.
- Each ~1 page. Outgrowing a page means the subsystem/product area should split.
- `aif index` generates a nav index for both, scoped like `knowledge/index.json`.
- Updating the affected doc is an acceptance criterion of any Feature that changes
  behavior, checked in review alongside tests.
- Bodies stay in git. Owners: Software-Engineer (architecture — absorbed from the
  former `engineering-tech-writer`, written at implementation time rather than as a
  separate after-the-fact pass), **product: no owner yet** — no product-facing
  agent or role exists in this framework today (PLAN.md's v1.4 milestone,
  "Product domain agents (PRD, UX, product decisions)," is still unbuilt).
  `docs/product/*` and its ownership are explicitly out of scope for this
  document; Implementation check 10 tracks the open decision and this line
  should not be read as having already made it. That's expected, not a gap in
  this redesign — it lands with the future product-domain work.

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, flat counter `AIF-ADR-001`, full options format |
| How the system / product works | The relevant `docs/architecture` or `docs/product` file |
| Process / tooling / convention change | No record — edit the skill/steering file; the commit + CHANGELOG line is the record |

- ADR scoped to one Feature is archived with it (moved into the Feature's own
  folder once the Feature is archived); foundational or cross-cutting ADRs
  attach to an architecture subsystem so they outlive any one Feature.
- `complexity-tiers` and `plan-lifecycle` stay (trimmed). `decision-record` shrinks to
  the ADR-only format: the current `{paths.decisions}/{domain-folder}/` directory
  structure flattens to `{paths.decisions}/` directly (no more `architecture/`,
  `process/`, `meta-process/`, `planning/` subfolders), IDs become a single flat
  counter (`AIF-ADR-001`, `AIF-ADR-002`, …) instead of one counter per
  `(project, domain)` pair, and `reference/domain-guidance.md` (the per-domain
  writing-guidance stub file) is deleted along with Step 1's Domain-determination
  step. `decision-triage`'s tier/domain classification step goes away
  entirely with it — with only one record type left (ADRs, rare architectural/product
  forks), there is no domain-ownership table to route through. Any agent that spots a
  genuine fork of that kind dispatches Architect directly (see Agent roster).
  Existing records already `Approved`/`Draft` and kept as live ADRs are renumbered
  into the flat scheme as part of this transition; records that get folded into a
  doc/skill/steering file or archived outright keep their original ID — see
  Existing Artifacts below for the full mapping and rule.

### Context rules

- Agents load the relevant reference-doc file(s) and index entries for their work area —
  always.
- Agents do not auto-load full ADR bodies, superseded reasoning, or historical
  narration by default — an index entry (title, description, tags, status) is
  enough to decide relevance. Load the full body only on demand, once an entry
  looks relevant to the task at hand. This is the same discipline
  `knowledge-consumption.md` already applies to general knowledge files; ADRs
  now follow it too instead of being the one type auto-loaded in full.
- **One dedicated index per knowledge type, never a shared/duplicated one.**
  Today, `knowledge/index.json` (general project knowledge — `reference`,
  `api`, `business-rule`, plus `decision` and `architecture` as two of
  `KNOWLEDGE_TYPES`) and `{paths.decisions}/index.json` (ADRs) overlap: per
  `skills/knowledge-authoring/SKILL.md` Step 2, a decision record is
  *additionally* copied into `knowledge/index.json` whenever its (now-retired)
  Domain is Architecture or AI-component, "because it lacks a single canonical
  implementing artifact." That domain-conditional rule cannot survive this
  document — there is no more Domain to condition on — so it is deleted
  outright, not reworked: decisions live in exactly one index,
  `{paths.decisions}/index.json`, full stop. The same one-index-per-type rule
  now extends to the two new doc types this document introduces:
  `docs/architecture/*` gets its own index, `docs/product/*` gets its own,
  neither duplicated into `knowledge/index.json` or each other. This also
  surfaces a naming collision worth fixing while here: `KNOWLEDGE_TYPES`
  already has a generic `architecture` type for freeform knowledge files,
  which is a different thing from the new purpose-built `docs/architecture/*`
  one-page-per-subsystem reference docs — same word, two structures. Retire
  the `architecture` and `decision` entries from `KNOWLEDGE_TYPES`
  (`lib/constants.js`) now that both have a dedicated home and a dedicated
  index; the general `knowledge/index.json` going forward covers `reference`,
  `api`, and `business-rule` only. This pattern — one type, one directory, one
  index, one clear name — is what a future code-knowledge index (mentioned as
  a "someday" in PLAN.md's v2.0 milestone) would also follow when it's built;
  no design work is needed now to accommodate it, just a new `--<type>` flag
  and directory when that day comes.
  - **What does this actually change in the general knowledge index?**
    Nothing is added by this document — one duplication rule is *removed*.
    `knowledge/index.json` currently exists to index general
    `reference`/`api`/`business-rule` project knowledge (per
    `knowledge-authoring`); the answer to "what needs indexing because of the
    flat-ADR move" is nothing new, only less: the Architecture/AI-component
    decision-duplication rule above goes away, and that is the entirety of
    the flat-ADR move's effect on this index.
- No migration tables, "supersedes X because…", or point-in-time proposals in any
  artifact body. Those belong in commit messages.

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
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for Engineering Manager or Software Engineer | Yes, scoped to a notes/scratch path (`.md` only) — `{paths.research}`, default `knowledge/research/`, a new `.aiconfig.json` field (see Implementation check 19) | **No** | Yes | No |
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

**Who commits an Architect-authored ADR to git, given Architect holds `write`
but not `shell`?**
Architect never commits its own output. Every git/GitHub operation in this
repo goes through `ai-git`, and `ai-git` is deliberately kept as a CLI script
invoked via the generic `shell` tool rather than a typed tool of its own
(`AIF-ARCH-006`, Approved — its unbounded git/gh surface was found unsuited to
a narrower tool boundary). Architect having `write` scoped to
`docs/decisions/**` is sufficient to produce the file; the agent that
dispatched Architect (Engineering Manager or Software Engineer) commits it
through the `shell`/`ai-git` access it already holds for its own plans —
exactly as Engineering Manager already commits Feature Plans today. This is
a process step, not a new tool grant: it does not reopen `AIF-ARCH-006`, and
it keeps Architect's privilege profile exactly as clean as the Security
posture table intends. The dispatching agent's prompt must say this
explicitly (Implementation check 9) so it isn't silently assumed.

**What survives when `decision-triage` and its Tier/Domain model are retired,
given the Tier 3 hand-off (above) reuses its hand-off-signal shape?**
Only the *structural pattern* — branch behavior on whether an orchestrator is
present, and stop-and-report vs. hand-to-orchestrator — not the file's
content. `skills/decision-triage/reference/handoff-signal.md` is built
entirely around the Tier A/B/C and Domain-owner vocabulary this document
retires; it is deleted along with the rest of `decision-triage` (Implementation
check 6). Software-Engineer's Tier 3 hand-off (Resolved design question above)
re-implements the same two-branch shape natively in its own prompt/skill —
it does not reference or depend on the retired file surviving.

---

## Existing artifacts

| Artifact | Disposition |
|---|---|
| `AIF-001`, `AIF-002`, `AIF-003` epics + their chunk plans | Done. Leave in place as history — no migration, no rename. |
| `AIF-004` (Draft — planning redesign) | Superseded by this document. Still-valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll into the work above. Mark `Superseded`. |
| `docs/plans/agent-consolidation-plan.md` (Draft) | Superseded by this document — its agent-roster content is merged into Agent roster above. Mark `Superseded`, leave in place as history. |
| `docs/plans/chunk-epic-planning-redesign-plan.md` (was Draft) | **Deleted** (not archived). This was the source plan `AIF-004` was drafted from — its own header said "superseded by [AIF-004] on approval," but `AIF-004` never reached `Approved` and is itself Superseded above, so this file was doubly-orphaned (Draft, pointing at a dead approval path) with zero content not already absorbed into `AIF-004`/this document. Unlike the general "archive, don't delete" policy below, deletion is correct here specifically because nothing of substance is lost — the content survives in `AIF-004` (kept as history) and in this document. `docs/misc/youtrack-tracking-config-notes.md`, which referenced this file by path, has been annotated to point at this document and `youtrack-integration-plan.md` instead. |
| `docs/plans/tech-lead-subagent-dispatch-plan.md` (was Deferred) | **Deleted** (not archived). Proposed a Tech-Lead-dispatches-AI-Engineer-as-subagent mechanism for AI-track chunk-plan authorship — moot now that the AI-track/software-track split itself is retired (AI-Engineer merges into Software-Engineer; there is no second track to dispatch into). Already `Deferred`, i.e. already stood down; nothing further would ever action it. Only referenced from `AIF-001`/`AIF-002`'s completed, frozen chunk plans and epics (`docs/plans/{chunks,epics}/AIF-00{1,2}/**`) — left untouched per that row's "no migration, no rename" policy; a reference from a frozen historical artifact to a deleted file is itself historical record, same as a reference to a deleted commit. |
| `docs/decisions/process/AIF-PROC-003_parallel-chunk-isolation-worktrees.decision.md` (Draft) | **Not cleaned up — directly related, in scope.** Names chunk-specific worktree isolation, but the mechanism it documents (branch-per-work-item, worktree-per-work-item) is exactly what "Task keeps today's Chunk mechanics" (Work hierarchy, above) carries forward unchanged. Resolve/reword as part of this redesign's vocabulary sweep rather than deleting: rename chunk→Task throughout, keep the decision. |
| Freeform `docs/plans/*.md` (`cli-plan` — live, real remaining work, not touched by this sweep; `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-filter-and-batch-tools` — Done/Complete → move to `docs/plans/completed/`; `gmail-mcp-server` — Approved, not `Draft`, not part of this redesign, left for a separate pass) | Triage each: Done → move to `docs/plans/completed/`; real upcoming work → becomes a Feature; process/tooling change → fold into the skill/steering edit and delete; stale → delete. No new freeform plans after this. |
| Other Draft ADRs not touched by this document (`AIF-PROC-004` Standards Sync Ownership, `AIF-PROC-005` Git Workflow Mode) | **Deliberately out of scope, not cleaned up.** Live, unimplemented decisions about subjects this redesign doesn't touch (standards distribution, git branching strategy) — "Draft" here means "not yet decided," not "stale." Cleaning up Draft records that are merely pending, rather than superseded-in-substance, would destroy real unactioned analysis unconnected to this redesign. Both stay at their current legacy path/ID (`docs/decisions/process/AIF-PROC-00{4,5}_*.decision.md`), outside the new flat `docs/decisions/AIF-ADR-*` structure, until whatever future work resolves them decides how they fit the by-then-established flat convention — that decision does not belong to this document. |
| `ai-engineering-plan` skill / "Tier 3 plan" concept | Retired. Small work (product or AI-component) runs under `complexity-tiers` (1/2); larger becomes a Feature. |
| `agents/tech-lead.yaml`, `test-engineer.yaml`, `engineering-tech-writer.yaml`, `ai-engineer.yaml` | Retired — charters absorbed into `engineering-manager.yaml` / `software-engineer.yaml` per Agent roster above. |
| `agents/architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`, `principal-engineer.yaml` | Modified per Agent roster above (tool grants, scope). |
| `agents/engineering-researcher.yaml` | New. |
| 16 decision records | `ARCH-001/005/006` → fold into `docs/architecture/`, then archive (keep legacy ID — archived records are not renumbered, see below). `ARCH-002/003/004/007` → **kept as live ADRs, renumbered into the new flat scheme**: `AIF-ARCH-002` → `AIF-ADR-001`, `AIF-ARCH-003` → `AIF-ADR-002`, `AIF-ARCH-004` → `AIF-ADR-003`, `AIF-ARCH-007` → `AIF-ADR-004` (order: original numeric order among the kept set). Files physically move from `docs/decisions/{domain}/` to flat `docs/decisions/AIF-ADR-{###}_{slug}.decision.md` — no more domain subfolders. Every live cross-reference to the old IDs (this document's own citations included — none currently cite these four by their pre-renumber ID, so none need fixing here) gets updated to the new ID as part of this same pass; archived/folded/moved-to-steering records are explicitly exempt from renumbering (see below) so their historical citations elsewhere are undisturbed. `PROC-001` → move to `steering/` as an artifact-type (code vs. declarative) classification rule, no longer an agent-boundary decision now that one agent applies it (keep legacy ID, archived). `PROC-003` → absorb into `chunk-orchestration`/`worktree-management` text, reworded chunk→Task (keep legacy ID, archived) — **not** grouped with `PROC-004`, which is unrelated (see the out-of-scope row above; a prior version of this table incorrectly grouped them). `PROC-005` → move to `steering/` (keep legacy ID, archived). `PROC-002/006` (AI-track dispatch/decomposition) → moot, not absorbed — the AI-track distinction itself is retired along with the AI-Engineer/Software-Engineer split (keep legacy ID, archived). `PLAN-001` → close (already Deferred; keep legacy ID, archived). `META-001/002` → survivors into `decision-record` skill, archive (keep legacy ID). **Renumbering scope rule:** only records that remain independently citable, standalone ADRs going forward get a flat `AIF-ADR-*` ID; anything folded into a doc/skill/steering file or simply archived keeps its original historical ID, since the archive is an audit trail, not a live index. |

Archived records and plans move to an `archive/` subfolder with status noted — not
deleted. Git plus a browsable trail is the audit record.

---

## Implementation checks

| # | Check |
|---|---|
| 1 | `docs/architecture/` and `docs/product/` exist, each with an index and a one-page file template. |
| 2 | `aif index` gains `--architecture`/`-a` and `--product`/`-p` flags in `lib/commands/index.js` (alongside existing `-k`/`-d`), each emitting its own dedicated index (`docs/architecture/index.json`, `docs/product/index.json`) — not a shared or combined file. `runIndex`'s existing "only one of -k/-d, not both" mutual-exclusivity check extends to all four flags (exactly one required per invocation), not just the original two. See Context rules ("One dedicated index per knowledge type") for why these stay separate from each other and from `knowledge/index.json`. |
| 3 | `epic-planning` + `chunk-planning` merge into `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 4 | `chunk-orchestration`: `chunks.json` → `tasks.json`; per-Task plan gate replaced by `complexity-tiers`; software-track/AI-track branching removed (Steps 2–3) — one pipeline shape (implement+self-test+docs → Principal-Engineer review) for every Task. |
| 5 | DAG server + `lib` renamed chunk→task; wave output is identical for an equivalent graph. Includes `servers/dag/logic.js`'s own doc comment (currently describes itself as processing "epic chunk dependency graphs") and the chunk/epic-worded assertions/fixtures in all three `servers/dag/tests/**` files — not identifiers alone. |
| 6 | `decision-triage`, `decision-brief`, `chunk-planning`, `ai-engineering-plan` skills deleted and all references removed, including `skills/decision-triage/reference/handoff-signal.md` — only its stop-and-report/hand-to-orchestrator *shape* survives, re-implemented natively in Software-Engineer's Tier 3 hand-off (see Resolved design questions); the file's Tier/Domain content does not survive it. |
| 7 | `decision-record` reduced to the flat ADR format: Step 1's Domain-determination sub-step deleted, `reference/domain-guidance.md` deleted, Step 4/Outputs' `{domain-folder}/` path and per-domain counter replaced by flat `docs/decisions/AIF-ADR-{###}_{slug}.decision.md` (see Decisions/Existing Artifacts above for the renumbering mapping and rule); `plan-lifecycle` and `complexity-tiers` trimmed; `complexity-tiers` re-pointed as Software-Engineer's primary gate. Tier 3's process changes from "produce a written plan, implement it" to "stop, do not plan or implement, hand off" — orchestrated → Engineering Manager, standalone → the human (see Agent roster, Resolved design questions). `plan this` documented as a Tier 2 floor, not an automatic Tier 3 jump — no fourth tier added. `lib/decisions.js` and `lib/commands/index.js` (real code behind `aif index -d`) updated to match: drop `Tier`/`Domain` from new index entries (existing entries keep theirs as historical record — parsing already tolerates their absence), and retire the `TITLE_PATTERN` branch matching `# Decision Brief: ...` now that `decision-brief` no longer produces any. |
| 8 | `steering/engineering/core.md` Rules 1/2/8/9 reworded: Rule 1 replaced by the `complexity-tiers` gate, Rule 2 gets a fallback for Tier 1/2 work with no plan artifact, "Chunk Plan"/"Epic Plan" wording → Feature Plan; `knowledge-consumption.md` changes decision-record handling from full-body auto-load to **index-only by default, full body loaded on demand once an entry looks relevant** (see Context rules) — this is a behavior change to the rule text, not a removal of decision-record handling; doc-update acceptance gate added. |
| 9 | Agent YAMLs updated per Agent roster above: 4 retired, 4 modified, 1 new (`engineering-researcher.yaml`). |
| 10 | Product-doc ownership assigned to an agent (existing or new); `skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` swept (several tracked candidates resolve or move owner as their originating agents merge). |
| 11 | Existing decision records dispositioned per the table above; archive location created. |
| 12 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 13 | `tests/validation/` cross-reference check passes against the new agent/skill/doc set; `npm test` green. Fixture data referencing retired agent names (`tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`) cleaned up as a low-risk pass. |
| 14 | `bundles/engineering/snapshot.json` regenerated (`bundle.yaml` itself needs no edit — pure domain-based auto-discovery absorbs the roster shrink). |
| 15 | `README.md`, `PLAN.md`, `AGENTS.md`, `agents/README.md`, `skills/README.md` updated for the new model. `install.ps1` is not part of this sweep — it was already deleted (see check 18): confirmed dead per `AIF-ARCH-001` (Approved), which documented it as broken (assumes `.md` agent files; the repo's agents are `.yaml`) and flagged it "will be deprecated and eventually removed." `AGENTS.md`'s Fields table and `projects/_template/.aiconfig.json` also get the `paths.epics`→`paths.features` / `paths.chunks`→`paths.tasks` rename as a real schema change — see check 19 for the back-compat stance. |
| 16 | `skills/agent-authoring/reference/tools.yaml` gains the trifecta-avoidance rule (no agent holds `moderate`/web and `privileged`/write+shell tools at once without documented isolation justification). |
| 17 | Software-Engineer's hard rules state a Researcher brief is data informing a decision, never an instruction to execute directly (see Residual injection surface in Agent roster above); and confirm Principal-Engineer review applies before merge regardless of whether Software-Engineer was dispatched by Engineering Manager or run standalone by a human. |
| 18 | **Done, ahead of and independent of this document's sequencing.** `install.ps1` was already dead (confirmed broken by `AIF-ARCH-001`, Approved, which documented it as assuming nonexistent `.md` agent files and flagged it for eventual removal). Deleted outright, and `tests/validation/tools.test.js`'s "install.ps1 exists" assertion removed to match. Not a future action item. |
| 19 | `.aiconfig.json` schema scope: `AGENTS.md` Fields table and `projects/_template/.aiconfig.json` renamed `paths.epics`→`paths.features`, `paths.chunks`→`paths.tasks`; new field `paths.research` added (default `knowledge/research/`) for Engineering Researcher's scratch-note output (see Agent roster) — deliberately under `knowledge/` since the notes are working material, not a fourth peer to `plans`/`decisions`/`knowledge`. **No back-compat path** on the renamed fields — no dual-key fallback, no deprecation warning, no reading the old field names. Consistent with the no-legacy-schema precedent the superseded `AIF-004` epic already set for `chunks.json`'s new fields: this framework is not yet widely adopted, so a clean break is cheaper than permanent dual-schema support. Any project repo with an existing `.aiconfig.json` using the old field names updates it manually when it adopts this model — not this framework repo's concern to bridge. |
| 20 | Terminology-sweep verification: after checks 3–9/13/15/19/21 land, a repo-wide search for `chunk`/`epic` outside the following returns zero matches — `docs/plans/{chunks,epics,orchestration}/`, `docs/plans/completed/`, Decision Record bodies (`docs/decisions/**/*.decision.md`) **and** `docs/decisions/index.json` (generated from those bodies' titles/tags, not itself a body — a separate carve-out from "Decision Record bodies" since the literal text wouldn't otherwise cover it), `docs/plans/agent-consolidation-plan.md` (Draft, kept in place as history per Existing Artifacts), `docs/plans/epics/AIF-004.epic.md` (already covered by the `epics/` exclusion above, noted for clarity since it's the largest single offender). `docs/plans/chunk-epic-planning-redesign-plan.md` and `docs/plans/tech-lead-subagent-dispatch-plan.md` needed no exception — both are deleted (see Existing Artifacts). Mirrors the acceptance criterion the superseded `AIF-004` epic used for its own (smaller) version of this sweep. Add this as an automated `tests/validation/` check, not a one-time manual grep, so a future PR can't silently reintroduce the retired terminology. |
| 21 | Knowledge-index type cleanup (see Context rules): `lib/constants.js`'s `KNOWLEDGE_TYPES` drops `decision` and `architecture`; `skills/knowledge-authoring/SKILL.md` Step 2's table and Edge Cases drop the Architecture/AI-component-domain duplication-into-`knowledge/index.json` rule for decisions (deleted outright — decisions live only in `{paths.decisions}/index.json` now), and its `architecture` type row is deleted in favor of pointing authors at `docs/architecture/*` (check 1). `lib/knowledge.js`/`lib/commands/index.js` gain the `--architecture`/`--product` index-generation paths (check 2). |

---

## Sequencing

**Already done, independent of the steps below:** check 18 (`install.ps1`
deleted — it was already dead code, unrelated to this redesign) and the two
file deletions in check 12's scope (`docs/plans/chunk-epic-planning-redesign-
plan.md`, `docs/plans/tech-lead-subagent-dispatch-plan.md` — see Existing
Artifacts). Neither blocks nor is blocked by anything below.

0. **Land the reference-doc + indexing foundation** (checks 1, 2, 21). 21 is
   bundled with 2 rather than left for later because it touches the same
   `lib/commands/index.js` surface 2 adds the `--architecture`/`--product`
   flags to — doing both in one pass avoids touching that file twice.
1. **Agent roster first** (check 9, together with check 19's `paths.research`
   addition — the new `engineering-researcher.yaml` needs that field to exist
   the moment the agent does). Everything in step 2 assumes the roster is
   already final.
2. **Vocabulary + skill + agent sweep, one pass** — feature/task rename,
   skill deletions, `complexity-tiers` re-pointed to Software-Engineer,
   steering rewrites, the `paths.epics`/`paths.chunks` rename half of check 19,
   product-doc owner decision left explicitly open (checks 3–8, 10, 13–17,
   19's remaining half).
3. **Disposition existing records and plans** (checks 11–12) — this is where
   the ADR flat-renumbering and domain-subfolder flattening actually happens
   (part of check 11's "dispositioned per the table above"); it depends on
   step 2 already having landed `decision-record`'s new flat-format skill, so
   the records being renumbered move into a directory shape the tooling
   already expects.
4. **Terminology-sweep verification last** (check 20) — by construction, this
   check can only pass once steps 0–3 are all in; running it earlier would
   just fail against work not yet done. This is the gate that confirms the
   sweep is actually complete, not a step that does any renaming itself.

This is the full sequencing for this document's scope. YouTrack integration is
a separate, follow-on layer on top of this model — see
`docs/plans/youtrack-integration-plan.md` — sequenced independently once the
above lands; nothing in this document depends on it.
