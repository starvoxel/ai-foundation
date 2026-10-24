# Session-waking test guide (human-run)

Step-by-step procedure for the test matrix in [`../session-waking-spikes.md`](../session-waking-spikes.md). Run each test on the desktop app and the CLI, on at least one POSIX system. Record the Claude Code version, OS and shell with every result, and a verdict per test: Verified, Refuted or Unverified (say why). If an observation matches no listed outcome, write down exactly what you saw and stop. Hook scripts for the W4 cases are in [`hook-prototypes/`](./hook-prototypes). Record results in a table appended to the note.

## Safety (read first)

- Throwaway PRs only, from branches named `AIF-test/{description}`, into a throwaway base branch. Never a real PR. Delete them at the end (see Cleanup).
- Run all session spikes in a scratch directory outside this repo (`mkdir ~/aif012-scratch`), never a real working tree, unless a step says otherwise.
- W5 uses `--dangerously-load-development-channels`, which bypasses a per-launch safety confirmation for non-allowlisted channels. Throwaway session in the scratch directory only; no real credentials in its environment.
- Use `ai-git` for any GitHub or git operation on this repo. Never paste or echo a token; refer to env vars by name only.
- Record the Claude Code version (`claude --version`) once, with OS and shell, in the results table.

## Conventions

- Time in UTC `HH:MM:SS`. Use `date -u +%H:%M:%S` (Git Bash and POSIX). Record start, expected, and observed time; "wake delay" = observed minus expected.
- "Idle" means the session sits at the prompt: no typing, no messages, no tool running. Do not touch the terminal or window until the wake window below ends (3x the expected time, or 10 minutes, whichever is longer).
- **Wake** = the session starts a turn on its own and reacts to the event. Record the first words of the reaction.
- Windows: use Git Bash for the commands below. Where a POSIX command differs, it is noted. Run each W item on every environment you have, one row per environment: `term-win` (terminal CLI, Windows Git Bash), `app-win` (desktop app, Windows), `term-posix` (macOS/Linux terminal, if available). Missing environments stay Unverified.
- Start every spike in a fresh session. State the exact prompt you used.

## Part W: wake spikes

### W1: does a finished background command wake an idle desktop session?

Expected timing: 90 s command, wake window 5 min.

1. In a fresh session in the scratch directory, send exactly: `Run this in the background and do nothing else, then stop and wait: sleep 90; echo done`. Confirm it replies that it started the command and ends its turn. Record the start time.
2. Leave the session idle. Do not interact. Watch for a self-started turn until 5 minutes after the expected finish.
3. If no wake after 5 minutes, send any message (for example `status?`) and record whether it then reports the finished command. Record the time of that prompt.
4. Repeat for each variant, one fresh session each:
   - V1 exit non-zero: `sleep 90; echo failed >&2; exit 3`
   - V2 multi-line: `sleep 90; printf 'line1\nline2\nline3\n'`
   - V3 long output: `sleep 90; seq 1 20000`
   - V4 expected-finish near the wake window edge: `sleep 240; echo done`
5. Fill in (one row per environment and variant):

| Env | Variant | Start | Expected finish | Woke on its own? (Y/N) | Wake time | Delay (s) | Reaction (first words) | Needed my prompt? | Notes |
| --- | ------- | ----- | --------------- | ---------------------- | --------- | --------- | ---------------------- | ----------------- | ----- |
|     | base    |       |                 |                        |           |           |                        |                   |       |
|     | V1      |       |                 |                        |           |           |                        |                   |       |
|     | V2      |       |                 |                        |           |           |                        |                   |       |
|     | V3      |       |                 |                        |           |           |                        |                   |       |
|     | V4      |       |                 |                        |           |           |                        |                   |       |

Verdict rule: Verified wake only if the session reacted with no input from you.

### W2: does the Monitor tool wake an idle session?

Expected timing: 60 s delay, deadline test up to 6 min.

1. In a fresh session, ask: `Do you have a tool named Monitor? Answer yes or no, then list your background-related tools by exact name.` Record the answer. If no: record the Claude Code version and the provider (subscription login, Bedrock, Vertex, Foundry), mark W2 Unverified for that environment, and skip the rest.
2. Ask: `Use the Monitor tool to run: sleep 60; echo MONITOR-HIT-1. Then stop and wait; do not run anything else.` Leave the session idle for 3 minutes. Record whether it wakes on the emitted line.
3. Deadline: ask `Use Monitor on: sleep 400; echo MONITOR-HIT-2` with no timeout given. Leave idle. Record whether and when a deadline notice appears (default expected 5 min), and what it does with it.
4. Re-arm: if a deadline notice arrived, reply `restart it`, leave idle, and record whether the second watch fires `MONITOR-HIT-2` and wakes the session.
5. Permissions: record any permission prompt that appeared for Monitor and whether it blocked an unattended run.
6. Windows only: record whether Git Bash is the shell in use, and any error if you run from PowerShell.

| Env | Monitor present? | Provider | Wake on line? | Wake delay (s) | Deadline notice at | Re-arm worked? | Permission prompt? | Notes |
| --- | ---------------- | -------- | ------------- | -------------- | ------------------ | -------------- | ------------------ | ----- |
|     |                  |          |               |                |                    |                |                    |       |

### W3: do `ScheduleWakeup`, `CronCreate` and `/loop` fire while idle?

Expected timing: 2-minute tick, 15 min including sleep.

1. Fresh session. Run `/usage` (or the status line's token total) and record the baseline tokens and cost.
2. Ask: `Schedule a wakeup in 2 minutes with the prompt "tick: say the current time and nothing else" using ScheduleWakeup.` If it has no such tool, record that and try `CronCreate` (`every 2 minutes`) and `/loop 2m say the current time and nothing else`. Record which tool names exist.
3. Leave idle for 3 ticks (about 7 min). For each tick record fire time, delay, and the token total from `/usage` before and after.
4. Interval floor: ask for a 30-second interval. Record the error or the clamped interval.
5. Sleep and resume: with a recurring task active, put the machine to sleep for about 5 minutes (so at least 2 ticks fall inside it), wake it, and do not touch the session for 3 minutes. Record how many fires happened on wake (expected per docs: at most one catch-up).
6. Resume: exit the session, then `claude --resume` (pick the same session). Record whether the schedule survived.
7. Cache: compare the per-tick cost of a 2-minute tick with a 10-minute tick (schedule one at 10 minutes and wait). Record whether the longer one costs visibly more (cache miss).

| Env | Tool used | Tick 1 fire / delay | Tick 2 | Tick 3 | Tokens per tick (2 min) | Tokens per tick (10 min) | Min interval accepted | Fires after sleep | Survived `--resume`? | Notes |
| --- | --------- | ------------------- | ------ | ------ | ----------------------- | ------------------------ | --------------------- | ----------------- | -------------------- | ----- |
|     |           |                     |        |        |                         |                          |                       |                   |                      |       |

### W5: can a development channel push an event into an idle session?

**Gate:** only run this after a documentation check (dispatch the researcher, with the human's confirmation) says it looks viable. Otherwise record Unverified (not viable per docs) and stop. **Safety:** this uses `--dangerously-load-development-channels`, which bypasses a safety confirmation. Throwaway session, scratch directory, no real working tree, no real credentials. Research preview only: do not adopt it as a standard.

1. Record the exact flag syntax from `claude --help` or the channels docs ([channels-reference](https://code.claude.com/docs/en/channels-reference)). The flags are research-preview and may differ from what is written here; the docs win.
2. Scratch directory `~/aif012-scratch/w5`. The stub channel server is a minimal stdio MCP server that emits one channel event after a delay. Build it from the channels-reference example; if the reference gives no minimal example, stop and record that (do not improvise a server).
3. Launch: `claude --dangerously-load-development-channels <server-spec per docs>`. Record the full-screen confirmation text you had to accept, and any org-setting (`channelsEnabled`) or login-type error.
4. Ask the session to do nothing and wait. Trigger the stub's single event (delay 60 s). Leave idle 3 minutes. Record whether the session wakes and reacts to the event.
5. Repeat on each environment you have: terminal CLI and desktop app (the app may not support the flag; record the error).
6. Close the session. Delete the scratch directory.

| Env | Flag syntax used | Confirmation shown (text) | Account type | Gating error? | Event delivered? | Woke idle session? | Delay (s) | Notes |
| --- | ---------------- | ------------------------- | ------------ | ------------- | ---------------- | ------------------ | --------- | ----- |
|     |                  |                           |              |               |                  |                    |           |       |

### W6: who owns a background command, monitor or timer started by a subagent?

Expected timing: 90 s per run.

1. Fresh session. Create `.claude/agents/w6-sub.md` in the scratch directory:

   ```
   ---
   name: w6-sub
   description: W6 verification subagent
   tools: Bash, Read
   ---
   I am w6-sub. Do exactly what the parent asks and report the raw outcome of each tool call.
   ```

2. Subagent run: ask `Dispatch subagent w6-sub. Tell it to start in the background: sleep 90; echo SUB-DONE, then finish immediately without waiting.` Note the time the subagent returned. Leave the main session idle 4 minutes. Record: did the main session wake on `SUB-DONE`? did the subagent get notified (it has already ended)? does `/tasks` list the command, and its state after the subagent ended?
3. Main run: ask the main session directly to start `sleep 90; echo MAIN-DONE` in the background, then idle. Record the same.
4. If Monitor exists (W2): repeat steps 2 and 3 with `Monitor` instead of Bash, using `MONITOR-SUB` and `MONITOR-MAIN`. If a timer tool exists (W3), repeat once with a 2-minute `ScheduleWakeup` from the subagent (expected per docs: the tool is removed for background subagents; record the error).
5. Foreground subagent versus background subagent: repeat step 2 once with the subagent dispatched in the background if your version offers it.

| Env | Started by | Mechanism | Command still alive after owner ended? | Who was notified | Main session woke? | `/tasks` state | Notes |
| --- | ---------- | --------- | -------------------------------------- | ---------------- | ------------------ | -------------- | ----- |
|     | subagent   | bash bg   |                                        |                  |                    |                |       |
|     | main       | bash bg   |                                        |                  |                    |                |       |
|     | subagent   | Monitor   |                                        |                  |                    |                |       |
|     | main       | Monitor   |                                        |                  |                    |                |       |
|     | subagent   | timer     |                                        |                  |                    |                |       |

### W7: what does a fresh cloud session provide?

Cloud sessions already wake through `subscribe_pr_activity`, so this only inventories the runtime, including whether an installed skill's `scripts/` folder reaches the session.

1. Attach the scratch repo (any repo you can attach; the AIF-test throwaway branch is fine). If you can install ai-foundation components into it, run `node bin/aif.js install -B engineering -H claude` from an ai-foundation checkout first and push the result; otherwise record "not installed" for step 3.
2. Fresh cloud session. Ask it to run each and report the raw output: `echo $PATH`, `which node npm npx gh git ai-git aif python3`, `node --version`, `ls -la ~/.claude/skills 2>&1 | head`, `ls -la .claude/skills 2>&1 | head`.
3. Pick any installed skill with a `scripts/` folder (for example `ls .claude/skills/*/scripts`). Ask: `Is scripts/ present for skill <name>? Show ls -l of it. Is each file executable? Run one if it is a node script and report the raw outcome.`
4. Ask: `List every MCP server and tool name you can see, by exact name, and tell me which are custom (not claude-code-remote or github).` Then ask it to call one custom tool, if any exists, and report the raw outcome.
5. Record whether a proxy blocks anything: ask it to run `ai-git gh-api GET repos/{owner}/{repo}/rate_limit` (or `curl -sI https://api.github.com`) and report status and the `x-ratelimit-*` headers. Do not echo any token.

| Item                            | Result (raw) |
| ------------------------------- | ------------ |
| `node` on PATH, version         |              |
| `aif` on PATH                   |              |
| `ai-git` on PATH                |              |
| `gh` on PATH                    |              |
| Skill `scripts/` folder present |              |
| Script executable / ran         |              |
| Custom MCP servers visible      |              |
| Custom tool callable            |              |
| `rate_limit` call               |              |
| Proxy-blocked endpoints         |              |

### W8: which mechanisms survive laptop sleep and `--resume`?

Expected timing: 10 min. Also check any W3 mechanism you ran.

1. Fresh session. Start all that apply, with distinct markers, then note the time:
   - background command: `sleep 240; echo BG-DONE`
   - Monitor (if present): `sleep 240; echo MON-DONE`
   - timer: `ScheduleWakeup` in 4 minutes with prompt `say TIMER-FIRED`
2. Put the machine to sleep for 6 minutes so all deadlines pass during sleep. Wake the machine. Do not touch the session for 3 minutes. Record which markers appeared on their own.
3. Send `status?` and record what the session reports as finished, lost, or still running (`/tasks`).
4. Resume test: exit the session, run `claude --resume` and choose it. Record which mechanisms are still listed or fire.
5. Repeat steps 1 to 4 without sleep but closing and resuming only (to separate the two effects), with 4-minute markers again.

| Env | Mechanism  | Fired during sleep? | Fired after wake (no input)? | Reported after my prompt? | Survived `--resume`? | Notes |
| --- | ---------- | ------------------- | ---------------------------- | ------------------------- | -------------------- | ----- |
|     | bg command |                     |                              |                           |                      |       |
|     | Monitor    |                     |                              |                           |                      |       |
|     | timer      |                     |                              |                           |                      |       |

## Cleanup

1. Close and delete every throwaway PR and every `AIF-test/*` and `AIF-test-base` branch you created (`ai-git` for this repo; for another repo use whatever tool you normally use). The repo's branch-cleanup workflow also ages out `AIF-test/` branches, but do not rely on it.
2. Delete `~/aif012-scratch` and any `.claude/agents/w6-sub.md` or other helper files.
3. Cancel any remaining scheduled task (`/tasks`).

## Where results go

Append one table per ID to [`../session-waking-spikes.md`](../session-waking-spikes.md) (verdict, raw numbers, the exact prompts used, and the environment). Keep transcripts out of the repo unless they contain no token or private data; summarise unexpected behaviour in a note instead.
