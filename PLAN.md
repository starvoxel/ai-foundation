# PLAN.md — AI Foundation Roadmap

The framework is one `engineer` agent that takes a request from idea to a reviewed PR, an independent `reviewer`, and a `researcher` that is the only agent with web access. How often the engineer stops for the human is the `oversight` setting. Everything else is skills, a small set of always-on rules, and the `aif` CLI and `ai-git` that install and run them.

## Done

- Lean core: `engineer`, `reviewer`, `engineering-researcher`; the `oversight` setting and skill; `engineer` set as the primary agent in this repo and the project template
- Skills: `oversight`, `prd`, `feature-planning`, `standards`, `test-execution`, `pr-authoring`, `pr-stewardship`, `subagent-prompting`, `code-review` with `ai-component-review` and `review-severity`, and `component-authoring` (in the `ai-engineering` bundle)
- One PR-based git workflow; about 2.5k words of always-on steering
- arc42 staleness computed from git with `Arch-Unaffected` waivers; the generated index refreshed by git hooks and the session-start script, and scaffolded by `aif init`
- Retired: orchestration, task DAGs, worktrees, ADRs, YouTrack, the multi-agent role pipeline (recoverable from the `legacy/process-v1` tag)

## Next, in order

1. **LOW tracking and the review stopping rule** — a durable, conflict-free way to record LOW review findings so they can be fixed later, without a ledger branch. Stopping rule, from the old PR #110: the reviewer approves once nothing at MEDIUM or above remains, a re-review never re-raises a LOW, and a round is never spent on LOWs alone. Mechanism still to confirm: GitHub issues labelled `review-low`, deduplicated by file and rule (recommended), or one small file per finding
2. **Per-agent approval** — a `tool-gate` hook and scoped `subagent:<name>` grants so each agent's `approved_tools` means "runs without a human" on both harnesses (research: `docs/research/subagent-spawn-allowlist.md`; hooks in user-scope agent frontmatter were verified, project-scope ones are skipped until the folder is trusted)
3. **Clear the pre-pivot work** — delete the stale and throwaway branches with the `Cleanup branches` workflow, and decide whether to keep the AIF-012 findings as one short research note first
4. **Waking local desktop sessions** — find a way for a local session to resume itself when its PR changes (cloud sessions already have `subscribe_pr_activity`). Known from the old spikes, to verify on desktop: a Stop hook can refuse to end a turn (capped at 8 loops), and `asyncRewake` on Stop wakes an idle session; `asyncRewake` on SessionStart and UserPromptSubmit does not
5. **Review split** (last) — keep one `reviewer` agent type; split review into targeted skills that the dispatch brief selects

## Later

- Verify the Kiro grant mapping against the official docs
- More standards (TypeScript, Python)
