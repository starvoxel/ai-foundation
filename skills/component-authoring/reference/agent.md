# Authoring an agent

An agent is a named persona with a role, prompt, tools, and skills. File: `agents/{name}.yaml` (optional `agents/{name}.md` for long-form docs).

## Fields

```yaml
name: 'agent-name' # Required. Kebab-case, matches the filename.
version: '0.1.0' # Required. Semver.
domain: 'engineering' # Required. Must match a steering/{domain}/ directory.
description: 'One sentence.' # Required.
prompt: | # Required. A direct instruction to the agent.
  ...
tools: [read, grep] # Required. Canonical names from agent-tools.yaml, or @server/tool.
approved_tools: [read] # Required. Subset of tools that run without human confirmation.
skills: ['skill/name'] # Optional. Every entry must exist in skills/.
preload_skills: ['*'] # Optional. ["*"] or a subset of skills; loaded into context at startup.
blocked_commands: ['git *'] # Optional. Shell glob patterns the agent may not run.
```

## Rules

- **Tools:** grant only what the role needs. A read-only agent has no `write` or `shell`; any agent that searches code gets `grep` and `glob`. Tiers and the combination rule are in `agent-tools.yaml`.
- **approved_tools:** start with read-only tools and add more only for autonomous work; when in doubt leave it out. Kiro turns it into its auto-approve list. The Claude Code adapter currently ignores it.
- **Prompt:** identity and role, a short numbered process, hard rules, and what the agent does not do. Imperative mood. Keep it as short as it can be: leave out steering (loaded automatically), tool documentation, other agents' duties, and anything a skill already owns — cite the skill instead. Hard rules is the one place for enumerated never/always constraints.
- **Skills:** omitting `preload_skills` preloads nothing; a skill is always reachable on demand through the Skill tool. Preload only what is used on nearly every run. Every named entry must also be in `skills`; `"*"` must be the sole entry. Kiro ignores the field and always includes the full `skills` list.
- **MCP tools:** use the `@server/tool_name` form. A genuinely new built-in tool goes in `agent-tools.yaml` first.
- **Overlap:** two agents should not share a job; state the boundary in both prompts.
- **Web tools:** only the researcher agent holds `web_search`/`web_fetch`; a test enforces this.

## Checklist

- [ ] Filename and `name` match, kebab-case; `version` is semver; `description` is one sentence
- [ ] `domain` has a matching `steering/{domain}/`
- [ ] `tools` are canonical or `@server/tool`; `approved_tools` is a subset of `tools`
- [ ] A `tools` list mixing `moderate` and `privileged` entries documents the isolation in Hard rules (`agent-tools.yaml`)
- [ ] `skills` all exist; `preload_skills` is `["*"]` or a subset of `skills`
- [ ] No narrative section restates an enumerated constraint that Hard rules already states
- [ ] The grant snapshot in `tests/validation/agent-tool-sets.test.js` is updated for the change
