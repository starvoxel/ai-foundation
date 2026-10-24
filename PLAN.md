# PLAN.md — AI Foundation Roadmap

The framework is one `engineer` agent that takes a request from idea to a reviewed PR, an independent `reviewer`, and a `researcher` that is the only agent with web access. How often the engineer stops for the human is the `oversight` setting. Everything else is skills, a small set of always-on rules, and the `aif` CLI and `ai-git` that install and run them.

## Done

- Lean core: `engineer`, `reviewer`, `engineering-researcher`; the `oversight` setting and skill; `engineer` set as the primary agent in this repo and the project template
- Skills: `oversight`, `prd`, `feature-planning`, `standards`, `test-execution`, `pr-authoring`, `pr-stewardship`, `subagent-prompting`, `code-review` with `ai-component-review` and `review-severity`, and `component-authoring` (in the `ai-engineering` bundle)
- One PR-based git workflow; about 2.5k words of always-on steering
- arc42 staleness computed from git with `Arch-Unaffected` waivers; the generated index refreshed by git hooks and the session-start script, and scaffolded by `aif init`
- Retired: orchestration, task DAGs, worktrees, ADRs, YouTrack, the multi-agent role pipeline (recoverable from the `legacy/process-v1` tag)

## Next, in order

1. **Findings** — done: non-blocking review and scan results are GitHub issues labelled `finding` (plus `severity:*` and `source:*`), filed and looked up per file with `skill/findings`; the reviewer approves once nothing at MEDIUM or above remains and a LOW never costs a round. Still to do: have scans file findings the same way, and sort lookups by severity and effort
2. **Per-agent approval** — a `tool-gate` hook and scoped `subagent:<name>` grants so each agent's `approved_tools` means "runs without a human" on both harnesses (research: `docs/research/subagent-spawn-allowlist.md`; hooks in user-scope agent frontmatter were verified, project-scope ones are skipped until the folder is trusted)
3. **Clear the pre-pivot work** — delete the stale and throwaway branches with the `Cleanup branches` workflow; the AIF-012 findings are kept in `docs/research/session-waking-spikes.md`, so the `AIF-012/*` branches can go once that merges
4. **Waking local desktop sessions** — find a way for a local session to resume itself when its PR changes (cloud sessions already have `subscribe_pr_activity`). The spikes ran only on Windows, headless; first run the test matrix in `docs/research/session-waking-spikes.md` on the desktop app and the CLI, then decide whether Stop + `asyncRewake` is viable before any implementation
5. **Review split** (last) — keep one `reviewer` agent type; split review into targeted skills that the dispatch brief selects

## Later

- Verify the Kiro grant mapping against the official docs
- More standards (TypeScript, Python)
