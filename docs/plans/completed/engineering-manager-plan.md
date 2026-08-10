# Plan: Engineering Manager Agent

## Metadata

| Field | Value |
|---|---|
| Status | Complete |
| Author (Agent) | AI Engineer |
| Approved By | Jeremy |
| Created | 2026-08-03 21:32 |
| Last Updated | 2026-08-07 13:01 |

---

## Progress

| Phase | Description | Status | Commit |
|---|---|---|---|
| 0 | DAG-ready planning | ✅ Complete | `40a6f56` |
| 1 | DAG MCP server | ✅ Complete | `f29d00e` |
| 2 | Tool mapping (`subagent`) | ✅ Complete | `213a0e4` |
| 3 | State schema | ✅ Complete | `5122a17` |
| 4 | Orchestration skill | ✅ Complete | `f5ce261` |
| 5 | Agent definition | ✅ Complete | `50319c0` |
| 6 | Validation | ✅ Complete | — |

---

## Goal

Create a new `engineering-manager` agent in the engineering domain that autonomously orchestrates parallel chunk plan execution across engineering agents, using harness-agnostic patterns limited to the lowest common denominator across Kiro, Claude Code, and Copilot.

---

## Harness Constraints (lowest common denominator)

| Capability | Kiro | Claude Code | Copilot | LCD |
|---|---|---|---|---|
| Parallel subagents | 4 | Unlimited | Multiple | **4 max** |
| DAG support | Built-in | Manual | Manual | **Manual (orchestrator manages)** |
| Review loops | Built-in | Manual | Manual | **Manual (orchestrator manages)** |
| Named agent dispatch | Yes | Yes | Yes | **Yes** |
| Subagent tool name | `subagent` | `Agent` | TBD | **Mapped via adapter** |

Design constraints:
- Max 4 concurrent subagents per wave
- Orchestrator manages DAG and loops explicitly (no reliance on harness-native DAG/loop features)
- Dispatch via generic `subagent` tool, mapped per-harness by adapter

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `skills/epic-planning/SKILL.md` | Modify | Add DAG validity requirement, reference chunks.json |
| `skills/epic-planning/reference/template.md` | Modify | Section 8 references chunks.json instead of inline table |
| `skills/epic-planning/reference/chunks-schema.md` | Create | Documents the chunks.json file format |
| `agents/tech-lead.yaml` | Modify | Add DAG validity to hard rules, add `dag` server tools |
| `servers/dag/dag.yaml` | Create | MCP server definition |
| `servers/dag/index.js` | Create | Server implementation (parseChunksFile, buildGraph, validate, computeWaves) |
| `agents/engineering-manager.yaml` | Create | New agent definition, references `dag` server |
| `skills/chunk-orchestration/SKILL.md` | Create | Execution procedure |
| `skills/chunk-orchestration/reference/state-schema.md` | Create | Tracking artifact format |
| `lib/harnesses/kiro.js` | Modify | Add `subagent` tool mapping |
| `lib/harnesses/claude.js` | Modify | Add `subagent` → `Agent` mapping |

---

## Design Decisions

### DAG Implementation
- MCP server (`servers/dag/`) exposing `dag-validate` and `dag-compute-waves` tools.
- Input format: `chunks.json` — a dedicated JSON file produced by Tech-Lead during epic decomposition. Stored at `plans/{ProjectName}/{EpicID}/chunks.json`.
- Available to any agent that declares the server — Tech-Lead uses `dag-validate` when producing epics, Engineering-Manager uses `dag-compute-waves` when orchestrating.
- No external library. Pure JS implementation.
- Trivially replaceable with a library later if visualization is needed (tool interface stays the same).

### Per-Chunk Pipeline
```
Software-Engineer implements on branch
    │
    ▼
Test-Engineer writes/runs tests on same branch
    │
    ▼
Principal-Engineer reviews on same branch
    │
    ├── APPROVED → chunk is Done
    └── NEEDS_CHANGES → back to Software-Engineer (max 5 iterations, then escalate)
```

### Wave Execution
- Dependency graph from Epic Section 8 forms waves via topological sort
- Within a wave, up to 4 chunks run their full SE → TE → PE pipelines concurrently
- Excess chunks queued, dispatched as slots free up
- Next wave blocked until all current wave chunks are Done

### Branch Naming
`{epic-id}/{chunk-number}-{short-description}`

### Human Touchpoints
- Merging to main (steering rule — separate agent handles PR creation)
- Escalation when review loops exhaust 5 iterations
- Resolving merge conflicts between parallel chunk branches

---

## Implementation Phases

### Phase 0: DAG-ready planning
Update epic-planning skill and template so Tech-Lead produces a valid, machine-parseable DAG. Add DAG validity to Tech-Lead's hard rules. Standardize dependency notation in Section 8.

### Phase 1: DAG MCP server
Create `servers/dag/` — server definition (`dag.yaml`) and implementation (`index.js`). Exposes `dag_validate` and `dag_compute_waves` tools. Pure functions internally (buildGraph, validate, computeWaves). Unit tests for the logic, integration test for the server.

### Phase 2: Tool mapping
Add `subagent` to the tool maps in Kiro and Claude Code adapters. Update adapter tests.

### Phase 3: State schema
Create `skills/chunk-orchestration/reference/state-schema.md` defining the execution state artifact format (chunk status table, current wave, escalations).

### Phase 4: Orchestration skill
Create `skills/chunk-orchestration/SKILL.md` — full procedure: call `dag-compute-waves`, dispatch per wave, monitor pipeline (SE → TE → PE with 5-iteration loop cap), gate waves, update state, escalate on failure.

### Phase 5: Agent definition
Create `agents/engineering-manager.yaml` with prompt, tools (`subagent`, `read`, `write`, `grep`, `glob`, `@dag/dag-compute-waves`), skill reference to `skill/chunk-orchestration`. No web access.

### Phase 6: Validation
Validation tests for schema compliance and cross-references. Run full suite.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Parallel branch conflicts (same file in two chunks) | Merge failures | Orchestrator detects from chunk plan Section 6 before dispatch, warns/serializes |
| Context limits on complex epics | Orchestrator loses track | State persisted to file, read back rather than relying on memory |
| Review loop stalls (PE/SE disagree) | Chunk never completes | Max 5 iterations then human escalation |

---

## Out of Scope

- CLI commands for orchestration visualization or progress dashboards
- PR creation (separate agent)
- Modifications to how SE/TE/PE operate internally
- Changes to chunk-planning template (already has dependency fields)
- Multi-epic coordination (one orchestrator instance per epic)

---

## References

### Subagent / Harness
- [Kiro subagent docs](https://kiro.dev/docs/cli/chat/subagents/)
- [Claude Code subagent SDK docs](https://code.claude.com/docs/en/agent-sdk/subagents)
- [GitHub Copilot custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)

### DAG Concepts & Algorithms
- [Databricks: What is a DAG?](https://www.databricks.com/blog/what-is-dag) — Clear conceptual explainer of directed, acyclic, graph properties
- [MIT/LibreTexts: DAGs and Scheduling](https://eng.libretexts.org/Bookshelves/Computer_Science/Programming_and_Computation_Fundamentals/Mathematics_for_Computer_Science_(Lehman_Leighton_and_Meyer)/02:_Structures/09:_Directed_graphs_and_Partial_Orders/9.05:_Directed_Acyclic_Graphs_and_Scheduling) — Formal math: partial orders, critical paths, parallel scheduling
- [Topological Sort Explained from First Principles](https://www.codeintuition.io/blogs/topological-sort-explained) — Intuition-first walkthrough of dependency resolution
- [Baeldung: Topological Sort of a DAG](https://www.baeldung.com/cs/dag-topological-sort) — Kahn's algorithm (BFS) and DFS approaches with pseudocode
- [Apache Airflow DAG concepts](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html) — Production DAG orchestrator; relevant patterns for scheduling and execution
