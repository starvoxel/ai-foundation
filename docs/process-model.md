# Process Model — Efficiency Rework

> Status: Draft
> Created: 2026-09-03
> Approved by: Pending

Target-state description of a lighter process, plus the transition plan to reach it.
Replaces the Epic→Chunk model, the 8-agent role-pipeline (architect / tech-lead /
engineering-manager / software-engineer / ai-engineer / test-engineer /
principal-engineer / engineering-tech-writer), and the tiered Decision-Record system —
the last of these swapped for standard MADR records managed by the `adrs` CLI, with
everything that was never a decision (mechanism, requirements, ownership) moved to a
document type that is allowed to stay current.

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

### Document types

Everything below is **knowledge** — the general term for non-code material an agent reads
to do its work, and the name `.aiconfig.json` already uses for the path
(`paths.knowledge`). This repo happens to point that at `docs/`; another project may
leave it as `knowledge/`. The types below are subdirectories under it, not a competing
concept.

Four kinds, split by what question each answers and whether it may change after it
lands. Collapsing them into one artifact type is what produced the current 15-record
decision log, of which 7 are not decisions at all.

| Type | Answers | Mutability | Home | Owner |
|---|---|---|---|---|
| **ADR** | Why this path won over another | Immutable once accepted — superseded, never edited | `docs/decisions/` | Architect |
| **Software doc** | How a subsystem currently works | Living — updated as the subsystem changes | `docs/software/*` | Architect may start one alongside an ADR; Software-Engineer maintains it at implementation time |
| **Product doc** *(reserved — not built yet)* | What a product area does, and for whom | Living | `docs/product/*` | A future product agent |
| **Process & ownership** | How we work / who is accountable | Living — edited in place | `steering/`, `standards/`, agent charters, the Agent roster above | Engineering Manager |

**Named "software", not "architecture", deliberately.** An "architecture doc" sitting
next to an "architecture decision record" is a coin-flip for humans and agents every
time either is referenced, and the two are precisely the pair this model most needs kept
apart. `software` also pairs cleanly with `product`: how it is built, versus what it
does for users.

**Product docs are a reserved slot, not current work.** Nothing here needs a PRD today,
and standing up a directory with no content and no owner is how unused ceremony starts.
The slot is named now because a product agent is a foreseeable addition and design work
is where PRDs start paying for themselves — build it when that agent lands, not before.

- Software docs are ~1 page each. Outgrowing a page means the subsystem should split.
- Updating the affected doc is an acceptance criterion of any Feature that changes
  behavior, checked in review alongside tests.
- Bodies stay in git. `aif index` generates a nav index for software docs; decisions are
  indexed by `adrs`, not `aif` (see ADR tooling below).
- **PRDs are an input, not a fifth type.** A PRD states goal, users, success criteria
  and out-of-scope — what and why, never how. For every Feature today, the Feature Plan's
  own goal/acceptance-criteria section *is* the PRD. When the product agent arrives and
  PRDs start outliving the Feature that introduced them, they go in the reserved slot.
- **Ownership (RACI) questions are not decisions.** "Who owns X" is answered by the
  Agent roster table and the agent charters it drives — never by a record in
  `docs/decisions/`. Three current records (`PROC-001/004/006`) exist only because
  there was no other home for that question.
- **`skill/knowledge-authoring` is reconciled with this table, not left beside it.** Its
  `type` list (`decision`, `reference`, `architecture`, `api`, `business-rule`) predates
  these four kinds and now overlaps them: `decision` is an ADR and no longer its
  business, `architecture` is a software doc. It keeps the types that are genuinely
  neither — reference material, API notes, business rules — and points here for the rest.

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, MADR format (below) |
| How the system / product works | The relevant `docs/software` file (or `docs/product`, once that slot is built) |
| Process / tooling / convention / ownership change | No record — edit the skill/steering/agent file; the commit + CHANGELOG line is the record |

- ADR scoped to one Feature is archived with it; foundational or cross-cutting ADRs
  attach to a software subsystem so they outlive any one Feature.
- `complexity-tiers` and `plan-lifecycle` stay (trimmed). `decision-record` is not
  trimmed but **replaced outright** by MADR + the `adrs` CLI below;
  `decision-triage`'s tier/domain classification goes away with it. With one record
  type left there is no domain-ownership table to route through — any agent spotting a
  genuine fork dispatches Architect directly (see Agent roster).

### ADR format — MADR

Standard MADR, replacing the in-house options-exploration template. An ADR records
*that* a decision was made and *why* — not the research trail behind it.

Frontmatter: `status` (`proposed`/`accepted`/`rejected`/`deprecated`/`superseded`),
`date`, `deciders`, `tags`. Sections: Context and Problem Statement → Decision Drivers
→ Considered Options → Decision Outcome (+ Consequences) → optional Pros and Cons of
the Options → optional More Information.

**Budget: 150–350 words excluding frontmatter.**

| Section | Cap |
|---|---|
| Context and Problem Statement | 2–4 sentences |
| Decision Drivers | 3–6 bullets, fragments not sentences |
| Considered Options | one line each, 2–4 options |
| Decision Outcome | 2–4 sentences tied back to the drivers |
| Consequences | 3–5 one-line bullets |
| Pros and Cons of the Options | optional; 2–3 bullets per option, only where a rejection isn't obvious from its one-liner |

Does **not** belong in an ADR — goes to the software doc, or to the Feature/ticket:
schemas, config field tables, algorithms, code blocks beyond a 3-line illustration,
migration and rollout steps, "what the implementer must know when decomposing this",
and open questions about how the system will work.

**Litmus test:** does this sentence explain *how the system works*, or *why this path
won over another*? Only the second belongs in the ADR. Every current ARCH record fails
this test in its `Design` section — see Decision-record disposition.

An accepted ADR is never edited; a reversal is a new ADR with `supersedes:` set. That
single property retires the `Amending` status and the Errata/Amendments ladder
wholesale — they exist only to make editing an approved record safe, which MADR
removes the need for.

### ADR tooling — `adrs` CLI

Adopt [`adrs`](https://github.com/joshrotenberg/adrs) (Rust, MADR mode) for
`docs/decisions/`, replacing the in-house `lib/decisions.js` + `aif index -d` path.

| Capability | Effect |
|---|---|
| `adrs new` | Scaffolds a correctly-shaped MADR file — no template copy-paste |
| `adrs link <n> <Kind> <target>` | Typed links (`Supersedes`/`Amends`/`RelatesTo`) with the reverse edge written automatically — replaces hand-maintained `References`/`Referenced By` |
| `adrs lint` | Structural checks: status, date format, filename/number match, sequential numbering, links resolve |
| Built-in MCP server | Agents query the decision log directly instead of grepping files |

Consequences of adopting it:

- **`lib/decisions.js`, `aif index -d`, the committed `docs/decisions/index.json`, and
  their unit/integration tests all retire.** That index is already stale on `main`
  (`aif index -d --check` → `✗ stale: Removed: AIF-PLAN-001`) — a generated artifact
  with nothing enforcing regeneration. `adrs` owns that job; `aif index` keeps
  architecture + product only.
- **Flat directory, single counter.** `adrs`'s `list()` is `WalkDir::max_depth(1)` and
  never descends into subfolders, so `docs/decisions/{architecture,process,meta-process}/`
  must flatten — which retiring domains already required. Frontmatter `tags` carry any
  categorization still wanted.
- **One known bug to guard.** Link kinds written as `relates-to` / `superseded-by` /
  `amended-by` silently deserialize to `Custom(...)` rather than the canonical variant,
  and `adrs lint` does not catch it (its link rule only checks that the target number
  exists). Either always let `adrs link` write the field, or add a CI grep guard:
  `grep -rnE '^\s*kind:\s*(relates-to|superseded-by|amended-by)\s*$' docs/decisions/`.
  Validate that regex against real `adrs`-generated files before wiring it in.
- **ID scheme.** `adrs` numbers files natively (`0001-short-title.md`). Keep the native
  filename and carry an `AIF-ADR-001`-style `id:` in frontmatter for citation rather
  than fighting the tool's numbering — the flat counter this model already chose maps
  1:1.
- Version/behavior claims above come from the linked research notes (`adrs-core`
  v0.11–0.12.x); re-verify against the current release at adoption time.

#### Open: how a Rust CLI reaches a Node project

`adrs` ships prebuilt macOS/Linux/Windows binaries via GitHub releases (a `cargo-dist`
installer script), plus Homebrew, Cargo and Docker. It does **not** publish an npm
package. That makes distribution a real decision rather than an install line, for two
reasons specific to this repo:

- **Windows is supported and not optional** — `install.ps1` exists and `ARCH-001` set
  OS-agnosticism as a hard constraint. Homebrew is out; Cargo means a Rust toolchain on
  every Windows dev machine.
- **The framework installs into other people's projects.** `ARCH-001` chose Node
  explicitly for "portable, minimal dependencies (Node.js stdlib + `yaml`)". Requiring a
  Rust binary in every consuming project is a real change to that contract, not an
  internal tooling detail — and it is the strongest argument against adoption.

| Option | Verdict |
|---|---|
| Pinned binary from GitHub releases, bootstrapped in setup + CI | Works on all three OSes with no Rust toolchain. Costs a version-pinned download step and a checksum. **Recommended starting point.** |
| Own npm wrapper (per-platform `optionalDependencies`, the esbuild/swc pattern) | Best DX for Node consumers, but means maintaining a distribution package for someone else's binary and re-publishing on every upstream release |
| Reimplement MADR handling in JS | Keeps the pure-Node contract; loses the MCP server and upstream maintenance. Note the maintenance argument is weaker than it looks — MADR is far simpler than the in-house format, so this is plausibly *less* code than `lib/decisions.js` is today |
| Homebrew / `cargo install` | Out — not Windows, or needs a Rust toolchain |

This is exactly the "contested, costly-to-reverse fork" shape the model reserves ADRs
for, and it partially reopens `ARCH-001`. Settle it as its own ADR (check 27) before
committing the conversion to `adrs`; if it lands against adoption, the MADR format and
everything else in this section still stand — only the tooling changes.

### Writing docs agents can consume

Applies to software docs, and to product docs when that slot is built — ADRs get their
shape from MADR above.

- **Frontmatter is for filtering, not reading**: `status`, `tags`, `last_verified`. No
  prose. A summary field here duplicates the doc's own opening line and drifts from it.
- **The one-line summary is a body convention**: a single blockquote sentence
  immediately after the H1. Mechanically extractable by the same parse-title-then-fields
  approach `lib/decisions.js` already uses, without a YAML block scalar.
- **Key Files section**: relative links to the source files the doc describes. This is
  file-level binding — the affordable version of symbol-level binding — and it makes
  staleness detectable, since a failing relative-link check is a strong signal the doc
  no longer matches the code. A code graph is explicitly *not* adopted here: it gives
  structure, never intent, and the tools that bind decisions to symbols are too early.
- **`aif index` entry shape**: `path`, `title`, `summary`, `status`, `tags`,
  `last_verified` — enough for an agent to skim the whole set and open only what is
  relevant. Same pure-parse → build → diff pipeline as today's decision indexer, minus
  the reference-graph inversion (these docs have no link graph); generalize
  `entriesEqual`'s hardcoded array-field list to "sort any array-valued field" so one
  module serves both doc sets.

### Context rules

- Agents load the relevant reference-doc file(s) and index entries for their work area —
  always.
- Agents do not auto-load full ADR bodies, superseded reasoning, or historical narration.
  The MADR word budget makes this cheap to hold to — a whole ADR is now roughly the size
  of one old record's `Options Explored` heading block.
- Decision records leave `knowledge/index.json`. Two discovery surfaces, no overlap:
  `aif index` for software docs, the `adrs` MCP server for decisions when an agent
  genuinely needs to query them.
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
| **Architect** | ADRs — rare, contested, costly-to-reverse forks (per Decisions above) — plus starting the software doc an ADR's mechanism content splits into | Yes, scoped to `docs/decisions/**` + `docs/software/**` | Yes (`adrs` CLI) | **No** | Callable as a subagent by Engineering Manager or Software Engineer; dispatches Researcher (gated) |
| **Engineering Manager** | Absorbs Tech-Lead: PRD/request → Feature Plan → Task decomposition → dispatch → orchestration | Yes (plans, orchestration state) | Yes (`ai-git`, dag tools) | **No** | Dispatches Software Engineer, Architect (on a spotted ADR-worthy fork), Researcher |
| **Software Engineer** | Absorbs Test-Engineer + Engineering-Tech-Writer + AI-Engineer + Task-level design (part of former Tech-Lead). Owns product code and AI-component work (agents/skills/steering/servers/bundles) alike, loading whichever skill set a Task calls for. | Yes | Yes | **No** | Gated `subagent` → Researcher (excluded from `approved_tools`, human confirms each dispatch) |
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for Architect, Engineering Manager or Software Engineer. Scoped for ADR-grade depth, not only light briefs — see below | Yes, scoped to a notes/scratch path (`.md` only) | **No** | Yes | No |
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

### Why Architect trades web for shell

Adopting `adrs` makes ADR authoring a CLI activity: `adrs new` scaffolds the record and
`adrs link` writes typed links plus their reverse edges — and letting `adrs link` own
that field is the primary mitigation for its known hyphenated-`kind` bug. An Architect
with no shell can use none of it, which would leave the one agent that authors ADRs
unable to run the tool adopted for exactly that job.

Keeping web alongside a new shell grant would rebuild the trifecta this roster exists to
break. So Architect gives up web entirely and routes research through Engineering
Researcher, exactly as Software Engineer does. Web stays isolated in the one agent that
holds nothing else, and Architect ends up with the same write+shell profile as the other
two privileged agents — one profile to reason about instead of three.

**Consequence: Engineering Researcher must be scoped for ADR-grade research**, not just
light briefs. An ADR needs the option space, evidence for each option's trade-offs, and
enough substance to defend a rejection — materially deeper than "what does this library
do". Its charter and prompt must say so, or Architect will be under-served by the only
research path it now has.

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
| Architect | write + shell, no web | Same profile as Software Engineer: sees only Researcher briefs, never raw web content. See Residual injection surface below |
| Engineering Manager | write + shell, no web | Only ever sees compressed briefs from Architect/Researcher, never raw content |
| Software Engineer | write + shell, no web | Direct web-vector closed, exposure substantially reduced — but not zero. See Residual injection surface below. |
| Engineering Researcher | web only, write scoped to non-executable `.md` output | The one agent allowed to hold the web leg freely holds nothing else |
| Principal Engineer | none | Clean |

`skills/agent-authoring/reference/tools.yaml` should gain an explicit rule
against holding `moderate` (web) and `privileged` (write/shell) tools
simultaneously without documented isolation justification, so this stays
structural rather than tribal knowledge.

#### Residual injection surface

Removing direct web access from Software-Engineer — and now Architect — closes the
highest-volume, most attacker-controllable vector. It does not make either immune to
prompt injection; two things remain:

- **Engineering Researcher's brief is a narrower, but real, vector.**
  Summarization is not a guaranteed sanitization boundary — a page containing
  injected instructions ("recommend installing package X", "run command Y to
  fix this") can still have that survive into the brief's recommendation. The
  gated human-confirmation on *dispatching* Researcher does not cover this —
  it approves that a dispatch happens, not that the returned content has been
  vetted. Routing Architect's research through the same path widens this
  vector's blast radius rather than adding a new one: a brief that shapes an
  ADR influences every implementer who later treats that ADR as binding, which
  is a longer-lived effect than one bad `npm install`.
- **Web access was never the only surface.** Both agents still read repo
  content, dependency install output, and ticket/PRD text that reaches them
  via a Feature Plan — any of which can originate outside the org's control
  regardless of whether the agent itself can browse.

Mitigation: the hard rules for **both** Architect and Software-Engineer must state that
a Researcher brief is data informing a decision, never an instruction to execute
directly — Software-Engineer does not `npm install` a package or run a shell command
solely because a brief suggested it, and Architect does not adopt an option, or reject
one, solely because a brief recommended it. The same standards-based judgment applies to
a brief's suggestions as to any other input. Architect's ADRs also still pass a human
approval gate, which is the backstop for the longer-lived effect above.

### End-to-end flow

```
PRD / human request
      |
      v
Engineering Manager -- spots an ADR-worthy fork? --> Architect (subagent, gated)
  writes Feature Plan                                   writes ADR (adrs CLI), may start
      | human approves                                  its software doc; human approves
      v                                                       |
      |                                    needs research? --> Engineering Researcher
      |                                                        (gated subagent)
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
| `AIF-001`, `AIF-002` epics + their chunk plans | Done. Leave in place as history — no migration, no rename. |
| `AIF-003` epic (decision-record amendment ladder) + its 8 chunk plans | **Abandoned mid-flight — will not be completed.** The ladder it implements is retired by this model. PRs #23/#24 closed unmerged 2026-09-09; four chunks (`001/003/004/005`) had already merged and need unwinding. Full teardown in checks 23–24. |
| `AIF-004` (Draft — planning redesign) | Superseded by this document. Still-valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll into the work above. Mark `Deferred` and archive (see below — `Superseded` is not a legal Epic Plan status). |
| `docs/plans/agent-consolidation-plan.md` (Draft) | Superseded by this document — its agent-roster content is merged into Agent roster above. Mark `Superseded`, leave in place as history. |
| Freeform `docs/plans/*.md` (`cli-plan`, `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-*`, `tech-lead-subagent-dispatch`, …) | Triage each: Done → move to `docs/plans/completed/`; real upcoming work → becomes a Feature; process/tooling change → fold into the skill/steering edit and delete; stale → delete. No new freeform plans after this. |
| `ai-engineering-plan` skill / "Tier 3 plan" concept | Retired. Small work (product or AI-component) runs under `complexity-tiers` (1/2); larger becomes a Feature. |
| `agents/tech-lead.yaml`, `test-engineer.yaml`, `engineering-tech-writer.yaml`, `ai-engineer.yaml` | Retired — charters absorbed into `engineering-manager.yaml` / `software-engineer.yaml` per Agent roster above. |
| `agents/architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`, `principal-engineer.yaml` | Modified per Agent roster above (tool grants, scope). |
| `agents/engineering-researcher.yaml` | New. |
| 15 decision records | Converted to MADR or rehomed per **Decision-record disposition** below. |

Archived records and plans move to an `archive/` subfolder with status noted — not
deleted. Git plus a browsable trail is the audit record.

**Retiring a plan uses `Deferred`.** Epic and Chunk Plans allow only
`Draft`/`Approved`/`Done`/`Deferred` — `Superseded` is a Decision-Record-only value —
so every plan retired here (`AIF-003`, `AIF-004`) moves to `Deferred` plus `archive/`.
Do not add an `Abandoned` status: this model is shrinking the status surface, the
`archive/` location already carries the finality, and the status only has to stop
reading as live to a gate. Freeform `docs/plans/*.md` files are not governed by that
vocabulary and can say whatever is clearest in their header.

### Decision-record disposition

All seven ARCH records were read in full: every one is a genuine ADR with real options,
real trade-offs, and rationale that isn't a restatement of the choice. None are
mislabeled. What they *do* carry is a `Design` section that fails the litmus test above
— which is what splits, not the record itself.

| Record | Genuine ADR? | Disposition |
|---|---|---|
| `ARCH-001` Install CLI redesign | Yes — 3 options | ADR core → MADR. `Design` (bundle schema, manifest format, Kiro adapter table) → `docs/software/install-cli.md`. |
| `ARCH-002` Steering schema & harness scoping | Yes — 3 options | ADR core → MADR. `Design` (frontmatter schema, adapter translation table) **and** `Known Limitations` (the Kiro `fileMatch` bug) → `docs/software/steering-schema.md` — a live upstream bug is exactly the content that must stay editable. |
| `ARCH-003` Shared resource lifecycle | Yes — 3 options | ADR core → MADR. `Design` (manifest schema, ownership lifecycle, 12-row component table) → `docs/software/install-manifest.md`. |
| `ARCH-004` Standards sync mechanism | Yes — still `Draft` | Decide or drop it before converting. Its own text defers the byte-level schema to implementation — that content belongs in `docs/software/standards-sync.md`, not a frozen ADR. |
| `ARCH-005` DAG tool as MCP server | Yes — minimal `Design` | Convert whole to MADR; nothing to split. Retrospective by design — its entire value is preserved reasoning, so do **not** fold-and-archive it. |
| `ARCH-006` `ai-git` tool boundary | Yes — a decision *not* to build | Convert whole to MADR. **Nothing to fold into a software doc** — the record contains no "how it works" content at all. |
| `ARCH-007` Epic/Chunk → YouTrack | Yes — 4 options | ADR core → MADR. `Design` (YouTrack field schema, workflow rules, permission scheme) → `docs/plans/youtrack-integration-plan.md`, which now owns that layer. |
| `PROC-001` AI-Engineer/SE boundary | No — ownership | → `steering/` as an artifact-type (code vs. declarative) classification rule; no longer an agent boundary now that one agent applies it. |
| `PROC-002`, `PROC-006` AI-track dispatch / decomposition | No — ownership | Moot. The AI-track distinction retires with the AI-Engineer/Software-Engineer merge. |
| `PROC-003` Parallel chunk isolation (worktrees) | Partly — a real trade-off | Keep the worktrees-vs-alternatives trade-off as a short MADR ADR; operational detail → orchestration skill text. |
| `PROC-004` Standards sync ownership | No — ownership | → `steering/`, alongside `PROC-001`. |
| `PROC-005` Git workflow mode | No — convention | → `steering/`. |
| `PLAN-001` Epic/chunk colocation | No — convention | Already deleted from disk; only the stale committed index still references it. Nothing to do beyond retiring that index (check 19). |
| `META-001`, `META-002` Tiering + amendment ladder | No — meta-process | Retired wholesale, nothing survives into a skill. Both exist to manage decision-record bloat that MADR + `adrs` prevent structurally. |

Corrects the earlier disposition, which folded `ARCH-001/005/006` into software docs
and archived them: that discards the decision rationale in all three, and `ARCH-006` has
no mechanism content to fold in the first place.

### New ADRs to write

Load-bearing choices the current stack makes but records nowhere. Write these as MADR
records during the conversion, not after.

| ADR | Evidence it's undocumented |
|---|---|
| Plain JavaScript + JSDoc, no TypeScript | No `tsconfig*.json` anywhere, despite `lib/` and `servers/` leaning on JSDoc typedefs plus runtime `zod` validation. The "why not TS" question is answered nowhere. |
| `node:test` over Jest/Vitest/Mocha | None of the three appear in `package-lock.json`, despite a unit/integration/validation suite. Worth recording *because* it's the less common choice. |
| MCP server credential handling | `servers/gmail` uses an OAuth flow (`auth.js`, `scripts/authorize.js`); `servers/youtrack` uses a static token in YAML. Two patterns, no unifying record — though `ARCH-006` already established that this repo treats credential-boundary questions as ADR-worthy. Strongest of the three. |

Two related items that are *not* missing ADRs:

- **ESM-only** (`"type": "module"`) — real but low-stakes; a line in the architecture
  doc, not a record.
- **No CI at all** (`.github/` does not exist) — an undecided question, not an
  undocumented decision. `adrs lint`, the hyphen guard, and the relative-link staleness
  check all assume a CI to run in, so that decision has to be made *as part of* this
  work rather than documented after it.

---

## Implementation checks

| # | Check |
|---|---|
| 1 | `docs/software/` exists with an index and a one-page file template carrying the conventions in Writing docs agents can consume: minimal frontmatter (`status`, `tags`, `last_verified`), a one-sentence blockquote summary after the H1, and a Key Files section of relative links. `docs/product/` is **not** created — reserved slot, no content and no owner yet. |
| 2 | `aif index` emits a nav index for software docs, scoped like `knowledge/index.json`, with the entry shape above. Decisions are explicitly out of its scope — `adrs` owns them. |
| 3 | `epic-planning` + `chunk-planning` merge into `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 4 | `chunk-orchestration`: `chunks.json` → `tasks.json`; per-Task plan gate replaced by `complexity-tiers`; software-track/AI-track branching removed (Steps 2–3) — one pipeline shape (implement+self-test+docs → Principal-Engineer review) for every Task. |
| 5 | DAG server + `lib` renamed chunk→task; wave output is identical for an equivalent graph. |
| 6 | `decision-triage`, `decision-brief`, `decision-record`, `chunk-planning`, `ai-engineering-plan` skills deleted and all references removed — `decision-record` included, since `adrs` + the MADR template replace it rather than shrink it. |
| 7 | `plan-lifecycle` and `complexity-tiers` trimmed; `complexity-tiers` re-pointed as Software-Engineer's primary gate. Tier 3's process changes from "produce a written plan, implement it" to "stop, do not plan or implement, hand off" — orchestrated → Engineering Manager, standalone → the human (see Agent roster, Resolved design questions). `plan this` documented as a Tier 2 floor, not an automatic Tier 3 jump — no fourth tier added. |
| 8 | `steering/engineering/core.md` Rules 1/2/8/9 reworded: Rule 1 replaced by the `complexity-tiers` gate, Rule 2 gets a fallback for Tier 1/2 work with no plan artifact, "Chunk Plan"/"Epic Plan" wording → Feature Plan; `knowledge-consumption.md` drops decision-record loading; doc-update acceptance gate added. |
| 8b | **Full vocabulary + reference sweep**, not just the planning skills. Chunk/epic wording also lives in `skills/code-review/` (SKILL + template), `skills/test-execution/` (SKILL + template), `skills/worktree-management/SKILL.md`, `skills/complexity-tiers/SKILL.md`, `skills/plan-lifecycle/reference/commit-gate-procedure.md`, `standards/csharp_base.md`, `standards/javascript_base.md`, and `steering/engineering/git-workflow-projects.md`. References to the deleted decision skills also live in `skills/agent-authoring/reference/schema.md`, `skills/knowledge-authoring/SKILL.md`, `projects/_template/project-standards.md`, `standards/javascript_node.md`, and — as JSDoc example values — `lib/resolver.js`. |
| 8c | `skill/knowledge-authoring` reconciled with the Document types table: `decision` and `architecture` drop out of its `type` list (they are ADRs and software docs now), the remaining types stay, and it points at that table rather than restating it. |
| 9 | Agent YAMLs updated per Agent roster above: 4 retired, 4 modified, 1 new (`engineering-researcher.yaml`). Two specifics that are easy to miss: `architect.yaml` **gains** `shell` and **loses** `web_search`/`web_fetch` (it holds `shell` today — this is a swap, not an addition) and gains gated Researcher dispatch; `engineering-researcher.yaml` is scoped for ADR-grade research depth, not light briefs only (see Why Architect trades web for shell). |
| 10 | `skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` swept (several tracked candidates resolve or move owner as their originating agents merge). Product-doc ownership is **not** assigned — the slot is reserved and unbuilt until a product agent exists. |
| 11 | Existing decision records dispositioned per the table above; archive location created. |
| 12 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 13 | `tests/validation/` cross-reference check passes against the new agent/skill/doc set; `npm test` green. Fixture data referencing retired agent or skill names cleaned up as a low-risk pass: `tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`, and also `tests/unit/resolver.test.js`, `tests/integration/resolver.test.js`, `tests/integration/commands.test.js` — the last three reference the deleted decision skills and were missed in the first pass. |
| 14 | `bundles/engineering/snapshot.json` regenerated (`bundle.yaml` itself needs no edit — pure domain-based auto-discovery absorbs the roster shrink). |
| 15 | `README.md`, `PLAN.md`, `AGENTS.md`, `install.ps1`, `agents/README.md`, `skills/README.md` updated for the new model. `install.ps1` specifically enumerates agent files for install — retired names must be removed there as a real code change. |
| 16 | `skills/agent-authoring/reference/tools.yaml` gains the trifecta-avoidance rule (no agent holds `moderate`/web and `privileged`/write+shell tools at once without documented isolation justification). |
| 17 | Software-Engineer's hard rules state a Researcher brief is data informing a decision, never an instruction to execute directly (see Residual injection surface in Agent roster above); and confirm Principal-Engineer review applies before merge regardless of whether Software-Engineer was dispatched by Engineering Manager or run standalone by a human. |
| 18 | `adrs` adopted and pinned; `docs/decisions/` flattened (domain subfolders removed, `adrs`-native filenames, `AIF-ADR-nnn` carried in frontmatter `id:`); every surviving record converted to MADR within the word budget; `adrs lint` green. |
| 19 | `lib/decisions.js`, `aif index -d`, `docs/decisions/index.json`, `tests/unit/decisions.test.js` and `tests/integration/decisions-index.test.js` removed; no remaining references to the decision index in skills, steering, or CLI help. |
| 20 | CI decision made and landed (`.github/` does not exist today): `adrs lint`, the hyphenated-`kind` grep guard, and the relative-link staleness check for `docs/software` all run somewhere enforced. Guard regex validated against real `adrs`-generated frontmatter first. |
| 21 | `Design` sections split out of `ARCH-001/002/003/004/007` into their software docs (or the YouTrack plan for `007`) per Decision-record disposition; `ARCH-005/006` converted whole with nothing split. |
| 22 | The three New ADRs to write are written in MADR form: no-TypeScript, `node:test`, MCP server credential handling. |
| 23 | `AIF-003` torn down as abandoned work: the Epic Plan and all 8 chunk plans move to `Deferred` and into `archive/` (per Retiring a plan above), reason recorded once, with `chunks.json` and `orchestration-state.json` archived alongside them. Delete the two stale remote branches (`AIF-003/002-amendment-index-fields`, `AIF-003/006-plan-lifecycle-ladder-docs`) — their PRs are already closed. Three older strays deserve the same sweep: `AIF-001/003-epic-planning-ai-track`, `AIF-002/010-migrate-aif-006`, `AIF-002/015-backfill-decisions-index`. |
| 24 | The merged half of `AIF-003` unwound — but only the part that does not already die elsewhere. `AIF-003-004`'s `Amending` status is the one real revert: remove it from `plan-lifecycle/reference/status-vocabulary.md` by hand. `AIF-003-003`'s `## Amendments`/`## Errata`/`Last Amended` template sections die with the `decision-record`/`decision-brief` skills (check 6), and `AIF-003-001`'s `Supersedes` parse dies with `lib/decisions.js` (check 19) — neither needs its own revert commit. `AIF-003-005`'s steering de-enumeration is **kept**: replacing an enumerated status list with a positive check against `Approved` is correct under MADR too, and reverting it would reintroduce a hardcoded list of statuses that no longer exist. |
| 25 | `.aiconfig.json` schema updated and its consumers with it: `paths.epics` → `paths.features`, `paths.chunks` → `paths.tasks`, add `paths.software`, keep `paths.decisions` (now flat), and reserve `paths.product` in documentation without shipping a default. This is a code change as well as a doc change — `resolveKnowledgePath`/`resolveDecisionsPath` in `lib/commands/index.js` read these, and the field table in `AGENTS.md` documents them. This repo's own `.aiconfig.json` updated to match. |
| 26 | `projects/_template/` brought to the new format — the whole reason the schema above matters, and untouched by every earlier draft of this plan. Its `.aiconfig.json` paths, its `plans/{epics,chunks,orchestration}/` skeleton, its `knowledge/decisions/` directory, and `project-standards.md`'s references to the deleted decision skills all move. Every consuming project starts from this. |
| 27 | The `adrs`-distribution ADR is written and accepted (see Open: how a Rust CLI reaches a Node project). **Blocks checks 18–20** — do not begin the conversion until it lands, since a decision against adoption changes the tooling but not the MADR format. If adoption wins, the pinned binary + checksum bootstrap works on macOS/Linux/Windows and is wired into both setup and CI. |

---

## Sequencing

1. Tear down `AIF-003` (check 23) — archive the epic and its chunks, delete the
   stale branches. Independent of everything else and cheap, and it removes the
   largest current source of confusion about what is still live. Its PRs are
   already closed, so nothing here waits on anyone.
2. Settle the `adrs`-distribution ADR (check 27). Early, and deliberately ahead of
   any conversion work: it is cheap to answer now and expensive to discover late,
   and a decision against adoption changes what step 5 builds without touching
   the MADR format everything else assumes.
3. Land the software-doc structure + `aif index` extension + doc conventions
   (checks 1–2).
4. Agent roster changes first (check 9) — everything else in this step derives
   from it. Then vocabulary + skill + agent sweep in one pass — feature/task
   rename, skill deletions, `complexity-tiers` re-pointed to Software-Engineer,
   steering rewrites (checks 3–8c, 10, 13–17) — plus the config fallout that
   rides with the rename: `.aiconfig.json` schema and its resolvers, then
   `projects/_template/` (checks 25–26).
5. Decisions conversion: adopt `adrs` per step 2, flatten `docs/decisions/`,
   convert the survivors to MADR, split `Design` sections into their software
   docs, rehome the ownership/convention records, retire the in-house indexer,
   and write the three missing ADRs (checks 11, 18–19, 21–22). Depends on
   step 3 — the software docs must exist before `Design` content can move in.
6. Unwind what is left of the merged `AIF-003` half (check 24) — small by this
   point, since steps 4 and 5 already delete most of it. Verify nothing survived,
   and hand-revert the `Amending` status.
7. Land the CI decision and its guards (check 20), once there is a valid,
   converted decision log for `adrs lint` to run against.
8. Triage the remaining freeform plans (check 12).

This is the full sequencing for this document's scope. YouTrack integration is
a separate, follow-on layer on top of this model — see
`docs/plans/youtrack-integration-plan.md` — sequenced independently once the
above lands; nothing in this document depends on it.
