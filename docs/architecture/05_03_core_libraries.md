---
section: '05.03'
title: 'Core libraries'
lifecycle: published
last_verified: bfba104
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
  - lib/aiconfig.js
  - lib/aiconfig-resolve.js
  - lib/aiconfig-defaults.js
---

> The harness-agnostic support libraries (`lib/*.js`, excluding `resolver.js`
> and `lib/harnesses/*`, each covered by their own §5.01/§5.02 expansion) that
> every command reuses — manifest tracking, snapshot diffing, decisions/
> architecture indexing, project scaffolding, and shared constants.

## Why this needs its own section

This is the largest single group in §5's "Core libraries" row — 13 files
across 7 responsibilities — and the one most likely to gain a new file as the
CLI grows. Giving it its own `key_files` list keeps the top-level §5 doc's own
list short enough that a rename or deletion there stays a meaningful signal,
while these files' individual freshness stays tracked here instead of silently
dropping out of `aif index architecture --check` coverage.

## Building blocks

| Block                                                          | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Interface                                                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `manifest.js`                                                  | Tracks every file `aif install` writes, per bundle/server/hook, in `.installs.yaml` — what `uninstall` reads to know what to remove.                                                                                                                                                                                                                                                                                                                                                               | `readManifest()`/`writeManifest()`, `get/set/removeEntry()`                                                |
| `snapshot/io.js` + `snapshot/pure.js`                          | Builds and diffs source-file-hash snapshots per bundle/server/hook to detect drift between installed output and current source.                                                                                                                                                                                                                                                                                                                                                                    | `buildSnapshot()`, `diffSnapshot()`, `isFreshnessCurrent()`                                                |
| `decisions.js`                                                 | Parses a `.decision.md` file's `## Metadata` table, builds/diffs the decisions index, inverts `Supersedes` into `superseded_by`. The parser reads that Markdown table, not YAML frontmatter — retargeting to MADR frontmatter is a pending, not yet landed, change.                                                                                                                                                                                                                                | `parseDecisionRecord()`, `buildDecisionIndex()`, `diffDecisionIndex()`                                     |
| `architecture.js`                                              | Parses arc42 section frontmatter, builds/diffs the architecture index, computes each doc's `stale` flag from `last_verified` vs. real git history of its `key_files`, and inverts `key_files` into a `source path → [docs]` reverse index.                                                                                                                                                                                                                                                         | `parseArchitectureSection()`, `buildArchitectureIndex()`, `diffArchitectureIndex()`, `isStaleAgainstGit()` |
| `index-diff.js`                                                | Generic index-entry structural comparison (sorts any array-valued field before comparing) — no decision or architecture domain knowledge, just the diffing primitive both `decisions.js` and `architecture.js` diff against.                                                                                                                                                                                                                                                                       | `entriesEqual()`                                                                                           |
| `project-init.js`                                              | Validates project name/shortname, generates `.aiconfig.json` content, applies template placeholder substitution.                                                                                                                                                                                                                                                                                                                                                                                   | `buildAiConfig()`, `applyProjectConfig()`                                                                  |
| `ai-git.js`                                                    | Pure logic behind the `ai-git` CLI: identity resolution, env injection, gh-command detection and auth-arg construction.                                                                                                                                                                                                                                                                                                                                                                            | `getIdentity()`, `buildGitEnv()`, `buildGhEnv()`                                                           |
| `constants.js` / `component-defs.js`                           | Shared constants (canonical tool names, source directories, CLI command list) and JSDoc-only `AgentDef`/`ServerDef` type shapes — no runtime behavior, just a single owner for both.                                                                                                                                                                                                                                                                                                               | `TOOLS`, `SOURCE_DIRS`, `COMMANDS`                                                                         |
| `aiconfig.js` / `aiconfig-resolve.js` / `aiconfig-defaults.js` | Resolves a `.aiconfig.json` field to its configured value or documented default, without ever writing a default back to disk. `aiconfig-defaults.js` owns the default table (some entries derive from another field's resolved value, e.g. `paths.decisions` nesting under `paths.knowledge`); `aiconfig-resolve.js` is the pure merge logic against a plain object; `aiconfig.js` is the I/O layer that reads `.aiconfig.json` off disk and also finds a project root by walking up for the file. | `getConfigValue()`, `getConfigPath()`, `findProjectRoot()`, `resolveConfigValue()`                         |

## Consumers

`lib/commands/*` is the primary caller of each library above — `install.js`/
`uninstall.js` use `manifest.js`; `snapshot.js` uses `snapshot/io.js`;
`index.js` uses `decisions.js`/`architecture.js` (both built on
`index-diff.js`) and `aiconfig.js` for path resolution; `init.js` uses
`project-init.js`; `config.js` uses `aiconfig.js` directly. `bin/ai-git.js` is
the sole caller of `ai-git.js`. `constants.js`/`component-defs.js` are
imported across nearly every module in `lib/` and `lib/commands/`.
