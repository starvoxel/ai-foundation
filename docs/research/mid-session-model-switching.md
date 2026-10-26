# Mid-session model switching in Claude Code and the Agent SDK (no subagents)

Date: 2026-10-26. Depth: option survey. Primary sources: code.claude.com docs (fetched this session). Docs are versioned heavily (v2.1.2xx-3xx); version gates are noted. Items marked **[unverified]** or **[inference]** were not confirmed in a source.

Fetched content was treated as data; none of it contained instructions to the researcher.

## Question

Can a running session change its own main model mid-session by context (strong model to plan, cheap to implement) without subagents? Feeds: whether ai-foundation (`agents/*.yaml`, Claude Code and Kiro adapters) can do automatic per-phase model selection, and by which mechanism.

## Bottom line (facts only, no recommendation requested)

| Route | Agent can trigger itself? | Mid-session? | Works in cloud? | Cache cost |
|---|---|---|---|---|
| (1) Agent-callable "switch model" tool | No documented tool | n/a | n/a | n/a |
| (2) Settings hook output / env var | No (no hook output sets a model) | n/a | n/a | n/a |
| (3a) Skill/command `model:` frontmatter | Yes (Skill tool or user `/skill`) | Current turn only | Likely yes (unverified) | Cache miss on the turn |
| (3b) Mod (plugin JS) `turn.step` rewrite | Yes, rule-based, no human | Per request, persistent via mod state | Hooks run in cloud for plugins that reach the cloud session | Per-model cache miss on each switch |
| (4) SDK `setModel()` / `set_model()` / `/model` as prompt | Outer orchestrator, not the agent | Yes, takes effect at next model call | Cloud: `/model <name>` typed into session works; programmatic SDK control of cloud sessions not documented | Cache miss |
| (5) `opusplan` | Automatic on plan-mode toggle | Yes | Unverified for cloud | Cache miss on every toggle |
| Advisor tool (adjacent) | Model-driven | n/a (main model stays) | Anthropic API only | Cache preserved |

## 1. Tool or API the agent itself can call

- No model-switch tool is documented. The commands page/skills page say only some built-ins (`/init`, `/security-review`) are reachable through the Skill tool; `/compact` is not; `/model` is not named either way. Source: [Skills](https://code.claude.com/docs/en/skills). Conclusion: the model cannot reliably invoke `/model` itself. **[unverified for /model specifically; absent from both lists]**
- Related but not a switch: the **advisor tool** lets the (cheaper) main model consult a stronger model server-side at decision points; the main model is unchanged. Enabled by `/advisor`, `advisorModel` setting or `--advisor`. Anthropic API only (not Bedrock/Vertex/Foundry); experimental; needs feature-flag fetching. Source: [Advisor](https://code.claude.com/docs/en/advisor). It is a server tool, not a subagent, and keeps the main-model cache intact (same page, "Impact on prompt caching"). Claude decides when to call it; no force/cap setting.

## 2. Hooks and settings.json

Settings hooks (command/HTTP/prompt/agent hooks):

- No hook output field sets a model. `SessionStart` input carries a read-only `model` field (not always present). Hook output fields documented: `updatedInput` (PreToolUse), `updatedToolOutput` (PostToolUse), `additionalContext`, `sessionTitle`, `initialUserMessage`, `watchPaths`, `reloadSkills`, `updatedPermissions`/`setMode` (permission mode only). Source: [Hooks reference](https://code.claude.com/docs/en/hooks) (summarised by fetch; 182k chars of the page were read in part, see Gaps).
- `PreModelSwitch` (v2.1.251+) runs before `/model`, picker, `Option+P`, fast-mode model change, and SDK/Remote Control `set_model` / `apply_flag_settings`; it can block or ask for confirmation, not choose a model. It does not fire for automatic fallback or resume restore. `PostModelSwitch` is context-only. Source: [Hooks: PreModelSwitch](https://code.claude.com/docs/en/hooks#premodelswitch) and [Model config](https://code.claude.com/docs/en/model-config).
- `CLAUDE_ENV_FILE` (SessionStart, Setup, CwdChanged, FileChanged) persists env vars for later Bash commands only; the docs do not say it affects the session model. `$ANTHROPIC_MODEL` is read at launch and does not reflect `/model`. Source: [Hooks](https://code.claude.com/docs/en/hooks), [Model config](https://code.claude.com/docs/en/model-config).
- `ConfigChange` can block a config change taking effect (not policy settings); it does not set one.

settings.json / env:

- `model` in settings, `--model`, `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_MODEL` are startup selections. Precedence: `/model` > `--model` > `ANTHROPIC_MODEL` > settings `model` > `ANTHROPIC_DEFAULT_MODEL`. A `/model` choice is outranked by `model` in project or managed settings and by `ANTHROPIC_MODEL` in the shell. Source: [Model config](https://code.claude.com/docs/en/model-config).
- Editing settings.json mid-session to change `model`: **not documented as live-applied** **[unverified]**. Mods can intercept settings reads (`settings.read` returns `{ value }` replacing merged keys, v2.1.304+), which could inject a `model` value; whether Claude Code re-reads `model` mid-session is **[unverified]**. Source: [Mods events](https://code.claude.com/docs/en/plugins/mods/events).
- `--agent <name>` / `agent` setting: the main thread takes the subagent definition's tool restrictions and model. This is launch-time, whole session. Source: [Sub-agents](https://code.claude.com/docs/en/sub-agents). Interaction with `--model` is not documented there.
- `fallbackModel` / `--fallback-model`: switches for the current turn only on API failure; not a planning/implementation router. Source: [Model config](https://code.claude.com/docs/en/model-config).

## 3. Plugins, skills, slash commands, mods

**Skills / commands with `model:` frontmatter.** "The override applies for the rest of the current turn and isn't saved to settings. The session model resumes when you send your next prompt." Accepts `/model` values or `inherit`; blocked by `availableModels`; ignored in auto mode if unsupported. With `context: fork` it sets a forked subagent's model instead (excluded by the brief). Source: [Skills frontmatter](https://code.claude.com/docs/en/skills). Cache: the turn is a model switch with no cache hits; session model resumes next prompt ([Prompt caching](https://code.claude.com/docs/en/prompt-caching#switching-models)). So a phase skill (e.g. `/plan`) can run one turn on a stronger model; a multi-turn phase will not stay on it. Note a turn includes all its tool-call requests, so a long single-turn autonomous run stays on the skill's model until it ends (inference from "rest of the current turn").

**Mods** (a plugin kind, JS event handlers running inside Claude Code; version gate v2.1.287+; Desktop v2.1.286+). Source: [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview).
- `turn.step` fires before each request to the model; a hook may return `next({ ...e, model })` or `next({ ...e, effort })` to send that request to a different model. Source: [Mods reference, Turns](https://code.claude.com/docs/en/plugins/mods/reference) and [Follow a turn](https://code.claude.com/docs/en/plugins/mods/events). This is the only found mechanism that lets code the repo ships choose the main-thread model automatically per request, including by rule (e.g. permission mode = plan, or a marker in the prompt). Whether the override changes the session's recorded model/status line or only that request is **[unverified]**.
- Other relevant API: `$.session.model` (read), `$.command.run`, `$.config.set`, `$.prompt.submit`, `agent.spawn` (subagent model; out of scope). Whether `$.command.run` can execute the built-in `/model` is **[unverified]**.
- Where mods run: terminal, Desktop, VS Code, `claude -p`, Agent SDK ("Yes" hooks run), and "a cloud session: Yes, for a plugin that reaches the cloud session". Source: [Mods overview, Where mods run](https://code.claude.com/docs/en/plugins/mods/overview). How a plugin reaches a cloud session: see [Cloud environments](https://code.claude.com/docs/en/cloud-environments.md#what-carries-over-from-your-setup) (not read).
- Risk notes (from the same page): a mod is unsandboxed code with the user's permissions; admins can disable all mods (`allowManagedModsOnly`, `disableAllHooks`). Feature is recent; stability/support level not stated in the pages read. The Kiro adapter would have no equivalent **[inference]**.
- This repo has a `plugin-authoring` skill listed in the session; its content was not read.

## 4. Agent SDK / headless / orchestrator control

- TypeScript: `Query.setModel(model?)`, streaming-input mode only; no arg or `"default"` resets. Mid-turn: the in-flight response finishes on the old model, "the rest of the turn, starting with the next model call" uses the new model (v2.1.212+; earlier it waited until next turn). Subagents keep their own model. Also `applyFlagSettings({ model })` (TS only), `supportedModels()`. Source: [TypeScript SDK](https://code.claude.com/docs/en/agent-sdk/typescript).
- Python: `ClaudeSDKClient.set_model(model | None)`; docs do not say if it affects an in-flight turn, or context carry-over. `interrupt()` and `set_permission_mode()` also exist. Source: [Python SDK](https://code.claude.com/docs/en/agent-sdk/python). In `auto` permission mode, a switch to a model without auto support drops to `default` mode (both SDKs).
- No per-message model field is documented; model is per session ([TypeScript SDK](https://code.claude.com/docs/en/agent-sdk/typescript)). The docs do not document a wire-level control-request format ([Python SDK](https://code.claude.com/docs/en/agent-sdk/python)); `set_model`/`apply_flag_settings` control requests are referenced in the PreModelSwitch hook docs.
- Headless `claude -p` and SDK: `/model <name>` typed as the prompt works and applies to the current session only, not saved (v2.1.205+). Also `/effort`, `/fast`, `/config key=value`. Sources: [Model config](https://code.claude.com/docs/en/model-config), [Headless](https://code.claude.com/docs/en/headless).
- Resume with a different model: `--resume`/`--continue` restore the transcript's model unless `--model` or `ANTHROPIC_MODEL` is given. Source: [Model config](https://code.claude.com/docs/en/model-config). So an orchestrator can run phase 1 (`claude -p --model opus`), then `--resume <id> --model sonnet` for phase 2: documented route, cold-cache cost, new process per phase. Cost reporting accumulates across resumes ([Headless](https://code.claude.com/docs/en/headless)).
- `Agent SDK` hooks plus `PreModelSwitch` fire for `set_model` requests, so a policy hook can gate orchestrator switches.

## 5. Built-in features

- `opusplan`: Opus during plan mode, Sonnet during execution; "the built-in way to change models mid-task without manual /model calls". `opusplan[1m]` for 1M context (v2.1.265+). Alias targets set by `ANTHROPIC_DEFAULT_OPUS_MODEL` / `ANTHROPIC_DEFAULT_SONNET_MODEL`. `ANTHROPIC_DEFAULT_MODEL` ignores `opusplan`. Subject to `availableModels`. Sources: [Model config](https://code.claude.com/docs/en/model-config), [Advisor comparison table](https://code.claude.com/docs/en/advisor).
- Fixed pair only (Opus/Sonnet via env overrides to arbitrary IDs); trigger is plan-mode entry/exit, which the agent and hooks can drive (`setMode` in PermissionRequest `updatedPermissions`, SDK `set_permission_mode`, ExitPlanMode) **[inference: plan-mode entry/exit is the trigger; the programmatic drivers are documented separately]**. Haiku for execution is not supported by the alias.
- Automatic model fallback (Fable, Opus 5.5, Sonnet 5.5, Opus 5) on classifier flags is a model switch the harness makes itself ([Prompt caching](https://code.claude.com/docs/en/prompt-caching#switching-models)); not controllable as a router.
- `CLAUDE_CODE_SUBAGENT_MODEL`, `agent.spawn` model: subagents only; excluded.

## 6. Local CLI vs cloud sessions

Source: [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) unless noted.

- `/model`, `/effort`, `/color`, `/rename` work in cloud sessions with the value as an argument (`/model sonnet`); no picker. 
- `/config` in the browser opens the settings page; to change a setting for a cloud session, set an environment variable on the cloud environment, or commit the key to the repo's `.claude/settings.json` (single-repo sessions outside a Project). So `model` in committed `.claude/settings.json` is startup config; see [Settings in cloud sessions](https://code.claude.com/docs/en/settings.md#settings-in-cloud-sessions) (not read).
- Mid-session switch in cloud is rejected if the model is excluded by `availableModels`; the allowlist must be delivered via server-managed settings because device settings do not reach cloud VMs ([Model config](https://code.claude.com/docs/en/model-config)).
- `claude -p "msg" --cloud <session-id>` queues a message into a running cloud session. Whether a message of `/model sonnet` sent this way executes as a command **[unverified]**; the docs say cloud sessions support text built-ins, and the queued message path is a normal user message **[inference]**.
- Hooks/settings in cloud: SessionStart hooks run (time limits apply; see [Cloud environments](https://code.claude.com/docs/en/cloud-environments.md#time-limits)). Settings hooks are in the repo so they travel. Mods run only if the plugin reaches the cloud session.
- Remote Control: model ID is checked locally; PreModelSwitch fires for its set_model.
- Terminal-only built-ins (`/plugin`, `/resume`) are unavailable in cloud.
- The exact programmatic control surface for cloud sessions (Agent SDK-style `setModel` on a claude.ai/code session) is not documented in the pages read **[unverified]**.

## 7. Effect of a mid-session switch on caching and context

Source: [Prompt caching](https://code.claude.com/docs/en/prompt-caching) unless noted.

- Each model has its own cache. After a switch the next request re-reads the whole history uncached even if content is identical; one slower, costlier turn, then re-cached.
- Terminal `/model` asks for confirmation only while the cache is warm (within one cache TTL of the last request) and the new model differs from the last responder; after the TTL it switches silently (v2.1.238+). A `PreModelSwitch` hook can force or skip confirmation.
- TTL: main conversation 1 hour on a Claude subscription within plan usage, otherwise 5 minutes; settable via `promptCacheTtl` / `CLAUDE_CODE_PROMPT_CACHE_TTL` (v2.1.242+).
- Context carries over: the conversation is re-sent as is; the system prompt and tool list stay the same (switching does not alter them per the docs). The 1M window depends on the model/suffix; switching between models of different context windows can force compaction **[inference]**.
- `opusplan`: each plan-mode toggle is a switch with a fresh cache. Skill/command `model:` frontmatter: the turn is a switch; the session model resumes next prompt (a second switch back).
- Not cache-breaking: permission mode changes (except opusplan), skills and commands loading, subagent spawn (separate cache), advisor toggle.
- Effort level: on Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.1 (API key or subscription) changing effort keeps the cache; on other models it does not. So per-phase effort is a cheaper lever than per-phase model **[inference from the docs]**.
- Docs advice: pick model and effort at the top of a session; switching is cheapest at the start or right after `/clear` (the Claude blog says the latter; secondary, see [Maximizing the value of your Claude Code sessions](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions)).
- Cost: with prefix caching a long conversation costs a full uncached read at the new model's input rate per switch; switching often (e.g. every plan toggle) can cost more than staying on one model **[inference]**. Docs do not quantify.

## Mapping to ai-foundation (observations only)

- `agents/*.yaml` has no model field today (repo grep of `agents/*.yaml`, harness-adapter doc and `lib/**/*.js` for "model" matched nothing). Any per-phase selection needs a new field and adapter work; that is a scope decision for the caller.
- Claude Code mechanisms usable without subagents, by automation level: (a) static whole-session model via `--agent`/`model` setting; (b) `opusplan` alias (fixed Opus-plan/Sonnet-execute); (c) skill/command frontmatter `model:` (one turn); (d) mod `turn.step` override (rule-based per request; newest, least proven); (e) outer orchestrator with SDK `setModel`/`--resume --model`/`/model` prompt.
- No settings-hook route exists. Kiro: not researched.

## Gaps and unverified items

- Hooks page: read ~200k of ~282k chars; `PreModelSwitch` input fields table and `ConfigChange` details not fully read. The negative result "no hook output sets a model" is from a summary of the first 100k chars plus targeted passages; confirm against the full page before relying on it.
- Not read: `cloud-environments` (what carries over, plugins in cloud), `settings-reference`, `commands` full table, `remote-control`, the mods TS declarations (`claude-code.d.ts`).
- Unverified: live-reload of `model` in settings.json; `$.command.run('/model')`; whether `turn.step` model override updates session model; `/model` as queued cloud message; Python `set_model` mid-turn semantics; Skill-tool access to `/model`.
- Docs fetched through a summarising model; direct quotes were limited, and some details (version numbers) may be mis-transcribed. Note the version numbers (Opus 5.5, Sonnet 5.5 etc.) reflect the fetched docs, not independently checked.

## Sources

- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/python
- https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/advisor
- https://code.claude.com/docs/en/plugins/mods/overview
- https://code.claude.com/docs/en/plugins/mods/api
- https://code.claude.com/docs/en/plugins/mods/events
- https://code.claude.com/docs/en/plugins/mods/reference
- https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions (secondary, via search snippet only)
