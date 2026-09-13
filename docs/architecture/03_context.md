---
section: "03"
title: "System Scope and Context"
lifecycle: published
last_verified: e066376
tags: [context, c4]
key_files:
  - bin/aif.js
  - lib/commands
---

> Who and what ai-foundation talks to, at the C4 System Context (L1) level.

## Context diagram

```mermaid
C4Context
  title ai-foundation — System Context

  Person(dev, "Human Developer", "Approves plans/ADRs, reviews and merges PRs")
  System(aif, "ai-foundation CLI (aif)", "Installs, validates, and indexes framework components")
  System_Ext(harness, "AI Harness", "Claude Code, Kiro, or any tool that loads installed agent/skill/steering files")
  System_Ext(project, "Target Project Repo", "Consumes installed components; holds its own .aiconfig.json and knowledge/decisions")
  System_Ext(github, "GitHub", "Hosts source, PRs, CI checks")

  Rel(dev, aif, "Runs install/validate/index")
  Rel(dev, github, "Reviews and merges PRs")
  Rel(aif, project, "Writes harness-native components into")
  Rel(harness, project, "Loads installed components from, at agent runtime")
  Rel(aif, github, "Reads/writes via git (source, not a runtime dependency)")
```

## External actors

| Actor | Interaction |
|---|---|
| Human developer | Runs `aif` commands directly; approves Feature Plans and ADRs; reviews and merges every PR — no agent merges to `main` (`steering/engineering/git-workflow-projects.md`). |
| AI harness (Claude Code, Kiro) | Loads the harness-native form of installed agents/skills/steering that `aif install` produced; not a build-time dependency of `aif` itself. |
| Target project repo | The repo `aif install` targets. Owns its own `.aiconfig.json`, `knowledge/`, and `plans/` — ai-foundation writes into it but does not run inside it as a service. |
| GitHub | Where this repo's own source, PRs, and CI live. Not a runtime dependency of the CLI (see §2 Constraints — no network at install time). |

## Out of scope here

Internal decomposition (agents/skills/steering/lib) is §5 Building Blocks, not
context — this section only covers ai-foundation's boundary with the outside world.
