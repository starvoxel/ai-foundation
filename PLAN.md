# PLAN.md — AI Foundation Roadmap

Tracks what has been done and what is planned for the ai-foundation framework.

---

## Milestones

| Version | Name | Status |
|---|---|---|
| v0.1 | Framework Foundation | ✅ Complete |
| v1.0 | MVP | 🔲 In Progress |
| v1.1 | Observability | 🔲 Planned |
| v1.2 | Quality Gates | 🔲 Planned |
| v1.3 | Tooling | 🔲 Planned |
| v1.4 | Product Domain | 🔲 Planned |
| v2.0 | Self-Improving | 🔲 Planned |

---

## Feature Tracker

| Feature | Size | Milestone | Status |
|---|---|---|---|
| AGENTS.md (framework rules, schemas, loading order) | M | v0.1 | ✅ Done |
| Agent definitions (7 agents, YAML format) | L | v0.1 | ✅ Done |
| Skills system (5 skills with procedures + templates) | L | v0.1 | ✅ Done |
| Steering system (global + engineering domain) | M | v0.1 | ✅ Done |
| Git workflow steering (framework + projects) | S | v0.1 | ✅ Done |
| Standards file (C#/Avalonia) | S | v0.1 | ✅ Done |
| Server template + folder structure | S | v0.1 | ✅ Done |
| Install script (Kiro CLI + VS Code Copilot) | M | v0.1 | ✅ Done |
| Test suite (schemas, tools, unit tests — 85 tests) | M | v0.1 | ✅ Done |
| Shared test library (lib/test-helpers.js) | S | v0.1 | ✅ Done |
| Directory READMEs | S | v0.1 | ✅ Done |
| Harness integration (load agents + steering in real sessions) | M | v1.0 | 🔲 |
| Model selection per agent | S | v1.0 | 🔲 |
| Work Log system (persistent activity tracking) | M | v1.1 | 🔲 |
| Task/progress tracking (chunk status across Epics) | L | v1.1 | 🔲 |
| CI/CD pipeline (automated tests on push) | S | v1.1 | 🔲 |
| Plan Reviewer agent | M | v1.2 | 🔲 |
| Epic QA agent | M | v1.2 | 🔲 |
| Server integration (real MCP server) | M | v1.3 | 🔲 |
| Product domain agents (PRD, UX, product decisions) | L | v1.4 | 🔲 |
| Context and memory layer (RAG, episodic memory) | XL | v2.0 | 🔲 |
| Self-improvement pipeline (outcome logging, prompt evolution) | XL | v2.0 | 🔲 |

---

## Milestone Descriptions

### v0.1 — Framework Foundation ✅
Structure defined and validated. Agents, skills, steering, and tests exist as plain files.
Everything is portable and harness-agnostic.

### v1.0 — MVP
Agents load in a harness with steering applied. The planning flow works end-to-end
on a real project. Minimum needed to start using this for actual development.

### v1.1 — Observability
Track what happened (Work Log), what's in progress (task tracking), and catch
regressions automatically (CI/CD).

### v1.2 — Quality Gates
Automated plan review and epic-level QA agents reduce the burden on human reviewers.

### v1.3 — Tooling
MCP servers give agents capabilities beyond what the harness provides natively.

### v1.4 — Product Domain
Expand beyond engineering into product requirements, UX, and design feedback.

### v2.0 — Self-Improving
The system learns from outcomes, evolves prompts based on results, and builds
institutional memory across projects.
