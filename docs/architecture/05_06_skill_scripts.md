---
section: '05.06'
title: 'Skill scripts'
lifecycle: published
tags: [skills, scripts]
key_files:
  - skills/oversight/scripts/resolve.js
  - skills/standards/scripts/resolve.js
  - skills/findings/scripts/findings.js
---

> Deterministic procedures that ship inside a skill folder, so an agent runs them instead of re-deriving the logic.

## Overview Diagram

```mermaid
graph TD
  Agent["Engineer agent"]
  Oversight["oversight/scripts/resolve.js"]
  Standards["standards/scripts/resolve.js"]
  Findings["findings/scripts/findings.js"]
  Config[".aiconfig.json"]
  Defaults["lib/aiconfig-defaults.js"]
  Std["standards/*.md"]
  GH["GitHub issues (via ai-git gh-api)"]

  Agent --> Oversight & Standards & Findings
  Oversight --> Config
  Standards --> Config & Std
  Findings --> GH
  Oversight -.defaults kept equal by a test.-> Defaults
  Standards -.defaults kept equal by a test.-> Defaults
```

## Motivation

Skills install as whole folders into the harness's skills directory, away from this repo's `node_modules`, with no executable bit. A script that ships in a skill must therefore be a plain `node scripts/x.js` with **zero dependencies**, so it cannot import from `lib/`. The cost is that a few defaults exist twice (`oversight.default`, `oversight.enforced`, `project_standards`); unit tests assert they equal `lib/aiconfig-defaults.js`.

## Contained Building Blocks

| Script                                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Interface                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/oversight/scripts/resolve.js` | Resolves the effective oversight level from `.aiconfig.json` and an optional requested level; an enforced setting only lets a request raise the level. Fails closed on an invalid value.                                                                                                                                                                                                                                                                                                                                                                          | `resolveOversight()`, CLI `--request`, `--config`                                                                                                 |
| `skills/standards/scripts/resolve.js` | Tag-matches standards (looked up in `./standards`, then the project-scope `./.claude/standards` and `./.kiro/standards`, then the home-directory copies) against the project's `standards` tags, adds the `depends_on` closure dependencies-first, and appends the optional project override last when it exists.                                                                                                                                                                                                                                                 | `resolveStandards()`, `projectOverridePath()`, CLI `--json`                                                                                       |
| `skills/findings/scripts/findings.js` | Builds a path → findings map from open GitHub issues labelled `finding`, looks it up by path, files a finding (requiring an S, M, or L `--effort`) by commenting on a matching one or opening a new issue, and picks a `batch` of open findings to fix in one PR: a main group of up to 5 findings of size M or smaller (`--max`; `--include-large` admits L), then S findings in the same areas up to 15 more (`--max-simple`), ordered by severity, then size, then age, and never splitting findings that share a file. The only script with a network effect. | `buildMap()`, `lookup()`, `planFiling()`, `planBatch()`, `isSimple()` (what counts as an S finding), `runAiGit()`, CLI `[paths]`, `file`, `batch` |

The decision logic in each script is pure and unit-tested; only `main()` and a few thin helpers touch the filesystem or `ai-git gh-api`. `runAiGit()` runs `ai-git` without a shell; on Windows `resolveAiGit()` launches the npm shim's node script directly, so user text is never re-parsed, and failures report the spawn error and exit status (`describeSpawnFailure()`).

## Consumers

The `engineer` agent runs them through `skill/oversight`, `skill/standards` and `skill/findings`. Findings makes GitHub Issues a runtime data store for agents, unlike the CLI, which has no runtime GitHub dependency (§3).
