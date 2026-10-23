# PLAN.md — AI Foundation Roadmap

The framework is one `engineer` agent that takes a request from idea to a reviewed PR, an independent `reviewer`, and a `researcher` that is the only agent with web access. How often the engineer stops for the human is the `oversight` setting. Everything else is skills, a small set of always-on rules, and the `aif` CLI and `ai-git` that install and run them.

## Done

- Lean core: `engineer`, `reviewer`, `engineering-researcher`; `oversight` setting, skill, and `aif oversight`
- Skills: `oversight`, `prd`, `feature-planning`, `standards`, `test-execution`, `pr-stewardship`, `code-review` with `ai-component-review` and `review-severity`, and `component-authoring` (in the `ai-engineering` bundle)
- One PR-based git workflow; about 2.5k words of always-on steering
- arc42 staleness computed from git with `Arch-Unaffected` waivers; the generated index refreshed by git hooks and the session-start script, and scaffolded by `aif init`
- Retired: orchestration, task DAGs, worktrees, ADRs, YouTrack, the multi-agent role pipeline (recoverable from the `legacy/process-v1` tag)

## Next, in order

1. **Per-agent approval** — a `tool-gate` hook and scoped `subagent:<name>` grants so each agent's `approved_tools` means "runs without a human" on both harnesses (research: `docs/research/subagent-spawn-allowlist.md`)
2. **Review split** — keep one `reviewer` agent type; split review into targeted skills that the dispatch brief selects
3. **`subagent-prompting` skill** — how to write briefs for subagents, with size targets
4. **Pre-pivot work** — decide what to finish, close, or delete among the open PRs, old branches, and unfinished features (PR watching, single tool-risk source)

## Later

- Verify the Kiro grant mapping against the official docs
- More standards (TypeScript, Python)
