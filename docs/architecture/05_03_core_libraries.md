---
section: '05.03'
title: 'Core libraries'
lifecycle: published
last_verified: 11b4da8
tags: [building-blocks, core-libraries]
key_files:
  - lib/manifest.js
  - lib/snapshot/io.js
  - lib/snapshot/pure.js
  - lib/project-init.js
  - lib/ai-git.js
  - lib/constants.js
  - lib/component-defs.js
  - lib/aiconfig.js
  - lib/aiconfig-resolve.js
  - lib/aiconfig-defaults.js
---

> The remaining harness-agnostic support libraries (`lib/*.js`, excluding
> `resolver.js`, `lib/harnesses/*`, and the decisions/architecture indexing pair,
> each covered by their own §5.01/§5.02/§5.04 expansion) that every command
> reuses — manifest tracking, snapshot diffing, project scaffolding, and shared
> constants.

## Why this needs its own section

This is still the largest heterogeneous group in §5's "Core libraries" row — 10
files across 5 unrelated responsibilities, and the one most likely to gain a new
file as the CLI grows. Giving it its own `key_files` list keeps the top-level §5
doc's own list short enough that a rename or deletion there stays a meaningful
signal, while these files' individual freshness stays tracked here instead of
silently dropping out of `aif index architecture --check` coverage.
`decisions.js`/`architecture.js`/`index-diff.js` used to live in this table too,
but at 583 lines together — more than `resolver.js`'s own §5.01 — and sharing a
real, cohesive pipeline shape, they outgrew a single row; see §5.04.

## Building blocks

| Block                                                          | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Interface                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `manifest.js`                                                  | Tracks every file `aif install` writes, per bundle/server/hook, in `.installs.yaml` — what `uninstall` reads to know what to remove.                                                                                                                                                                                                                                                                                                                                                               | `readManifest()`/`writeManifest()`, `get/set/removeEntry()`                        |
| `snapshot/io.js` + `snapshot/pure.js`                          | Builds and diffs source-file-hash snapshots per bundle/server/hook to detect drift between installed output and current source.                                                                                                                                                                                                                                                                                                                                                                    | `buildSnapshot()`, `diffSnapshot()`, `isFreshnessCurrent()`                        |
| `project-init.js`                                              | Validates project name/shortname, generates `.aiconfig.json` content, applies template placeholder substitution.                                                                                                                                                                                                                                                                                                                                                                                   | `buildAiConfig()`, `applyProjectConfig()`                                          |
| `ai-git.js`                                                    | Pure logic behind the `ai-git` CLI: identity resolution, env injection, gh-command detection and auth-arg construction.                                                                                                                                                                                                                                                                                                                                                                            | `getIdentity()`, `buildGitEnv()`, `buildGhEnv()`                                   |
| `constants.js` / `component-defs.js`                           | Shared constants (canonical tool names, source directories, CLI command list) and JSDoc-only `AgentDef`/`ServerDef` type shapes — no runtime behavior, just a single owner for both.                                                                                                                                                                                                                                                                                                               | `TOOLS`, `SOURCE_DIRS`, `COMMANDS`                                                 |
| `aiconfig.js` / `aiconfig-resolve.js` / `aiconfig-defaults.js` | Resolves a `.aiconfig.json` field to its configured value or documented default, without ever writing a default back to disk. `aiconfig-defaults.js` owns the default table (some entries derive from another field's resolved value, e.g. `paths.decisions` nesting under `paths.knowledge`); `aiconfig-resolve.js` is the pure merge logic against a plain object; `aiconfig.js` is the I/O layer that reads `.aiconfig.json` off disk and also finds a project root by walking up for the file. | `getConfigValue()`, `getConfigPath()`, `findProjectRoot()`, `resolveConfigValue()` |

## Consumers

`lib/commands/*` is the primary caller of each library above — `install.js`/
`uninstall.js` use `manifest.js`; `snapshot.js` uses `snapshot/io.js`; `init.js`
uses `project-init.js`; `index.js` uses `aiconfig.js` for path resolution (see
§5.04 for `decisions.js`/`architecture.js` themselves); `config.js` uses
`aiconfig.js` directly. `bin/ai-git.js` is the sole caller of `ai-git.js`.
`constants.js` is imported across nearly every module in `lib/` and
`lib/commands/` (10 of 11 files); `component-defs.js` is much narrower — its
JSDoc-only types are referenced (via `@param {import('./component-defs.js').X}`
comments, never a runtime `import`) only by the three `lib/harnesses/*` files,
not repo-wide.
