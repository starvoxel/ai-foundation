# Remote /compact triggering — findings (2026-09-22)

## Confirmed working mechanism

```
claude -p "/compact" --cloud <cloud-session-id>
```

Confirmed by the user running this from their own PC (properly authenticated `claude`
CLI, real claude.ai account session) against the sibling session
(`session_014YJhMLqMcoDGU8twdYWcXH`) — **it worked**, triggering real compaction on
that cloud session from an entirely separate machine.

## What was ruled out first

| Mechanism | Result |
|---|---|
| `claude stop <cloud-session-id>` | Dead end — `claude agents`/`stop` only see local background jobs on the *same machine*; structurally can't address a different container. Confirmed via `claude agents --json` showing only this session's own local process. |
| `claude -p "/compact" --resume <cloud-session-id>` | Dead end — `--resume` expects a local transcript UUID (e.g. `9ec9b1a8-...`), not a CCR `session_...` ID. Different namespace entirely; rejected outright ("not a UUID"). |
| Scheduled/routine-delivered message containing literal "/compact" text (Claude Code Remote `send_later`) | Dead end — arrives as plain text in the delivered turn, no `<command-name>compact</command-name>` block, no real compaction. Confirmed empirically in the 45-minute self-`send_later` test earlier this session (marker 2026-09-22T18:06:47.507Z, fired 18:52:15Z). Bypasses the CLI's own slash-command interception entirely. |
| `claude -p "/compact" --cloud <cloud-session-id>` **from this sandboxed container** | Inconclusive, not dead — failed with "Session expired. Please run /login" despite `claude auth status` showing `loggedIn: true`. The `--cloud` cross-session-messaging feature needs a different (fuller, account-level) auth scope than this sandbox's API-only credentials provide. Structurally the right mechanism, just blocked by this environment's restricted auth. |

## Why `--cloud` works where the others don't

`--cloud [session_id]` is the one flag actually built to address a *different* cloud
session. Going through the real `claude` binary means the prompt text passes through
the CLI's own client-side slash-command parsing before it's sent — the same path a
human gets when they type `/compact` interactively. The routine/`send_later` delivery
path, by contrast, injects text directly as a synthetic user turn via Claude Code
Remote's own message-delivery system, which never passes through that client-side
command-interception layer at all — hence it just arrives as literal text.

## Open items / not yet tested

- Does this require the target session to be idle first, or does it work against a
  live/busy session safely? (The original `idle-compact.sh` corruption we hit was
  from a *different* mechanism — `-p --resume` racing a live local transcript — not
  necessarily proof `--cloud` has the same race risk. Worth testing deliberately
  against a genuinely busy target to see if it queues safely or corrupts anything.)
- Confirming this from a machine/environment with real account-level auth is a
  prerequisite — it won't work from any sandbox running on API-key/OAuth-token-only
  credentials without a full `claude auth login`.
- Full automation (debounced 45-minute idle timer) still needs a trigger to fire
  `claude -p "/compact" --cloud <id>` from a properly-authenticated environment on a
  schedule — e.g. a cron job or scheduled task on a real machine, not a Claude Code
  Remote sandbox.
