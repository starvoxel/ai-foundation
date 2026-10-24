# Waking an idle local session: spike findings (AIF-012)

Condensed from the AIF-012 spikes (run 2026-10-06/07, Claude Code 2.1.292), whose branches are being deleted. Recoverable until then from `origin/AIF-012/001`–`006` (`docs/research/pr-watch-spike-results.parts/`).

**Scope of the evidence:** every result below ran on **Windows 10, Git Bash, headless** (`claude -p`, stream-json with stdin held open as a stand-in for an idle session). Nothing was run on POSIX, in the interactive TUI, in the desktop app or in a cloud session. Treat all of it as a lead, not a verdict.

## Verified (Windows, headless)

| Mechanism                        | Result                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop hook refusing turn end      | Returns `{"decision":"block","reason":…}`; the model acts on the reason. Capped at 8 consecutive continuations (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` tunes it); tool calls reset the counter   |
| Stop + `asyncRewake`             | Hook exiting 2 wakes an idle session with its stderr as a reminder; exit 0 does not. It re-arms every turn, so a watcher must exit 0 on no change or it creates an unbounded paid wake loop |
| SessionStart + `asyncRewake`     | Runs synchronously and delays startup; no wake                                                                                                                                              |
| UserPromptSubmit + `asyncRewake` | Runs synchronously; exit 2 blocks and erases the prompt (a hazard)                                                                                                                          |
| SessionStart digest              | Injects context on start and resume; digests accumulate across resumes, so keep them small and timestamped                                                                                  |

## PR state (REST, via `ai-git gh-api`)

- Almost everything derives from GitHub on each check; only edge events (new comment, review) need a watermark: the highest id already seen
- Handled markers can live on the PR: reaction, label, resolved thread, marker comment, commit status. Check runs cannot (403)
- A full check is about 6 REST calls at one core-rate unit each; conditional requests (`If-None-Match`) return 304 at no cost

## Test matrix before any implementation

Run each on the **desktop app and the CLI (TUI)**, on at least one POSIX system:

| ID    | Question                                                             |
| ----- | -------------------------------------------------------------------- |
| W4-a  | Does a Stop hook refusal behave the same, and stop at the 8-loop cap |
| W4-e  | Does Stop + `asyncRewake` (exit 2) wake an idle session              |
| W4-g  | Does a user interrupt trigger a false-positive block                 |
| W4-q4 | Does a wake turn interrupt a turn the user is typing or running      |
| W1    | Does a finished background command wake an idle session              |
| W2    | Does the Monitor tool wake an idle session; does it re-arm           |
| W3    | Do `ScheduleWakeup`, `CronCreate` and `/loop` fire while idle        |
| W5    | Can a development channel push an event into an idle session         |
| W6    | Who owns a background task a subagent started                        |
| W8    | Which mechanisms survive laptop sleep and `--resume`                 |

Record the Claude Code version, OS and shell with every result.

## Open

- Why SessionStart and UserPromptSubmit ignore `asyncRewake`'s background mode (per-event, or version-specific)
- How an adapter installs a session-level hook rather than an agent-frontmatter one
