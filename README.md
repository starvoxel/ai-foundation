# AI Foundation

A portable, harness-agnostic framework for AI-assisted software development.
Defines agent roles, reusable procedures, enforced rules, and coding standards
as plain files that any AI harness can load.

Works with Kiro, Cursor, Copilot, LangGraph, AutoGen, or any tool that can
inject text into an agent's context.

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
| Architect | Technical decision-making, option exploration, Decision Records |
| Tech-Lead | Epic and Chunk Plan authoring, decomposition, parallelization |
| Software-Engineer | Implementation and correction of review findings |
| Principal-Engineer | Code review, security enforcement, standards verification |
| Test-Engineer | Test authoring and execution |
| Engineering-Tech-Writer | Inline docs, README updates, CHANGELOG |

Agent definitions live in `agents/`. Each agent has a `.yaml` file (canonical definition)
and optionally a `.md` companion for extended documentation.

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

Human review gates occur at three points:
1. After Epic Plan — approve scope before any chunks are written
2. After Chunk Plans — approve execution plan before any code is written
3. After Test-Engineer — sign off on the completed iteration

---

## Directory Structure

```
ai-foundation/
├── AGENTS.md                        ← Entry point for AI agents
├── README.md                        ← This file (human reference)
│
├── agents/                          ← Agent definitions (.yaml + optional .md)
│
├── skills/                          ← Reusable procedures agents invoke
│   ├── skill-authoring/             ← How to create new skills
│   ├── agent-authoring/             ← How to create new agents
│   └── ...
│
├── steering/                        ← Always-on rules applied to agents
│   ├── _template.md
│   ├── global/                      ← Applies to all agents
│   │   └── core.md
│   └── engineering/                 ← Applies to engineering-domain agents
│       └── core.md
│
├── standards/                       ← Prescriptive coding/stack rules
│   └── csharp-avalonia.md
│
├── servers/                         ← Tool server definitions (MCP, etc.)
│
├── bundles/                         ← Install bundles (what to deploy per harness)
│
├── docs/                            ← Decision records and documentation
│
├── bin/                             ← CLI entry point (aif)
├── lib/                             ← CLI modules
├── tests/                           ← Unit, integration, and validation tests
│
└── projects/                        ← Per-project overrides and standards
```

Plans and decisions for specific projects live in the project's own repository,
not here. This repo is the framework only.

---

## Component Types

| Type | Format | Purpose |
|---|---|---|
| Agent | `.yaml` (+ optional `.md`) | Named persona with role, prompt, tools, skills |
| Skill | `.md` with front-matter | Reusable step-by-step procedure |
| Steering | `.md` with front-matter | Always-on rules enforced unconditionally |
| Standards | `.md` | Prescriptive coding/stack rules |
| Knowledge | `.md` | Descriptive reference material |
| Server | `.yaml` (+ optional `.md`) | Tool provider definition (MCP, etc.) |

See `AGENTS.md` for full schemas, loading rules, and authoring guidelines.

---

## Standards

Standards files define prescriptive rules for a language or stack. Deviation requires
an explicit exception noted in the plan.

| File | Applies To |
|---|---|
| `standards/csharp-avalonia.md` | C# / .NET / Avalonia / ReactiveUI projects |
| `projects/_template/project-standards.md` | Copy per project and fill in |

---

## Installation

Agent definitions can be deployed to supported AI harnesses using the install script.
Uses **symlinks** so `git pull` automatically propagates updates — no reinstall needed.

```powershell
# Install to all detected harnesses (run as Administrator)
.\install.ps1

# Install to a specific harness only
.\install.ps1 -Harness Kiro
.\install.ps1 -Harness Copilot

# Preview what would happen without making changes
.\install.ps1 -DryRun

# Remove all installed symlinks/files
.\install.ps1 -Uninstall
```

| Harness | How it installs | Location |
|---|---|---|
| Kiro CLI | Symlinks `.md` files | `~/.kiro/agents/` |
| VS Code Copilot | Generates `.agent.md` wrapper files | `%APPDATA%/Code/User/globalStorage/github.copilot-chat/` |

> Requires running PowerShell as Administrator for symlink creation on Windows.

---

## Future / Planned

- **Work Log system** — persistent tracking of agent activity for audit and self-improvement
- **Task/progress tracking** — system to track chunk status (in progress, blocked, done) across Epics
- **Model selection per agent** — allow agents to declare preferred model in their definition
- **Self-improvement pipeline** — outcome logging, evaluation, prompt evolution
- **CI/CD pipeline** — automated test runs on push
- **Plan Reviewer agent** — reviews Epic and Chunk Plans before human approval
- **Epic QA agent** — broad end-to-end acceptance verification across a completed Epic
- **Product domain agents** — PRD authoring, UX, product decision-making
- **Context and memory layer** — RAG over codebase, episodic memory of past tasks
