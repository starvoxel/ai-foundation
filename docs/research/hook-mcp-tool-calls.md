# Research Brief: Can a hook call an MCP tool?

- **Date:** 2026-11-07
- **Requested by:** dispatcher (follows `trigger-tool-scoping-options.md`; not repeated)
- **Status:** Findings only.
- **Question:** Can a `PreToolUse` hook on `mcp__claude-code-remote__delete_trigger` call `get_trigger` and allow or deny on `persistent_session_id`?

Labels: **verified** (official doc), **inference**, **not found**.

## Findings

| # | Question | Finding |
| - | -------- | ------- |
| 1a | Handler exists | **Verified.** `type: "mcp_tool"` is a fifth handler beside command, http, prompt, agent. Fields: `server` (required, a configured server name; plugin servers as `plugin:<plugin>:<server>`), `tool` (required), optional `input` (string values support `${path}` substitution from the hook JSON, e.g. `${tool_input.trigger_id}`), plus common `if`, `timeout`, `statusMessage`, `once`. [hooks](https://code.claude.com/docs/en/hooks) |
| 1b | Events | **Verified.** `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `Stop`, `UserPromptSubmit` and others support it; `PermissionRequest` too; `SessionStart` at launch and `Setup` skip it (no MCP client yet). Same page. |
| 1c | Version | **Not found.** Changelog fetches (docs page and GitHub CHANGELOG, first ~100k characters of each) contained no `mcp_tool` entry. Related: `mcp_server` hook input needs v2.1.274+ (hooks page). |
| 1d | Result to decision | **Verified.** The tool's text is parsed like command-hook stdout at exit 0: plain text is success; a JSON object is hook output, so the tool itself would have to return `permissionDecision`. [hooks](https://code.claude.com/docs/en/hooks) **Inference:** `get_trigger` returns raw trigger JSON, not decision JSON, so the hook cannot turn `persistent_session_id` into allow/deny. The result is not passed to other logic. |
| 2 | Dynamic servers, cloud | **Not found / unverified.** The `server` field is documented as a "configured" server; dynamic or platform-provided servers (`source: "dynamic"`) are not mentioned. `mcp_server.source` values named include plugin, sdk, user, project; `dynamic` is not listed in the part read. Cloud-specific `mcp_tool` behaviour is not documented. Cloud sessions skip `~/.claude/settings.json` (hooks page). |
| 3 | Prompt/agent hooks | **Partly verified.** Agent hooks (experimental) spawn a verifier that uses tools such as Read, Grep, Glob; whether MCP tools are available is **not found**. Prompt hooks are a single model turn with no tools. No documented way for a command hook to reach the session's MCP servers; **inference:** a command hook could call the platform API itself if it holds credentials (outside the doc, untested). |
| 4 | Failure mode | **Verified: fail open.** `isError: true`, an unconnected server, or a timeout is a non-blocking error and the tool call proceeds. `onFailure: "block"` exists only for command and http hooks. Default timeout 600 s (30 s on `UserPromptSubmit`); `timeout` is settable. On blocking events the hook waits for a connecting server up to `MCP_TIMEOUT`. |
| 5 | Recursion | **Not found.** The docs do not say whether the hook's own MCP call fires `PreToolUse`. Test before relying on it. |

## Verdict

Not viable as a guard. Even if the server is reachable, `mcp_tool` fails open and cannot map the result to a decision; dynamic-server and cloud reach are unverified. A command hook (fail closed, exit 2) remains the supported decision path; for it to check ownership it needs a state file (the `PostToolUse` ID-recording approach in option 2 of the earlier brief) rather than a live `get_trigger` call.

## Sources

- https://code.claude.com/docs/en/hooks (WebFetch; read characters 0 to 200000 of ~290k, plus a grep of 200k to 290k; handler types, events, `mcp_tool` fields, failure semantics)
- https://code.claude.com/docs/en/changelog and https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md (WebFetch; first ~100k characters only)
- Repo: `docs/research/trigger-tool-scoping-options.md`

Fetch tools return model-written summaries, not verbatim text. Fetched content contained no instructions aimed at the agent.
