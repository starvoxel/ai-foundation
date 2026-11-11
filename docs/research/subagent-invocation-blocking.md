# Blocking an agent from being dispatched as a subagent: Claude Code and Kiro CLI

Question: how can an agent definition be made impossible to dispatch as a subagent, so it runs only when a human invokes it explicitly (`claude --agent <name>`, `/agent`, Kiro equivalent), with the rejection enforced by the harness rather than prompt advice? Researched 2026-11-11. No recommendation requested. Builds on `docs/research/subagent-spawn-allowlist.md` (spawner-side allowlists and the `Agent(name)` deny rule are not repeated beyond what is needed).

Sources: [CC-SUB] https://code.claude.com/docs/en/sub-agents (first 100,000 of 116,972 characters read, plus a later segment), [CC-PERM] https://code.claude.com/docs/en/permissions, [CC-HOOKS] https://code.claude.com/docs/en/hooks (first 200,000 of 293,226 characters read), [CC-CLI] https://code.claude.com/docs/en/cli-reference, [KC-SUB] https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/docs/reference/kiro-cli/chat/subagents.md (a third-party repo's copy of upstream docs), [KIRO-SEARCH] a web-search summary of kiro.dev pages (https://kiro.dev/docs/cli/chat/subagents/, https://kiro.dev/docs/custom-agents/configuration-reference/, https://kiro.dev/docs/cli/2x-reference/).

Source caveat: `kiro.dev` and `dev.classmethod.jp` did not resolve from the fetch tool (they must be allowed in the session network settings to fetch them). All Kiro claims are secondary (KiroCrew copy or search summary), and the search summary reveals a CLI 2.x versus CLI V3 split that the earlier brief missed (section 2.2). Fetched content contained no instructions aimed at the agent.

## 1. Claude Code

### 1.1 Frontmatter on the target agent: no blocking field exists

[CC-SUB] lists 19 supported frontmatter fields: `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `autoCompactWindow`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`, `initialPrompt`, `experimental`. None prevents the agent being spawned or auto-delegated to. `disable-model-invocation` and `user-invocable` belong to skills, not subagents, and per [CC-SUB] "Claude Code ignores a field it doesn't recognize without reporting an error", so setting one on an agent file would be a silent no-op. The `description` field is what Claude uses to route automatic delegation ([CC-SUB], "Write descriptions that single out one subagent"), but removing or weakening it is prompt-level steering, not enforcement, and the name stays spawnable by explicit `subagent_type`.

Conclusion for item 1 on Claude Code: no target-side field. Blocking must be done on the spawner or settings side.

### 1.2 Settings `permissions.deny: ["Agent(name)"]`

- Syntax and effect, [CC-SUB]: "You can prevent Claude from using specific subagents by adding them to the `deny` array in your settings. Use the format `Agent(subagent-name)` where `subagent-name` matches the subagent's name field." It "works for both built-in and custom subagents" and has a CLI form `--disallowedTools "Agent(Explore)"`. [CC-PERM] documents the same rule form under "Agent (subagents)" and states deny is evaluated first: "Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines the outcome."
- Blocks automatic delegation: the docs frame the deny rule as stopping "Claude" from using the subagent, and automatic delegation is Claude calling the Agent tool with a `subagent_type`, which is the call the rule matches. [CC-SUB] has no separate automatic-delegation path outside the Agent tool, so the deny covers it. This is a reasonable inference; the page does not state "this also blocks automatic delegation" in those words. Not tested.
- Scopes: [CC-PERM] describes rules in settings files generally (the fetched excerpt confirms project-shared settings and per-developer settings exist, and managed policy exists). Whether `aif install` can write them: the repo has no code touching `settings.json` today (a search of `lib/` found no match), so this would be new installer capability, not an existing path (repo fact). Concrete scope files are not quoted in the excerpt read; the standard Claude Code locations are `.claude/settings.json` (project, committed), `.claude/settings.local.json`, `~/.claude/settings.json` (user), and managed settings. That list is from general knowledge and was not verified against [CC-PERM] in this session (unverified).
- Granularity: global to the session. It cannot say "deny only when spawned by X", and it also denies the main thread's own Agent tool calls for that type (inference).
- Also available: "To prevent Claude from delegating to any subagent, deny the `Agent` tool itself with `permissions.deny`" [CC-SUB]. That is too broad for this use.
- Parameter matchers exist for `Agent` (`Agent(model:opus)`, `Agent(isolation:worktree)`) per [CC-PERM], but only on model and isolation, not on name beyond the plain `Agent(name)` form.

### 1.3 Can the human still run a denied agent with `--agent` or `/agent`?

Not confirmed. [CC-SUB] says `--agent` starts "a session where the main thread itself takes on that subagent's tool restrictions and model", and [CC-CLI] lists `--agent` ("Specify an agent for the current session"). Neither page says a `permissions.deny` entry `Agent(name)` affects that start path. Because `--agent` does not go through the Agent tool, the rule plausibly does not apply (inference), but this is the key empirical test. The docs reviewed also never mention a `/agent` slash command (not found in the portions read; unverified whether it exists under another name). Known consequence from the earlier brief and [CC-SUB]: `Agent(a, b)` in `tools` is honored only when the agent runs as the `--agent` main thread. By the same logic, the main-thread agent still holds its own tools while the deny blocks the Agent tool for that name.

### 1.4 Hook-based enforcement (spawner side, harness-run)

[CC-HOOKS] confirms the PreToolUse matcher accepts the tool name `Agent`, and that the Agent tool input carries `subagent_type` (also `prompt`, `description`, optional `model`). A PreToolUse hook on `Agent` can therefore read `tool_input.subagent_type` and block, using exit code 2 or the documented decision output (blocking semantics for PreToolUse are the general hook mechanism; the exact JSON decision fields were not re-read here). This is harness-executed, not prompt advice, and is per-spawner scoping capable because hooks fire inside subagents too: [CC-HOOKS] says hooks from settings, managed policy and plugins "also run inside subagents" with `agent_id` and `agent_type` in input. This is the only documented route to "deny X unless spawner is Y". Hook files must be installed by `aif install`; the repo already installs a PreToolUse hook for `blocked_commands` (`lib/harnesses/claude.js`, repo fact), so the mechanism has a precedent, but that one is scoped via agent frontmatter `hooks`, which fires only while that agent runs; a spawn-blocking hook has to live in settings, since it must fire in every spawner.

### 1.5 Detecting "I am a subagent" (fallback guard)

- [CC-HOOKS] common input fields: `agent_id` ("Unique identifier for the subagent or in-process teammate the hook fires in") and `agent_type` ("Present when the session uses `--agent` or the hook fires inside a subagent. For subagents, the subagent's type takes precedence over the session's `--agent` value.").
- Discriminator: `agent_id` present means subagent or teammate; absent on the main thread. `agent_type` alone is ambiguous because it is also set for a `--agent` main thread. The `agent_id` reading is inferred from the field description (it says the hook fires in a subagent); the page does not say "absent on main thread" in the excerpt (unverified).
- `SessionStart` input has `agent_type`, "Present only with `claude --agent <name>`. This is not set for subagents" ([CC-HOOKS]). That is a positive signal for human-launched `--agent` sessions.
- `SubagentStart` cannot block: the exit-code table says "No | Shows stderr to user only", and it supports only `additionalContext` ([CC-HOOKS]). It therefore cannot serve as the rejection point. Use PreToolUse on `Agent` instead (1.4) or a PreToolUse hook inside the target agent's frontmatter that checks `agent_id` and blocks all tools (a self-destruct guard: harness-run, but the agent has already started and consumed a turn; inference).
- Environment variables identifying subagent context: none found in the portions read (unverified). `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is a depth limit, not an identifier ([CC-SUB] via the earlier brief).

### 1.6 Other Claude Code notes

- Plugin and project `.claude/agents/` loading: the permissions page notes some project-scope subagent features (frontmatter hooks, inline `mcpServers`) are not used until the folder is trusted ([CC-PERM]); settings deny rules were not described as trust-gated (not stated).
- User scope vs project scope for the agent file itself is orthogonal: the deny rule matches by name wherever the agent is defined.
- Forks: `Agent(fork)` is deniable separately ([CC-SUB]). A fork is a clone of the current session, not a named subagent, so a name deny does not govern it, and a fork of an `--agent` session keeps that session's system prompt and tools ([CC-SUB]: fork "sees the same system prompt, tools, model, and message history as the main session"). This is a side channel worth noting: if the explicit-only agent is the main thread, a fork behaves as that agent as a subagent. Block with `Agent(fork)` if that matters (inference on impact).

## 2. Kiro CLI

### 2.1 CLI 2.x config (documented in [KC-SUB], [KIRO-SEARCH])

- Keys: `toolsSettings.subagent.availableAgents` ("a glob list of agents this agent may spawn, and omitting it allows all") and `toolsSettings.subagent.trustedAgents` ("run without permission prompts"). Exact quotes from [KC-SUB].
- Delegation requires the `subagent` tool: "An orchestrator agent needs `subagent` in its own `tools` array (or `@builtin`) or it cannot delegate." [KC-SUB]
- Target-side blocking: none. [KC-SUB] states no dedicated setting makes an agent non-spawnable and no value of `availableAgents` is described as blocking spawning. The main agent "picks one from the `description` field, or you name it in the prompt" ([KC-SUB]), the same description-routing as Claude.
- Consequence: the only Kiro CLI 2.x mechanism is spawner-side. For an explicit-only agent `X`, every spawner's `availableAgents` must omit `X`, but an agent with `subagent` in `tools` and no `availableAgents` "allows all", so exclusion requires every delegating agent to carry an explicit allowlist. There is no global deny. Enforcement strength (fail-closed) is not documented in sources reached (unverified), as noted in the earlier brief.
- A non-interactive subagent "fails fast when a tool needs approval unless the agent is in `trustedAgents`" ([KC-SUB]).

### 2.2 CLI V3 differs (new finding, secondary source only)

The [KIRO-SEARCH] summary of kiro.dev states: "CLI V3 ignores toolsSettings. To limit which agents an agent can spawn in CLI V3, list subagent/<name> entries in its tools instead of subagent. In V3, trusted agents are set through a subagent capability allow rule instead of trustedAgents", and that the configuration reference calls `toolsSettings` "CLI 2.x legacy per-tool configuration; ignored by CLI V3". The earlier brief's `permissions.rules` capability list including `subagent` (from the KiroCrew copy of the config reference) fits this. So in V3 the spawn allowlist moves into `tools` entries of the form `subagent/<name>` and trust into `permissions.rules` with capability `subagent` and effect `allow`. Whether `permissions.rules` accepts an `effect: deny` for capability `subagent` with a `match` list (as the repo already emits for capability `shell`, `lib/harnesses/kiro.js`) is not confirmed (unverified); if it does, that would be the closest Kiro analogue to Claude's `Agent(name)` deny. Exact V3 key shapes need fetching from https://kiro.dev/docs/custom-agents/configuration-reference/ once the host is reachable. The summary also flags inconsistent docs (markdown agent files in `.kiro/agents` versus JSON), so the repo's target schema version must be pinned before choosing keys.

### 2.3 Human invocation and detection

- Kiro human invocation (`--agent`, `/agent` swap): not described in [KC-SUB]; not verified in primary docs. Whether an explicit start bypasses spawner-side lists is expected (the lists govern the `subagent` tool only) but unconfirmed.
- Detecting subagent context in Kiro hooks or env: not researched at primary level; no source found (unverified).

## 3. Side-by-side

| Aspect | Claude Code | Kiro CLI |
| --- | --- | --- |
| Target-agent field blocking spawn | None (19 fields, none applicable) | None documented |
| Global deny by name | `permissions.deny: ["Agent(name)"]`, `--disallowedTools` | None found for 2.x; V3 `permissions.rules` deny on `subagent` unverified |
| Per-spawner restriction | `tools: Agent(a, b)` (main thread only); PreToolUse hook on `Agent` reading `tool_input.subagent_type` | `toolsSettings.subagent.availableAgents` (2.x); `subagent/<name>` in `tools` (V3, secondary) |
| Covers automatic delegation | Yes by inference (same Agent tool call) | Spawner list governs the same tool |
| Human explicit start of a denied agent | Unconfirmed; probably unaffected (not an Agent tool call) | Not documented |
| Subagent detection | `agent_id` / `agent_type` in hook input; SessionStart `agent_type` only for `--agent` | Not found |
| Installer path today | None writes settings files (repo `lib/` search) | `kiro.js` already emits `permissions.rules` |

## 4. What `aif install` would need (facts and gaps, no recommendation)

- Claude: a field like `invocation: explicit` has no frontmatter translation; it requires writing `permissions.deny` entries (project `.claude/settings.json` or user `~/.claude/settings.json`) or installing a settings-level PreToolUse hook on `Agent`. No existing adapter code writes settings files (repo fact), so ownership and merging of a user-edited settings file would be new design work.
- Kiro: translation depends on CLI version (2.x versus V3). Either way every spawning agent in the bundle must be rewritten with an allowlist excluding the explicit-only agent; agents installed outside the bundle remain unrestricted.
- Residual gaps: Claude fork side channel (1.6), `--agent` interaction with deny (1.3), Kiro enforcement semantics.

## 5. Unverified list

Claude: whether `--agent` or any `/agent` command is blocked by an `Agent(name)` deny; that deny also blocks description-based automatic delegation (inferred, not tested); exact settings file scopes and precedence (general knowledge, not re-read); absence of `agent_id` on the main thread; any env var marking subagent context; the PreToolUse JSON decision field names; remaining unread parts of [CC-SUB] (final ~17k characters partly read) and [CC-HOOKS] (last ~93k characters). Kiro: all claims are secondary; V3 `subagent/<name>` tools entries and `permissions.rules` subagent deny; fail-closed behavior; human `--agent` invocation; subagent detection; nesting.
