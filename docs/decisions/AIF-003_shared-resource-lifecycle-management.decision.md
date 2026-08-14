# Decision Record: Shared Resource Lifecycle Management (Servers & Hooks)

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-003 |
| Project | ai-foundation |
| Status | Approved |
| Author (Agent) | AI-Engineer |
| Approved By | Jeremy |
| Created | 2026-08-13 13:38 |
| Referenced By | — |
| Supersedes | — |

---

## Problem Statement

`aif uninstall --bundle <name> --harness <harness>` deletes every file and MCP
registration listed under a bundle's manifest entry unconditionally, including MCP
servers and the Claude Code `block-command` hook script. If a second bundle shares a
server (via an agent's `@server/tool` reference) or a hook (via an agent's
`blocked_commands` field), uninstalling the first bundle silently breaks the second —
its server directory is deleted and its MCP registration removed out from under it,
even though it is still "installed." The hook script avoids this specific failure
today only by never being removed by any bundle's uninstall (a workaround, not a
fix) — which leaks it permanently once no bundle needs it. Neither resource type has
any concept of "installed by more than one thing."

## Constraints & Requirements

What was non-negotiable:
- Uninstalling one bundle must never remove a server or hook still required by
  another installed bundle (same harness)
- Servers and hooks must eventually be removable once nothing depends on them
  (no permanent leaks)
- No backward-compatibility burden — `.installs.yaml` is a generated, gitignored
  file with no external consumers; a schema change is acceptable
- `aif status` / `aif install --update` must correctly detect when a shared
  resource's *source* changes, without requiring a human to manually reconcile
  every bundle that happens to reference it

What was a preference but not a hard requirement:
- One consistent mechanism for all shared, harness-level resources (not one
  bespoke workaround per resource type)
- Minimal new abstractions — reuse existing patterns (bundle manifest entries,
  bundle snapshots) where the shape already fits

---

## Options Explored

### Option A: Derived ownership (scan-on-uninstall, no schema change)

**Summary**: Keep the manifest flat. At uninstall time, scan every other
`{bundle}_{harness}` manifest entry and check whether any of them still lists the
server/hook name being removed; only physically remove it if no other entry does.
**Strengths**: No manifest schema change. Small diff.
**Weaknesses**: Doesn't fix the more subtle half of the bug — `entry.files` already
contains untagged server/hook file paths that get deleted in the generic
file-deletion loop *before* the ownership check ever runs, so files would need to be
individually tagged with their owning resource anyway. Doesn't generalize cleanly to
hooks (hook usage isn't resolved onto a bundle-level list the way `resolved.servers`
is — it's discovered per-agent). Ownership is implicit and recomputed every time
rather than an explicit, inspectable fact.
**Verdict**: Not chosen — the tagging workaround it still requires is roughly as
much code as Option B, without Option B's clarity or extensibility to hooks.

### Option B: Persisted reference-counted manifest sections (`bundles` / `servers` / `hooks`)

**Summary**: Split `.installs.yaml` into three top-level sections. `bundles` keeps
today's per-bundle file lists (now scoped to bundle-owned sources only: agents,
steering, skills, standards). `servers` and `hooks` each track their own files/hash
and an explicit `installedBy: [bundleName, ...]` list. Installing a bundle
adds it to the relevant `installedBy` lists (creating the entry if new). Uninstalling
a bundle removes it from each list; the resource is only physically deleted
(files + MCP deregistration) when its `installedBy` list becomes empty. Detection of
which agents need a shared resource happens where agent YAML is already parsed
(the `installAgents` loop in `harnesses/base.js`), via a harness-supplied
`detectSharedResource(agent)` predicate — generalizing the exact same mechanism used
for MCP servers to cover the `block-command` hook script.
**Strengths**: Explicit, inspectable ownership (no rescanning). One mechanism for
both servers and hooks. `aif status` can report shared usage directly.
Fixes the hook-script leak (it becomes removable once unreferenced, instead of
permanent). Naturally extends to future shared resource types.
**Weaknesses**: Larger diff — manifest shape change touches every command
(`install`, `uninstall`, `status`) and their tests.
**Verdict**: Chosen.

### Option C: Status quo pattern generalized (install once, never remove)

**Summary**: Apply the existing `block-command` workaround to servers too — install
unconditionally, never remove any shared resource via `aif uninstall`, document it as
permanent machine-level state.
**Strengths**: Trivial, zero new code.
**Weaknesses**: Never cleans up. Every shared resource becomes permanent disk/config
state regardless of whether anything still uses it. This is the exact leak already
observed with the hook script and the human explicitly asked to fix it, not spread it
to servers.
**Verdict**: Not chosen.

---

## Decision

**Chosen approach**: Option B — persisted reference-counted manifest sections,
generalized to both MCP servers and the Claude Code hook script, with per-resource
freshness tracking decoupled from bundle snapshots.

**Rationale**:
Servers and hooks are genuinely shared, independently-lived resources — their
lifecycle is not a subset of any one bundle's lifecycle. Modeling that explicitly
(a dedicated manifest section with an `installedBy` list) is more correct and more
maintainable than deriving ownership by rescanning on every uninstall, and it is the
only option that also fixes the hook-script leak. Decoupling resource freshness
(each server/hook gets its own snapshot) from bundle freshness prevents the
duplication that would otherwise occur — every bundle referencing a shared server
would otherwise need its own copy of that server's source hashes, and a source change
to one server would appear to invalidate every referencing bundle's entire snapshot.

**Trade-offs accepted**:
- Larger implementation surface than Option A (manifest shape, both harness
  adapters, all three commands, snapshot subsystem, and their tests all change).
  Accepted because this repo has no external consumers of `.installs.yaml` and no
  backward-compatibility constraint.
- `aif install --update` still operates at bundle granularity — if a shared
  resource's source changes, every bundle that depends on it will independently be
  marked stale and reinstalled (safe/idempotent, since reinstalling just re-upserts
  the same shared resource content), rather than patching the resource once.
  Accepted as an acceptable inefficiency, not a correctness issue; not solved by
  this decision.

---

## Design

### Manifest Schema (`.installs.yaml`)

```yaml
bundles:
  engineering_kiro:
    version: "1.0.0"
    files:                        # bundle-owned only: standards, agents, steering, skills
      - path: "~/.kiro/agents/architect.json"
        hash: "sha256:..."
    servers: ["git"]              # server names this bundle depends on
    hooks: ["block-command"]      # hook resource names this bundle depends on
    sourceHashes: {...}           # bundle-owned sources only (unchanged mechanism, narrower scope)

servers:
  git_kiro:                       # keyed via existing manifestKey(name, harness)
    files:
      - path: "~/.kiro/servers/git/index.js"
        hash: "sha256:..."
    installedBy: ["engineering"]
    sourceHashes: {...}           # this server's own source hashes (see Freshness below)

hooks:
  block-command_claude:
    files:
      - path: "~/.claude/scripts/block-command/cli.js"
        hash: "sha256:..."
    installedBy: ["engineering"]
    sourceHashes: {...}
```

### Ownership Lifecycle

- **Install**: for each server/hook a bundle resolves to, create the section entry
  if absent, add `bundleName` to `installedBy` if not already present. Files are
  (re)installed every time (idempotent — same source, same result).
- **Uninstall**: remove `bundleName` from each dependency's `installedBy`. If the
  list becomes empty, physically remove the resource (delete its target directory,
  deregister MCP settings for servers) and delete the manifest section entry. If not
  empty, keep the resource installed and log which bundle(s) still need it.

### Shared Resource Detection

- **Servers**: unchanged — resolved per bundle today via `resolveBundle()` /
  `resolveServersFromAgents()` (agent `tools` entries using `@server/tool`).
- **Hooks**: detected where agent YAML is already parsed, in `base.js`'s
  `installAgents()` loop, via an optional harness-supplied
  `detectSharedResource(agent) => string|null`. `claude.js` returns `'block-command'`
  when `agent.blocked_commands` is non-empty; `kiro.js` supplies no detector (it
  embeds `blocked_commands` directly into each agent's own JSON via
  `permissions.rules` — no shared external asset needed). `installAgents()` returns
  `{ files, sharedResources }` instead of a flat file array (its only caller,
  `install.js`, is updated accordingly). A harness-supplied
  `sharedResourceInstallers` map (parallel to `serverInstallers`) performs the actual
  file copy for a detected resource name.

### Freshness (decoupled from bundle snapshots)

- `bundles/{name}/snapshot.json` scoped to bundle-owned sources only (agents,
  steering, skills) — servers hashing removed from `computeSourceHashes()`.
- `servers/{name}/snapshot.json` — new, one per server, computed the same way as a
  bundle snapshot but scoped to that server's runtime files only.
- `lib/harnesses/assets/{hookName}/snapshot.json` — new, same pattern for hook
  resources, colocated with the hook's own source.
- `aif snapshot` extended to also generate/check server and hook snapshots
  (`listServers(repoRoot)` and `listHookResources(repoRoot)` helpers).
- `isCurrent(bundleName, harness, repoRoot)` checks both: the bundle's own snapshot
  freshness, and — for every server/hook the bundle depends on — whether that
  resource's manifest-recorded `sourceHashes` match a freshly computed resource
  snapshot. Either being stale marks the bundle not-current.
- `aif status` reports server/hook staleness against their own snapshot once, rather
  than duplicating the signal across every referencing bundle.

### Components Affected

| Component | Change |
|---|---|
| `lib/manifest.js` | New `{ bundles, servers, hooks }` shape; section-aware pure functions (`getSectionEntry`/`setSectionEntry`/`removeSectionEntry`) and I/O wrappers |
| `lib/harnesses/base.js` | `installServers()` returns `[{ name, files }]` grouped per server; `installAgents()` gains `detectSharedResource` detection and returns `{ files, sharedResources }`; new `installSharedResources()` |
| `lib/harnesses/claude.js` | `detectSharedResource`, `sharedResourceInstallers` (block-command); hook installer returns file hashes instead of void |
| `lib/harnesses/kiro.js` | No shared-resource config (unchanged behavior) |
| `lib/commands/install.js` | Single read → mutate all three sections in memory → single write; drop unconditional hook-script install; `isCurrent()` checks resource-level freshness |
| `lib/commands/uninstall.js` | Reference-counted cleanup for `servers` and `hooks` sections; bundle's own files unaffected by resource tagging (no longer needed — server/hook files aren't in `entry.files` at all) |
| `lib/commands/status.js` | Reports `bundles`, `servers`, `hooks` sections; resource staleness shown once, not per referencing bundle |
| `lib/commands/snapshot.js` | `computeSourceHashes()` narrowed to bundle-owned sources; new `buildServerSnapshot()`, `buildHookSnapshot()`; `aif snapshot` processes all three resource types |
| `lib/resolver.js` | New `listServers()`, `listHookResources()` helpers |
| `tests/unit/manifest.test.js`, `tests/integration/manifest.test.js` | Rewritten for section-aware shape |
| `tests/integration/install.test.js`, `install-claude.test.js`, `install-kiro.test.js`, `install-freshness.test.js` | Updated assertions for new manifest shape; hook script now conditional |
| `tests/integration/uninstall-kiro.test.js` | Updated for new shape |
| `tests/integration/uninstall-shared-server.test.js` (new) | Proves the original bug is fixed: two bundles sharing a server, uninstall order-independence |
| `tests/integration/uninstall-shared-hook.test.js` (new) | Same proof for the hook script |
| `tests/unit/claude-adapter.test.js` | `detectSharedResource` unit tests |

---

## Impact on Planning

- No Epic exists yet for this work; it is being implemented directly by AI-Engineer
  following this Decision Record, per direct human instruction
- Any future harness adapter (Copilot, etc.) that introduces its own shared,
  harness-level resource (a script, a config file, anything not owned by a single
  bundle) should follow this same `installedBy` pattern rather than inventing a new
  one
- `aif install --update`'s bundle-level reinstall granularity for shared-resource
  changes is accepted as-is; do not attempt to optimize it as part of this work

---

## Open Items

None. All design questions raised during this session were resolved inline above.
