# adr-kit: standalone ADR CLI + MCP server

## Context

We want ADR (decision-record) tooling — search by name/tags, typed links
(related/supersedes/amends), reverse file-lookup, a CLI, and an MCP server on
top — usable by both humans and agents. Evaluated adr-tools and log4brains;
neither covers typed links or reverse file-lookup, so we'd be building that
layer regardless of which base tool we started from. Decided to build it
ourselves rather than adopt either dependency.

Discussed where it should live: ai-foundation isn't published to npm itself
(`"private": true`, distributed via its own install/bundle pipeline), and
there's currently exactly one consumer, so standing up separate published
packages/repos today would be pure overhead for a hedge against consumers
that don't exist yet. Landed on: build it inside ai-foundation now, but
architect the code split the way it would need to look if it ever does ship
as three separate packages (core / CLI / MCP) — so that split is a mechanical
extraction later, not a rewrite.

Format: YAML frontmatter (MADR-style), not ai-foundation's existing
Metadata-table `.decision.md` convention. The 14 existing
`docs/decisions/*.decision.md` files are **not** touched or migrated by this
work — they keep using `lib/decisions.js`/`aif index -d` exactly as today.
adr-kit is a separate, parallel tool.

**Physical split** (per discussion): only the MCP protocol layer belongs
under `servers/` — that folder's own convention (`servers/README.md`) is
MCP-server definitions only, not application code. Core logic and the CLI
live under `lib/adr-kit/` and `bin/adr-kit.js`, mirroring exactly how the
`aif` CLI itself is structured (`bin/aif.js` + `lib/*`). This means
`servers/adr-kit/index.js` has one necessary cross-folder import into
`lib/adr-kit/` — an explicit, deliberate exception to "no dependencies on
other tools," not an accidental one. Everything else about `lib/adr-kit/`'s
own code must have zero imports reaching outside itself (see "Zero-coupling
guard" below) — that's the part that has to be portable if/when it splits
into `adr-kit-core`, `adr-kit-cli`, `adr-kit-mcp` packages later.

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
    ├── unit/adr-kit.test.js            # thin — see note below
    ├── integration/adr-kit.test.js     # thin — see note below
    └── integration/adr-kit.mcp.test.js # the real coverage: tool listing + invocation

tests/unit/adr-kit-core.test.js         # lib/adr-kit/core.js — pure logic
tests/unit/adr-kit-cli.test.js          # bin/adr-kit.js — arg parsing, mirrors tests/unit/cli.test.js
tests/integration/adr-kit-io.test.js    # lib/adr-kit/io.js — real tmp-dir filesystem
tests/integration/adr-kit-cli.test.js   # spawns bin/adr-kit.js end-to-end
```

Test locations follow the two conventions already in this repo side by
side: `lib/*`/`bin/*` are tested from root `tests/unit/`+`tests/integration/`
(e.g. `tests/unit/decisions.test.js`, `tests/unit/cli.test.js` for
`bin/aif.js`), while `servers/{name}/` keeps its own local `tests/` per
`skill/server-authoring`. `servers/adr-kit/tests/unit` and
`.../integration` stay intentionally thin (smoke-level) since the real
logic is already fully covered by `lib/adr-kit`'s own suite — avoid testing
the same logic twice. The MCP protocol layer (`adr-kit.mcp.test.js`) is the
one genuinely new coverage this folder adds.

**Zero-coupling guard**: a unit test (`tests/unit/adr-kit-core.test.js`)
scans every `.js` file under `lib/adr-kit/` for import specifiers that
reach outside that folder (anything other than node builtins, the `yaml`
package, or a relative import starting with `./`) and fails if found. This
is the invariant that has to hold for `lib/adr-kit/` to become
`adr-kit-core` as a clean package later. `bin/adr-kit.js` and
`servers/adr-kit/index.js` are allowed their one intentional import into
`lib/adr-kit/` — that's a documented convention, not a second automated
guard (proportionate: it's one line to review, not worth a second scanner).

---

## Data model (frontmatter)

Follows real MADR field names/semantics where MADR defines something;
`tags`/`links`/`affects` are additions MADR has no equivalent for (vanilla
MADR only encodes supersession as prose inside `status`, e.g. `"superseded
by ADR-0123"` — no structured link fields, no tags, no file-affects).

**ID is not a frontmatter field.** Per MADR convention, the ID is the
filename's zero-padded number: `NNNN-title-slug.md` (e.g.
`0002-use-postgresql.md`). `links.*` and CLI arguments reference that same
bare number (`supersedes: ["0002"]`), never a separate stored id.

```yaml
---
status: accepted        # MADR: proposed | rejected | accepted | deprecated | superseded by 0002
date: 2026-09-10        # MADR: date decision was last updated
decision-makers: []     # MADR: optional
consulted: []           # MADR: optional
informed: []            # MADR: optional
tags: [database, storage]      # addition — no MADR equivalent
links:                          # addition — no MADR equivalent (MADR: prose in `status` only)
  related: ["0004"]               # symmetric — inverted both ways automatically
  supersedes: ["0002"]            # directional — inverted to superseded_by
  amends: ["0003"]                # directional — inverted to amended_by
affects:                        # addition — no MADR equivalent
  - src/db/**
  - config/database.yml
---
# {title}   ← MADR: plain H1, not a frontmatter field
<free MADR-style body: Context and Problem Statement / Decision Drivers /
Considered Options / Decision Outcome / Consequences — not parsed structurally>
```

Config file at the consuming project's root, `.adr-kit.json`:
```json
{ "path": "docs/adr", "idPrefix": "ADR" }
```
`idPrefix` is display-only (CLI prints "ADR-0002"); the stored/referenced ID
stays the bare MADR-style number. Config kept intentionally minimal/generic
— no Tier/Domain or other ai-foundation-specific fields.

---

## `lib/adr-kit/core.js` — pure logic

- `parseAdrFile(content, relPath)` → `{record}` or `{error}` — parses YAML frontmatter, validates required fields (`title` from the H1, `status`); derives `id` from `relPath`'s `NNNN-` filename prefix, not from frontmatter
- `buildIndex(records)` → `{generated_at, entries}` — inverts `supersedes`→`superseded_by`, `amends`→`amended_by` (directional), merges `related` as a symmetric edge (extends `lib/decisions.js`'s `buildDecisionIndex` inversion pattern for the symmetric case)
- `searchByQuery(index, {text, tags})` → matches title/id and tags
- `findByFile(index, filePath)` → matches `affects` patterns against `filePath`; small internal glob matcher (`*`, `**`, exact paths) rather than a `minimatch`-style dependency, given the modest matching needs
- `nextId(index, idPrefix)` → next sequential id
- `renderAdrTemplate({id, title, tags, links, affects}, template)` → new file content

## `lib/adr-kit/io.js` — io wrappers (same pure/io split convention as `lib/decisions.js`)

Exported (public surface for anyone building their own wrapper on top):
- `collectAdrFiles(dir)`, `writeAdrFile(dir, record, content)`, `readConfig(projectRoot)` (falls back to `docs/adr` / prefix `ADR` if `.adr-kit.json` absent)
- `loadOrBuildIndex(dir)` — the **only** way to get an index; see below

Module-private, not exported — reachable only from `loadOrBuildIndex` in
this same file:
- `buildIndexForDir(dir)` (full parse of every file's frontmatter — the expensive path)
- `fingerprintDir(dir)` → cheap `{path, mtimeMs}[]` via `readdirSync`+`statSync` only, no file content reads

`loadOrBuildIndex(dir)` reads `{dir}/index.json` if present, compares its
stored fingerprint against a fresh `fingerprintDir(dir)`; returns the cached
index unchanged on a match (zero frontmatter parsing), otherwise calls the
private `buildIndexForDir`, writes the refreshed `index.json`
(`{generated_at, fingerprint, entries}`, mirroring `docs/decisions/index.json`'s
shape plus the fingerprint), and returns that.

Keeping `buildIndexForDir`/`fingerprintDir` unexported is deliberate: a
future consumer writing their own wrapper directly against `io.js` (the
scenario the "ship as 3 packages later" goal anticipates) can only reach
the index through the cached path — there's no expensive function to
accidentally call instead of the cheap one. Their sole way in is
`loadOrBuildIndex`.

**Query path**: `list`/`search`/`show`/`affects` (CLI and MCP alike) always
call `loadOrBuildIndex` — it's the only exported way to get an index. This
is the actual fix for the "parsing frontmatter for every file on every
query" cost at dozens/hundreds-of-ADRs scale: steady-state cost becomes N
`stat` calls (cheap) instead of N file reads + YAML parses, with a full
re-parse only when the directory's fingerprint has actually changed.
`new`/`link` write their file, then call `loadOrBuildIndex` once to refresh
the cache (a full rebuild after a mutation — no incremental single-entry
index update, since writes are infrequent relative to reads and a full
rebuild stays cheap in absolute terms even at hundreds of ADRs).

Testing note: since `buildIndexForDir` isn't exported, its full-reparse
behavior is exercised indirectly through `loadOrBuildIndex`'s cache-miss
path (no `index.json` present, or a deliberately stale fingerprint) in
`tests/integration/adr-kit-io.test.js` — testing through the real public
contract rather than reaching around it.

## `bin/adr-kit.js` — CLI

- `adr-kit init` — scaffold `docs/adr/` + `.adr-kit.json`
- `adr-kit new "<title>" [--tags a,b] [--related ID] [--supersedes ID] [--amends ID] [--affects glob,...]`
- `adr-kit list [--status X] [--tag X]`
- `adr-kit search <query>`
- `adr-kit show <id>`
- `adr-kit affects <file>`
- `adr-kit link <id> --related|--supersedes|--amends <otherId>`
- `adr-kit index` — rebuild `index.json` cache (same purpose as `aif index -d`; what a future static-site generator would read, though the site itself is out of scope here)

Add `"adr-kit": "./bin/adr-kit.js"` to root `package.json`'s `bin` map, next to the existing `aif`/`ai-git` entries.

## `servers/adr-kit/index.js` — MCP tools

`adr_search`, `adr_show`, `adr_list`, `adr_affects`, `adr_create`, `adr_link` — thin `registerTool` wrappers over `lib/adr-kit/{core,io}.js`, following `servers/dag/index.js`'s exact pattern.

---

## Install-pipeline extension (needed for this split to actually work)

`aif install` copies only `servers/{name}/` into the target harness's server
directory (e.g. `~/.claude/servers/adr-kit/`) and runs `npm install` there —
see `installMcpStdio` inside `lib/harnesses/claude.js` and
`lib/harnesses/kiro.js` (each harness implements its own stdio installer;
the shared dispatch in `lib/harnesses/base.js`'s `installServers()` just
calls whichever one matches `serverDef.protocol`). Since `index.js` now
imports `../../lib/adr-kit/`, that relative path won't exist post-copy
unless `lib/adr-kit/` is copied alongside it.

Extend both `installMcpStdio` implementations: after copying
`servers/{name}/`, check whether `lib/{name}/` exists in the source repo,
and if so copy it to the same relative position in the target
(`{targetRoot}/lib/{name}/`) before running `npm install`. Generic by
`{name}`, not special-cased to adr-kit, so any future server with the same
core/CLI/MCP split benefits automatically.

---

## Build order

1. `lib/adr-kit/core.js` + `tests/unit/adr-kit-core.test.js` (parse, index/inversion incl. symmetric `related`, search, glob-based `findByFile`, template render, zero-coupling guard)
2. `lib/adr-kit/io.js` + `tests/integration/adr-kit-io.test.js`
3. `bin/adr-kit.js` + `tests/unit/adr-kit-cli.test.js` + `tests/integration/adr-kit-cli.test.js`; register it in root `package.json`'s `bin` map
4. `servers/adr-kit/adr-kit.yaml` + `package.json` (deps: `@modelcontextprotocol/sdk`, `yaml`) + `index.js` + thin unit/integration tests + `adr-kit.mcp.test.js`
5. Extend `installMcpStdio` in `lib/harnesses/claude.js` and `lib/harnesses/kiro.js` to copy `lib/{name}/` alongside `servers/{name}/` when present
6. Add `@adr-kit/adr_search`, `@adr-kit/adr_create`, etc. to `agents/architect.yaml`'s `tools:` list, so `lib/resolver.js`'s `resolveServersFromAgents()` discovers the server for bundle install (bundles reference servers indirectly, via agent tool refs — no direct bundle listing needed)

---

## Verification

- `node --test tests/unit/adr-kit-core.test.js tests/unit/adr-kit-cli.test.js` — pure logic + CLI parsing
- `node --test tests/integration/adr-kit-io.test.js tests/integration/adr-kit-cli.test.js` — real filesystem, spawned CLI
- `node --test servers/adr-kit/tests/integration/adr-kit.mcp.test.js` — MCP tool listing + invocation via `InMemoryTransport`, per `servers/dag/tests/integration/dag.mcp.test.js`
- Manual: `node bin/adr-kit.js init` in a scratch dir → `new` a couple of ADRs with cross-links → `search`/`affects`/`list` return expected results
- Cache behavior (`tests/unit/adr-kit-core.test.js` or a dedicated case in `tests/integration/adr-kit-io.test.js`): build an index, touch nothing, call `loadOrBuildIndex` again and assert the underlying per-file parse function was not re-invoked (spy/counter); then modify one ADR file's mtime/content and assert it *is* re-invoked and `index.json` is rewritten
- `npm run lint && npm run typecheck` at repo root
- `aif install --bundle engineering --harness claude` in a scratch target dir → confirm `~/.claude/servers/adr-kit/` **and** `~/.claude/lib/adr-kit/` both exist, `npm install` succeeded, and the server actually starts (no missing-module error) — this is the concrete check that the install-pipeline extension in step 5 worked
