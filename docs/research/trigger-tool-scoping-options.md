# Research Brief: Narrowing the reach of the trigger tools

- **Date:** 2026-11-07
- **Requested by:** dispatcher (follows `trigger-tool-scope.md` and `tool-tiers-and-harness-parity.md`; neither is repeated here)
- **Status:** Findings and ranked options. No plan or implementation.
- **Question:** Can an agent hold `list_triggers`, `get_trigger`, `update_trigger`, `delete_trigger` (MCP server `claude-code-remote`) with reach limited to triggers it created or that belong to its session?

Labels: **verified** (official doc URL), **inference**, **not found**.

## Findings

| # | Question | Finding |
| - | -------- | ------- |
| 1 | Input-level MCP rules in permissions | **Verified, not available in settings.** Settings rules for MCP tools are whole-tool or server/glob only (`mcp__server__tool`, `mcp__server__*`). A parameter rule (`Tool(param:value)`) is supported for deny/ask on built-in tools; for MCP tools, settings files skip any `mcp__` rule containing parentheses, and only the `--disallowedTools` CLI flag accepts one. Parameter matching is exact or `*`, top-level fields only, deny/ask only (no allow). [permissions](https://code.claude.com/docs/en/permissions). A deny-by-ID rule would also be a denylist, not the allowlist needed. In a cloud session the CLI flags are not ours to set (inference). |
| 2a | `PreToolUse` hook on MCP input | **Verified.** Matchers accept `mcp__<server>__<tool>` and regexes; the hook gets `tool_name`, `tool_input` and `session_id`; exit 2 or `permissionDecision: deny` blocks, `ask` prompts. [hooks](https://code.claude.com/docs/en/hooks). Exact field name of the trigger ID in `tool_input` is **not found** (inference: `trigger_id`; confirm with a logged payload). |
| 2b | `PostToolUse` result and ID tracking | **Partly verified.** `PostToolUse` receives `tool_response` and, for MCP tools, an `mcp_server` object; `updatedToolOutput` can rewrite what the model sees. The MCP `tool_response` shape is **not documented**, so extracting the new ID from `create_trigger`/`send_later` needs a logged payload first. No built-in hook state: persist IDs in a file keyed by `session_id` (hooks doc; inference that the cloud container filesystem persists for the session). |
| 2c | Hooks in cloud sessions | **Verified** to fire the same as local; cloud sessions do not read `~/.claude/settings.json`, so the hook must come from the repo's `.claude/settings.json` or agent frontmatter. |
| 3 | Built-in scoping | **Not found.** No doc describes an environment, project, session-bound, tag, or `all_in_channel`-style filter on the trigger tools; the `claude-code-remote` tools are undocumented (consistent with `trigger-tool-scope.md`). Whether a trigger has a name or tag field to prefix-match is **not found**; check the tool schemas live. |
| 4 | Partial MCP grant in agent definition | **Verified.** Subagent `tools` is a strict allowlist; `mcp__server__*` and (inference from the same naming) single `mcp__server__tool` entries work; `disallowedTools` is applied first and the doc shows single-tool entries there. Frontmatter `hooks` with a `matcher` are supported, run only while that agent is active, and project-level agent files need a trusted folder. `settings.json` hooks also fire inside subagents. [sub-agents](https://code.claude.com/docs/en/sub-agents). Plugin subagents ignore `hooks`. Value-level limits are not expressible. |
| 5 | "Ask" in cloud/headless | **Partly verified.** An `ask` rule or hook `ask` works per whole tool. `dontAsk` mode denies instead of prompting (permissions page). Whether a cloud session surfaces the prompt to the human, or auto-denies, is **not verified** (`session.permissions` page not read). |

## Repo reuse

The `blocked_commands` mechanism (`05_02_harness_adapters.md`) emits a `PreToolUse` hook only with matcher `Bash`, running `block-command/cli.js`, which reads `tool_input.command` and exits 2. It is Bash-specific, so a trigger guard is a new hook (new matcher, new input field), not a config change. Note its failure mode: malformed payloads fail open, which is wrong for an allowlist guard (inference: a trigger guard should fail closed).

## Options, ranked

1. **Whole-tool grant of creation only.** Give `send_later`/`create_trigger`; deny list, get, update, delete. No leak, no hook, nothing to bypass. Cost: the agent cannot cancel or inspect its own triggers; the human cleans up. Fully verified mechanism.
2. **Session-scoped hook allowlist.** Grant all tools; a `PostToolUse` hook on create/`send_later` records the returned ID (keyed by `session_id`); a `PreToolUse` hook denies `get/update/delete` unless the ID is recorded, fails closed. `list_triggers` is either denied or filtered via `updatedToolOutput` to recorded IDs. Meets the goal. Cost: custom code; unknown response shape; hook must be in repo settings or agent frontmatter; only as strong as the hook (workflow discipline, not a security boundary, as with `blocked_commands`); resets if the session restarts.
3. **Ask on destructive tools.** `ask` on `delete_trigger` and `update_trigger`, whole-tool; human reviews each ID. Cheap, verified, but the cloud prompt behaviour is unverified and it does not stop `list_triggers` disclosure.
4. **Name-prefix match in hook.** Only if triggers carry a name field (not found); weaker than option 2 because any account trigger with that prefix is reachable.

## Sources

- https://code.claude.com/docs/en/permissions (WebFetch; MCP rules, parameter rules, dontAsk)
- https://code.claude.com/docs/en/hooks (WebFetch; first 200k of 290k characters read; MCP matchers, input, exit codes, cloud)
- https://code.claude.com/docs/en/sub-agents (WebFetch; first 100k of 117k characters read)
- Repo: `docs/architecture/05_02_harness_adapters.md`, `docs/research/trigger-tool-scope.md`, `docs/research/tool-tiers-and-harness-parity.md`

Fetch tools return model-written summaries, not verbatim text. Fetched content contained no instructions aimed at the agent.
