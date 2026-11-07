# Plan: Scoped trigger tools for the engineer agent

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-07 |

## Goal

Let the `engineer` agent list, inspect and cancel the scheduled tasks (triggers) it created, without reach over other triggers on the account. Today it holds only `send_later`, so it cannot see or cancel its own reminders. The full `routines` group is account-wide and stays ungranted.

## Scope

- In: a new small tool group holding `list_triggers`, `get_trigger`, `delete_trigger`; `routines` rebuilt on top of it; a fail-closed hook that limits those tools to triggers owned by the calling session; granting the group to `engineer`; removing the trial artifacts.
- Out: `update_trigger`, `fire_trigger`, `create_trigger`, `watch_url` for the engineer; local-harness scheduling tools (`CronCreate`, `ScheduleWakeup`) and Kiro; name-prefix matching; any change to `send_later`.

## Findings this plan rests on

Research briefs (read these first, do not redo them): `docs/research/trigger-tool-scope.md`, `docs/research/trigger-tool-scoping-options.md`, `docs/research/hook-mcp-tool-calls.md`, `docs/research/tool-tiers-and-harness-parity.md`.

- **Reach.** `list_triggers` returns triggers of the whole account (other sessions, other projects, routines made in the web UI). `get_trigger` and `delete_trigger` take any `trig_…` ID. Each trigger carries `persistent_session_id` (for example `session_01SouJM46P7fRzR5kYMChtAm`); a routine has none.
- **Settings cannot scope it.** Permission rules for MCP tools are whole-tool only; there is no per-input allow rule.
- **A hook can.** A `PreToolUse` command hook on the `claude-code-remote` tools receives JSON on stdin. Captured from a real cloud session (`scratch/trigger-hook-log.jsonl`, trial hook on branch `engineer-routines-test`):
  - Common fields: `session_id` (a Claude UUID, not the scheduler's `session_…` ID), `tool_name` (`mcp__claude-code-remote__delete_trigger`), `tool_use_id`, `hook_event_name`, `agent_type`, `permission_mode`, `cwd`, `transcript_path`, `mcp_server: {name: "claude-code-remote", source: "dynamic"}`.
  - `tool_input` is the call's arguments: `{"trigger_id": "trig_…"}` for `get_trigger` and `delete_trigger`, `{}` for `list_triggers`.
  - `PostToolUse` adds `tool_response`: an array of text blocks whose first `text` is a JSON string (parse twice). `send_later` returns `{"fire_at", "now", "trigger_id"}`. `delete_trigger` returns `{"trigger": {… "id", "persistent_session_id" …}}` plus a trailing "Deleted" text block; `get_trigger` uses the same `trigger` wrapper (inferred, not captured); `list_triggers` returns `{"data": [ {id, persistent_session_id?, …} ], "has_more"}`. `create_trigger`'s response is not captured.
  - The delete input has no session ID, and the response that does carry one arrives only after the deletion, so the hook must already know the owner.
- **The hook cannot fetch the list itself.** An `mcp_tool` hook handler exists but fails open on error or timeout, treats plain-text output as success, and only reaches "configured" servers; cloud behaviour with `source: "dynamic"` servers is unverified. Not usable as a guard.
- **Own scheduler session ID.** In a cloud session the environment holds `CLAUDE_CODE_REMOTE_SESSION_ID=cse_<suffix>` and `get_session` reports `session_<suffix>`; the trigger's `persistent_session_id` is `session_<suffix>`. Verified in one session only.
- **Hooks in cloud sessions** come from the repo (`.claude/settings.json` or agent frontmatter); `~/.claude/settings.json` is not read.

## Approach

- **Tool groups** (`lib/constants.js`, `lib/harnesses/claude.js`, `lib/harnesses/kiro.js`). Add `trigger_manage` (T1; name pending, see open questions) mapping to `list_triggers`, `get_trigger`, `delete_trigger`. Define `routines` as the spread of `trigger_manage` plus `create_trigger`, `update_trigger`, `fire_trigger`, `watch_url`, `unwatch_url`, so the two cannot drift; the resolver already de-duplicates shared tools (`resolveTools` in `lib/harnesses/base.js`). Kiro resolves the new group to `UNSUPPORTED`. Update `docs/research/tool-tiers-and-harness-parity.md` and arc42 `05.02`.
- **Guard, pure logic.** A new asset next to `block-command` (`lib/harnesses/assets/`), with a pure `logic.js` and a thin `cli.js`, following the shape in arc42 `05.02` ("The `block-command` hook"). `logic.js` decides from `(event, tool_name, tool_input, tool_response, ownSessionId, knownIds)` and returns the decision plus the IDs to record.
  - `PostToolUse` on `send_later`, `create_trigger`, `get_trigger`, `list_triggers`: parse the response, record each trigger ID whose `persistent_session_id` equals this session's derived ID, and every ID returned by `send_later`/`create_trigger` in this session.
  - `PreToolUse` on `get_trigger`, `delete_trigger`: allow only recorded IDs; otherwise exit 2 with a message telling the agent to call `list_triggers` first, naming no secret. The agent's lookup is recorded by the `PostToolUse` hook, so a retry passes.
  - Optional: `PostToolUse` on `list_triggers` rewrites the output (`updatedToolOutput`) to the session's own triggers only. Include only if the rewrite is verified to work in a cloud session; otherwise leave the list unfiltered, since listing is read-only.
  - State is a JSON file under the project's `scratch/` or the OS temp dir (`node:os`, `node:path`; cross-platform rules apply), keyed by the hook payload's `session_id`.
  - Fail closed: an unparseable payload, an unreadable state file, or an unknown own session ID denies the `PreToolUse` calls. This differs from `block-command`, which fails open.
- **Wiring.** Decide how the adapter emits the hook (see open questions); the default is the same mechanism `blocked_commands` uses: an agent holding `trigger_manage` gets matchers for the tools above, installed as a shared resource.
- **Grant.** `agents/engineer.yaml` replaces the trial `routines` grant with `trigger_manage` (tools and approved_tools) and bumps the agent and bundle versions; reinstall the bundle (`aif install -B engineering -H claude --scope project`) and update the grant snapshots in `tests/validation/agent-tool-sets.test.js` and the unit tests.
- **Remove trial artifacts.** Delete `scripts/trigger-hook-log.js`, its two entries in `.claude/settings.json`, and the "Trial trigger-log hook" bullet in `docs/architecture/11_risks.md` (a `key_files` change; edit the doc or waive with the right section). The captured payloads above replace the log.

## Milestones

### 1. Tool groups

- Does: `trigger_manage` and the re-based `routines` in constants, `claude.js`, `kiro.js`; tests; tiers doc.
- Acceptance criteria: `trigger_manage` resolves to exactly the three tools on Claude and is dropped on Kiro; `routines` resolves to the same eight tools as before (no change for any current holder); a tool shared by both groups is granted once when both are held.
- Verified by: `npm run test:unit`, `npm run test:validation`.

### 2. Guard logic and hook

- Does: the pure decision logic and the CLI wrapper, with fixtures built from the captured payloads above.
- Acceptance criteria: with no recorded IDs every `delete_trigger` and `get_trigger` is denied with a message that names the lookup tool and no ID value beyond the one asked about; after a recorded `send_later` response the same ID is allowed; after a `list_triggers` response only IDs whose `persistent_session_id` equals the own session ID are allowed; a malformed payload, a missing state file for a `PreToolUse`, or an unknown own session ID is denied; a different `session_id` does not see the first session's state; no payload is written to state beyond IDs.
- Verified by: unit tests for `logic.js`; integration tests running `cli.js` over stdin with those fixtures (exit codes, stderr, state file).

### 3. Install and grant

- Does: adapter wiring, the `engineer` grant, bundle reinstall, trial removal, arc42 `05.02` update.
- Acceptance criteria: the installed `engineer.md` lists the three tools and no others from `routines`; the installed hook matcher covers exactly the guarded tools; `aif install --check`, `aif index architecture --check`, `aif validate` and `npm test` pass; no `trigger-hook-log` reference remains.
- Verified by: the commands above plus `npm run lint` and `npm run typecheck`.

### 4. Live check (human-gated)

- Does: in a fresh cloud session on the branch, the human runs the sequence below.
- Acceptance criteria: (a) `send_later`, then `delete_trigger` on that ID succeeds; (b) `delete_trigger` on a trigger from another session (for example the weekly branch review) is denied; (c) `get_trigger` on an unlisted own-session ID is denied until `list_triggers` runs, then allowed; (d) with the state file removed the delete is denied, not allowed.
- Verified by: the results in the session transcript; record unexpected behaviour as a finding.

## Requirements

- Security: the guard fails closed; the deny message and the state file contain trigger IDs only, never prompts, tokens or other response content; the hook never calls the network; a trigger owned by another session or none (a routine) is never deletable through the agent; the full `routines` group is not granted to any agent.
- Logging: a denial writes one line to stderr naming the tool and the reason (`not owned by this session`, `no lookup recorded`, `unreadable state`); allowed calls are silent, like `block-command`.

## Open questions

- **Group name** (human decides). `trigger_manage` is proposed; `local_triggers` was rejected because the tools reach the whole account.
- **Hook wiring** (decide in milestone 3 after reading arc42 `05.02`). Default: emit it from the adapter for any agent holding `trigger_manage`, as `blocked_commands` does. Alternative: a fixed entry in `.claude/settings.json`, which would not travel with an agent install.
- **Own-session ID derivation** (verify in milestone 4). Relies on `CLAUDE_CODE_REMOTE_SESSION_ID`, checked in one session only. If absent, the guard falls back to recorded creations only, and the message must say so.
- **`create_trigger` response shape** (capture in milestone 2 or 4). Not captured; `send_later` is.
- **`updatedToolOutput` filtering of `list_triggers`** (optional; include only if verified in a cloud session).
- **Local sessions** (human decides). The `claude-code-remote` server may not exist outside cloud sessions, so the guard may never fire there and `CronCreate`/`ScheduleWakeup` are unguarded. Out of scope here; research separately if local runs need it.
