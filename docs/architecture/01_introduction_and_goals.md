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
| 2 | Proportionate ceremony | Process overhead should scale with what a change actually risks, not apply uniformly regardless of size — see `docs/process-model.md`. |
| 3 | Git as the source of truth | History, review, and audit trail live in git, not in accreting in-context records agents must re-read. |
| 4 | Minimal-dependency tooling | The CLI and its adapters stay plain Node.js with a small dependency footprint, so installing this framework doesn't itself become a supply-chain or portability liability. |

## Stakeholders

| Role | Concern |
|---|---|
| Human developer | Approves plans/decisions, reviews agent output, owns merge-to-main. |
| AI agent (see `agents/README.md` for the current roster) | Executes work within the roles and boundaries this framework defines. |
| Harness (Claude Code, Kiro) | Loads the installed, harness-native form of these components at runtime. |
