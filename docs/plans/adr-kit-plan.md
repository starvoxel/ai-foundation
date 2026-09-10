# adr-kit: standalone ADR CLI + MCP server

## Context

- Need: ADR tooling with search (name/tags), typed links (related/supersedes/amends), reverse file-lookup, a CLI, and an MCP server.
- Evaluated: **adrs-core** (feature fit, but Rust — wrong stack), **adr-tools** and **log4brains** (Node, but neither has typed links or reverse file-lookup). Building that layer ourselves either way, so build the whole thing ourselves.
- Where it lives: ai-foundation isn't published to npm (`"private": true`) and has exactly one consumer today, so a separate package/repo now is overhead with no payoff. Build inside ai-foundation, but split the code (core / CLI / MCP) the way it would need to look as three packages later, so extraction is mechanical, not a rewrite.
- Format: YAML frontmatter, MADR convention — not ai-foundation's `.decision.md` Metadata-table format. The 14 existing `docs/decisions/*.decision.md` files are untouched; adr-kit is a separate, parallel tool.
- Physical split: only the MCP protocol layer goes under `servers/` (per `servers/README.md`, that folder is MCP defs only). Core logic + CLI live at `lib/adr-kit/` + `bin/adr-kit.js`, mirroring `lib/*` + `bin/aif.js`. `servers/adr-kit/index.js` importing `lib/adr-kit/` is the one deliberate cross-folder dependency; `lib/adr-kit/` itself must stay zero-coupled (see guard below) so it can become `adr-kit-core` cleanly later.

---

## Layout

```
lib/adr-kit/
├── core.js                # pure logic: parse/index/search/links/reverse-lookup/template-render
├── io.js                  # fs wrappers: collect files, build index for dir, write file, read config
└── template.js            # default MADR-ish new-ADR template string

bin/adr-kit.js             # CLI entry point — imports lib/adr-kit/{core,io}.js only; own arg parser
                            # (mirrors bin/aif.js's parseArgs shape, written fresh, not imported)

servers/adr-kit/
├── adr-kit.yaml           # server def (protocol: mcp, transport: stdio)
├── index.js                # MCP entry — imports ../../lib/adr-kit/{core,io}.js, registers tools
├── package.json            # standalone-install deps: @modelcontextprotocol/sdk, yaml
└── tests/
    ├── unit/adr-kit.test.js            # thin — logic already covered in lib/adr-kit's own suite
    ├── integration/adr-kit.test.js     # thin — same reason
    └── integration/adr-kit.mcp.test.js # the real coverage: tool listing + invocation

tests/unit/adr-kit-core.test.js         # lib/adr-kit/core.js — pure logic
tests/unit/adr-kit-cli.test.js          # bin/adr-kit.js — arg parsing, mirrors tests/unit/cli.test.js
tests/integration/adr-kit-io.test.js    # lib/adr-kit/io.js — real tmp-dir filesystem
tests/integration/adr-kit-cli.test.js   # spawns bin/adr-kit.js end-to-end
```

`lib/*`/`bin/*` are tested from root `tests/unit/`+`tests/integration/` (matches `tests/unit/decisions.test.js`, `tests/unit/cli.test.js`); `servers/{name}/` keeps its own local `tests/` per `skill/server-authoring`.

**Zero-coupling guard**: `tests/unit/adr-kit-core.test.js` scans every `.js` file under `lib/adr-kit/` and fails if any import reaches outside the folder (node builtins, `yaml`, and `./`-relative imports only allowed). `bin/adr-kit.js` and `servers/adr-kit/index.js` keep their one intentional import into `lib/adr-kit/` — a documented exception, not a second guard.

---

## Data model (frontmatter)

Real MADR field names where MADR defines something; `tags`/`links`/`affects` are additions (vanilla MADR has none of these — supersession is just prose in `status`).

**No `id` frontmatter field.** MADR's ID is the filename's zero-padded number (`NNNN-title-slug.md`, e.g. `0002-use-postgresql.md`). `links.*` reference that same bare number.

```yaml
---
status: accepted        # MADR: proposed | rejected | accepted | deprecated | superseded by 0002
date: 2026-09-10        # MADR: date decision was last updated
decision-makers: []     # MADR: optional
consulted: []           # MADR: optional
informed: []            # MADR: optional
tags: [database, storage]      # addition
links:                          # addition (MADR: prose in `status` only)
  related: ["0004"]               # symmetric — inverted both ways
  supersedes: ["0002"]            # directional — inverted to superseded_by
  amends: ["0003"]                # directional — inverted to amended_by
affects:                        # addition
  - src/db/**
  - config/database.yml
---
# {title}   ← MADR: plain H1, not a frontmatter field
<free MADR-style body: Context and Problem Statement / Decision Drivers /
Considered Options / Decision Outcome / Consequences — not parsed structurally>
```

Config at the consuming project's root, `.adr-kit.json`:
```json
{ "path": "docs/adr", "idPrefix": "ADR" }
```
`idPrefix` is display-only ("ADR-0002" in CLI output); stored/referenced IDs stay bare MADR numbers. No Tier/Domain or other ai-foundation-specific fields.

---

## `lib/adr-kit/core.js` — pure logic

Each exported function is here because a real CLI command or MCP tool calls
it directly — not speculative API surface.

**Exported (wrapper-facing)**:
- `parseAdrFile(content, relPath)` → `{record}`/`{error}` — parses frontmatter, validates `title` (H1) and `status`, derives `id` from `relPath`'s `NNNN-` prefix. Used by `link` (read the target file's current frontmatter before patching it) as well as internally during index build.
- `searchByQuery(index, {text, tags})` — used by `search` / `adr_search`
- `findByFile(index, filePath)` — used by `affects` / `adr_affects`; small internal glob matcher (`*`, `**`, exact paths), no dependency
- `nextId(index, idPrefix)` — used by `new` / `adr_create`
- `renderAdrTemplate({id, title, tags, links, affects}, template)` — used by `new` / `adr_create`

**Exported out of necessity, not API** (`@internal` JSDoc tag):
- `buildIndex(records)` → `{generated_at, entries}` — inverts `supersedes`→`superseded_by`, `amends`→`amended_by`, merges `related` symmetrically (extends `lib/decisions.js`'s inversion pattern). Called only by `io.js`'s private `buildIndexForDir`. Must stay `export`ed since core.js and io.js are separate files — plain JS has no file-local-but-cross-module privacy — but it's not part of the intended wrapper API and is tagged accordingly so consumers know not to rely on it directly.

## `lib/adr-kit/io.js` — io wrappers

**Exported (wrapper-facing)**: `writeAdrFile(dir, record, content)` (used by `new`, `link`), `readConfig(projectRoot)` (used by every command — resolves ADR dir + idPrefix, defaults `docs/adr`/`ADR`), `loadOrBuildIndex(dir)` (the only way to get an index — used by every query/mutation command).

**Module-private** (plain, unexported — true same-file-only privacy, reachable solely from `loadOrBuildIndex` in this file): `collectAdrFiles(dir)` (lists ADR files — no command needs a raw file list on its own), `buildIndexForDir(dir)` (full frontmatter parse — the expensive path: `collectAdrFiles` → `parseAdrFile` per file → `buildIndex`), `fingerprintDir(dir)` (`{path, mtimeMs}[]` via `readdirSync`/`statSync` — cheap, no content reads). None of these three are called by any CLI command or MCP tool directly, so none are exported.

`loadOrBuildIndex(dir)`: compares a fresh `fingerprintDir(dir)` against the fingerprint stored in `{dir}/index.json`; returns the cache unchanged on a match, otherwise rebuilds via `buildIndexForDir`, writes `{generated_at, fingerprint, entries}`, and returns it.

**Query path**: `list`/`search`/`show`/`affects` (CLI and MCP) always call `loadOrBuildIndex` — steady-state cost is N `stat` calls, not N frontmatter parses; a full re-parse only fires when the directory actually changed. `new`/`link` write their file, then call `loadOrBuildIndex` to refresh the cache.

Testing: since `buildIndexForDir` isn't exported, its behavior is exercised through `loadOrBuildIndex`'s cache-miss path in `tests/integration/adr-kit-io.test.js`.

## `bin/adr-kit.js` — CLI

- `adr-kit init` — scaffold `docs/adr/` + `.adr-kit.json`
- `adr-kit new "<title>" [--tags a,b] [--related ID] [--supersedes ID] [--amends ID] [--affects glob,...]`
- `adr-kit list [--status X] [--tag X]`
- `adr-kit search <query>`
- `adr-kit show <id>`
- `adr-kit affects <file>`
- `adr-kit link <id> --related|--supersedes|--amends <otherId>`
- `adr-kit index` — rebuild `index.json` cache

Add `"adr-kit": "./bin/adr-kit.js"` to root `package.json`'s `bin` map, next to `aif`/`ai-git`.

## `servers/adr-kit/index.js` — MCP tools

`adr_search`, `adr_show`, `adr_list`, `adr_affects`, `adr_create`, `adr_link` — thin `registerTool` wrappers over `lib/adr-kit/{core,io}.js`, following `servers/dag/index.js`'s pattern.

---

## Install-pipeline extension

`aif install` copies only `servers/{name}/` into the target harness dir (e.g. `~/.claude/servers/adr-kit/`) and runs `npm install` there — see `installMcpStdio` in `lib/harnesses/claude.js` and `lib/harnesses/kiro.js`. Since `index.js` imports `../../lib/adr-kit/`, that path won't exist post-copy unless `lib/adr-kit/` comes with it.

Extend both `installMcpStdio` implementations: after copying `servers/{name}/`, also copy `lib/{name}/` (if it exists) to the same relative position in the target, before `npm install`. Generic by `{name}`, not adr-kit-specific.

---

## Build order

1. `lib/adr-kit/core.js` + `tests/unit/adr-kit-core.test.js` (parse, index/inversion incl. symmetric `related`, search, `findByFile`, template render, zero-coupling guard)
2. `lib/adr-kit/io.js` + `tests/integration/adr-kit-io.test.js`
3. `bin/adr-kit.js` + `tests/unit/adr-kit-cli.test.js` + `tests/integration/adr-kit-cli.test.js`; register in root `package.json`'s `bin` map
4. `servers/adr-kit/adr-kit.yaml` + `package.json` (`@modelcontextprotocol/sdk`, `yaml`) + `index.js` + thin unit/integration tests + `adr-kit.mcp.test.js`
5. Extend `installMcpStdio` in `lib/harnesses/claude.js` and `lib/harnesses/kiro.js` to copy `lib/{name}/` alongside `servers/{name}/`
6. Add `@adr-kit/adr_search`, `@adr-kit/adr_create`, etc. to `agents/architect.yaml`'s `tools:` list, so `lib/resolver.js`'s `resolveServersFromAgents()` discovers the server for bundle install

---

## Verification

- `node --test tests/unit/adr-kit-core.test.js tests/unit/adr-kit-cli.test.js`
- `node --test tests/integration/adr-kit-io.test.js tests/integration/adr-kit-cli.test.js`
- `node --test servers/adr-kit/tests/integration/adr-kit.mcp.test.js` — tool listing + invocation via `InMemoryTransport`, per `servers/dag/tests/integration/dag.mcp.test.js`
- Manual: `node bin/adr-kit.js init` in a scratch dir → `new` a couple of ADRs with cross-links → `search`/`affects`/`list` return expected results
- Cache behavior: build an index, call `loadOrBuildIndex` again with nothing changed, assert no re-parse (spy/counter); modify one file, assert it *is* re-parsed and `index.json` rewritten
- `npm run lint && npm run typecheck`
- `aif install --bundle engineering --harness claude` in a scratch target dir → confirm `~/.claude/servers/adr-kit/` **and** `~/.claude/lib/adr-kit/` both exist, `npm install` succeeded, and the server starts
