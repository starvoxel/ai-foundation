---
section: "01"
title: "Introduction and Goals"
lifecycle: published
last_verified: e066376
tags: [overview]
key_files:
  - README.md
  - AGENTS.md
---

> What ai-foundation is, who it's for, and the quality goals its design serves.

## Requirements overview

ai-foundation is a portable, harness-agnostic framework for AI-assisted software
development. It defines agent roles, reusable procedures, enforced rules, and coding
standards as plain files — YAML agent definitions, Markdown skills/steering/standards,
JSON manifests — that any AI coding harness can load. A project adopts it by running
`aif install`, which copies and transforms the relevant components into that harness's
native format (e.g. Claude Code's `.claude/agents/`, Kiro's `.kiro/steering/`).

The framework itself is also the first consumer of its own conventions: this
repository's `.aiconfig.json`, `agents/`, `skills/`, and `docs/` follow the same
schemas a downstream project would, so changes here are validated by using them, not
just by describing them.

## Goals

| Priority | Goal | Motivation |
|---|---|---|
| 1 | Portability | One definition installs into multiple harnesses (Claude Code, Kiro today) without per-harness rewrites. |
| 2 | Vendor neutrality / single source of truth | "Define once, install anywhere" (README) — a project isn't locked into one AI tool's proprietary config format, and rule changes propagate from one place rather than being hand-copied per project. |
| 3 | Consistent enforcement across projects | The same agent roles, tool boundaries, and standards apply the same way in every project that installs them — not documentation each project's contributors reinterpret independently. |
| 4 | Minimal-dependency tooling | The CLI and its adapters stay plain Node.js with a small dependency footprint, so installing this framework doesn't itself become a supply-chain or portability liability. |

Process-level principles this repo follows for its own development (proportionate
ceremony, git as the durable record over accreting in-context artifacts, and so on)
are real, but they're goals of *how ai-foundation's own contributors work*, documented
in `docs/process-model.md` — not quality goals of the framework as a system, so they
don't belong in this table.

## Stakeholders

| Role | Concern |
|---|---|
| Human developer | Wants one set of AI-development rules that behaves identically across every project and harness they use, installed once and trusted rather than re-verified per project — while keeping final approval over anything AI-authored before it takes effect. |
| AI agent (see `agents/README.md` for the current roster) | Needs an unambiguous role, tool grant, and procedure to execute — consumes `agents/`, `skills/`, and `steering/` as its own operating definition, not just reference material. |
| Harness (Claude Code, Kiro, and any future one) | Needs a stable adapter contract (`lib/harnesses/*`) so its native format can be generated without component sources (`agents/`, `skills/`, …) needing harness-specific knowledge. |
