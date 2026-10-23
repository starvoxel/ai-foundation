# Subagent spawn allowlists: Claude Code and Kiro CLI

Question: can an agent be restricted to spawning only a named set of subagent types (example: `engineer` may spawn `reviewer` and `security-reviewer`, never `engineering-researcher`)? Researched 2026-10-23. No recommendation was requested beyond the smallest-change proposal in section 4.

Sources: [CC-SUB] https://code.claude.com/docs/en/sub-agents, [CC-PERM] https://code.claude.com/docs/en/permissions, [CC-LOG] https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md, [KIRO-SUB] https://kiro.dev/docs/cli/chat/subagents (search-result snippets only; see caveat), [KC-SUB] https://github.com/kirodotdev/KiroCrew/blob/main/docs/reference/kiro-cli/chat/subagents.md, [KC-CFG] https://github.com/kirodotdev/KiroCrew/blob/main/docs/reference/kiro-cli/custom-agents/configuration-reference.md.

Source caveat: `kiro.dev` and related hosts did not resolve from the fetch tool in this session (DNS failure). Kiro findings come from (a) web-search result summaries of kiro.dev pages and (b) the KiroCrew repo's copy of the docs, which states it "describes upstream's subagent model" (per the fetch summary of [KC-SUB]). Treat Kiro quotes as one hop from primary.

## 1. Claude Code

### 1.1 Allowlist in agent frontmatter (`tools`)

[CC-SUB] documents this snippet:

```yaml
---
name: coordinator
description: Coordinates work across specialized agents
tools: Agent(worker, researcher), Read, Bash
---
```

- Semantics, quoted from [CC-SUB]: "This is an allowlist: only the `worker` and `researcher` subagents can be spawned. If the agent tries to spawn any other type, the request fails and the agent sees only the allowed types in its prompt."
- Several names: yes, comma-separated inside one `Agent(...)` (the doc's example has two). A single name follows the same pattern (inference; no single-name example seen).
- `Agent` without parentheses allows any subagent. Omitting `Agent` from `tools` means the agent "can't spawn any subagents with the Agent tool." [CC-SUB]
- The name must match the target subagent's `name` field (documented for the deny form in [CC-SUB]; presumed identical here, unverified).
- Denied spawn: documented as the request failing, i.e. fails closed, and enforced by the harness (tool-level), not prompt advice. Exact error text not found.

### 1.2 Scope: main thread only

[CC-SUB]: "The `Agent(agent_type)` allowlist syntax applies only to an agent running as the main thread with `claude --agent`. In a subagent definition, listing `Agent` in `tools` lets that subagent spawn subagents of its own while the depth limit allows it, but any type list inside the parentheses is ignored."

Consequence: if `engineer` runs as a dispatched subagent rather than the `--agent` main thread, the allowlist is silently ignored and it may spawn any type (including `engineering-researcher`) subject to depth. This is the key caveat for the example.

### 1.3 Settings-level rules (deny, applies everywhere)

[CC-PERM] "Agent (subagents)": rules `Agent(Explore)`, `Agent(Plan)`, `Agent(my-custom-agent)` match subagents by name; "Add these rules to the `deny` array in your settings or use the `--disallowedTools` CLI flag":

```json
{
  "permissions": {
    "deny": ["Agent(Explore)"]
  }
}
```

[CC-SUB] adds `claude --disallowedTools "Agent(Explore)"` and says the form works for built-in and custom subagents. This is global to the session/scope: it cannot say "deny `engineering-researcher` for `engineer` only". Because architect/EM may legitimately dispatch the researcher in this repo's roster, a blanket deny is not a per-agent substitute (inference from AGENTS-level roster; not verified in this brief).

Only deny/`--disallowedTools` forms are documented for `Agent(name)`. Whether `permissions.allow: ["Agent(name)"]` acts as an exclusive allowlist was not found; unverified. [CC-PERM] also documents parameter matchers such as `Agent(model:opus)` and `Agent(isolation:worktree)` (unrelated to name filtering).

### 1.4 Subagents spawning subagents

[CC-SUB]: by default "a subagent can spawn subagents up to three layers below the main conversation"; at the limit Claude Code "withholds the `Agent` tool from every subagent except a fork" (a fork keeps the tool but gets an error). Limit set via env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (`1` turns nesting off). Withhold `Agent` from a subagent by omitting it from `tools` or listing it in `disallowedTools`. Default history per [CC-SUB]: v2.1.172-2.1.216 allowed five layers; v2.1.217-2.1.218 default one; v2.1.219 raised to three. A fork cannot spawn further forks. `Agent(fork)` can be denied in `permissions.deny`. Concurrency cap: 20 running subagents by default (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`).

### 1.5 Interaction with `Agent`, `ListAgents`, `SendMessage`

- Allowlist syntax attaches only to `Agent`; it is the spawn gate.
- `SendMessage` "to resume a subagent by setting `to` to its agent ID or name" and "doesn't require agent teams to be enabled" [CC-SUB]. It resumes existing agents, so it is not a spawn path for a new type by that description; whether it can resume an agent of a type outside the allowlist was not documented (unverified). Note in [CC-LOG] 2.1.118: subagents "resumed via `SendMessage`" exist as a feature.
- `ListAgents`: [CC-SUB] says it "follows these filters like any built-in tool: a foreground subagent inherits it in sessions where cross-session messaging is enabled, and a background subagent doesn't keep it." Nothing found stating `ListAgents` is filtered by the `Agent(...)` list (unverified). It does not spawn.
- Whether a main-thread `tools:` line mixing `Agent(a, b), ListAgents, SendMessage` is accepted as expected: not shown in the docs; unverified but no contrary statement.

### 1.6 Versions

- Allowlist landed in v2.1.33, changelog entry: "Added support for restricting which sub-agents can be spawned via `Task(agent_type)` syntax in agent "tools" frontmatter" [CC-LOG].
- `Task` renamed to `Agent` in v2.1.63; "Existing `Task(...)` references in settings and agent definitions still work as aliases" [CC-SUB].
- Depth-limit changes: see 1.4. `ListAgents` introduction version not found.

## 2. Kiro CLI

### 2.1 Mechanism: `toolsSettings.subagent`

[KC-CFG] (JSON agent file, `toolsSettings` is "Per-tool configuration"):

```json
"subagent": {
  "availableAgents": ["reviewer", "tester"],
  "trustedAgents": ["reviewer"]
}
```

[KC-SUB]:

```json
{
  "toolsSettings": {
    "subagent": {
      "availableAgents": ["reviewer", "tester", "docs-*"],
      "trustedAgents": ["reviewer", "tester"]
    }
  }
}
```

- "`availableAgents` is a glob list of agents this agent may spawn, and omitting it allows all." "`trustedAgents` run without permission prompts." [KC-SUB]
- Several names: yes (array), plus globs such as `docs-*`. Glob syntax beyond that example is not defined in the pages seen.
- The delegating agent needs `subagent` in its own `tools` array: "An orchestrator agent needs `subagent` in its own `tools` array" [KC-SUB].
- A named custom subagent "uses that agent's own `tools` and `permissions`" [KC-SUB]; restrict a subagent in its own config, not the parent's.
- Kiro's `permissions.rules` capability list includes `subagent` ("`fs_read`, `fs_write`, `shell`, `web_fetch`, `web_search`, `mcp`, `subagent`, `all`") but no `subagent` rule example is shown [KC-CFG]. Whether `permissions.rules` with capability `subagent` could replace `toolsSettings.subagent`: unverified.

### 2.2 Limits and caveats

- Enforced vs advisory, fail-closed on a name outside `availableAgents`: not documented in sources reached (unverified). The docs' phrasing ("agents this agent may spawn") suggests enforcement; this is inference.
- Interaction between `availableAgents` and `trustedAgents` (the page has a "Combining both settings" section per search summaries): text not retrieved. Unverified whether a trusted agent must also be available.
- Subagents spawning subagents: not stated in [KC-SUB]. Unverified. The default subagent "has the same built-in tools as the main agent" [KC-SUB], which hints a subagent could hold the `subagent` tool, but this is inference.
- Per search summary of [KIRO-SUB]: main agent can run up to 4 subagents in parallel (secondary, unverified).
- `toolsSettings` is marked "Deprecated for the shell and write rules below, which `permissions.rules` now expresses"; the page "does not mark `toolsSettings.subagent` as deprecated" [KC-CFG]. Schema stated as "the IDE 1.0 / CLI 3.0 one"; `/upgrade-agent` migrates older configs [KC-CFG]. Version where `availableAgents` first appeared: not found.
- Harness-agnostic note: a docs page also states subagent tool access is per-agent config, so there is no separate global deny.

## 3. Side-by-side

| Aspect                     | Claude Code                                                        | Kiro CLI                                               |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| Per-agent allowlist        | `tools: Agent(a, b)` in agent frontmatter                          | `toolsSettings.subagent.availableAgents` in agent JSON |
| Multiple names             | Yes, comma list                                                    | Yes, array plus globs                                  |
| Scope limit                | Main thread (`--agent`) only; ignored inside a subagent definition | Not documented                                         |
| Global deny                | `permissions.deny: ["Agent(name)"]`, `--disallowedTools`           | None found                                             |
| Fail closed                | Documented: request fails                                          | Not documented                                         |
| Nesting                    | Up to 3 layers default; env-tunable                                | Not documented                                         |
| Since                      | v2.1.33                                                            | Not found                                              |
| Separate prompt-free trust | n/a (permission rules)                                             | `trustedAgents`                                        |

## 4. Proposal for this repo (smallest change)

Facts from the repo: `TOOLS.SUBAGENT = 'subagent'` (lib/constants.js); Claude `TOOL_MAP` maps it to `['Agent','ListAgents','SendMessage']`; Kiro maps it to `['subagent']`; `engineer.yaml` lists `subagent` in `tools` and omits it from `approved_tools`; `transformAgent` in claude.js emits `tools: <comma-joined>` and ignores `approved_tools`; `resolveTool` in base.js throws `UnknownToolError` for any name not in `TOOL_MAP` or an `@server/tool` ref (so a scoped grant needs resolver support).

Proposed YAML (illustrative):

```yaml
tools:
  - 'subagent:reviewer'
  - 'subagent:security-reviewer'
```

Alternative to avoid parsing a suffix: a new optional agent field such as `spawnable_agents: [reviewer, security-reviewer]`, with plain `subagent` kept in `tools`. Either way:

- Resolver: treat `subagent:<name>` as the `subagent` group scoped to names; collect scoped names into a list; a bare `subagent` stays unrestricted. Mixing bare and scoped should be a validation error (inference).
- Claude emission: replace the `Agent` member with `Agent(reviewer, security-reviewer)`, keeping `ListAgents` and `SendMessage` as-is, e.g. frontmatter `tools: Read, Write, Edit, Bash, ..., Agent(reviewer, security-reviewer), ListAgents, SendMessage`. Inferred from [CC-SUB]; mixing is not shown in the docs.
- Kiro emission: keep `tools: [..., "subagent"]` and add `toolsSettings.subagent.availableAgents: ["reviewer","security-reviewer"]`. Optionally `trustedAgents` from `approved_tools` entries such as `subagent:reviewer` (this would give `approved_tools` a real Claude-independent meaning only on Kiro; Claude has no equivalent field).
- Claude `approved_tools` remains no-op; the spawn allowlist should live in `tools` (the Claude grant surface), not `approved_tools`.
- `aif validate` could check that each named agent exists in `agents/`.

Caveats to carry into any plan:

1. Claude enforcement holds only when `engineer` runs as the `--agent` main thread. As a dispatched subagent the list is ignored [CC-SUB]. If that matters, the only harness-enforced backstop is a session/settings `permissions.deny` of `Agent(engineering-researcher)`, which is global (blocks other agents too), or a `PreToolUse` hook on the `Agent` tool (not researched here; unverified whether hooks can see/deny Agent calls by type).
2. Kiro fail-closed behavior, glob semantics, and nesting are undocumented in reachable sources; verify empirically before relying on it.
3. The researcher's "human-confirmed dispatch" requirement is a prompt-level rule; a harness allowlist enforces exclusion, but not human confirmation.

## 5. Unverified list

Claude: exact error text on denied spawn; `allow: ["Agent(name)"]` exclusivity; `ListAgents`/`SendMessage` filtering by allowlist; mixing `Agent(...)` with `ListAgents`/`SendMessage`; `ListAgents` introduction version; hook coverage of Agent calls. Kiro: enforcement/fail-closed; glob grammar; availableAgents vs trustedAgents interaction; nesting; introduction version; `permissions.rules` `subagent` capability use.

No fetched content contained instructions aimed at the agent.
