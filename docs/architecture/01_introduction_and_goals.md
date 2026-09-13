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
| 2 | Vendor neutrality | "Define once, install anywhere" (README) — not locked to one AI tool's proprietary format. |
| 3 | Consistent enforcement | Same roles, tool boundaries, and standards apply identically wherever installed — not reinterpreted per project. |
| 4 | Minimal-dependency tooling | Plain Node.js, small dependency footprint — the framework itself avoids becoming a supply-chain or portability liability. |

## Stakeholders

| Role | Concern |
|---|---|
| Human developer | One set of AI-development rules, trusted across every project/harness; retains final approval over anything AI-authored. |
| AI agent (see `agents/README.md`) | An unambiguous role, tool grant, and procedure — `agents/`, `skills/`, `steering/` are its operating definition. |
| Harness (Claude Code, Kiro, future ones) | A stable adapter contract (`lib/harnesses/*`) so component sources need no harness-specific knowledge. |
