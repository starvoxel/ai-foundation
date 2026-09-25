---
section: '05.03'
title: 'Core libraries'
lifecycle: published
last_verified: 9b2a27c
tags: [building-blocks, core-libraries]
key_files:
  - lib/manifest.js
  - lib/snapshot/io.js
  - lib/snapshot/pure.js
  - lib/decisions.js
  - lib/architecture.js
  - lib/index-diff.js
  - lib/project-init.js
  - lib/ai-git.js
  - lib/constants.js
  - lib/component-defs.js
---

> The harness-agnostic support libraries (`lib/*.js`, excluding `resolver.js`
> and `lib/harnesses/*`, each covered by their own §5.01/§5.02 expansion) that
> every command reuses — manifest tracking, snapshot diffing, decisions/
> architecture indexing, project scaffolding, and shared constants.

## Why this needs its own section

This is the largest single group in §5's "Core libraries" row — 10 files
across 6 responsibilities — and the one most likely to gain a new file as the
CLI grows. Giving it its own `key_files` list keeps the top-level §5 doc's own
list short enough that a rename or deletion there stays a meaningful signal,
while these files' individual freshness stays tracked here instead of silently
dropping out of `aif index architecture --check` coverage.

## Building blocks

| Block                                 | Responsibility                                                                                                                                                                                                                                                                                                                                                                         | Interface                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `manifest.js`                         | Tracks every file `aif install` writes, per bundle/server/hook, in `.installs.yaml` — what `uninstall` reads to know what to remove.                                                                                                                                                                                                                                                   | `readManifest()`/`writeManifest()`, `get/set/removeEntry()`                                                |
| `snapshot/io.js` + `snapshot/pure.js` | Builds and diffs source-file-hash snapshots per bundle/server/hook to detect drift between installed output and current source.                                                                                                                                                                                                                                                        | `buildSnapshot()`, `diffSnapshot()`, `isFreshnessCurrent()`                                                |
| `decisions.js`                        | Parses an ADR's MADR frontmatter (`status`/`date`/`decision-makers`/`tags`/`links.supersedes`/`affects`), builds/diffs the flat decisions index, inverts `links.supersedes` into `superseded_by`. The ID is the filename's own zero-padded number, not a frontmatter field; collection is flat and non-recursive, so `docs/decisions/archive/`'s old-format records are never scanned. | `parseDecisionRecord()`, `buildDecisionIndex()`, `diffDecisionIndex()`                                     |
| `architecture.js`                     | Parses arc42 section frontmatter, builds/diffs the architecture index, computes each doc's `stale` flag from `last_verified` vs. real git history of its `key_files`, and inverts `key_files` into a `source path → [docs]` reverse index.                                                                                                                                             | `parseArchitectureSection()`, `buildArchitectureIndex()`, `diffArchitectureIndex()`, `isStaleAgainstGit()` |
| `index-diff.js`                       | Generic index-entry structural comparison (sorts any array-valued field before comparing) — no decision or architecture domain knowledge, just the diffing primitive both `decisions.js` and `architecture.js` diff against.                                                                                                                                                           | `entriesEqual()`                                                                                           |
| `project-init.js`                     | Validates project name/shortname, generates `.aiconfig.json` content, applies template placeholder substitution.                                                                                                                                                                                                                                                                       | `buildAiConfig()`, `applyProjectConfig()`                                                                  |
| `ai-git.js`                           | Pure logic behind the `ai-git` CLI: identity resolution, env injection, gh-command detection and auth-arg construction.                                                                                                                                                                                                                                                                | `getIdentity()`, `buildGitEnv()`, `buildGhEnv()`                                                           |
| `constants.js` / `component-defs.js`  | Shared constants (canonical tool names, source directories, CLI command list) and JSDoc-only `AgentDef`/`ServerDef` type shapes — no runtime behavior, just a single owner for both.                                                                                                                                                                                                   | `TOOLS`, `SOURCE_DIRS`, `COMMANDS`                                                                         |

## Consumers

`lib/commands/*` is the primary caller of each library above — `install.js`/
`uninstall.js` use `manifest.js`; `snapshot.js` uses `snapshot/io.js`;
`index.js` uses `decisions.js`/`architecture.js` (both built on
`index-diff.js`); `init.js` uses `project-init.js`. `bin/ai-git.js` is the
sole caller of `ai-git.js`. `constants.js` is imported across nearly every
module in `lib/` and `lib/commands/` (10 of 11 files); `component-defs.js`
is much narrower — its JSDoc-only types are referenced (via
`@param {import('./component-defs.js').X}` comments, never a runtime
`import`) only by the three `lib/harnesses/*` files, not repo-wide.
