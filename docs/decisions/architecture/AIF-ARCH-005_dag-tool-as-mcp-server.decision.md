# Decision Record: DAG Validation/Wave-Computation as an MCP Server

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-ARCH-005 |
| Project | ai-foundation |
| Tier | A |
| Domain | architecture |
| Status | Aoorived |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2026-08-23 |
| Referenced By | — |
| References | AIF-005 |
| Tags | mcp, dag, tooling, cross-harness |

> **Note:** This record documents, retrospectively, a decision already implemented in `servers/dag/` (built under `docs/plans/completed/engineering-manager-plan.md`, Phase 1, commit `f29d00e`). No Decision Record was produced at the time. It is written now, at human request, so the reasoning is a durable, citable artifact instead of something that has to be reconstructed from a plan's prose each time it comes up — and so the same reasoning can be applied consistently when auditing other cross-harness tooling (see Impact on Planning). Options B and C below were not actually built or trialed; they are reconstructed counterfactuals evaluated against the same constraints the original implementation satisfied, not alternatives that were live-tested and discarded.

---

## Problem Statement

Chunk dependency-graph validation (cycle/reference checks) and wave computation (topological sort for parallel dispatch) are needed by two different agents — Tech-Lead (`dag-validate`, at Epic decomposition time) and Engineering-Manager (`dag-compute-waves`, at orchestration time) — across every harness this framework installs into (Kiro, Claude Code, Copilot). This logic must produce identical, deterministic results regardless of which agent or harness calls it. The question: how should this shared, deterministic logic be exposed to agents, given the framework's harness-agnostic, lowest-common-denominator design constraint?

---

## Constraints & Requirements

What was non-negotiable:
- Identical behavior across Kiro, Claude Code, and Copilot — no harness-specific graph logic.
- Deterministic output — cycle detection and wave computation are algorithmic; correctness cannot depend on an LLM re-deriving topological sort correctly on every call.
- Callable by more than one agent (Tech-Lead and Engineering-Manager) without duplicating the implementation in two places.
- Must not weaken any existing approval/validity gate — `dag-validate` failure must still block Epic approval, per Tech-Lead's hard rules.

What was a preference but not a hard requirement:
- Reuse the framework's existing tool-provisioning pipeline (`servers/`, the install/registration mechanism already built for `gmail`) rather than inventing a new one.
- Keep the implementation swappable — start with pure JS, allow replacing it with a real graph library later without changing how agents call it.

---

## Options Explored

### Option A: MCP server exposing typed tools (`dag-validate`, `dag-compute-waves`)

**Summary**: Build `servers/dag/` per `skill/server-authoring`'s standard shape — pure logic (`buildGraph`, `validate`, `computeWaves`) in `logic.js`, a thin MCP protocol wrapper in `index.js`, tests at unit/integration/MCP-protocol layers. Agents declare the tools directly in their `tools`/`approved_tools` fields as `@dag/dag-validate` and `@dag/dag-compute-waves`, installed and registered the same way every other MCP server in this framework already is.
**Strengths**: Every harness this framework targets (Kiro, Claude Code, Copilot, per the plan's Harness Constraints table) can invoke tools via the same `@server/tool` convention — no per-harness translation logic needed. Any agent gains access simply by declaring the tool in its YAML, without touching the implementation. Reuses infrastructure this repo already built and validated (`servers/`, `skill/server-authoring`, the install/registration pipeline) instead of adding a second tool-provisioning mechanism alongside it. Input/output is schema-typed (zod), so malformed `chunks.json` input fails predictably rather than producing an ambiguous shell exit code an agent has to interpret.
**Weaknesses**: Heavier scaffold than a script — a full `servers/{name}/` folder with three test layers (unit, integration, MCP protocol), a `package.json`, and an `@modelcontextprotocol/sdk` dependency, versus a single file.
**Verdict**: Chosen.

### Option B: Standalone script invoked via the generic `shell` tool

**Summary**: A single Node script (e.g. `scripts/dag.js validate chunks.json` / `scripts/dag.js compute-waves chunks.json`) that any agent with `shell` access invokes directly, parsing its stdout/exit code.
**Strengths**: Minimal scaffold — one file, no protocol SDK dependency, no server registration step. Trivial to run ad hoc outside an agent session for debugging.
**Weaknesses**: Every consuming agent needs `shell` access broadly (already true for most agents here, but it's a wider grant than a single named tool) and has to parse unstructured stdout/exit-code conventions instead of a typed response — errors are string-shaped, not schema-shaped, so a subtly malformed `chunks.json` is more likely to be misinterpreted by the calling agent than to fail loudly. Does not benefit from the `@server/tool` discoverability convention — an agent's YAML `tools` list would just say `shell`, giving no signal that DAG capability exists without reading the script itself.
**Verdict**: Not chosen — trades a one-time scaffolding cost for a permanently weaker contract between the tool and its callers, on logic that specifically needs a hard-fail contract (an unvalidated or miscomputed DAG must not silently proceed).

### Option C: Logic embedded inline in the orchestration/planning skill (no separate tool at all)

**Summary**: Instead of a callable tool, `skill/epic-planning` and `skill/chunk-orchestration` would contain prose/pseudocode instructions telling Tech-Lead and Engineering-Manager how to manually validate acyclicity and compute waves by reasoning over `chunks.json` themselves.
**Strengths**: Zero new code, zero new dependency, nothing to install or register.
**Weaknesses**: Directly violates the determinism constraint — cycle detection and topological sort are exactly the kind of task an LLM can get subtly wrong on a large or oddly-shaped graph, and a wrong wave computation means chunks get dispatched out of dependency order. No single implementation to fix if the algorithm needs a correction; the fix would mean editing prose in two skills and hoping both agents apply it identically.
**Verdict**: Not chosen — reintroduces the exact class of non-determinism this decision exists to avoid, for the cheapest possible short-term saving.

---

## Decision

**Chosen approach**: Option A — MCP server exposing `dag-validate` and `dag-compute-waves` as typed tools, following the framework's standard `skill/server-authoring` shape.

**Rationale**: MCP is the one tool-invocation surface this framework's harness targets (Kiro, Claude Code, Copilot) can all consume through the same `@server/tool` declaration and the same install/registration pipeline already built for other servers (`gmail`) — building a second, script-based convention alongside it would fragment "how an agent gets a capability" into two patterns for no benefit. The determinism requirement rules out Option C outright: graph algorithms need to be *computed*, not reasoned about token-by-token. Against Option B, the deciding factor is contract strength, not raw cost — this logic gates whether chunks dispatch in valid dependency order, so a typed, schema-validated response that fails loudly on bad input is worth the heavier scaffold over a script whose failure mode is "an agent misreads stdout."

**Trade-offs accepted**:
- Three-layer test suite and `@modelcontextprotocol/sdk` dependency for a comparatively small amount of pure logic (`buildGraph`/`validate`/`computeWaves`). Accepted because it's the same fixed cost every server in this framework already pays, not a cost specific to this decision.
- The DAG capability requires an explicit install/registration step per harness rather than "just being a checked-in script anyone can run." Accepted because that step is exactly what makes the capability uniformly discoverable and installable across harnesses — the property Option B would have given up.

---

## Design

`servers/dag/` follows `skill/server-authoring`'s standard shape:
- `logic.js` — pure functions (`buildGraph`, `validate`, `computeWaves`), no protocol awareness.
- `index.js` — thin MCP entry point; registers `dag-validate` and `dag-compute-waves`, connects stdio transport.
- Input: `chunks.json`, produced by Tech-Lead during Epic decomposition, at `plans/{ProjectName}/{EpicID}/chunks.json`.
- No external graph library — pure JS today, deliberately kept swappable behind the same tool interface if a library becomes warranted later (e.g. for visualization).

---

## Impact on Planning

- No new Epic required — this record documents an already-implemented capability. Nothing changes in `servers/dag/` as a result of this decision.
- **General guidance for future cross-harness deterministic-logic needs**: when a capability must (a) produce identical results across every harness this framework targets, (b) be deterministic/algorithmic rather than reasoned about, and (c) be callable by more than one agent, default to `skill/server-authoring`'s MCP pattern rather than a script invoked via `shell`. Treat a script as acceptable only when the capability is single-agent, non-deterministic-tolerant, or genuinely just a thin wrapper around an already-external CLI the agent needs raw pass-through access to.
- **Audit finding, not decided here**: this framework has at least one existing cross-harness tool that does *not* follow the MCP pattern and arguably should be evaluated against it — `ai-git` (invoked via the generic `shell` tool by Software-Engineer, Engineering-Manager, and referenced throughout git-workflow steering as the mandatory git/GitHub wrapper for identity injection and credential handling). It satisfies (a) and (c) above, and its credential-handling responsibility (per `steering/engineering/git-workflow-*.md` Rule 7/8, "never log or echo the token value") is exactly the kind of contract that benefits from a typed tool boundary rather than shell stdout parsing. `aif index -d` and other `aif` CLI subcommands invoked by decision-authoring skills are a smaller, secondary instance of the same pattern. This decision does not resolve whether either should move to MCP — that determination, and its own options-exploration, belongs to a follow-up Decision Record scoped specifically to `ai-git`, so as not to expand this record's scope beyond the DAG tool it was written to document.

---

## Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | Why was DAG validation/wave-computation built as an MCP server rather than a script? | Harness-agnostic invocation via the existing `@server/tool` convention, a hard determinism requirement that rules out prompt-embedded reasoning, and a stronger typed-failure contract than a script's stdout/exit-code convention would give. |
| 2 | Should this pattern generalize to other shared, deterministic, cross-harness logic? | Yes, as default guidance — see Impact on Planning. |
| 3 | Does this decision resolve whether `ai-git` or `aif` CLI subcommands should become MCP servers? | No — flagged as a follow-up audit item for its own Decision Record, not decided here. |
