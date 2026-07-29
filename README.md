# AI Foundation

A framework for structured AI-assisted software development using a team of specialized agents.
Defines agent roles, planning artifacts, coding standards, and a self-improving feedback loop.

Designed to work with any AI agent harness (Kiro, Cursor, Copilot, LangGraph, AutoGen, etc.)
by keeping all agent definitions, rules, and artifact formats as plain markdown files.

---

## What This Is

A set of portable, harness-agnostic documents that define:

- **Who** does what — named agent roles with explicit responsibilities and hard rules
- **What** they produce — standardized artifact formats for plans, decisions, reviews, and tests
- **How** quality is enforced — security, logging, and standards rules baked into every artifact
- **How** work grows over time — a feedback loop from outcomes back into agent improvement

Everything is markdown. Nothing is tied to a specific tool.

---

## Agent Roster

| Agent | Role |
|---|---|
| [Architect](agents/architect.md) | Technical decision-making, option exploration, Decision Records |
| [Tech-Lead](agents/tech-lead.md) | Epic and Chunk Plan authoring, decomposition, parallelization |
| [Software-Engineer](agents/software-engineer.md) | Implementation and correction of review findings |
| [Principal-Engineer](agents/principal-engineer.md) | Code review, security enforcement, standards verification |
| [Test-Engineer](agents/test-engineer.md) | Test authoring and execution |
| [Engineering-Tech-Writer](agents/engineering-tech-writer.md) | Inline docs, README updates, CHANGELOG |

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

## Artifact Formats

| Artifact | File | Description |
|---|---|---|
| Epic Plan | [epic-plan-format.md](epic-plan-format.md) | Full feature scope, human-reviewable |
| Chunk Plan | [plan-artifact-format.md](plan-artifact-format.md) | Agent-executable, parallelizable |
| Decision Record | Embedded in [architect.md](agents/architect.md) | Technical decision + rationale |
| Review Report | Embedded in [principal-engineer.md](agents/principal-engineer.md) | Findings by severity |
| Test Results | Embedded in [test-engineer.md](agents/test-engineer.md) | Pass/fail per test case |

---

## Standards

Standards files populate the security, logging, testing, and documentation sections
of every plan. They are composed in layers:

```
Universal schema (plan-artifact-format.md)
    + Language/stack standards (standards/{stack}.md)
        + Project standards (projects/{name}/project-standards.md)
```

| File | Applies To |
|---|---|
| [standards/csharp-avalonia.md](standards/csharp-avalonia.md) | C# / .NET / Avalonia / ReactiveUI projects |
| [projects/_template/project-standards.md](projects/_template/project-standards.md) | Copy per project and fill in |

---

## Directory Structure

```
ai-foundation/
├── README.md                              ← This file
├── architecture-scoping.md               ← Decisions made in setting up this framework
├── epic-plan-format.md                   ← Epic Plan artifact schema
├── plan-artifact-format.md               ← Chunk Plan artifact schema
├── agents/
│   ├── architect.md
│   ├── tech-lead.md
│   ├── software-engineer.md
│   ├── principal-engineer.md
│   ├── test-engineer.md
│   └── engineering-tech-writer.md
├── standards/
│   └── csharp-avalonia.md
└── projects/
    └── _template/
        └── project-standards.md
```

Plans and decisions for specific projects live in the project's own repository,
not here. This repo is the framework only.

---

## Future / Planned

- **Plan Reviewer agent** — reviews Epic and Chunk Plans before human approval
- **Epic QA agent** — broad end-to-end acceptance verification across a completed Epic
- **Product domain agents** — PRD authoring, UX, product decision-making
- **Self-improvement pipeline** — outcome logging, evaluation, prompt evolution
- **Context and memory layer** — RAG over codebase, episodic memory of past tasks

---

## Using This With an AI Harness

Each agent definition in `agents/` is structured to be usable as a system prompt
or agent instruction file. The key sections are:

- **Purpose** — what the agent is for
- **Hard Rules** — non-negotiable constraints to enforce strictly
- **Process** — the steps the agent follows
- **Inputs / Outputs** — what it reads and what it produces

To configure an agent in your harness, point it at the relevant `agents/*.md` file
and the applicable `standards/` and `projects/` files for context.
