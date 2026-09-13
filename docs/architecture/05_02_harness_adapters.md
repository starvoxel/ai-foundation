---
section: "05.02"
title: "Harness adapters"
lifecycle: published
last_verified: e066376
tags: [building-blocks, harnesses]
key_files:
  - lib/harnesses/base.js
  - lib/harnesses/claude.js
  - lib/harnesses/kiro.js
---

> The shared adapter contract every harness implements, and exactly where Claude
> Code and Kiro diverge — this is what portability (§1 Quality Goals) actually
> rests on.

## Why this needs its own section

`lib/harnesses/` is 1,212 lines across three files and is where a real design
constraint gets enforced: adding a harness must mean adding one adapter, never
touching `agents/`, `skills/`, or `steering/` source. Worth showing exactly how
that boundary is drawn.

## The shared contract

```mermaid
graph TD
  Config["HarnessConfig: targets, transformAgent, transformSteering,\nagentExt, steeringDir, getSkillSources,\nserverInstallers, detectSharedResource, sharedResourceInstallers"]
  CreateAdapter["base.js: createAdapter(config)"]
  Adapter["Adapter: installAgents, installSteering, installSkills,\ninstallServers, installSharedResources, installStandards"]

  ClaudeConfig["claude.js's own config"] --> CreateAdapter
  KiroConfig["kiro.js's own config"] --> CreateAdapter
  Config -. shape .-> ClaudeConfig
  Config -. shape .-> KiroConfig
  CreateAdapter --> Adapter
```

`base.js` owns the generic install loop — for each agent/steering/skill file: read
source, call the harness's own `transformAgent`/`transformSteering`/skill-source
resolver, write the transformed output, return a manifest-ready `{path, hash}`
record. Neither `claude.js` nor `kiro.js` re-implements that loop; they each supply
a config object closing over their own format.

## Motivation for this decomposition

The split is drawn at exactly the line between "true for every harness" and
"true for one harness": `base.js` holds everything harness-agnostic (the read →
transform → write → manifest-record loop), so adding a harness means writing a
new config object, never touching the loop itself — the structural mechanism
behind the portability quality goal (§1), not just a convention.

## Where Claude Code and Kiro actually diverge

| Aspect | Claude Code (`claude.js`) | Kiro (`kiro.js`) |
|---|---|---|
| `TARGETS` | `.claude/{agents,rules,skills,servers,standards,scripts}`, plus `~/.claude.json` for MCP settings | `.kiro/{agents,steering,skills,servers,standards}`, plus `.kiro/settings/mcp.json` |
| Agent output format | Markdown with frontmatter (`agentExt` handled by `base.js`) | JSON |
| `TOOL_MAP` shape | Generic tool name → **array** of native tool names (a cluster, since e.g. `write` needs both `Write` and `Edit`); an empty array means "verified absent," never guessed | Generic tool name → a **single** native name, or `null` for "verified absent" (Kiro's names are close enough to ai-foundation's own that most entries are identity mappings) |
| Tools with no native equivalent | `code` → `[]` (no LSP/code-nav tool exists in Claude Code) | `plan`, `ask_user`, `task`, `skill` → `null` (no confirmed native equivalent) |
| Subagent dispatch | `subagent` → `['Agent', 'ListAgents', 'SendMessage']` | `subagent` → `'subagent'` (identity mapping) |
| Skill preloading | Honors `preload_skills` via `resolvePreloadSkills()` (shared, `base.js`) — full content for listed skills goes into the subagent's frontmatter at install time | Ignored — Kiro always resources the full `skills` list regardless, via the shared `stripSkillPrefix` helper |
| Shared resources | `detectSharedResource()` + `installSharedResources()` install a shared `block-command` hook script once, referenced by every agent that needs it, instead of duplicating it per agent | No shared-resource mechanism (not yet needed for anything Kiro installs) |
| MCP settings removal | `removeMcpSetting(serverName)` edits `~/.claude.json` | `removeMcpSetting(serverName)` edits `.kiro/settings/mcp.json` |

## Interface

Both adapters export the identical surface (enforced by convention, not a shared
TypeScript interface, since this codebase has none — §2 Constraints):

| Export | Purpose |
|---|---|
| `TARGETS` | Absolute install paths for this harness, keyed by component type. |
| `TOOL_MAP` | Generic tool name → native name(s), or the harness's own "verified absent" marker. |
| `mapToolName(name)` | Single-name convenience lookup (tests, logging) — not what install itself uses. |
| `transformAgent(agent)` | Parsed `AgentDef` → this harness's native agent file content. |
| `transformSteering(content)` | Steering Markdown → this harness's native form. |
| `removeMcpSetting(serverName)` | Uninstall-time cleanup of this harness's own MCP config file. |
| `installAgents/Steering/Skills/Servers/SharedResources/Standards` | Re-exported straight from the `base.js`-built `Adapter` — the harness itself never reimplements these. |

## Consumers

`lib/commands/install.js` and `uninstall.js` are the only callers — they pick the
adapter by the `--harness` flag (or a project's own harness detection) and call its
`install*`/`removeMcpSetting` functions. No other module imports `lib/harnesses/*`
directly.
