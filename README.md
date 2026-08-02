# AI Foundation

A portable, harness-agnostic framework for AI-assisted software development.
Defines agent roles, reusable procedures, enforced rules, and coding standards
as plain files that any AI harness can load.

Works with Kiro, Copilot, Claude Code, or any tool that can inject text into
an agent's context.

---

## What This Is

A structured framework that defines:

- **Who** does what — named agent roles with explicit responsibilities and prompts
- **What procedures they follow** — skills that define reusable step-by-step processes
- **What rules govern them** — steering files that enforce behaviour unconditionally
- **What reference material they draw on** — standards and knowledge files

Nothing here is tied to a specific AI harness. Everything is plain text.

---

## Agent Roster

| Agent | Role |
|---|---|
| AI-Engineer | AI infrastructure — agents, skills, steering, servers, tooling |
| Architect | Technical decision-making, option exploration, Decision Records |
| Tech-Lead | Epic and Chunk Plan authoring, decomposition, parallelization |
| Software-Engineer | Implementation and correction of review findings |
| Principal-Engineer | Code review, security enforcement, standards verification |
| Test-Engineer | Test authoring and execution |
| Engineering-Tech-Writer | Inline docs, README updates |

Agent definitions live in `agents/`. Each has a `.yaml` file and optionally a `.md` companion.

---

## Planning Flow

```
[Optional]
Architect  →  Decision Record
                    ↓
             Tech-Lead  →  Epic Plan  →  [Human Approval]
                                ↓
                          Chunk Plans  →  [Human Approval]
                                ↓
                     ┌──────────┴──────────┐
               Software-Engineer     Software-Engineer  (parallel chunks)
                          ↓
                  Principal-Engineer  (review)
                          ↓ (findings → correct → re-review)
                    Test-Engineer
                          ↓
              Engineering-Tech-Writer
                          ↓
                   [Human Sign-off]
```

---

## Directory Structure

```
ai-foundation/
├── AGENTS.md                        ← Entry point for AI agents
├── README.md                        ← This file (human reference)
├── agents/                          ← Agent definitions (.yaml + optional .md)
├── skills/                          ← Reusable procedures (folders with SKILL.md)
│   ├── agent-authoring/
│   ├── skill-authoring/
│   ├── steering-authoring/
│   ├── server-authoring/
│   ├── bundle-authoring/
│   └── ...
├── steering/                        ← Always-on rules
│   ├── global/                      ← All agents
│   └── engineering/                 ← Engineering-domain agents
├── standards/                       ← Prescriptive coding/stack rules
├── servers/                         ← MCP tool server definitions
├── bundles/                         ← Install bundles (per-harness deployment)
├── docs/                            ← Decision records
├── bin/                             ← CLI entry point (aif)
├── lib/                             ← CLI modules
├── tests/                           ← unit/, integration/, validation/
└── projects/                        ← Per-project overrides
```

---

## Component Types

| Type | Format | Purpose | Authoring |
|---|---|---|---|
| Agent | `.yaml` | Named persona with role, prompt, tools, skills | `skill/agent-authoring` |
| Skill | folder with `SKILL.md` | Reusable step-by-step procedure | `skill/skill-authoring` |
| Steering | `.md` | Always-on rules enforced unconditionally | `skill/steering-authoring` |
| Server | `.yaml` | MCP tool provider definition | `skill/server-authoring` |
| Bundle | `.yaml` | What components to install per harness | `skill/bundle-authoring` |
| Standards | `.md` | Prescriptive coding/stack rules | — |

See `AGENTS.md` for loading rules and quick-reference schemas.

---

## Installation

Components are installed to harnesses using the `aif` CLI. Installs are copies
(transformed where needed), tracked by a manifest for clean uninstall/update.

```bash
aif install --bundle engineering --harness kiro
aif uninstall --bundle engineering --harness kiro
aif status
aif list bundles
```

| Harness | Status | Transform |
|---|---|---|
| Kiro | Supported | YAML agents → JSON, steering frontmatter rewritten |
| Copilot | Planned | → `.instructions.md` with `applyTo` |
| Claude Code | Planned | → `.claude/rules/` with `paths` |

---

## Testing

```bash
node --test "tests/unit/**/*.test.js"          # Fast, no I/O
node --test "tests/integration/**/*.test.js"   # Filesystem tests
node --test "tests/validation/**/*.test.js"    # Real repo checks
```

Requires Node.js 20+. Single dependency: `yaml` (`npm install`).

---

## Future / Planned

- **Work Log system** — persistent tracking of agent activity for audit
- **Task/progress tracking** — chunk status across Epics
- **Self-improvement pipeline** — outcome logging, evaluation, prompt evolution
- **CI/CD pipeline** — automated test runs on push
- **Plan Reviewer agent** — reviews plans before human approval
- **Product domain agents** — PRD authoring, UX, product decisions
- **Context and memory layer** — RAG over codebase, episodic memory
