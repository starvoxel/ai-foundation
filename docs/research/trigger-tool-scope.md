# Research Brief: Scope of the cloud-session trigger tools

- **Date:** 2026-11-07
- **Requested by:** dispatcher, to decide how to name the trigger tool group (follows `tool-tiers-and-harness-parity.md`, which tiers these as T5 but does not answer scope)
- **Status:** Findings only. No recommendation requested.
- **Question:** Are `list_triggers`, `get_trigger`, `delete_trigger` (MCP server `claude-code-remote`; `send_later` wraps `create_trigger`) scoped to the calling session, or do they act on the account, environment or repo?

Labels: **verified** (official doc, URL given), **inference**, **not found**.

## Findings

Key caveat: Anthropic's docs describe the web UI, `/schedule` and the fire API. **No official page documents the `claude-code-remote` trigger tools themselves** (not found). Everything about the tools' scope is therefore inference from the account-level model. This researcher's own toolset did not include the trigger tools, so nothing was tested live.

| # | Question | Finding |
| - | -------- | ------- |
| 1 | `list_triggers`: session or account? | **Not found** for the tool. Verified model: scheduled tasks (formerly routines) belong to the individual claude.ai account, and web, Desktop and CLI all write to the same cloud account. A schedule-trigger is a property of a task, not of a session. **Inference:** `list_triggers` is account-wide for that user (not org-wide: tasks are not shared with teammates), not filtered to the caller. Not an environment or repo filter: a task carries its own repos and environment as settings. |
| 2 | Can `get_trigger`/`delete_trigger` act on another session's, routine's or web-UI trigger? | **Not found** for the tools. Verified: the web UI can delete any task, and `/schedule list/update/run` manages the account's tasks. **Inference:** the tools most likely act by trigger id on any account-owned trigger regardless of creator. Treat `delete_trigger` as able to remove a user's web-created routine until a live test shows otherwise. |
| 3a | Is a `send_later` reminder visible in the routines list? | **Inference, likely yes.** Verified: one-off schedules are a first-class trigger type ("once at a specific future time") and show in the web UI, marked Completed after running. The fired-prompt note says a trigger's prompt was stored by "an authorized session on your account", which indicates sessions can create account-level tasks. Not confirmed that `send_later` produces a visible task. |
| 3b | Does it fire if the creating session is idle or ended? | **Inference, yes.** Verified: tasks run on Anthropic infrastructure and keep working when the laptop is closed; each run opens a new, separate session. Delivery is therefore independent of the creator's state. **Contrast (inference):** the reminder does not resume the creating session. Projects can instead continue an existing thread (same doc), which is a separate case. |
| 4 | Documented delivery failures | Verified: runs are rate-limited to 100/hour per account (the run waits for reset); a run can fail to start when the organization's concurrent cloud-session limit is reached; runs are put on hold while a subscription is paused; org admins can switch scheduled tasks off, which stops existing ones; a run whose session is archived before it starts is marked Failed; a one-off turns itself off after running. **Not found:** any documented "session idle when due" failure. The doc's idle-session language concerns only in-session `/loop` scheduling (a separate, local mechanism; page not fetched). |

Also verified: `/schedule` is unavailable inside a cloud session (manage via the web UI). This suggests the MCP tools are the in-session route to the same account store (inference).

## Implication for naming (inference)

The tools are account-level, not session-local. A name such as "session-scheduling" would understate reach; "routines" or "triggers" fits the doc vocabulary. Confirm with one live test before relying on this: create a trigger from one session, list and delete it from another, and check the web list.

## Sources

- Official: https://code.claude.com/docs/en/routines (fetched via WebFetch; the same page serves as scheduled tasks). Sections used: ownership, one-off schedule, run history/status, usage limits, troubleshooting, `/schedule` availability.
- Lower confidence (search snippets only, not used for any verified claim): https://makerkit.dev/blog/tutorials/claude-code-routines-guide, https://www.dsebastien.net/claude-code-routines/
- Repo: `docs/research/tool-tiers-and-harness-parity.md`, `docs/research/session-waking-spikes.md`.

Note: fetched page content contained no instructions aimed at the agent.
