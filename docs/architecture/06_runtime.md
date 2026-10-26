---
section: '06'
title: 'Runtime View'
lifecycle: published
tags: [runtime, manifest, snapshot, scope]
key_files:
  - lib/manifest.js
  - lib/commands/install.js
  - lib/commands/uninstall.js
  - lib/commands/snapshot.js
---

> How installing and uninstalling a bundle actually behaves at runtime, where that
> behavior isn't obvious from §5's static block list — specifically, shared-resource
> lifecycle (MCP servers, the Claude Code hook script) and freshness detection.

## Shared resource lifecycle (servers and hooks)

`.installs.yaml` has three top-level sections: `bundles`, `servers`, `hooks`.
`bundles` entries hold only bundle-owned files (agents, steering, skills,
standards); `servers` and `hooks` are independently-lived resources, each tracking
its own `installedBy: [bundleName, ...]` list rather than being owned by any single
bundle's file list.

```mermaid
sequenceDiagram
  participant Install as aif install
  participant Manifest as .installs.yaml
  participant Uninstall as aif uninstall

  Install->>Manifest: bundle resolves to server/hook X
  Install->>Manifest: create X's entry if absent; add bundleName to X.installedBy
  Note over Install: files for X are (re)written every install — idempotent

  Uninstall->>Manifest: remove bundleName from X.installedBy
  alt installedBy now empty
    Uninstall->>Manifest: delete X's files, deregister MCP config, drop the entry
  else installedBy still non-empty
    Uninstall->>Manifest: leave X installed — another bundle still needs it
  end
```

Only servers an adapter actually installed are recorded; one it skips (unsupported protocol, or stdio at project scope) gets no entry.

A reinstall also releases what the bundle's previous install had and the new one does
not: files no other bundle owns are deleted (emptied directories too), and servers and
hooks it stopped using drop `bundleName` from `installedBy` exactly as `uninstall` does.
An upgrade therefore leaves no retired agents, skills or rules behind. A file that cannot be removed is reported and skipped, so one failure does not stop the install. The new entry no longer lists it, so no later install retries it: remove it by hand.

Bundle-owned files that two bundles install to the same path (every bundle installs all standards, and bundles can share a skill or rule) have no `installedBy` list. `uninstall` instead deletes only the paths no other bundle's manifest entry lists (`splitOwnedPaths()`), so the last owner to go removes them.

This is what makes uninstalling one bundle safe when a second bundle shares a server
(via an agent's `@server/tool` reference) or the Claude Code `block-command` hook
(via an agent's `blocked_commands`) — the shared resource is only physically removed
once nothing references it, instead of being deleted out from under the bundle that
still needs it.

**Detection**: server usage is resolved per bundle the same way it always was
(`resolveBundle()` / `resolveServersFromAgents()`, §5.01). Hook usage is detected
where agent YAML is already parsed, in `base.js`'s `installAgents()` loop, via an
optional harness-supplied `detectSharedResource(agent)` predicate — `claude.js`
returns `'block-command'` when an agent's `blocked_commands` is non-empty; `kiro.js`
has no detector, since it embeds `blocked_commands` directly into each agent's own
JSON and needs no shared external asset.

## Install scope

A global install (the default) writes under the home directory and records it in `.installs.yaml` at the ai-foundation root, with absolute paths. A project install (`--scope project`) writes under `<project>/.claude/` or `.kiro/` and records it in that directory's own `.installs.yaml`, with project-relative paths, so the files and the manifest are committed together. The repo's `.gitignore` ignores `.installs.yaml` except those two.

Committing the install is what lets a session's primary agent exist before Claude Code starts: the SessionStart hook runs only after the agent is resolved, so an agent it installs applies from the next session. Verified locally with headless Claude Code 2.1.310: a committed project agent named by `agent` in the project's `.claude/settings.json` ran as primary on the first turn and outranked a user agent of the same name.

The two scopes keep separate manifests and never share a file. SessionStart's global install passes `--skip-project`, so a bundle the project carries is not also installed globally; that matters because Claude Code ranks a personal skill above a project skill of the same name (research brief `docs/research/project-scope-harness-locations.md`).

Drift: `aif install --scope project --check` reinstalls the recorded bundles into a temporary project and compares the files with the committed ones; in MCP settings files, only aif's own server entries count. It never fails; CI reports drift as a warning.

## Freshness detection

Each bundle, server, and hook resource has its own snapshot of source-file hashes,
computed independently — a bundle's snapshot covers only bundle-owned sources, never
a shared server/hook's files, so a source change to one shared server doesn't appear
to invalidate every bundle that happens to reference it.

`isCurrent(bundleName, ctx)` (used by `aif status` and to decide
whether `aif install` is a no-op; project scope never treats a bundle as current) checks two things: the bundle's own snapshot
freshness, and — for every server/hook the bundle depends on — whether that
resource's manifest-recorded hashes still match a freshly computed snapshot of its
own files. Either being stale marks the bundle not-current. `aif status` reports a
shared resource's staleness once, rather than duplicating the signal once per
referencing bundle.

`aif install --update`'s reinstall granularity stays at the bundle level: if a
shared resource's source changes, every bundle depending on it is independently
marked stale and reinstalled — safe and idempotent (reinstalling just re-upserts the
same shared content), but not optimized to patch the resource once. Accepted as
inefficiency, not a correctness gap.
