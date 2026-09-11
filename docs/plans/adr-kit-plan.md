# adr-kit: standalone ADR CLI + MCP server

## Context

- Need: ADR tooling with search (name/tags), typed links (related/supersedes/amends), reverse file-lookup, a CLI, and an MCP server.
- Evaluated: **adrs-core** (feature fit, but Rust — wrong stack), **adr-tools** and **log4brains** (Node, but neither has typed links or reverse file-lookup). Building that layer ourselves either way, so build the whole thing ourselves.
- Where it lives: ai-foundation isn't published to npm (`"private": true`) and has exactly one consumer today, so a separate package/repo now is overhead with no payoff. Build inside ai-foundation, but split the code (core / CLI / MCP) the way it would need to look as three packages later, so extraction is mechanical, not a rewrite.
- Format: YAML frontmatter, MADR convention. This is now the *same* format `docs/process-model.md` adopted for ai-foundation's own `docs/decisions/` — see "Format alignment with process-model.md" below. adr-kit does **not** perform that migration; the existing `.decision.md` records are rewritten by hand as part of process-model.md's own migration, independent of this plan.
- Physical split: only the MCP protocol layer goes under `servers/` (per `servers/README.md`, that folder is MCP defs only). Core logic + CLI live at `lib/adr-kit/` + `bin/adr-kit.js`, mirroring `lib/*` + `bin/aif.js`. `servers/adr-kit/index.js` importing `lib/adr-kit/` is the one deliberate cross-folder dependency; `lib/adr-kit/` itself must stay zero-coupled (see guard below) so it can become `adr-kit-core` cleanly later.
- **Goal is for ai-foundation to eventually adopt adr-kit once built** — not run two parallel decision-record systems indefinitely. Until then, ai-foundation authors decisions by hand (`docs/process-model.md`'s Phase 0.5, below) in the *same* format adr-kit will later automate, so the format gets validated by real use before any tooling is built, and adopting adr-kit later is a tooling swap, not a format migration.

---

## Format alignment with `process-model.md`

`docs/process-model.md`'s "ADR format — MADR" section is the source of truth for
ai-foundation's own decision-record format; this plan's data model matches it exactly
— `decision-makers`/`consulted`/`informed`, `links.supersedes`, `affects`, flat
`docs/decisions/` directory with `tags` carrying categorization instead of subfolders,
and the bare MADR filename-number ID (`0007-slug.md`, no project prefix). `idPrefix`
in `.adr-kit.json` stays purely display-only (a consumer can render "ADR-0007" in CLI
output) — the stored/referenced ID is never prefixed. `links.related`/`links.amends`
are reserved in both documents, populated starting Phase 3 below.

No remaining discrepancies between the two documents' formats.

---

## Phases

Split into featuresets so each phase is independently useful and buildable without the
next one existing yet.

| Phase | Scope | Where it lives |
|---|---|---|
| **0.5** | Hand-authored MADR records — the format below, written by `write` alone, no tooling. This *is* `docs/process-model.md`'s current "ADR tooling — not needed for the proof of concept" state. | `docs/process-model.md`, not this plan |
| **1** | Vanilla MADR + `affects` + `links.supersedes`, parsed and indexed by a CLI. Minimal command surface: create records, build the index. No search/list/show query commands yet, no MCP. | `lib/adr-kit/`, `bin/adr-kit.js` |
| **2** | Full CLI (search/list/show/affects/link) + MCP server, both fronting the same Phase 1 engine. | + `servers/adr-kit/` |
| **3** | `links.related` (symmetric) and possibly `links.amends`; possibly a generic "custom" link-type mechanism. Deliberately unspecified until Phase 2 ships — fleshed out then. | TBD |

Phases 1 and 2 are what the rest of this document specs in detail. Phase 3 is a
placeholder, not a commitment to `amends`/custom-links' exact shape.

---

## Layout

```
lib/adr-kit/
├── core.js                # pure logic: parse/index/links/template-render (+ search/reverse-lookup, Phase 2)
├── io.js                  # fs wrappers: collect files, build index for dir, write file, read config
└── template.js            # default MADR-ish new-ADR template string

bin/adr-kit.js             # CLI entry point — imports lib/adr-kit/{core,io}.js only; own arg parser
                            # (mirrors bin/aif.js's parseArgs shape, written fresh, not imported)

servers/adr-kit/           # Phase 2 only — does not exist in Phase 1
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

Real MADR field names where MADR defines something; `tags`/`links`/`affects` are additions (vanilla MADR has none of these — supersession is just prose in `status`). Matches `docs/process-model.md` exactly (see Format alignment above).

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
  supersedes: ["0002"]            # Phase 1 — directional, inverted to superseded_by
  related: ["0004"]               # Phase 3 — symmetric, inverted both ways
  amends: ["0003"]                # Phase 3 — directional, inverted to amended_by
affects:                        # Phase 1
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

## Phase 1 — engine + minimal CLI

Vanilla MADR fields, `affects`, `links.supersedes`, and a CLI that can create records and build the index. No querying beyond what `index.json` itself contains, no MCP.

### `lib/adr-kit/core.js` — pure logic

**Exported (wrapper-facing)**:
- `parseAdrFile(content, relPath)` → `{record}`/`{error}` — parses frontmatter, validates `title` (H1) and `status`, derives `id` from `relPath`'s `NNNN-` prefix.
- `nextId(index, idPrefix)` — used by `new`
- `renderAdrTemplate({id, title, tags, links, affects}, template)` — used by `new`

**Exported out of necessity, not API** (`@internal` JSDoc tag):
- `buildIndex(records)` → `{generated_at, entries}` — inverts `links.supersedes`→`superseded_by` (Phase 1; `related`/`amends` inversion added Phase 3). Called only by `io.js`'s private `buildIndexForDir`. Must stay `export`ed since core.js and io.js are separate files — plain JS has no file-local-but-cross-module privacy — but it's not part of the intended wrapper API and is tagged accordingly.

### `lib/adr-kit/io.js` — io wrappers

**Exported (wrapper-facing)**: `writeAdrFile(dir, record, content)` (used by `new`), `readConfig(projectRoot)` (used by every command), `loadOrBuildIndex(dir)` (the only way to get an index).

**Module-private** (plain, unexported — same-file-only, reachable solely from `loadOrBuildIndex`): `collectAdrFiles(dir)`, `buildIndexForDir(dir)` (full parse: `collectAdrFiles` → `parseAdrFile` per file → `buildIndex`), `fingerprintDir(dir)` (`{path, mtimeMs}[]` via `readdirSync`/`statSync` — cheap, no content reads).

`loadOrBuildIndex(dir)`: compares a fresh `fingerprintDir(dir)` against the fingerprint stored in `{dir}/index.json`; returns the cache unchanged on a match, otherwise rebuilds via `buildIndexForDir`, writes `{generated_at, fingerprint, entries}`, and returns it.

### `bin/adr-kit.js` — CLI (Phase 1 surface)

- `adr-kit init` — scaffold `docs/adr/` + `.adr-kit.json`
- `adr-kit new "<title>" [--tags a,b] [--supersedes ID] [--affects glob,...]` — Phase 1 has no `--related`/`--amends` flags (reserved fields, not yet populated)
- `adr-kit index` — rebuild `index.json` cache

Add `"adr-kit": "./bin/adr-kit.js"` to root `package.json`'s `bin` map, next to `aif`/`ai-git`.

### Phase 1 build order

1. `lib/adr-kit/core.js` + `tests/unit/adr-kit-core.test.js` (parse, index/inversion for `supersedes` only, template render, zero-coupling guard)
2. `lib/adr-kit/io.js` + `tests/integration/adr-kit-io.test.js`, including the cache-behavior case (build once, call again with nothing changed → no re-parse; modify a file → re-parse + rewritten `index.json`)
3. `bin/adr-kit.js` (`init`/`new`/`index` only) + `tests/unit/adr-kit-cli.test.js` + `tests/integration/adr-kit-cli.test.js`; register in root `package.json`'s `bin` map

### Phase 1 verification

- `node --test tests/unit/adr-kit-core.test.js tests/unit/adr-kit-cli.test.js`
- `node --test tests/integration/adr-kit-io.test.js tests/integration/adr-kit-cli.test.js`
- Manual: `node bin/adr-kit.js init` in a scratch dir → `new` a couple of ADRs with `--supersedes`/`--affects` → `index` → inspect `index.json` for correct entries + inverted `superseded_by`
- `npm run lint && npm run typecheck`

---

## Phase 2 — full CLI + MCP

Adds querying (search/list/show/affects/link) and an MCP server fronting the same engine. No new frontmatter fields.

### `lib/adr-kit/core.js` additions

- `searchByQuery(index, {text, tags})` — used by `search` / `adr_search`
- `findByFile(index, filePath)` — used by `affects` / `adr_affects`; small internal glob matcher (`*`, `**`, exact paths), no dependency

`parseAdrFile` gains a second caller: `link` (read the target file's current frontmatter before patching it).

### `bin/adr-kit.js` additions

- `adr-kit list [--status X] [--tag X]`
- `adr-kit search <query>`
- `adr-kit show <id>`
- `adr-kit affects <file>`
- `adr-kit link <id> --supersedes <otherId>` (Phase 3 adds `--related`/`--amends`)

### `servers/adr-kit/index.js` — MCP tools (new in Phase 2)

`adr_search`, `adr_show`, `adr_list`, `adr_affects`, `adr_create`, `adr_link` — thin `registerTool` wrappers over `lib/adr-kit/{core,io}.js`, following `servers/dag/index.js`'s pattern.

### Install-pipeline extension

`aif install` copies only `servers/{name}/` into the target harness dir (e.g. `~/.claude/servers/adr-kit/`) and runs `npm install` there — see `installMcpStdio` in `lib/harnesses/claude.js` and `lib/harnesses/kiro.js`. Since `index.js` imports `../../lib/adr-kit/`, that path won't exist post-copy unless `lib/adr-kit/` comes with it.

Extend both `installMcpStdio` implementations: after copying `servers/{name}/`, also copy `lib/{name}/` (if it exists) to the same relative position in the target, before `npm install`. Generic by `{name}`, not adr-kit-specific.

### Phase 2 build order

1. `searchByQuery`/`findByFile` in `core.js` + test cases
2. `list`/`search`/`show`/`affects`/`link` in `bin/adr-kit.js` + test cases
3. `servers/adr-kit/adr-kit.yaml` + `package.json` (`@modelcontextprotocol/sdk`, `yaml`) + `index.js` + thin unit/integration tests + `adr-kit.mcp.test.js`
4. Extend `installMcpStdio` in `lib/harnesses/claude.js` and `lib/harnesses/kiro.js` to copy `lib/{name}/` alongside `servers/{name}/`
5. Add `@adr-kit/adr_search`, `@adr-kit/adr_create`, etc. to `agents/architect.yaml`'s `tools:` list, so `lib/resolver.js`'s `resolveServersFromAgents()` discovers the server for bundle install

### Phase 2 verification

- `node --test servers/adr-kit/tests/integration/adr-kit.mcp.test.js` — tool listing + invocation via `InMemoryTransport`, per `servers/dag/tests/integration/dag.mcp.test.js`
- Manual: `search`/`affects`/`list`/`link` against the Phase 1 scratch dir return expected results
- `aif install --bundle engineering --harness claude` in a scratch target dir → confirm `~/.claude/servers/adr-kit/` **and** `~/.claude/lib/adr-kit/` both exist, `npm install` succeeded, and the server starts

---

## Phase 3 — related / amends / custom links

Not specified yet. At minimum: populate `links.related` (symmetric inversion) and evaluate whether `links.amends` (directional, `amended_by`) is still wanted once Phase 2 is in real use. A generic "custom" link-type mechanism (arbitrary named relationships beyond the fixed set) is plausible but not designed — revisit once Phase 2 usage shows whether the fixed set is actually limiting.
