# Decision Record: Who Sets AI-Track Chunk Boundaries

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-010 |
| Project | ai-foundation |
| Status | Draft |
| Author (Agent) | Architect |
| Approved By | Pending |
| Created | 2026-08-13 |
| Referenced By | — |
| References | AIF-004, AIF-005 |

---

## Problem Statement

AIF-005 settled how AI-track chunks *dispatch and pipeline* once they exist in
`chunks.json`, but it left one thing unexamined: **who decides where the chunk
boundaries and dependencies are in the first place.** As written, AIF-005 still has
Tech-Lead deciding this for both tracks — "Tech-Lead's Epic Section 8 decomposition
assigns `agents: ["AI-Engineer"]` to AI-track chunks with only a scope summary and
`depends_on`." Tech-Lead only delegates writing the *detailed* chunk plan to
AI-Engineer; it still makes the judgment call of how many AI-track chunks an Epic
needs and how they depend on each other.

That's a real gap by AIF-004's own logic: Tech-Lead isn't expected to write
AGENTS.md-schema-level *detail*, but deciding chunk boundaries for AI-component work
requires knowing which components are tightly coupled (e.g. a skill change and the
steering file that references it) versus genuinely independent — exactly the kind of
judgment AIF-004 already said shouldn't sit with Tech-Lead. `epic-planning`'s own
Section 5 template (`New Components` typed as Model/Service/ViewModel/View) confirms
Tech-Lead's architecture-overview thinking is built for software, not AI-component
structure.

The question: does Tech-Lead need help — a peer agent, or a delegated
sub-decomposition step to AI-Engineer — to set AI-track chunk boundaries correctly?

---

## Constraints & Requirements

What was non-negotiable:
- `chunks.json` remains a single file with one DAG per Epic — whatever the answer,
  it must not require Engineering-Manager to merge two independently-authored
  dependency graphs.
- Must not silently weaken the human-approval gate — Epic-level approval already
  covers scope; any further decomposition step must not bypass it.
- Must not introduce a new agent unless the coordination cost of *not* doing so is
  demonstrably worse than the cost of maintaining one.

What was a preference but not a hard requirement:
- Prefer reusing existing agents/skills over adding new ones, consistent with
  AIF-004/AIF-005's general bias toward extending what exists.

---

## Options Explored

### Option A: Status quo — Tech-Lead sets all chunk boundaries, with an explicit escalation fallback

**Summary**: Keep AIF-005 as written: Tech-Lead decomposes both tracks' chunk
boundaries and dependencies into `chunks.json` at Epic decomposition time, using
AGENTS.md's component taxonomy (Agent/Skill/Steering/Standard/Server) as a
coarse-grained guide — not deep domain expertise, just categorical grouping. If
AI-Engineer, while writing a chunk's detailed plan, discovers the boundary was wrong
(too coarse, too fine, or a missing dependency), it stops and raises this as an open
question on the parent Epic — already an existing, defined path
(`chunk-planning`'s "Discovers work not in the Epic" edge case, and Rule 4 generally)
— and Tech-Lead revises Section 8 / `chunks.json` accordingly.
**Strengths**: Zero new agents, zero new skills. One author for the whole DAG, so
`dag-validate`/`dag-compute-waves` keep working exactly as they do today with no
merge-of-graphs problem. The fallback path already exists and is already exercised
for exactly this kind of "plan turned out wrong" discovery — this isn't a new
process, just an acknowledgment that it applies here too.
**Weaknesses**: Every misjudged AI-track boundary costs a round trip (AI-Engineer
discovers it wrong → raises to Tech-Lead → Epic/chunks.json revised → re-approved →
AI-Engineer resumes) rather than being right the first time. Cost scales with how
often AI-track Epics have multiple, non-obviously-coupled chunks.

### Option B: New peer agent — an "AI Tech-Lead"

**Summary**: Introduce a new agent mirroring Tech-Lead but for the AI-component
domain: given an Epic's AI-track scope, it decomposes that scope into chunk
boundaries/dependencies with actual AGENTS.md-schema expertise, producing (or
appending to) `chunks.json`. Tech-Lead continues to own the Epic Plan itself and the
software-track chunks.
**Strengths**: Domain-appropriate expertise actually applied at decomposition time,
not just at implementation time — the person best equipped to judge "should this be
one chunk or three" is the one making that call.
**Weaknesses**: A new agent is real, ongoing maintenance surface (prompt, skills,
install bundle, tests) for a problem not yet observed in practice — no AI-track
chunk has been decomposed yet under AIF-005, since its orchestration-skill update
hasn't landed. Reintroduces a two-author `chunks.json` coordination problem
functionally identical to the "fully decoupled tracks" option AIF-005 already
rejected (Option C there): who's authoritative when a software-track chunk depends
on an AI-track chunk or vice versa, and who resolves a conflicting edit to the same
file. This is the heaviest option for a problem that may turn out to be rare.

### Option C: AI-Engineer self-decomposes its own portion

**Summary**: Tech-Lead's Epic Section 8 only identifies *that* AI-track work exists
and its rough boundary against the software track (which deliverables are
AI-component work vs. code) — not exact chunk count or internal dependencies.
AI-Engineer is then dispatched once for the Epic's whole AI-track scope, further
decomposes it into however many chunks make AGENTS.md-domain sense, and appends
those nodes/edges directly into the shared `chunks.json`, running `dag-validate`
itself before Engineering-Manager proceeds.
**Strengths**: Domain-appropriate boundary decisions without a new agent — reuses
AI-Engineer, which already has the relevant expertise and already reasons via
`skill/complexity-tiers` about "is this one unit of work or several." Chunk count
stays right-sized without a Tech-Lead↔AI-Engineer round trip.
**Weaknesses**: Requires a new AI-Engineer skill (e.g. `skill/ai-chunk-decomposition`)
to safely append to a shared file — avoiding ID collisions with Tech-Lead's
software-track entries, re-validating the whole DAG, and deciding whether this
sub-decomposition step needs its own human-approval checkpoint or rides on the
already-approved Epic. Real, bounded, but non-trivial new work, for a problem not
yet observed.

---

## Decision

**Chosen approach**: Option A — status quo, with the escalation fallback made
explicit rather than assumed.

**Rationale**: This is the first Epic that will ever contain AI-track chunks — the
orchestration-skill update AIF-005 itself requires hasn't landed yet, so there is no
evidence yet that Tech-Lead's coarse, taxonomy-based boundary-setting actually
produces bad splits often enough to justify Option B's new-agent maintenance cost or
Option C's new-skill/DAG-append complexity. Both alternatives solve a problem that
is currently hypothetical by adding real, permanent surface area. The existing
Rule 4 discovery-and-escalate path already handles a wrong boundary when one occurs,
at the cost of a revision round trip — an acceptable cost for a rare event, and the
correct one to pay before building infrastructure for a recurring one that hasn't
been demonstrated.

**Trade-offs accepted**:
- AI-track Epics with several non-obviously-coupled chunks may cost a Tech-Lead
  revision round trip more often than software-track Epics do, until/unless this
  becomes frequent enough to revisit.

**Revisit trigger**: If, after AIF-005's orchestration update ships and a handful of
real AI-track Epics have been decomposed, Tech-Lead's chunk boundaries are wrong
often enough that the round-trip cost is materially slowing work down, reopen this
decision in favor of Option C first (lower cost than Option B) before considering a
dedicated peer agent.

---

## Impact on Planning

- No change to AIF-005's design or the `chunk-orchestration`/`chunk-planning` update
  it already requires — Tech-Lead remains the sole author of `chunks.json` for both
  tracks.
- `chunk-planning`'s existing "Discovers work not in the Epic" edge case already
  covers a misjudged AI-track boundary; no skill change needed to enable the
  fallback described here; it should just be understood to apply to this case, not
  only to genuinely new scope.
- No action needed until AIF-005's orchestration update ships and real AI-track
  Epics start flowing through it.

---

## Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | Does AI-Engineer need a Tech-Lead-equivalent agent to decompose AI-track chunk boundaries? | Not now. Tech-Lead remains the sole `chunks.json` author for both tracks; a misjudged boundary is handled via the existing discovery/escalation path, not a new agent. |
| 2 | Under what condition should this be revisited? | If, after real AI-track Epics run through AIF-005's dispatch mechanism, boundary misjudgments prove frequent/costly — revisit toward Option C (AI-Engineer self-decomposes) before considering a new peer agent (Option B). |
