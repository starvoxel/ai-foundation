# Process Model — Efficiency Rework

> Status: Draft
> Created: 2026-09-03
> Approved by: Pending

Target-state description of a lighter process, plus the transition plan to reach it.
Replaces the Epic→Chunk model, the 8-agent role-pipeline (architect / tech-lead /
engineering-manager / software-engineer / ai-engineer / test-engineer /
principal-engineer / engineering-tech-writer), and the tiered Decision-Record system —
swapped for standard MADR records, written by hand for now. Everything that was never
a decision (mechanism, requirements, ownership) moves to a document type that's allowed
to stay current.

Merges two original drafts (this one and `docs/plans/agent-consolidation-plan.md`) —
they touched the same files for the same reason: proportionate ceremony.
`agent-consolidation-plan.md` is kept as a superseded historical record.

---

## Goal

Proportionate ceremony. Current-state docs instead of accreting records. Coarser work
units. One agent owns a task end-to-end — design, implementation, testing, and
documentation — instead of a role-pipeline that loses context at every handoff. A
tracker that surfaces state. Git holds history; agent context holds only what's
binding and current.

---

## Target model

### Work hierarchy

| Level | Was | Definition | Artifact | Gate |
|---|---|---|---|---|
| **Feature** | Epic | A small, definable piece of work, reviewable by a human in one pass. | Feature Plan. | One committed human approval. |
| **Task** | Chunk | One execution unit of a Feature, owned end-to-end by one Software-Engineer dispatch (design → implement → test → document). Same DAG / wave / worktree machinery. | Row in `tasks.json` (+ optional short plan, see Agent roster). | Covered by the Feature's approval, or a Tier 3 escalation per `complexity-tiers`. |

Rename plus the pipeline-ownership change in Agent roster below; mechanics carry over unchanged.

### Task sizing

- A unit of review — reviewable by Principal-Engineer in one sitting, not the smallest
  mergeable diff and not a duration estimate. Owning a Task end-to-end can take longer
  in elapsed time than the old model implied, since work that used to span SE/TE/ETW
  now runs inside one Task. Size by interface/contract boundary.
- Split a Feature into multiple Tasks only for real parallelism or a hard dependency
  boundary — not "different files," not artifact type (one dispatch handles code and
  declarative-component work alike).
- Small Features may be a single Task, or skip `tasks.json` entirely.

### Document types

Everything below is **knowledge** — non-code material an agent reads to work, the same
concept `.aiconfig.json`'s `paths.knowledge` already names (this repo points it at
`docs/`). Four kinds, split by what question each answers and whether it may change
after landing. Collapsing them into one type produced the current 16-record decision
log, 8 of which aren't decisions at all.

| Type | Answers | Mutability | Home | Owner |
|---|---|---|---|---|
| **ADR** | Why this path won over another | Immutable once accepted — superseded, never edited | `docs/decisions/` | Architect |
| **Architecture doc** | How the system currently works | Living | `docs/architecture/*`, as arc42 sections | Architect may start a section alongside an ADR; Software-Engineer maintains it at implementation time |
| **Product doc** *(reserved — not built yet)* | What a product area does, for whom | Living | `docs/product/*` | A future product agent |
| **Process & ownership** | How we work / who's accountable | Living | `steering/`, `standards/`, agent charters, Agent roster | Engineering Manager |

**Structured as arc42 + C4** (below). `architecture` reads close to "architecture
decision record," but it's the standard arc42/C4 term and agents already know it —
cheaper than a private dialect.

**Product docs are a reserved slot, not current work** — nothing needs a PRD today,
and an empty owned-by-nobody directory is how unused ceremony starts. Build it when a
product agent lands.

- One file per arc42 section/building block — replaces the old page-limit, and is what
  arc42's own numbering already implies.
- Updating the affected doc is a Feature acceptance criterion, checked in review with tests.
- Bodies stay in git; `aif index` covers architecture sections and decisions alike.
- **PRDs are an input, not a fifth type.** The Feature Plan's goal/acceptance-criteria
  section *is* the PRD today. PRDs move to the reserved slot once a product agent exists.
- **Ownership (RACI) questions aren't decisions.** Answered by the Agent roster and the
  charters it drives, never a record in `docs/decisions/`. `PROC-001/004/006` exist only
  because there was no other home for that question.

#### Subject matter is not a document kind

`skill/knowledge-authoring`'s `type` list (`decision`, `reference`, `architecture`,
`api`, `business-rule`) mixes kind and subject. The four kinds above are a pure kind
axis, split by mutability — `api`/`business-rule` become **tags** instead, and their
content lands wherever it actually fits:

| The thing | Home |
|---|---|
| Authoritative spec (OpenAPI, JSON Schema, zod, `.d.ts`) | Code — a `key_files` entry, never restated in prose |
| External interfaces | arc42 §3 Technical Context |
| A building block's interface to its neighbours | That block's §5 file |
| Stability / versioning policy | `standards/` |
| Business rule — product requirement | Reserved `docs/product/` slot |
| Business rule — how the domain is modelled | arc42 §8 or the owning §5 block |
| Business rule — externally imposed (regulatory) | arc42 §2 Constraints |

**`skill/knowledge-authoring` retires** (check 6). Once `decision`/`architecture` move
out and `api`/`business-rule` become tags, only reference material about *other*
systems is left — no arc42 home, not a procedure either. Routing goes to `steering/`;
the file shape is a template. No agent or bundle declares this skill today, and it's
the only `*-authoring` skill with no `reference/` schema, so it's already dead wiring.

### Decisions — four homes, no tiers, no domains

| Kind | Home |
|---|---|
| Binding implementer rule (stack, pattern, layering) | `standards/` or `steering/` |
| Genuine architectural/product fork — contested, costly to reverse (rare) | ADR — `docs/decisions/`, MADR format (below) |
| How the system / product works | The relevant `docs/architecture` section (or `docs/product`, once built) |
| Process / tooling / convention / ownership change | No record — edit the skill/steering/agent file; commit + CHANGELOG is the record |

- ADR scoped to one Feature is archived with it; cross-cutting ADRs are cross-linked
  from arc42 §9 so they outlive any one Feature.
- `complexity-tiers`/`plan-lifecycle` stay (trimmed). `decision-record` is **replaced
  outright** by MADR; `decision-triage`'s tier/domain classification goes with it — one
  record type left, no domain table to route through. An agent spotting a genuine fork
  dispatches Architect directly.

### ADR format — MADR

Standard MADR, replacing the in-house options-exploration template. Records *that* a
decision was made and *why*, not the research trail.

Frontmatter: `status` (`proposed`/`accepted`/`rejected`/`deprecated`/`superseded`),
`date`, `deciders`, `tags`. Sections: Context and Problem Statement → Decision Drivers
→ Considered Options → Decision Outcome (+ Consequences) → optional Pros and Cons →
optional More Information.

**Budget: 150–350 words excluding frontmatter**, enforced at Principal-Engineer review
(no tooling — see ADR tooling below):

| Section | Cap |
|---|---|
| Context and Problem Statement | 2–4 sentences |
| Decision Drivers | 3–6 bullets, fragments |
| Considered Options | one line each, 2–4 options |
| Decision Outcome | 2–4 sentences tied to the drivers |
| Consequences | 3–5 one-line bullets |
| Pros and Cons of the Options | optional; 2–3 bullets, only where a rejection isn't obvious |

**Not** in an ADR — goes to the relevant arc42 section or the Feature/ticket: schemas,
config tables, algorithms, code beyond a 3-line illustration, migration/rollout steps,
implementer detail, open questions about how the system will work.

**Litmus test:** *how the system works* vs. *why this path won* — only the second
belongs. Every current ARCH record's `Design` section fails this (see disposition below).

An accepted ADR is never edited; a reversal is a new ADR with `supersedes:` set. This
retires the `Amending` status and the Errata/Amendments ladder wholesale.

### ADR tooling — none, deliberately, for now

Architect writes MADR files by hand with plain `write`. No CLI, no MCP server, no
binary — a deferral, not a rejection. `adrs` (Rust, no npm path) doesn't fit this
Node project, and nothing about starting MADR conversion depends on answering the
tooling question first.

**Architect writes that decision itself, later** (check 27), once there's enough
hand-written volume to know whether staying manual actually hurts. Options already
scoped: a pinned `adrs` binary (cross-platform but no npm path), an npm wrapper around
it, an in-repo JS implementation (fits `servers/dag`'s existing MCP-server shape), or
staying manual. Cost of staying manual: no scaffolding/reverse-edge automation (cheap —
a template and the index cover both) and no structural lint (real, covered by PE review
meanwhile).

### ADR discovery — keep the existing indexer, retargeted

No CLI means no `adrs` MCP server to query, so discovery stays with `aif`.
`lib/decisions.js` already parses records, builds an index, and inverts `Supersedes`
into `superseded_by` — retarget its parser from the `## Metadata` table to MADR
frontmatter and it serves the new format unchanged in shape. Less work than rebuilding,
and the reverse edge stays computed rather than authored twice.

`docs/decisions/index.json` is stale on `main` today (`aif index -d --check` →
`✗ stale: Removed: AIF-PLAN-001`) — a CI gap, not a reason to retire the indexer (check 20).

Flat directory, single counter: `docs/decisions/{architecture,process,meta-process}/`
flattens since domains are retired; IDs become `AIF-ADR-001`. Frontmatter `tags` carry
any categorization still wanted.

### Architecture docs — arc42 + C4

One system, one repo, one arc42 — `docs/architecture/` is a flat directory of numbered
section files, no subfolders (arc42 already numbers its own sub-levels):

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

Why arc42+C4 over free-form subsystem docs: closes the system-level gap (§1/§2/§3/§10
have nowhere else to live); §5 is recursive, so per-subsystem detail is arc42's
white-box expansion rather than a competing structure; section numbers are addressable
("read §3 and §6") in a way filenames aren't; C4 supplies the diagrams arc42 doesn't
specify, as inline Mermaid so they stay diffable.

Two rules against ceremony: **create sections lazily** (only real content, no empty
12-section scaffold), and **§9 holds pointers, never decision content** (keeps ADRs
immutable and separate). §11 Risks and §12 Glossary likely stay absent until needed.

### Writing docs agents can consume

Applies to arc42 sections and future product docs — ADRs use MADR's own shape.

Frontmatter carries structured values only; prose lives in the body:

```yaml
---
section: "05.01"
title: "Bundle resolution"
status: current                  # current | draft | stale
last_verified: 8f3c2a1           # commit SHA, not a date
tags: [install, bundles]
key_files:
  - lib/resolver.js
  - lib/commands/install.js
---
```

`section` makes the arc42 role machine-readable. `key_files` is structured data in
frontmatter, not prose — file-level binding (a code graph is deliberately not adopted;
too early, and it gives structure without intent). The one-line summary stays a body
convention (a blockquote after the H1), so it doesn't drift from frontmatter.

Two computed affordances matter more than any field:
1. **Reverse index** — `key_files` inverted: `aif index` builds `source path → [docs]`,
   the highest-value navigation available here (same inversion pattern as `supersedes`).
2. **Real staleness detection** — `last_verified` as a commit SHA means *has any
   `key_files` entry changed since?* is mechanical, turning doc drift into a CI failure.

`aif index` entry shape: `path`, `section`, `title`, `summary`, `status`, `tags`,
`key_files`, `last_verified`, plus the reverse index. Same pure-parse → build → diff
pipeline as today's decision indexer — generalize it to serve both doc sets.

### Context rules

- Agents always load the relevant reference-doc file(s) and index entries for their work area.
- No full ADR bodies, superseded reasoning, or historical narration auto-loaded — the
  MADR budget makes this cheap (a whole ADR ≈ one old record's `Options Explored` heading).
- Decision records leave `knowledge/index.json`. One discovery surface: `aif index`,
  covering architecture sections and decisions through the same retargeted indexer.
- No migration tables, "supersedes X because…", or point-in-time proposals in any
  artifact body — those belong in commit messages.

---

## Agent roster

Split by context boundary and privilege level, not job title. One agent owns a Task
end-to-end because design/implement/test/document share the same rationale and lose
fidelity across handoffs. Research (context volume + privilege) and review (blackbox
verification) are the only splits that earn a separate agent.

8 agents → 5: `Tech-Lead`, `Test-Engineer`, `Engineering-Tech-Writer`, `AI-Engineer`
retire; charters absorbed below. Also closes a security gap: `architect`/`ai-engineer`
previously held write + shell + web simultaneously (the "lethal trifecta"), mitigated
only by a human-confirmation gate, not a structural boundary.

| Agent | Role | Write | Shell | Web | Subagent dispatch |
|---|---|---|---|---|---|
| **Architect** | ADRs — rare, contested, costly-to-reverse forks — plus starting the arc42 section an ADR's mechanism content splits into | Yes, scoped to `docs/decisions/**` + `docs/architecture/**` | **No** | **No** | Callable by Engineering Manager or Software Engineer; dispatches Researcher (gated) |
| **Engineering Manager** | Absorbs Tech-Lead: PRD/request → Feature Plan → Task decomposition → dispatch → orchestration | Yes (plans, orchestration state) | Yes (`ai-git`, dag tools) | **No** | Dispatches Software Engineer, Architect (spotted ADR-worthy fork), Researcher |
| **Software Engineer** | Absorbs Test-Engineer + Engineering-Tech-Writer + AI-Engineer + Task-level design. Owns product code and AI-component work alike. | Yes | Yes | **No** | Gated `subagent` → Researcher (excluded from `approved_tools`, human confirms each dispatch) |
| **Engineering Researcher** *(new)* | Web research → decision-ready brief, for Architect, EM, or SE. Scoped for ADR-grade depth, not just light briefs. | Yes, scoped to `{paths.research}` (default `knowledge/research/`, new `.aiconfig.json` field — check 25), `.md` only | **No** | Yes | No |
| **Principal Engineer** | Review gate — standards + the Feature's outline. Checklist branches by artifact type. | No (findings only) | No | No | No |

**Why AI-Engineer merges into Software-Engineer:** same privilege profile (write +
shell, no web), no context-volume or verification-role reason to split, and
parallelism already comes from dispatching multiple instances of one agent, not two
identities. Also removes real coordination cost — a Task touching both `lib/` and a
`bundle.yaml` needed two agents before.

**Why Architect holds neither shell nor web:** writing MADR by hand needs only `write`;
adopting a CLI would force `shell`, recreating the trifecta this roster removes.
Architect routes research through Engineering Researcher instead of holding web itself
— keeps one web-holder, and research shaping a binding ADR passes through an agent that
can't write to the repo at all. **Consequence:** Engineering Researcher must be scoped
for ADR-grade depth (option space, trade-off evidence, enough to defend a rejection),
not just light briefs — its charter must say so (check 9).

**Why Principal-Engineer absorbs AI-component review:** branching a checklist by
artifact type is no different from already branching by language standard — not a
second reviewer role. New rule: any diff touching `tools`/`approved_tools`/
`blocked_commands` in an agent definition is always HIGH-or-above severity, which is
what makes Software-Engineer's write access to `agents/*.yaml` safe post-merge.

### Security posture

| Agent | Legs held | Residual risk |
|---|---|---|
| Architect | write only | Tightest posture in the roster — no shell, no web. Sees only Researcher briefs, never raw web content. |
| Engineering Manager | write + shell, no web | Only sees compressed briefs from Architect/Researcher, never raw content |
| Software Engineer | write + shell, no web | Direct web-vector closed, but not zero — see Residual injection surface |
| Engineering Researcher | web only, write scoped to non-executable `.md` | The one agent allowed to hold web freely holds nothing else |
| Principal Engineer | none | Clean |

`skills/agent-authoring/reference/tools.yaml` should gain an explicit rule against
holding `moderate` (web) and `privileged` (write/shell) tools at once without
documented isolation — structural, not tribal knowledge.

#### Residual injection surface

Removing direct web from Software-Engineer and Architect closes the highest-volume
vector, not all of it: **Researcher's brief is a narrower but real vector**
(summarization isn't sanitization — an injected recommendation can survive into the
brief; dispatch-confirmation approves the dispatch, not the vetted content). Routing
Architect's research through the same path widens this vector's blast radius, since a
bad ADR outlives any one bad `npm install`. **Web was never the only surface** — both
agents still read repo content, install output, and ticket/PRD text of unknown origin.

Mitigation: both agents' hard rules must state a Researcher brief is data informing a
decision, never an instruction to execute directly. Architect's human approval gate is
the backstop for the ADR case.

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

Correction and merge-conflict loops cycle within one agent instead of restarting a
multi-agent chain — the old model's largest coordination cost.

### Resolved design questions

**How detailed should a Feature Plan be?** Coarse — *what*, not *how*: acceptance
criteria, interface boundaries owned vs. depended on, binding standards/Approved ADRs,
a non-functional checklist (security, logging, perf — still a PE gate), explicit
out-of-scope. Not function-level design or a file-by-file breakdown — that's
Software-Engineer's own design step. Design mistakes are now caught at PE review
instead of before code is written — intended, not an oversight.

**Does Software-Engineer need a pre-approved plan per Task?** No —
`complexity-tiers` becomes its universal front door. Tier 1 proceeds directly,
self-validated. Tier 2 outlines and stops for approval, then SE implements. Tier 3 no
longer means "SE writes its own plan and implements it" — it stops and hands off:
dispatched → report back to Engineering Manager to decompose; standalone → escalate to
the human directly. Reuses `skills/decision-triage/reference/handoff-signal.md`'s
orchestrated/standalone branching *shape* even though that skill retires — the pattern
is proven and worth keeping. This is the existing "refuse if too large" behavior made
universal, not an AI-only case.

**Does "plan this" force Tier 3?** No — it's a floor on Tier 2 (stop for human sign-off
before SE implements), not a jump to Tier 3 (work genuinely too large for SE to own).
More rigor within Tier 2 is a richer outline, not a fourth tier.

**Can Software-Engineer run without Engineering Manager?** Yes — a human can drive it
directly on Tier 1/2 work with no Feature Plan first. Principal-Engineer review before
merge is a standing gate regardless of who invoked SE — "no EM" never means "no review."

**Does Engineering Manager pick up anything else?** Gated `subagent` dispatch to
Researcher (same mechanism as its Architect dispatch), and — since `decision-triage`'s
domain-routing retires — the "is this ADR-worthy" judgment moves into EM's and SE's own
prompts rather than a separate classification skill.

**Who commits an Architect-authored ADR to git, given Architect holds no `shell`?**
Architect never commits its own output. `write` scoped to `docs/decisions/**` +
`docs/architecture/**` produces the file; the dispatching agent (EM or SE) commits it
through the `shell`/`ai-git` access it already holds for its own plans — a process
step, not a new tool grant. Must be stated explicitly in the dispatching agent's prompt
(check 9).

**What survives when `decision-triage` retires?** Only the structural pattern (branch
on orchestrator presence, stop-and-report vs. hand-to-orchestrator) — not
`handoff-signal.md`'s Tier/Domain content, which is deleted with the rest of the skill
(check 6). Software-Engineer's Tier 3 hand-off re-implements the shape natively.

---

## Existing artifacts

| Artifact | Disposition |
|---|---|
| `AIF-001`, `AIF-002` epics + chunk plans | Done. Leave in place as history — no migration, no rename. |
| `AIF-003` epic (decision-record amendment ladder) + its 8 chunk plans | **Abandoned mid-flight.** The ladder it implements is retired by this model. PRs #23/#24 closed unmerged 2026-09-09; chunks `001/003/004/005` had already merged and need unwinding. Teardown in checks 23–24. |
| `AIF-004` (Draft — planning redesign) | Superseded. Valid pieces (one gate per Feature, tier-aware pipeline, terminology sweep) roll in above. Mark `Deferred` and archive (`Superseded` isn't a legal Epic Plan status). |
| `docs/plans/agent-consolidation-plan.md` (Draft) | Superseded — agent-roster content merged above. Mark `Superseded`, leave as history. |
| `docs/plans/chunk-epic-planning-redesign-plan.md`, `docs/plans/tech-lead-subagent-dispatch-plan.md` | **Already deleted, not archived**, ahead of sequencing — both doubly-orphaned/moot with nothing not already captured here. `AIF-001`/`AIF-002`'s frozen chunk plans still reference the deleted path as historical record. |
| Freeform `docs/plans/*.md` (`cli-plan`, `ai-git-enforcement`, `commit-discipline-plan-gate`, `gmail-*`, …) | Triage each: Done → `docs/plans/completed/`; real upcoming work → a Feature; process change → fold into the edit and delete; stale → delete. No new freeform plans after this. |
| `ai-engineering-plan` skill / "Tier 3 plan" | Retired. Small work runs under `complexity-tiers`; larger becomes a Feature. |
| `agents/tech-lead.yaml`, `test-engineer.yaml`, `engineering-tech-writer.yaml`, `ai-engineer.yaml` | Retired — charters absorbed per Agent roster. |
| `agents/architect.yaml`, `software-engineer.yaml`, `engineering-manager.yaml`, `principal-engineer.yaml` | Modified per Agent roster (tool grants, scope). |
| `agents/engineering-researcher.yaml` | New. |
| 16 decision records | Converted to MADR or rehomed — see disposition below. |

Archived records/plans move to an `archive/` subfolder with status noted — not deleted;
git plus a browsable trail is the audit record.

**Retiring a plan uses `Deferred`** — Epic/Chunk Plans allow only
`Draft`/`Approved`/`Done`/`Deferred` (`Superseded` is Decision-Record-only), so `AIF-003`
and `AIF-004` both move to `Deferred` + `archive/`, not a new `Abandoned` status.
Freeform `docs/plans/*.md` isn't governed by that vocabulary.

### Decision-record disposition

All seven ARCH records are genuine ADRs with real options and trade-offs — none
mislabeled. What splits is each `Design` section, which fails the litmus test above.

| Record | Genuine ADR? | Disposition |
|---|---|---|
| `ARCH-001` Install CLI redesign | Yes | Core → MADR. `Design` (bundle schema, manifest, adapter table) → arc42 §5 install/bundle sections. |
| `ARCH-002` Steering schema & harness scoping | Yes | Core → MADR. `Design` → arc42 §5 (harness adapters); `Known Limitations` (Kiro `fileMatch` bug) → §11 Risks. |
| `ARCH-003` Shared resource lifecycle | Yes | Core → MADR. `Design` → arc42 §5 (manifest/snapshot) and §6 Runtime. |
| `ARCH-004` Standards sync mechanism | Yes, still `Draft` | Decide or drop before converting — its byte-level schema belongs in arc42 §5, not a frozen ADR. |
| `ARCH-005` DAG tool as MCP server | Yes | Convert whole; nothing to split — retrospective by design, don't fold-and-archive. |
| `ARCH-006` `ai-git` tool boundary | Yes — a decision not to build | Convert whole. No "how it works" content to fold anywhere. |
| `ARCH-007` Epic/Chunk → YouTrack | Yes | Core → MADR. `Design` (field schema, workflow rules) → `docs/plans/youtrack-integration-plan.md`. |
| `PROC-001` AI-Engineer/SE boundary | No — ownership | → `steering/`; no longer an agent boundary. |
| `PROC-002`, `PROC-006` AI-track dispatch/decomposition | No — ownership | Moot — AI-track distinction retires with the merge. |
| `PROC-003` Parallel chunk isolation (worktrees) | Partly | Short MADR ADR for the worktrees-vs-alternatives trade-off; operational detail → orchestration skill text. |
| `PROC-004` Standards sync ownership | No — ownership | → `steering/`, alongside `PROC-001`. |
| `PROC-005` Git workflow mode | No — convention | → `steering/`. |
| `PLAN-001` Epic/chunk colocation | No — convention | Already deleted from disk; retire the stale index reference (check 19). |
| `META-001`, `META-002` Tiering + amendment ladder | No — meta-process | Retired wholesale — MADR's budget/immutability prevent this bloat structurally. |

Corrects an earlier disposition that folded `ARCH-001/005/006` into architecture docs
and archived them — that discards real decision rationale.

### New ADRs to write

Load-bearing choices the stack makes but records nowhere. Write these as MADR during
the conversion:

| ADR | Evidence it's undocumented |
|---|---|
| Plain JavaScript + JSDoc, no TypeScript | `tsconfig.json` exists (`allowJs`/`checkJs`, feeding `npm run typecheck`) but only typechecks JSDoc — no `.ts` source anywhere despite JSDoc typedefs + runtime `zod`. That split is the undocumented decision. |
| `node:test` over Jest/Vitest/Mocha | None of the three appear in `package-lock.json` — worth recording because it's the less common choice. |
| MCP server credential handling | `servers/gmail` uses OAuth, `servers/youtrack` a static token — two patterns, no unifying record, though `ARCH-006` already treats this class as ADR-worthy. |

Not missing ADRs: **ESM-only** (real but low-stakes — a line in the architecture doc)
and **CI** — `.github/workflows/ci.yml` (lint, typecheck, format, validate, test on
Node 22.x/26.x) already exists, landed via a sibling PR before this document merged;
not an open question this work resolves. Check 20 adds new guards to that workflow.

---

## Implementation checks

| # | Check |
|---|---|
| 1 | `docs/architecture/` exists as a flat arc42 section directory with a section-file template (frontmatter: `section`, `title`, `status`, `last_verified` as a commit SHA, `tags`, `key_files`; one-sentence blockquote summary after the H1). Sections created lazily — only §1/§2/§3/§5 need exist at the start. `docs/product/` **not** created — reserved, no owner yet. |
| 2 | `aif index` emits a nav index for arc42 sections (entry shape above) plus the computed `source path → [docs]` reverse index from `key_files`. Decisions stay in scope via the retargeted indexer (check 19) — one module, two doc sets. |
| 3 | `epic-planning` + `chunk-planning` merge into `feature-planning`: renamed, Task-sizing rules added, small Features may skip decomposition. |
| 4 | `chunk-orchestration`: `chunks.json` → `tasks.json`; per-Task plan gate replaced by `complexity-tiers`; software/AI-track branching removed — one pipeline (implement+self-test+docs → PE review) for every Task. |
| 5 | DAG server + `lib` renamed chunk→task; wave output identical for an equivalent graph. Includes `servers/dag/logic.js`'s doc comment and the chunk/epic-worded test fixtures in all three `servers/dag/tests/**` files, not just identifiers. |
| 6 | `decision-triage`, `decision-brief`, `decision-record`, `chunk-planning`, `ai-engineering-plan`, `knowledge-authoring` skills deleted, all references removed. `decision-record` because MADR replaces (not shrinks) it; `knowledge-authoring` per Subject matter is not a document kind. |
| 7 | `plan-lifecycle`/`complexity-tiers` trimmed; `complexity-tiers` re-pointed as SE's primary gate. Tier 3 becomes "stop and hand off" (orchestrated → EM, standalone → human). `plan this` documented as a Tier 2 floor, not a Tier 3 jump. |
| 8 | `steering/engineering/core.md` Rules 1/2/8/9 reworded (Rule 1 → `complexity-tiers` gate, Rule 2 gets a Tier 1/2 fallback, Chunk/Epic Plan → Feature Plan); `knowledge-consumption.md` moves decision-records from full-body auto-load to **index-only by default, full body on demand**; doc-update acceptance gate added. |
| 8b | **Full vocabulary + reference sweep**, not just planning skills: `skills/code-review/`, `skills/test-execution/`, `skills/worktree-management/SKILL.md`, `skills/complexity-tiers/SKILL.md`, `skills/plan-lifecycle/reference/commit-gate-procedure.md`, `standards/csharp_base.md`, `standards/javascript_base.md`, `steering/engineering/git-workflow-projects.md`. Deleted-skill references also in `skills/agent-authoring/reference/schema.md`, `projects/_template/project-standards.md`, `standards/javascript_node.md`, and `lib/resolver.js`'s JSDoc examples. |
| 8c | What `knowledge-authoring` carried is re-homed: a steering rule holds the four-kind routing table; templates hold the file shapes (MADR, arc42 section, external-reference file). A skill earns its place with judgment/validation steps; a template + always-on rule is enough for light-structure prose. |
| 9 | Agent YAMLs updated per Agent roster: 4 retired, 4 modified, 1 new. `architect.yaml` **loses** `shell` and `web_search`/`web_fetch`, gains gated Researcher dispatch; `engineering-researcher.yaml` scoped for ADR-grade depth. |
| 10 | `skill/agent-authoring` and `docs/agent-prompt-extraction-candidates.md` swept. Product-doc ownership **not** assigned — reserved and unbuilt. |
| 11 | Existing decision records dispositioned per the table above; archive location created. |
| 12 | Freeform `docs/plans/*.md` triaged and cleared; `docs/plans/completed/` holds the finished ones. |
| 13 | `tests/validation/` cross-reference check passes against the new set; `npm test` green. Fixtures cleaned up: `tests/unit/decisions.test.js`, `tests/integration/decisions-index.test.js`, `knowledge-index.test.js`, `base.test.js`, `claude-adapter.test.js`, `kiro-adapter.test.js`, `tests/unit/resolver.test.js`, `tests/integration/resolver.test.js`, `tests/integration/commands.test.js`. |
| 13b | Terminology-sweep verification as an automated `tests/validation/` check: repo-wide `chunk`/`epic` search returns zero matches outside `docs/plans/{chunks,epics,orchestration}/`, `docs/plans/completed/`, `docs/plans/archive/`, MADR record bodies (e.g. `ARCH-007`), and `docs/decisions/index.json` (generated from those bodies, not itself a body). `agent-consolidation-plan.md` and `AIF-004.epic.md` are covered as kept-in-place history. The two already-deleted plans need no exception. |
| 14 | `bundles/engineering/snapshot.json` regenerated (`bundle.yaml` needs no edit — domain-based auto-discovery absorbs the shrink). |
| 15 | `README.md`, `PLAN.md`, `AGENTS.md`, `agents/README.md`, `skills/README.md` updated. `install.ps1` not in scope — already deleted (dead per `ARCH-001`), its `tools.test.js` assertion removed with it. |
| 16 | `skills/agent-authoring/reference/tools.yaml` gains the trifecta-avoidance rule (no agent holds `moderate`/web and `privileged`/write+shell at once without documented isolation). |
| 17 | Software-Engineer's hard rules state a Researcher brief is data informing a decision, never an instruction to execute; confirm PE review applies regardless of who dispatched SE. |
| 18 | `docs/decisions/` flattened (domain subfolders removed, flat `AIF-ADR-nnn` counter); every surviving record rewritten by hand into MADR within the word budget, checked at PE review. |
| 19 | `lib/decisions.js` **retargeted, not deleted**: parser moves from the `## Metadata` table to MADR frontmatter, keeping index generation and the `supersedes`→`superseded_by` inversion. `aif index -d` and `docs/decisions/index.json` stay. `tests/unit/decisions.test.js` and `tests/integration/decisions-index.test.js` updated to new fixtures. |
| 20 | New guards added to the **existing** `.github/workflows/ci.yml`: `key_files`-vs-`last_verified` staleness check, relative-link resolution across `docs/architecture`, `aif index --check`. No `adrs lint` or hyphenated-`kind` guard — both moot while ADRs are hand-written. |
| 21 | `Design` sections split out of `ARCH-001/002/003/004/007` into their arc42 homes (or the YouTrack plan for `007`); `ARCH-005/006` converted whole. This is what seeds `docs/architecture/` with real content. |
| 22 | The three New ADRs to write are written in MADR form. |
| 23 | `AIF-003` torn down: Epic Plan + all 8 chunk plans move to `Deferred` and `archive/`, reason recorded once, `chunks.json`/`orchestration-state.json` archived alongside. Delete stale remote branches: `AIF-003/002-amendment-index-fields`, `AIF-003/006-plan-lifecycle-ladder-docs`, plus older strays `AIF-001/003-epic-planning-ai-track`, `AIF-002/010-migrate-aif-006`, `AIF-002/015-backfill-decisions-index`. |
| 24 | Merged half of `AIF-003` unwound, minus what already dies elsewhere. Real revert: `AIF-003-004`'s `Amending` status, removed from `plan-lifecycle/reference/status-vocabulary.md` by hand. `AIF-003-003`'s Amendments/Errata template sections die with check 6; `AIF-003-001`'s `Supersedes` parse dies with check 19 — no separate revert needed. `AIF-003-005`'s steering de-enumeration is **kept** (correct under MADR too). |
| 25 | `.aiconfig.json` schema: `paths.epics`→`paths.features`, `paths.chunks`→`paths.tasks`, add `paths.architecture`, add `paths.research` (default `knowledge/research/`, for Engineering Researcher), keep `paths.decisions` (now flat), reserve `paths.product` without a default. Code change too — `resolveKnowledgePath`/`resolveDecisionsPath` in `lib/commands/index.js` read these; `AGENTS.md`'s field table documents them. This repo's own `.aiconfig.json` updated to match. |
| 26 | `projects/_template/` brought to the new format: `.aiconfig.json` paths, `plans/{epics,chunks,orchestration}/` skeleton, `knowledge/decisions/` directory, `project-standards.md`'s deleted-skill references. Every consuming project starts from this. |
| 27 | A **deferred** ADR, written by Architect once there's enough hand-written volume: ADR tooling (Rust CLI vs. in-repo JS vs. staying manual — see ADR tooling above). Gates nothing. |

---

## Sequencing

1. Tear down `AIF-003` (check 23) — independent and cheap, removes the largest source
   of confusion about what's still live. PRs already closed.
2. Land the arc42 structure + `aif index` extension + doc conventions (checks 1–2).
3. Agent roster first (check 9) — everything else here derives from it. Then
   vocabulary + skill + agent sweep in one pass: feature/task rename, skill deletions,
   `complexity-tiers` re-pointed, steering rewrites (checks 3–8c, 10, 13–17), plus
   `.aiconfig.json` schema/resolvers and `projects/_template/` (checks 25–26). Check
   13b (terminology-sweep verification) runs last within this step, once 3–8c/13/25–26
   are all in.
4. Decisions conversion: flatten `docs/decisions/`, rewrite survivors as MADR, split
   `Design` sections into arc42, rehome ownership/convention records, retarget the
   indexer, write the three missing ADRs (checks 11, 18–19, 21–22). Depends on step 2.
5. Unwind what's left of the merged `AIF-003` half (check 24) — small by this point.
6. Add the new guards to the existing CI workflow (check 20), once there's a converted
   decision log and populated arc42 sections to run against.
7. Triage the remaining freeform plans (check 12).

Check 27 (ADR tooling) is deliberately absent — Architect's to write later, gates
nothing.

YouTrack integration is a separate follow-on layer — see
`docs/plans/youtrack-integration-plan.md` — sequenced independently; nothing here
depends on it.
