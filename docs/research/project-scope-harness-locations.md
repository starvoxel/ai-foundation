---
name: 'project-scope-harness-locations'
tags: ['claude-code', 'kiro', 'install', 'project-scope', 'mcp']
scope: 'all'
description: 'Where Claude Code and Kiro read project-level agents, rules/steering, skills and MCP config, and how project and user scope take precedence, for aif install --scope project.'
---

# Project-scope harness locations (Claude Code, Kiro)

Question: for `aif install --scope project`, which in-repo paths do Claude Code and Kiro (IDE and kiro-cli) read at session start for agents, rules/steering, skills and MCP servers, and how do they rank against the user/global copies? Researched 2026-10-26. No recommendation requested.

Labels: **documented** = stated in official docs; **reported** = search-result summary of official docs, community issue, or mirror; **inference** = my reasoning, unverified.

Source caveat: `kiro.dev` (and its `alpha.us-east-2.kiro.adc.aws.dev` mirror) did not resolve from the fetch tool (DNS failure), as in `docs/research/subagent-spawn-allowlist.md`. Kiro findings come from web-search summaries of kiro.dev pages and the KiroCrew repo's copy of the kiro-cli docs, so they are one hop from primary. Recheck them on kiro.dev before relying on them.

Sources: [CC-SUB] https://code.claude.com/docs/en/sub-agents · [CC-MEM] https://code.claude.com/docs/en/memory · [CC-SKL] https://code.claude.com/docs/en/skills · [CC-MCP] https://code.claude.com/docs/en/mcp · [CC-HOOK] https://code.claude.com/docs/en/hooks · [CC-SREF] https://code.claude.com/docs/en/settings-reference · [CC-SET] https://code.claude.com/docs/en/settings · [CC-CLOUD] https://code.claude.com/docs/en/cloud-environments · [GH-26429] https://github.com/anthropics/claude-code/issues/26429 · [GH-33815] https://github.com/anthropics/claude-code/issues/33815 · [K-CA] https://kiro.dev/docs/custom-agents/ · [K-CAC] https://kiro.dev/docs/custom-agents/creating/ · [K-CLI-CA] https://kiro.dev/docs/cli/custom-agents/creating/ · [K-CA-TS] https://kiro.dev/docs/cli/custom-agents/troubleshooting/ · [K-SUBA] https://kiro.dev/docs/chat/subagents/ · [K-V1] https://kiro.dev/docs/ide/whats-new-v1/ · [K-CREW] https://kiro.dev/docs/crew/capabilities/agents/ · [K-CFGREF] https://github.com/kirodotdev/KiroCrew/blob/main/docs/reference/kiro-cli/custom-agents/configuration-reference.md · [K-STEER] https://kiro.dev/docs/steering/ · [K-CLI-STEER] https://kiro.dev/docs/cli/steering/ · [K-SKL] https://kiro.dev/docs/skills/ · [K-CLI-SKL] https://kiro.dev/docs/cli/skills/ · [K-MCP] https://kiro.dev/docs/mcp/configuration/ · [K-CONF] https://kiro.dev/docs/configuration/

## Claude Code

### 1. Project-level locations

| Component | Path                             | Notes                                                                                                                                          |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagents | `.claude/agents/*.md`            | Discovered by walking up from the cwd to the repo root; nearest definition wins among nested dirs [CC-SUB].                                    |
| Skills    | `.claude/skills/<name>/SKILL.md` | Loaded from the start dir and every parent up to the repo root; dirs below the start dir load when Claude first touches a file there [CC-SKL]. |
| Rules     | `.claude/rules/**/*.md`          | Exists. Files found recursively. Without `paths` they load at launch "with the same priority as `.claude/CLAUDE.md`" [CC-MEM].                 |
| MCP       | `.mcp.json` at project root      | Top-level key `mcpServers` [CC-MCP].                                                                                                           |

- **`paths:` frontmatter in rules works**: YAML list or comma-separated globs; the rule loads only when Claude works with matching files. Globs for project rules resolve against the directory that holds the rule's `.claude` folder [CC-MEM]. A `.claude/rules` symlink pointing outside the working directory needs a once-per-project approval, after which only rules without `paths` load [CC-MEM].
- **`.mcp.json` expansion**: `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url`, `headers` [CC-MCP].
- **`CLAUDE_PROJECT_DIR` in `.mcp.json`**: Claude Code sets it in the spawned stdio server's environment, not in its own. So `${CLAUDE_PROJECT_DIR}` in a project `.mcp.json` `command`/`args` needs a default such as `${CLAUDE_PROJECT_DIR:-.}` [CC-MCP]. Inference: with `:-.`, the path resolves relative to Claude Code's cwd, so a session started in a subdirectory may get the wrong path.
- **Approval**: interactive sessions prompt before using project `.mcp.json` servers. `enableAllProjectMcpServers` (all) or `enabledMcpjsonServers` (named list) pre-approve them. Both are "Any file" keys, but in a folder whose trust dialog is not accepted they are ignored from the shared `.claude/settings.json` and honored only from user, managed or `--settings` sources. `disabledMcpjsonServers` always rejects [CC-SREF], [CC-MCP].
- **Trust gate on agent hooks**: project-level agent frontmatter hooks need the workspace trust dialog accepted for the folder that holds the agent file. Plugin subagents ignore frontmatter hooks [CC-SUB].
- **Cloud sessions**: the repo's `.claude/agents`, `.claude/skills`, `.claude/rules`, `.claude/settings.json` hooks and `.mcp.json` all carry over (`.mcp.json` and settings only "in a session with one repository"). User `~/.claude/{skills,agents}` and `~/.claude.json` servers do not; the docs say to commit them to the repo instead [CC-CLOUD].
- **Not native**: `.claude/standards/` and `.claude/scripts/` are not documented harness locations (inference from their absence in [CC-SUB], [CC-SKL], [CC-MEM]). They are plain files that agents or hooks reference by path.

### 2. Precedence: same name at user and project scope

| Component  | Winner                                                                                                           | Source              |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------- |
| Subagent   | **Project** (`.claude/agents` priority 3 beats `~/.claude/agents` priority 4; managed 1, `--agents` 2, plugin 5) | documented [CC-SUB] |
| Skill      | **Personal beats project** ("With `deploy` in both… `/deploy` runs the personal one"); enterprise beats both     | documented [CC-SKL] |
| MCP server | **Local > project > user** (then plugin, then claude.ai connectors); whole entry wins, no field merge            | documented [CC-MCP] |
| Rules      | **Neither**: user rules load first, project rules later; on conflict "Claude may follow either one"              | documented [CC-MEM] |

Implication (inference): a stale global install of a skill silently shadows the committed project copy. Agents and MCP servers do not have this problem.

### 3. `$CLAUDE_PROJECT_DIR` in agent-frontmatter `hooks:` (PreToolUse)

- Documented: hooks get `CLAUDE_PROJECT_DIR` ("the project root where the session started"), exported to the spawned process and substituted into exec-form `command`/`args` [CC-HOOK]. Frontmatter supports all hook events, including `PreToolUse` [CC-SUB].
- **Undocumented** whether this applies to agent- or skill-frontmatter hooks specifically. [CC-HOOK] does not say, and its only frontmatter example uses a relative path (`./scripts/...`).
- Reported against: [GH-33815] (v2.1.74) said the variable was empty in PreToolUse hooks and Bash calls on macOS, Windows and WSL2. It was auto-closed "not planned" for inactivity, with no maintainer response or fix version. [GH-26429] said it was empty inside Task subagents (probably the Bash env); it was auto-closed "not planned". Other reports, via claudeissues.com search summaries, say frontmatter hooks do not fire for subagents at all (#18392, #19213, #30260); not verified.
- Status: **unknown / reported-fragile**. The community workaround in [GH-33815] falls back to the git toplevel when the variable is empty. Verify on the target Claude Code version before relying on it.

### 4. `"agent": "<name>"` in project `.claude/settings.json`

- Documented: the key takes "the name of a built-in or custom agent", can be set in any settings file, and `--agent` overrides it [CC-SREF], [CC-SUB].
- **Not stated** which scope the name resolves against. Inference: it uses the same subagent registry, so a project `.claude/agents/<name>.md` resolves, and on a name clash the precedence in §2 applies (project beats user). Unverified. If the agent is missing on resume, the session continues with default tools and a warning [CC-SUB].

## Kiro (IDE and kiro-cli)

### 5. Workspace locations

| Component     | Workspace path                           | Format / notes                                                                                                                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Custom agents | `.kiro/agents/`                          | JSON or Markdown; the filename (without `.json`/`.md`) becomes the agent name [K-CFGREF], [K-CAC]. IDE 1.0 introduced Markdown agents with YAML frontmatter [K-V1], [K-SUBA]. Existing JSON agents keep working (reported, French docs). Shared by IDE and CLI [K-CREW]. Workspace agents load only if the workspace is trusted [K-CLI-CA] (reported). |
| Steering      | `.kiro/steering/*.md`                    | [K-STEER], [K-CLI-STEER]. A custom agent gets steering only via `resources` such as `file://.kiro/steering/**/*.md`, loaded at startup [K-CFGREF].                                                                                                                                                                                                     |
| Skills        | `.kiro/skills/<name>/SKILL.md`           | Docs recommend committing the folder [K-CLI-SKL]. Custom agents do not load skills by default; add `skill://.kiro/skills/*/SKILL.md` to `resources` (metadata at startup, full content on demand) [K-CLI-SKL], [K-CFGREF].                                                                                                                             |
| MCP           | `.kiro/settings/mcp.json` (`mcpServers`) | [K-MCP]. An agent includes these servers via `includeMcpJson`, and can also define `mcpServers` inline [K-CFGREF]. `${VAR}` expansion is gated by an approved-env-var list; see `docs/kiro-mcp-env-var-expansion.md`.                                                                                                                                  |

- `KIRO_HOME` relocates the global `~/.kiro` [K-CONF] (reported).
- Inference: `.kiro/standards/` is ai-foundation's own convention, not a Kiro location. It reaches an agent only through `resources`.

### 6. Precedence: workspace vs global (`~/.kiro`)

| Component    | Winner                                                                                                                                                                      | Confidence                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Agents (CLI) | **Workspace**; "local takes precedence", with a warning on conflict                                                                                                         | reported [K-CFGREF], [K-CLI-CA], [K-CA-TS] |
| Agents (IDE) | **Workspace**, per a search summary of [K-CA]. Another summary found only the selector's listing order [K-SUBA], so this is not confirmed for the IDE                       | reported, weak                             |
| Steering     | **Workspace** wins on conflicting instructions; both sets load                                                                                                              | reported [K-STEER], [K-CLI-STEER]          |
| Skills       | **Workspace** overrides a global skill with the same name (opposite of Claude Code)                                                                                         | reported [K-SKL]                           |
| MCP          | Files are **merged**; on a name clash the workspace entry wins; inline agent `mcpServers` reportedly rank highest. Whether the merge is whole-entry or per-field is unknown | reported [K-MCP]                           |

## Summary table

| Component                                               | Claude Code project path                      | Conf.                              | Kiro project path                               | Conf.                          |
| ------------------------------------------------------- | --------------------------------------------- | ---------------------------------- | ----------------------------------------------- | ------------------------------ |
| Agents                                                  | `.claude/agents/<name>.md`                    | documented [CC-SUB]                | `.kiro/agents/<name>.json` or `.md`             | reported [K-CFGREF], [K-CAC]   |
| Agent precedence                                        | project > user                                | documented [CC-SUB]                | workspace > global                              | reported (CLI), weak (IDE)     |
| Rules / steering                                        | `.claude/rules/**/*.md` (`paths:` supported)  | documented [CC-MEM]                | `.kiro/steering/*.md` (via agent `resources`)   | reported [K-STEER], [K-CFGREF] |
| Rules precedence                                        | none, both load, user first                   | documented [CC-MEM]                | workspace wins on conflict                      | reported [K-STEER]             |
| Skills                                                  | `.claude/skills/<name>/SKILL.md`              | documented [CC-SKL]                | `.kiro/skills/<name>/SKILL.md` (via `skill://`) | reported [K-CLI-SKL]           |
| Skill precedence                                        | **personal > project**                        | documented [CC-SKL]                | workspace > global                              | reported [K-SKL]               |
| MCP                                                     | `.mcp.json` (`mcpServers`), approval required | documented [CC-MCP], [CC-SREF]     | `.kiro/settings/mcp.json` (`mcpServers`)        | reported [K-MCP]               |
| MCP precedence                                          | local > project > user, no merge              | documented [CC-MCP]                | merged, workspace wins on clash                 | reported [K-MCP]               |
| `${CLAUDE_PROJECT_DIR}` in `.mcp.json` `command`/`args` | needs `:-default`                             | documented [CC-MCP]                | n/a                                             |                                |
| `$CLAUDE_PROJECT_DIR` in agent-frontmatter hook         | undocumented; bug reports of it empty         | unknown [CC-HOOK], [GH-33815]      | n/a                                             |                                |
| `"agent"` setting → project agent                       | resolves to the agent name; scope not stated  | unknown (inference: yes) [CC-SREF] | n/a                                             |                                |
| Standards / scripts dirs                                | `.claude/{standards,scripts}`: not native     | inference                          | `.kiro/standards`: not native                   | inference                      |

No fetched content attempted to instruct the researcher.
