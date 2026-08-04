# Plan: Engineering Manager Agent

## Metadata

| Field | Value |
|---|---|
| Status | Approved |
| Author (Agent) | AI Engineer |
| Approved By | Jeremy |
| Created | 2026-08-03 21:32 |
| Last Updated | 2026-08-03 21:32 |

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
| `skills/epic-planning/SKILL.md` | Modify | Add DAG validity requirement |
| `skills/epic-planning/reference/template.md` | Modify | Tighten Section 8 format for machine-parseability |
| `agents/tech-lead.yaml` | Modify | Add DAG validity to hard rules |
| `lib/dag.js` | Create | Pure DAG utilities (buildGraph, validate, computeWaves) |
| `agents/engineering-manager.yaml` | Create | New agent definition |
| `skills/chunk-orchestration/SKILL.md` | Create | Execution procedure |
| `skills/chunk-orchestration/reference/state-schema.md` | Create | Tracking artifact format |
| `lib/harnesses/kiro.js` | Modify | Add `subagent` tool mapping |
| `lib/harnesses/claude.js` | Modify | Add `subagent` → `Agent` mapping |

---

## Design Decisions

### DAG Implementation
- No external library. Pure JS implementation (~30 lines).
- Interface: `buildGraph(chunks)`, `validate(graph)`, `computeWaves(graph)`
- Trivially replaceable with a library later if visualization is needed (interface stays the same).

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

### Phase 1: DAG utility module
Create `lib/dag.js` — pure functions for `buildGraph`, `validate` (cycle detection, missing refs), `computeWaves` (topological sort grouped by depth). Unit tests.

### Phase 2: Tool mapping
Add `subagent` to the tool maps in Kiro and Claude Code adapters. Update adapter tests.

### Phase 3: Agent definition
Create `agents/engineering-manager.yaml` with prompt, tools (`subagent`, `read`, `write`, `grep`, `glob`), and skill reference to `skill/chunk-orchestration`.

### Phase 4: State schema
Create `skills/chunk-orchestration/reference/state-schema.md` defining the execution state artifact format.

### Phase 5: Orchestration skill
Create `skills/chunk-orchestration/SKILL.md` — full procedure: parse DAG, compute waves, dispatch, monitor pipeline (SE → TE → PE with 5-iteration loop cap), gate waves, update state, escalate on failure.

### Phase 6: Validation
Write tests — unit tests for DAG module, validation tests for schema compliance and cross-references. Run full suite.

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

- [Kiro subagent docs](https://kiro.dev/docs/cli/chat/subagents/)
- [Claude Code subagent SDK docs](https://code.claude.com/docs/en/agent-sdk/subagents)
- [GitHub Copilot custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)
