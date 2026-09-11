# Process Model — Efficiency Rework

> Status: Draft
> Created: 2026-09-03
> Approved by: Pending

Target-state description of a lighter process, plus the transition plan to reach it.
Replaces the Epic→Chunk model, the 8-agent role-pipeline (architect / tech-lead /
engineering-manager / software-engineer / ai-engineer / test-engineer /
principal-engineer / engineering-tech-writer), and the tiered Decision-Record system —
the last of these swapped for standard MADR records, written by hand for now, with
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
lands. Collapsing them into one artifact type is what produced the current 16-record
decision log, of which 8 are not decisions at all.

| Type | Answers | Mutability | Home | Owner |
|---|---|---|---|---|
| **ADR** | Why this path won over another | Immutable once accepted — superseded, never edited | `docs/decisions/` | Architect |
| **Architecture doc** | How the system and its subsystems currently work | Living — updated as the system changes | `docs/architecture/*`, as arc42 sections | Architect may start a section alongside an ADR; Software-Engineer maintains it at implementation time |
| **Product doc** *(reserved — not built yet)* | What a product area does, and for whom | Living | `docs/product/*` | A future product agent |
| **Process & ownership** | How we work / who is accountable | Living — edited in place | `steering/`, `standards/`, agent charters, the Agent roster above | Engineering Manager |

**Structured as arc42 + C4** — see arc42 structure below. That settles the naming too:
`architecture` reads confusingly close to "architecture decision record", but it is what
the entire arc42/C4 ecosystem calls this, and every arc42 user already lives with the
adjacency. A private dialect would cost more than the collision does, especially for
agents, which have seen far more arc42 than any invented alternative.

**Product docs are a reserved slot, not current work.** Nothing here needs a PRD today,
and standing up a directory with no content and no owner is how unused ceremony starts.
The slot is named now because a product agent is a foreseeable addition and design work
is where PRDs start paying for themselves — build it when that agent lands, not before.

- One file per arc42 section, one per building block. The file boundary replaces the
  earlier page limit — less arbitrary, and it is what arc42's own numbering already implies.
- Updating the affected doc is an acceptance criterion of any Feature that changes
  behavior, checked in review alongside tests.
- Bodies stay in git. `aif index` covers architecture sections and decisions alike
  (see ADR discovery below, and Writing docs agents can consume).
- **PRDs are an input, not a fifth type.** A PRD states goal, users, success criteria
  and out-of-scope — what and why, never how. For every Feature today, the Feature Plan's
  own goal/acceptance-criteria section *is* the PRD. When the product agent arrives and
  PRDs start outliving the Feature that introduced them, they go in the reserved slot.
- **Ownership (RACI) questions are not decisions.** "Who owns X" is answered by the
  Agent roster table and the agent charters it drives — never by a record in
  `docs/decisions/`. Three current records (`PROC-001/004/006`) exist only because
  there was no other home for that question.

#### Subject matter is not a document kind

`skill/knowledge-authoring`'s `type` list (`decision`, `reference`, `architecture`,
`api`, `business-rule`) mixes two axes: the first three are document *kinds*, the last
two are *subjects*. The four kinds above are purely a kind axis, split by mutability —
which is exactly why `api` and `business-rule` never slot into it. They become **tags**;
their content lands in whichever kind fits.

API content splits four ways:

| The thing | Home |
|---|---|
| The authoritative spec (OpenAPI, JSON Schema, zod, `.d.ts`) | Code, not docs — a `key_files` entry, never restated in prose, because a prose copy drifts the day it is written |
| The system's external interfaces — what it exposes, to whom, over what | arc42 §3 Technical Context |
| A building block's interface to its neighbours | That block's §5 file (arc42's white-box template has an Interfaces subsection) |
| Stability / versioning policy | Prescriptive → `standards/`, not knowledge |

Business rules split three ways by the rule's *nature*: a requirement ("the product must
behave this way") is product content and belongs in the reserved `docs/product/` slot;
how the domain is modelled in code is arc42 §8 Cross-cutting Concepts, or the §5 block
that owns it; an externally imposed rule (regulatory, contractual) is arc42 §2
Constraints, because §2 is precisely what you do not get to choose.

**`skill/knowledge-authoring` retires** (check 6). Once `decision` and `architecture`
move out and `api`/`business-rule` become tags, one type is left: reference material
about systems *outside* this one — a third-party format's quirks, an upstream tool's
behaviour. That genuinely has no arc42 home, since arc42 documents your system rather
than your dependencies, but it is not a procedure either. The routing above is always-on
and belongs in `steering/`; the file shape is a template. It is also the only
`*-authoring` skill with no `reference/` schema — that family exists for artifacts with
something to validate against, and prose with four frontmatter fields has none — and no
agent or bundle declares it today, so it is already dead wiring. External reference stays
as plain files under `paths.knowledge`, indexed like everything else.

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, MADR format (below) |
| How the system / product works | The relevant `docs/architecture` section (or `docs/product`, once that slot is built) |
| Process / tooling / convention / ownership change | No record — edit the skill/steering/agent file; the commit + CHANGELOG line is the record |

- ADR scoped to one Feature is archived with it; foundational or cross-cutting ADRs are
  cross-linked from arc42 §9 so they outlive any one Feature.
- `complexity-tiers` and `plan-lifecycle` stay (trimmed). `decision-record` is not
  trimmed but **replaced outright** by the MADR format below;
  `decision-triage`'s tier/domain classification goes away with it. With one record
  type left there is no domain-ownership table to route through — any agent spotting a
  genuine fork dispatches Architect directly (see Agent roster).

### ADR format — MADR

Standard MADR, replacing the in-house options-exploration template. An ADR records
*that* a decision was made and *why* — not the research trail behind it.

Frontmatter: `status` (`proposed`/`accepted`/`rejected`/`deprecated`/`superseded`),
`date`, `decision-makers`, `tags`, plus optional `consulted`/`informed` (both per MADR).
Two structured fields beyond vanilla MADR: `links.supersedes` (array of IDs — the
reverse edge, `superseded_by`, is computed by the indexer below, never stored) and
`affects` (file globs/paths the decision binds, for "what ADRs touch this file"
lookup). `links.related`/`links.amends` are reserved, not yet populated — see
`docs/plans/adr-kit-plan.md`'s Phase 3 — the `links:` key exists now so adding them
later isn't a frontmatter migration. Sections: Context and Problem Statement →
Decision Drivers → Considered Options → Decision Outcome (+ Consequences) → optional
Pros and Cons of the Options → optional More Information.

**Budget: 150–350 words excluding frontmatter.** Nothing enforces this mechanically —
the caps live in the record template and are checked at Principal-Engineer review, which
is the trade-off accepted by writing ADRs by hand (see ADR tooling below).

| Section | Cap |
|---|---|
| Context and Problem Statement | 2–4 sentences |
| Decision Drivers | 3–6 bullets, fragments not sentences |
| Considered Options | one line each, 2–4 options |
| Decision Outcome | 2–4 sentences tied back to the drivers |
| Consequences | 3–5 one-line bullets |
| Pros and Cons of the Options | optional; 2–3 bullets per option, only where a rejection isn't obvious from its one-liner |

Does **not** belong in an ADR — goes to the relevant arc42 section, or to the Feature/ticket:
schemas, config field tables, algorithms, code blocks beyond a 3-line illustration,
migration and rollout steps, "what the implementer must know when decomposing this",
and open questions about how the system will work.

**Litmus test:** does this sentence explain *how the system works*, or *why this path
won over another*? Only the second belongs in the ADR. Every current ARCH record fails
this test in its `Design` section — see Decision-record disposition.

An accepted ADR is never edited; a reversal is a new ADR with `links.supersedes` set.
That single property retires the `Amending` status and the Errata/Amendments ladder
wholesale — they exist only to make editing an approved record safe, which MADR
removes the need for.

### ADR tooling — not needed for the proof of concept

Architect writes MADR files by hand with plain `write`. No CLI, no MCP server, no
adopted binary. The format above is the whole specification; the conventions are
enforced by the template and by Principal-Engineer review, not by a linter.

This manual-authoring phase **is** Phase 0.5 of `docs/plans/adr-kit-plan.md`'s phased
build-out, and it is itself the proof of concept: it validates that the format works
by using it, before any tooling gets built around it. Tooling isn't required to prove
the format out, so none is built yet.

`docs/plans/adr-kit-plan.md` already scopes what tooling would look like if and when
it's built — an in-repo JS CLI + MCP server, in phases — over a pinned Rust `adrs`
binary, since `adrs` has no npm-friendly distribution path (Cargo/Homebrew, not
Windows) and `ARCH-001` chose Node precisely for portable, minimal-dependency tooling.
That reasoning is settled. What's still open, and revisited with Architect once Phase
0.5 has enough real volume to judge by, is whether adr-kit is actually needed at all
and how much of its scoped phases (1 through 3) are worth building — a scope-and-need
question, not an implementation-approach one.

What staying manual costs, stated plainly so that future revisit can weigh it: no
scaffolding, no automatic reverse edge on `links.supersedes`, and no structural lint. The
first two are cheap at this volume — a template covers scaffolding, and the reverse edge
is *computed*, not authored, by the index (below). Structural lint is the real loss, and
it is what Principal-Engineer review has to cover in the meantime.

### ADR discovery — keep the existing indexer, retargeted

Without a CLI there is no `adrs` MCP server to query, so discovery stays with `aif`.
`lib/decisions.js` already does this job: parse each record, build an index, and invert
`Supersedes` into `superseded_by` across the set. Retarget its parser from the
`## Metadata` markdown table to MADR's YAML frontmatter — reading `links.supersedes`
instead of the old `Supersedes` table row — and it serves the new format unchanged in
shape. `affects`-based reverse file-lookup is out of scope for this retargeted
indexer; that arrives with adr-kit tooling, not before.

That is meaningfully less work than deleting it and rebuilding, and it means the one
capability lost with typed links — the reverse edge — is not lost at all, because the
index computes it rather than storing it twice.

The committed `docs/decisions/index.json` is stale on `main` today
(`aif index -d --check` → `✗ stale: Removed: AIF-PLAN-001`) because nothing enforces
regeneration. That is a CI gap, not a reason to retire the indexer — see check 20.

Flat directory, single counter: `docs/decisions/` — no subfolders at all, not even by
type. IDs drop the `AIF-ADR-` project prefix and use MADR's own convention: the
filename's bare zero-padded number (`0007-use-postgresql.md`), one flat counter across
the whole directory. This matches adr-kit's ID scheme exactly (see
`docs/plans/adr-kit-plan.md`), so adopting adr-kit later needs no ID migration.
Frontmatter `tags` carry all categorization (e.g. `architecture`, `process`,
`meta-process`) that the old domain subfolders used to encode structurally.

### Architecture docs — arc42 + C4

One system, one repo, one arc42 — so `docs/architecture/` is a flat directory of
numbered section files, no subfolders. arc42 already numbers its own sub-levels, so
building blocks are flat siblings rather than a nested tree.

```
docs/architecture/
├── 01_introduction_and_goals.md
├── 02_constraints.md              ← OS-agnostic, Node-only, no network
├── 03_context.md                  ← C4 L1, inline Mermaid
├── 04_solution_strategy.md
├── 05_building_blocks.md          ← C4 L2/L3 + index of the blocks below
├── 05_01_bundle_resolution.md     ← white-box expansions, flat siblings
├── 05_02_harness_adapters.md
├── 06_runtime.md
├── 07_deployment.md               ← install/uninstall into harness directories
├── 09_decisions.md                ← pointer to docs/decisions/, never content
└── 10_quality_requirements.md
```

Why this rather than free-form subsystem docs:

- **It closes the system-level gap.** Context boundary, constraints and quality goals
  are not subsystem-scoped and previously had nowhere to live. §1/§2/§3/§10 are exactly
  that content, and it is what a newcomer — human or agent — needs first.
- **§5 is recursive**, so per-subsystem docs are not in tension with arc42; they *are*
  its white-box expansions, with a system-level frame around them.
- **Section numbers are addressable.** "Read §3 and §6 for the subsystem you are
  touching" is a reliable instruction in a way that free-form filenames are not, and
  agents have seen far more arc42 than any invented structure.
- **C4 supplies the diagrams arc42 deliberately does not specify** — L1 in §3, L2/L3 in
  §5, written as inline Mermaid so they stay diffable text an agent can actually read
  rather than a picture it can only note the existence of.

Two rules that keep it from becoming the ceremony this model exists to remove:

- **Create sections lazily.** A section file exists only when it has real content. No
  twelve empty stubs on day one — an agent that opens a "TBD" file has spent tokens to
  learn nothing, and empty scaffolding is how a 12-section template decays.
- **§9 holds pointers, never decision content.** arc42's own guidance is to keep
  decisions as separate records and use §9 to list and cross-link them. Inlining them
  would put immutable records inside a living document, which destroys the one property
  that makes an ADR worth keeping.

Sections likely to stay absent here: §11 Risks (until there are any) and §12 Glossary.

### Writing docs agents can consume

Applies to arc42 sections, and to product docs when that slot is built — ADRs get their
shape from MADR above.

**Frontmatter carries structured values only; prose lives in the body.**

```yaml
---
section: "05.01"
title: "Bundle resolution"
lifecycle: published             # draft | published — staleness is not a value here, see below
last_verified: 8f3c2a1           # commit SHA, not a date — see staleness below
tags: [install, bundles]
key_files:
  - lib/resolver.js
  - lib/commands/install.js
---
```

- `section` makes the arc42 role machine-readable, so routing ("I need runtime
  behaviour") does not depend on parsing filenames.
- **Named `lifecycle`, not `status`** — MADR's ADR frontmatter also has a `status`
  field (`proposed`/`accepted`/.../`superseded`), a different vocabulary for a
  different purpose; reusing the name was the earlier-flagged ambiguity, so this field
  gets its own name. `lifecycle: draft | published` is the *only* value an author
  writes — whether the doc is still being written. That's a completion axis, not a
  currency one, so "current"/"stale" don't belong in it as values at all — a doc's
  currency is never authored, only computed (see the staleness check below), and
  never stored back into this field or any other frontmatter key. `aif index` reports
  a separate, purely computed `stale: true/false` per doc; nothing in the doc's own
  frontmatter ever claims to be current, because that claim would go stale the moment
  it was written and nothing would catch it.
- `key_files` belongs in frontmatter rather than a body section, because it is a list of
  paths — structured data, not prose. This is file-level binding: the affordable version
  of symbol-level binding. A code graph is explicitly *not* adopted; it gives structure,
  never intent, and the tools binding decisions to symbols are still too early.
  **Scope**: list a file only if a change to *that file's logic* would make this doc's
  claims wrong — that's the actual thing the staleness check below is testing.
  Excludes callers/consumers of the described behavior (only what implements it
  belongs), test files (they validate behavior, they don't define it — including them
  produces false-positive staleness on every refactor), and incidentally-touched
  config/types the section isn't actually about. If a section's `key_files` grows past
  roughly 5–8 entries, that's a signal to split it into a finer subsection (`05.01`,
  `05.02`, ...) rather than let the list keep growing — a short, tight list is what
  keeps a rename or deletion a rare, meaningful CI failure instead of routine noise.
- **The one-line summary stays a body convention** — a single blockquote sentence
  immediately after the H1, extracted by the same parse-title-then-fields approach
  `lib/decisions.js` already uses. A summary field in frontmatter would duplicate the
  doc's own opening line and drift from it.

**Two computed affordances matter more than any field:**

1. **Reverse index.** The question an implementation agent actually has is not "what
   docs exist" but "I am about to edit `lib/resolver.js` — what describes it?" That is
   `key_files` inverted: `aif index` builds `source path → [docs]` across the set, using
   the same inversion `lib/decisions.js` already performs for
   `supersedes → superseded_by`. Nearly free, and the highest-value navigation
   affordance available here.
2. **Real staleness detection.** With `last_verified` as a commit SHA, staleness is
   mechanical: *has any file in `key_files` changed since that commit?* A resolving link
   only proves a file exists, not that the doc still describes it. This turns doc drift
   into a CI failure instead of a hope — and it's the sole source of the computed
   `stale` flag; no frontmatter field ever holds it.

**`aif index` entry shape**: `path`, `section`, `title`, `summary`, `lifecycle`, `tags`,
`key_files`, `last_verified`, plus the computed reverse index and the computed `stale`
flag — enough for an agent to skim the whole set and open only what is relevant. Same pure-parse → build → diff
pipeline as today's decision indexer; generalize `entriesEqual`'s hardcoded array-field
list to "sort any array-valued field" so one module serves both doc sets.


### Context rules

- Agents load the relevant reference-doc file(s) and index entries for their work area —
  always.
- Agents do not auto-load full ADR bodies, superseded reasoning, or historical narration.
  The MADR word budget makes this cheap to hold to — a whole ADR is now roughly the size
  of one old record's `Options Explored` heading block.
- Decision records leave `knowledge/index.json`. One discovery surface: `aif index`,
  covering architecture sections and decisions through the same retargeted indexer.
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
| **Architect** | ADRs — rare, contested, costly-to-reverse forks (per Decisions above) — plus starting the arc42 section an ADR's mechanism content splits into | Yes, scoped to `docs/decisions/**` + `docs/architecture/**` | **No** | **No** | Callable as a subagent by Engineering Manager or Software Engineer; dispatches Researcher (gated) |
| **Engineering Manager** | Absorbs Tech-Lead: PRD/request → Feature Plan → Task decomposition → dispatch → orchestration | Yes (plans, orchestration state) | Yes (`ai-git`, dag tools) | **No** | Dispatches Software Engineer, Architect (on a spotted ADR-worthy fork), Researcher |
| **Software Engineer** | Absorbs Test-Engineer + Engineering-Tech-Writer + AI-Engineer + Task-level design (part of former Tech-Lead). Owns product code and AI-component work (agents/skills/steering/servers/bundles) alike, loading whichever skill set a Task calls for. | Yes | Yes | **No** | Gated `subagent` → Researcher (excluded from `approved_tools`, human confirms each dispatch) |
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for Architect, Engineering Manager or Software Engineer. Scoped for ADR-grade depth, not only light briefs — see below | Yes, scoped to a notes/scratch path (`.md` only) — `{paths.research}`, default `knowledge/research/`, a new `.aiconfig.json` field (check 25) | **No** | Yes | No |
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

### Why Architect holds neither shell nor web

Writing an ADR by hand needs `write` and nothing else. Adopting a CLI would have forced
`shell`, and `shell` alongside `write` and `web` is the trifecta this roster exists to
break — one more reason the tooling question is worth deferring rather than answering
under pressure. Staying manual removes the question entirely.

Architect also gives up web and routes research through Engineering Researcher, so web
stays isolated in the one agent that holds nothing else. With no shell that is not
forced — write + web would be two legs, not three — but it remains the better default:
research shaping a binding ADR benefits from passing through an agent that cannot write
to the repo at all, and it keeps one web-holder instead of two. Revisit only if the
Researcher hop proves to cost more than it saves.

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
| Architect | write only | The tightest posture in the roster — no shell, no web, no tooling beyond writing markdown. Sees only Researcher briefs, never raw web content. See Residual injection surface below |
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
  writes Feature Plan                                   writes ADR by hand, may start
      | human approves                                  its arc42 section; human approves
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

**Who commits an Architect-authored ADR to git, given Architect now holds
neither `shell` nor `write`-adjacent git access?**
Architect never commits its own output. Every git/GitHub operation in this
repo goes through `ai-git`, invoked via the generic `shell` tool — the one
tool Architect gives up entirely (Why Architect holds neither shell nor web,
above). Architect's `write` scoped to `docs/decisions/**` +
`docs/architecture/**` is sufficient to produce the MADR file and any arc42
section it starts; the agent that dispatched Architect (Engineering Manager or
Software Engineer) commits it through the `shell`/`ai-git` access it already
holds for its own plans — exactly as Engineering Manager already commits
Feature Plans today. This is a process step, not a new tool grant: it keeps
Architect's "write only" posture (Security posture, above) exactly as clean as
stated. The dispatching agent's prompt must say this explicitly (check 9) so
it isn't silently assumed.

**What survives when `decision-triage` is retired, given the Tier 3 hand-off
above reuses its hand-off-signal shape?**
Only the *structural pattern* — branch behavior on whether an orchestrator is
present, and stop-and-report vs. hand-to-orchestrator — not the file's
content. `skills/decision-triage/reference/handoff-signal.md` is built around
the Tier A/B/C and Domain-owner vocabulary this document retires; it is
deleted along with the rest of `decision-triage` (check 6). Software-
Engineer's Tier 3 hand-off (above) re-implements the same two-branch shape
natively in its own prompt/skill — it does not reference or depend on the
retired file surviving.

---

## Existing artifacts

| Artifact | Disposition |
|---|---|
| `AIF-001`, `AIF-002` epics + their chunk plans | Done. Leave in place as history — no migration, no rename. |
| `AIF-003` epic (decision-record amendment ladder) + its 8 chunk plans | **Abandoned mid-flight — will not be completed.** The ladder it implements is retired by this model. PRs #23/#24 closed unmerged 2026-09-09; four chunks (`001/003/004/005`) had already merged and need unwinding. Full teardown in checks 23–24. |
| `AIF-004` (Draft — planning redesign) | Superseded by this document. Still-valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll into the work above. Mark `Deferred` and archive (see below — `Superseded` is not a legal Epic Plan status). |
| `docs/plans/agent-consolidation-plan.md` (Draft) | Superseded by this document — its agent-roster content is merged into Agent roster above. Mark `Superseded`, leave in place as history. |
| `docs/plans/chunk-epic-planning-redesign-plan.md` (was Draft), `docs/plans/tech-lead-subagent-dispatch-plan.md` (was Deferred) | **Already deleted, not archived** — done ahead of this document's sequencing. The former was `AIF-004`'s source plan, doubly-orphaned once `AIF-004` itself became Superseded, with nothing not already absorbed here; the latter proposed an AI-track subagent dispatch mechanism moot now that the AI-track/software-track split is retired. Neither needed archiving: no content survives that isn't already captured in this document or in `AIF-001`/`AIF-002`'s frozen historical chunk plans, which still reference the deleted file by path as historical record (same as a reference to a deleted commit). |
| Freeform `docs/plans/*.md` (`cli-plan`, `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-*`, …) | Triage each: Done → move to `docs/plans/completed/`; real upcoming work → becomes a Feature; process/tooling change → fold into the skill/steering edit and delete; stale → delete. No new freeform plans after this. |
| `ai-engineering-plan` skill / "Tier 3 plan" concept | Retired. Small work (product or AI-component) runs under `complexity-tiers` (1/2); larger becomes a Feature. |
| `agents/tech-lead.yaml`, `test-engineer.yaml`, `engineering-tech-writer.yaml`, `ai-engineer.yaml` | Retired — charters absorbed into `engineering-manager.yaml` / `software-engineer.yaml` per Agent roster above. |
| `agents/architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`, `principal-engineer.yaml` | Modified per Agent roster above (tool grants, scope). |
| `agents/engineering-researcher.yaml` | New. |
| 16 decision records | Converted to MADR or rehomed per **Decision-record disposition** below. |

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
| `ARCH-001` Install CLI redesign | Yes — 3 options | ADR core → MADR. `Design` (bundle schema, manifest format, Kiro adapter table) → arc42 §5 building-block sections for install/bundle resolution. |
| `ARCH-002` Steering schema & harness scoping | Yes — 3 options | ADR core → MADR. `Design` (frontmatter schema, adapter translation table) → arc42 §5 (harness adapters); `Known Limitations` (the Kiro `fileMatch` bug) → §11 Risks — a live upstream bug is exactly the content that must stay editable, and it is what first gives §11 a reason to exist. |
| `ARCH-003` Shared resource lifecycle | Yes — 3 options | ADR core → MADR. `Design` (manifest schema, ownership lifecycle, 12-row component table) → arc42 §5 (manifest/snapshot) and §6 Runtime for the install/uninstall lifecycle. |
| `ARCH-004` Standards sync mechanism | Yes — still `Draft` | Decide or drop it before converting. Its own text defers the byte-level schema to implementation — that content belongs in an arc42 §5 section, not a frozen ADR. |
| `ARCH-005` DAG tool as MCP server | Yes — minimal `Design` | Convert whole to MADR; nothing to split. Retrospective by design — its entire value is preserved reasoning, so do **not** fold-and-archive it. |
| `ARCH-006` `ai-git` tool boundary | Yes — a decision *not* to build | Convert whole to MADR. **Nothing to fold into an arc42 section** — the record contains no "how it works" content at all. |
| `ARCH-007` Epic/Chunk → YouTrack | Yes — 4 options | ADR core → MADR. `Design` (YouTrack field schema, workflow rules, permission scheme) → `docs/plans/youtrack-integration-plan.md`, which now owns that layer. |
| `PROC-001` AI-Engineer/SE boundary | No — ownership | → `steering/` as an artifact-type (code vs. declarative) classification rule; no longer an agent boundary now that one agent applies it. |
| `PROC-002`, `PROC-006` AI-track dispatch / decomposition | No — ownership | Moot. The AI-track distinction retires with the AI-Engineer/Software-Engineer merge. |
| `PROC-003` Parallel chunk isolation (worktrees) | Partly — a real trade-off | Keep the worktrees-vs-alternatives trade-off as a short MADR ADR; operational detail → orchestration skill text. |
| `PROC-004` Standards sync ownership | No — ownership | → `steering/`, alongside `PROC-001`. |
| `PROC-005` Git workflow mode | No — convention | → `steering/`. |
| `PLAN-001` Epic/chunk colocation | No — convention | Already deleted from disk; only the stale committed index still references it. Nothing to do beyond retiring that index (check 19). |
| `META-001`, `META-002` Tiering + amendment ladder | No — meta-process | Retired wholesale, nothing survives into a skill. Both exist to manage decision-record bloat that MADR's word budget and immutability prevent structurally. |

Corrects the earlier disposition, which folded `ARCH-001/005/006` into architecture docs
and archived them: that discards the decision rationale in all three, and `ARCH-006` has
no mechanism content to fold in the first place.

### New ADRs to write

Load-bearing choices the current stack makes but records nowhere. Write these as MADR
records during the conversion, not after.

| ADR | Evidence it's undocumented |
|---|---|
| Plain JavaScript + JSDoc, no TypeScript | `tsconfig.json` exists (`allowJs`/`checkJs`, feeding `npm run typecheck` in CI) — but only to typecheck JSDoc-annotated `.js` files; there is still no `.ts` source anywhere, despite `lib/` and `servers/` leaning on JSDoc typedefs plus runtime `zod` validation. That split — typecheck JSDoc, never compile actual TypeScript — is itself the undocumented decision; the "why JSDoc over TS" question is answered nowhere. (Earlier drafts of this row cited "no `tsconfig*.json` anywhere" as the evidence — stale for the same reason as the CI note above: this document's branch predates the tooling PR that added it.) |
| `node:test` over Jest/Vitest/Mocha | None of the three appear in `package-lock.json`, despite a unit/integration/validation suite. Worth recording *because* it's the less common choice. |
| MCP server credential handling | `servers/gmail` uses an OAuth flow (`auth.js`, `scripts/authorize.js`); `servers/youtrack` uses a static token in YAML. Two patterns, no unifying record — though `ARCH-006` already established that this repo treats credential-boundary questions as ADR-worthy. Strongest of the three. |

Two related items that are *not* missing ADRs:

- **ESM-only** (`"type": "module"`) — real but low-stakes; a line in the architecture
  doc, not a record.
- **CI already exists** (`.github/workflows/ci.yml`: lint, typecheck, format check,
  validate, test on Node 22.x/26.x) — landed via a sibling PR that merged into `main`
  before this document did; this document's own branch predates it and was never
  rebased, which is why earlier drafts of this section described `.github/` as absent.
  Not an open question this work resolves — check 20 below adds the new doc/decision
  staleness guards to that existing workflow rather than building one from scratch.

---

## Implementation checks

| # | Check |
|---|---|
| 1 | `docs/architecture/` exists as a flat arc42 section directory with a section-file template carrying the conventions in Writing docs agents can consume: frontmatter (`section`, `title`, `lifecycle`, `last_verified` as a commit SHA, `tags`, `key_files`) and a one-sentence blockquote summary after the H1. Sections are created lazily — only §1/§2/§3/§5 need exist at the start, and no empty stubs are scaffolded. `docs/product/` is **not** created — reserved slot, no content and no owner yet. |
| 2 | `aif index` emits a nav index for arc42 sections with the entry shape above, **plus the computed `source path → [docs]` reverse index** from `key_files`. Decisions stay in scope too, via the retargeted indexer in check 19 — one module, two doc sets. |
| 3 | `epic-planning` + `chunk-planning` merge into `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 4 | `chunk-orchestration`: `chunks.json` → `tasks.json`; per-Task plan gate replaced by `complexity-tiers`; software-track/AI-track branching removed (Steps 2–3) — one pipeline shape (implement+self-test+docs → Principal-Engineer review) for every Task. |
| 5 | DAG server + `lib` renamed chunk→task; wave output is identical for an equivalent graph. Includes `servers/dag/logic.js`'s own doc comment (currently describes itself as processing "epic chunk dependency graphs") and the chunk/epic-worded assertions and fixture data in all three `servers/dag/tests/**` files — not identifiers alone. |
| 6 | `decision-triage`, `decision-brief`, `decision-record`, `chunk-planning`, `ai-engineering-plan`, `knowledge-authoring` skills deleted and all references removed. `decision-record` because the MADR template replaces it rather than shrinks it; `knowledge-authoring` per Subject matter is not a document kind — no agent or bundle declares it, and it is the only `*-authoring` skill whose artifact has no schema. |
| 7 | `plan-lifecycle` and `complexity-tiers` trimmed; `complexity-tiers` re-pointed as Software-Engineer's primary gate. Tier 3's process changes from "produce a written plan, implement it" to "stop, do not plan or implement, hand off" — orchestrated → Engineering Manager, standalone → the human (see Agent roster, Resolved design questions). `plan this` documented as a Tier 2 floor, not an automatic Tier 3 jump — no fourth tier added. |
| 8 | `steering/engineering/core.md` Rules 1/2/8/9 reworded: Rule 1 replaced by the `complexity-tiers` gate, Rule 2 gets a fallback for Tier 1/2 work with no plan artifact, "Chunk Plan"/"Epic Plan" wording → Feature Plan; `knowledge-consumption.md` changes from full-body decision-record auto-load to **index-only by default, full body loaded on demand once an entry looks relevant** — matching Context rules' "Agents do not auto-load full ADR bodies" — not a removal of decision-record handling; doc-update acceptance gate added. |
| 8b | **Full vocabulary + reference sweep**, not just the planning skills. Chunk/epic wording also lives in `skills/code-review/` (SKILL + template), `skills/test-execution/` (SKILL + template), `skills/worktree-management/SKILL.md`, `skills/complexity-tiers/SKILL.md`, `skills/plan-lifecycle/reference/commit-gate-procedure.md`, `standards/csharp_base.md`, `standards/javascript_base.md`, and `steering/engineering/git-workflow-projects.md`. References to the deleted decision skills also live in `skills/agent-authoring/reference/schema.md`, `projects/_template/project-standards.md`, `standards/javascript_node.md`, and — as JSDoc example values — `lib/resolver.js`. |
| 8c | What `knowledge-authoring` carried is re-homed rather than lost: a **steering rule** holds the four-kind routing table (including the API and business-rule placements), since choosing a home applies whenever an agent writes documentation — which is every Task, because doc-updating is an acceptance criterion — and **templates** hold the file shapes (MADR record, arc42 section, external-reference file). A skill earns its place when there is a procedure with judgment steps or validation to pass; a template plus an always-on rule is enough when the artifact is prose with light structure. |
| 9 | Agent YAMLs updated per Agent roster above: 4 retired, 4 modified, 1 new (`engineering-researcher.yaml`). Two specifics that are easy to miss: `architect.yaml` **loses** both `shell` and `web_search`/`web_fetch` — it holds `shell` today, and ADR operations arrive as `@adr/*` tools instead — and gains gated Researcher dispatch; `engineering-researcher.yaml` is scoped for ADR-grade research depth, not light briefs only (see Why Architect holds neither shell nor web). |
| 10 | `skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` swept (several tracked candidates resolve or move owner as their originating agents merge). Product-doc ownership is **not** assigned — the slot is reserved and unbuilt until a product agent exists. |
| 11 | Existing decision records dispositioned per the table above; archive location created. |
| 12 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 13 | `tests/validation/` cross-reference check passes against the new agent/skill/doc set; `npm test` green. Fixture data referencing retired agent or skill names cleaned up as a low-risk pass: `tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`, and also `tests/unit/resolver.test.js`, `tests/integration/resolver.test.js`, `tests/integration/commands.test.js` — the last three reference the deleted decision skills and were missed in the first pass. |
| 13b | Terminology-sweep verification, as an automated `tests/validation/` check (not a one-time manual grep, so a future PR can't silently reintroduce retired terminology): a repo-wide search for `chunk`/`epic` returns zero matches outside — `docs/plans/{chunks,epics,orchestration}/`, `docs/plans/completed/`, `docs/plans/archive/` (checks 23–24's teardown target), MADR record bodies under `docs/decisions/` (they document real historical chunk/epic-era decisions, e.g. `ARCH-007`), and `docs/decisions/index.json` (generated from those bodies' titles/tags, not itself a body — a separate carve-out, since the literal text "record bodies" wouldn't otherwise cover a generated index file). `docs/plans/agent-consolidation-plan.md` and `docs/plans/epics/AIF-004.epic.md` are Draft/Superseded and kept in place as history per Existing Artifacts — the latter is already covered by the `epics/` exclusion above, named here for clarity since it's the largest single offender. `docs/plans/chunk-epic-planning-redesign-plan.md` and `docs/plans/tech-lead-subagent-dispatch-plan.md` need no exception — both are already deleted (Existing Artifacts, above). |
| 14 | `bundles/engineering/snapshot.json` regenerated (`bundle.yaml` itself needs no edit — pure domain-based auto-discovery absorbs the roster shrink). |
| 15 | `README.md`, `PLAN.md`, `AGENTS.md`, `agents/README.md`, `skills/README.md` updated for the new model. `install.ps1` is not part of this sweep — it's already deleted, confirmed dead by `ARCH-001` (assumed nonexistent `.md` agent files; the real install path is the `aif` CLI), and `tests/validation/tools.test.js`'s matching existence assertion was removed with it. |
| 16 | `skills/agent-authoring/reference/tools.yaml` gains the trifecta-avoidance rule (no agent holds `moderate`/web and `privileged`/write+shell tools at once without documented isolation justification). |
| 17 | Software-Engineer's hard rules state a Researcher brief is data informing a decision, never an instruction to execute directly (see Residual injection surface in Agent roster above); and confirm Principal-Engineer review applies before merge regardless of whether Software-Engineer was dispatched by Engineering Manager or run standalone by a human. |
| 18 | `docs/decisions/` flattened (domain subfolders removed, flat bare-number MADR counter — `0007-slug.md`, no `AIF-ADR-` prefix) and every surviving record rewritten by hand into MADR within the word budget, renumbered onto the new counter. The format conventions live in the record template and are checked at Principal-Engineer review — there is no linter for them. |
| 19 | `lib/decisions.js` **retargeted, not deleted**: its parser moves from the `## Metadata` markdown table to MADR YAML frontmatter, keeping index generation and the `supersedes` → `superseded_by` inversion it already performs. `aif index -d` and `docs/decisions/index.json` stay. `tests/unit/decisions.test.js` and `tests/integration/decisions-index.test.js` are updated to the new fixtures rather than removed. |
| 20 | New guards added to the **existing** CI workflow (`.github/workflows/ci.yml` already runs lint/typecheck/format/validate/test — see New ADRs to write above; this document's earlier drafts incorrectly described `.github/` as absent, a staleness from branching before that workflow merged): the `key_files`-vs-`last_verified` staleness check (has any listed file changed since that commit?), relative-link resolution across `docs/architecture`, and `aif index --check` so no committed index can go stale again the way the decision index has on `main`. No `adrs lint` and no hyphenated-`kind` guard — both were `adrs`-specific and are moot while ADRs are hand-written. |
| 21 | `Design` sections split out of `ARCH-001/002/003/004/007` into the arc42 sections they belong to (or the YouTrack plan for `007`) per Decision-record disposition; `ARCH-005/006` converted whole with nothing split. Each split populates a real section — this is what seeds `docs/architecture/` rather than scaffolding it empty. |
| 22 | The three New ADRs to write are written in MADR form: no-TypeScript, `node:test`, MCP server credential handling. |
| 23 | `AIF-003` torn down as abandoned work: the Epic Plan and all 8 chunk plans move to `Deferred` and into `archive/` (per Retiring a plan above), reason recorded once, with `chunks.json` and `orchestration-state.json` archived alongside them. Delete the two stale remote branches (`AIF-003/002-amendment-index-fields`, `AIF-003/006-plan-lifecycle-ladder-docs`) — their PRs are already closed. Three older strays deserve the same sweep: `AIF-001/003-epic-planning-ai-track`, `AIF-002/010-migrate-aif-006`, `AIF-002/015-backfill-decisions-index`. |
| 24 | The merged half of `AIF-003` unwound — but only the part that does not already die elsewhere. `AIF-003-004`'s `Amending` status is the one real revert: remove it from `plan-lifecycle/reference/status-vocabulary.md` by hand. `AIF-003-003`'s `## Amendments`/`## Errata`/`Last Amended` template sections die with the `decision-record`/`decision-brief` skills (check 6), and `AIF-003-001`'s `Supersedes` parse dies with `lib/decisions.js` (check 19) — neither needs its own revert commit. `AIF-003-005`'s steering de-enumeration is **kept**: replacing an enumerated status list with a positive check against `Approved` is correct under MADR too, and reverting it would reintroduce a hardcoded list of statuses that no longer exist. |
| 25 | `.aiconfig.json` schema updated and its consumers with it: `paths.epics` → `paths.features`, `paths.chunks` → `paths.tasks`, add `paths.architecture`, add `paths.research` (default `knowledge/research/`) for Engineering Researcher's scratch-note output (Agent roster) — deliberately under `knowledge/` since the notes are working material, not a fifth peer to `plans`/`decisions`/`knowledge`/`architecture` — keep `paths.decisions` (now flat), and reserve `paths.product` in documentation without shipping a default. This is a code change as well as a doc change — `resolveKnowledgePath`/`resolveDecisionsPath` in `lib/commands/index.js` read these, and the field table in `AGENTS.md` documents them. This repo's own `.aiconfig.json` updated to match. |
| 26 | `projects/_template/` brought to the new format — the whole reason the schema above matters, and untouched by every earlier draft of this plan. Its `.aiconfig.json` paths, its `plans/{epics,chunks,orchestration}/` skeleton, its `knowledge/decisions/` directory, and `project-standards.md`'s references to the deleted decision skills all move. Every consuming project starts from this. |
| 27 | A **deferred** ADR, written by Architect once there is enough hand-written volume to judge it: ADR tooling — Rust CLI vs. in-repo JS implementation vs. staying manual (see ADR tooling above for the research already gathered). This gates nothing; the conversion proceeds manually regardless of how it lands. |

---

## Sequencing

1. Tear down `AIF-003` (check 23) — archive the epic and its chunks, delete the
   stale branches. Independent of everything else and cheap, and it removes the
   largest current source of confusion about what is still live. Its PRs are
   already closed, so nothing here waits on anyone.
2. Land the arc42 structure + `aif index` extension (including the reverse index) +
   doc conventions (checks 1–2).
3. Agent roster changes first (check 9) — everything else in this step derives
   from it. Then vocabulary + skill + agent sweep in one pass — feature/task
   rename, skill deletions, `complexity-tiers` re-pointed to Software-Engineer,
   steering rewrites (checks 3–8c, 10, 13–17) — plus the config fallout that
   rides with the rename: `.aiconfig.json` schema and its resolvers, then
   `projects/_template/` (checks 25–26). Check 13b (the terminology-sweep
   verification test) runs last within this step, once 3–8c/13/25–26 are all
   in — it can only pass against a finished sweep, so it verifies rather than
   performs any of the renaming itself.
4. Decisions conversion: flatten `docs/decisions/`, rewrite the survivors as
   MADR by hand, split `Design` sections into their arc42 sections, rehome the
   ownership/convention records, retarget the indexer, and write the three
   missing ADRs (checks 11, 18–19, 21–22). Depends on step 2 — the arc42 structure
   must exist before `Design` content can move in.
5. Unwind what is left of the merged `AIF-003` half (check 24) — small by this
   point, since steps 3 and 4 already delete most of it. Verify nothing survived,
   and hand-revert the `Amending` status.
6. Add the new guards to the existing CI workflow (check 20), once there is a
   converted decision log and populated arc42 sections for them to run against.
7. Triage the remaining freeform plans (check 12).

Check 27 (the ADR-tooling decision) is deliberately absent from this sequence — it
is Architect's to write later, gates nothing, and should not be attempted until
there is enough hand-written volume to answer it from evidence.

This is the full sequencing for this document's scope. YouTrack integration is
a separate, follow-on layer on top of this model — see
`docs/plans/youtrack-integration-plan.md` — sequenced independently once the
above lands; nothing in this document depends on it.
