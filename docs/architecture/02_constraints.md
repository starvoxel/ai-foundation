---
section: "02"
title: "Constraints"
lifecycle: published
last_verified: e066376
tags: [constraints]
key_files:
  - package.json
  - lib/harnesses/base.js
---

> Technical and organizational constraints the design must work within.

## Technical constraints

| Constraint | Detail |
|---|---|
| Node.js only | The CLI, adapters, and MCP servers are plain Node.js (`engines.node: >=22.0.0`). No other language runtime is introduced for core tooling — the servers under `servers/` are Node too. |
| ESM-only | `package.json` sets `"type": "module"`; every module in `lib/`, `bin/`, and `servers/` is an ES module. No CommonJS (`require`/`module.exports`) anywhere in this codebase. Low-stakes, real constraint — noted here rather than as an ADR. |
| OS-agnostic | No shell scripts or OS-specific path assumptions in the install/uninstall path — `lib/harnesses/*.js` and `lib/resolver.js` use Node's `path` module throughout so installation works the same on Linux, macOS, and Windows. |
| No network at install time | `aif install`/`uninstall`/`validate`/`index` read and write the local filesystem only. Network access is confined to the optional MCP servers (`servers/gmail`, `servers/youtrack`) a project chooses to install, and to `web_search`/`web_fetch` tool grants an *installed agent* uses at runtime — never to the framework's own CLI operations. |
| Plain JavaScript + JSDoc, no TypeScript | `tsconfig.json` type-checks JSDoc annotations (`allowJs`/`checkJs`) via `npm run typecheck`; there is no `.ts` source. Runtime validation (e.g. `zod`, where used) is separate from the type-checking layer. |
| `node:test` over a third-party test runner | Jest/Vitest/Mocha appear nowhere in `package-lock.json` — the built-in `node:test` runner is used throughout `tests/`. |

## Organizational constraints

| Constraint | Detail |
|---|---|
| Human approves plans and decisions | No agent may set a plan or ADR to `Approved`; only a human confirms. See `docs/process-model.md`. |
| Human merges to `main` | Agents open PRs; only a human merges (`steering/engineering/git-workflow-projects.md` Rule 13). |
