# Task 004 results: Stop hook, SessionStart digest, asyncRewake (W4, input to C2)

Feature AIF-012, Task 004. Consolidated later by Task 008. Prototypes: `004-prototypes/` (throwaway; nothing wired into agents, bundles or settings).

## Method

- Claude Code 2.1.292, Windows 10, Git Bash, model `haiku`, run headless: `claude -p ... --settings <scratch.json> --setting-sources project --output-format json`. The real `~/.claude` settings were not modified; hooks came only from scratch settings files.
- Idle-session probe: `idle-driver.cjs` runs `claude -p --input-format stream-json --output-format stream-json --verbose` with stdin held open, so the session sits idle after its first turn while events are logged with timestamps.
- Docs: [hooks reference](https://code.claude.com/docs/en/hooks) (fetched; paraphrased below).
- Not run: POSIX (macOS/Linux), interactive TUI, desktop app, cloud sessions.

## Verdicts

| ID   | Question                                                                    | Verdict                                                                                       |
| ---- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| W4-a | Stop hook can refuse turn end with a reason the model acts on               | Verified (Windows Git Bash, `-p`)                                                             |
| W4-b | Stop-hook loop is bounded                                                   | Verified: hard cap of 8 consecutive continuations                                             |
| W4-c | Fail-safe (fail open) when helper absent / flag absent                      | Verified for the prototype's own check                                                        |
| W4-d | SessionStart injects a digest, including on resume                          | Verified (`source` = startup, resume)                                                         |
| W4-e | Hook can wake an idle session (`asyncRewake`)                               | Verified for Stop event under `-p` stream-json; Refuted for SessionStart and UserPromptSubmit |
| W4-f | `asyncRewake` re-arms                                                       | Verified, but uncontrolled: it loops (see below)                                              |
| W4-g | POSIX behaviour, interactive TUI/desktop, false positives on user interrupt | Unverified (label for human)                                                                  |

## Evidence

### Stop hook blocks turn end (W4-a, W4-b)

Prototype `stop-hook.sh`: reads stdin JSON, emits `{"decision":"block","reason":...}` while a fake flag file is non-empty. Docs: block makes Claude continue with `reason`; `stop_hook_active` is true when already continuing; 8-consecutive-continuation cap, reset when Claude calls a tool, tunable by `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`.

| Run                                         | Hook invocations                | Turns | Cost USD | Wall | Outcome                                                  |
| ------------------------------------------- | ------------------------------- | ----- | -------- | ---- | -------------------------------------------------------- |
| mode=once (honour `stop_hook_active`)       | 2 (active=false, then true)     | 7     | 0.086    | 31 s | Model read the reason, acted on it, ended turn           |
| mode=always, reason invites tool use        | 14                              | 22    | 0.130    | 96 s | More than 9 because tool calls reset the cap counter     |
| mode=always, no tools, reason "say PENDING" | 9 (1 + 8 blocked continuations) | 10    | 0.086    | 27 s | Cap overrode the 9th block; turn ended with empty result |
| same, `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=3`   | 4 (1 + 3)                       | 5     | 0.019    | 10 s | Cap env var honoured                                     |

Findings:

- A hook that ignores `stop_hook_active` cannot loop forever, but burns up to 8 full model turns per session end (about $0.09 on Haiku, ~2-3 s each) and more if each continuation uses a tool.
- Honouring `stop_hook_active` (block once) is cheap but then enforces "watch" exactly once; a pending PR is not actually kept watched. The Stop hook is a nudge, not a wake source: it only fires when a turn tries to end.
- Because the cap resets on tool calls, a model that keeps calling tools in response to the reason can be held in a long loop; no external bound beyond the session.

### Fail-safe and false positives (W4-c)

- Helper path absent (`PRW_HELPER` missing): hook exited 0, 1 turn, 3.1 s, no block. Flag file absent: same, 2.8 s. No block, no error output.
- This is the hook's own explicit check. A missing hook script itself, or missing `bash`/`node`, was not tested.
- False-positive source observed by design: while the flag is set, every turn end is blocked, including unrelated questions. The hook cannot tell "turn about the PR" from "any turn". Mitigations (not built): clear flag when PR resolves; scope by cwd/session id; allow `stop_hook_active` pass.
- Stop input also carries `background_tasks` and `session_crons` (docs), so a hook could decline to block when a watcher or cron is already armed. Not exercised.

### SessionStart digest (W4-d)

`session-start-hook.sh` prints a digest on stdout (plain stdout from SessionStart is added to context per docs).

- Fresh session: model quoted digest verbatim (`source=startup`), 1 turn, $0.040.
- `--resume <id>` with a changed digest file: hook ran again with `source=resume`; model saw both the old startup digest and the new resume digest (1 turn, $0.046).
- Implication: injected digests persist in the transcript and accumulate across resumes. The digest must be small, timestamped, and the helper should acknowledge or clear state so stale digests are not re-read as current.
- Docs: SessionStart hooks run in the background on launch/resume but the first response waits for them; keep them fast.

### asyncRewake (W4-e, W4-f)

Docs say `asyncRewake` runs in the background and, on exit 2, wakes Claude with stderr as a system reminder, even if idle. Probe `rewake-hook.sh` (sleep N, then stderr text, exit 2), session held idle:

| Event            | Observed                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SessionStart     | Ran synchronously: `init` was delayed by the full 15 s delay. No wake. Refuted for this event.                                                       |
| UserPromptSubmit | Ran synchronously in `-p`; exit 2 BLOCKED the prompt (turn 0, prompt erased with the hook message). Refuted, and a hazard.                           |
| Stop             | Background: turn ended at 2.6 s; at 15-18 s a new turn started on its own with the stderr text visible to the model (it quoted the token). Verified. |
| Stop, exit 0     | Hook ran 10 s then exited; no wake, no new turn. Only exit 2 wakes.                                                                                  |

Re-arm: with Stop + asyncRewake, each woken turn ends, Stop fires again, the hook restarts, and exits 2 again. In a 60 s window with a 15 s delay the session woke 3 times unprompted (log shows 4 hook starts). Each wake is a full model turn. So re-arm is automatic but unconditional: a real watcher must exit 0 (no change) rather than 2 when nothing changed, otherwise it creates an infinite paid wake loop. Timeout is enforced for asyncRewake per docs (not tested).

Caveats: tested under `-p` stream-json with stdin held open as a proxy for an idle interactive session. Docs state `-p` kills async hooks at teardown. Interactive TUI and desktop behaviour is Unverified and should be confirmed by the human (W-series session).

## Implications for C2 / gate G4

- A Stop + `asyncRewake` hook looks like the first hook-based mechanism that can wake an idle session; it needs a watcher that exits 0 on no-change and 2 only on change, plus a consumed/ack state so the same change does not wake twice.
- SessionStart digest suits catch-up on resume; keep output bounded.
- Plain blocking Stop hook is bounded by the 8-cap but is a nudge, and costs turns.

## Open questions

1. Does Stop + `asyncRewake` wake an idle interactive TUI and desktop session (not only `-p` stream-json), and on POSIX? Human to run.
2. Why do SessionStart and UserPromptSubmit run `asyncRewake` hooks synchronously (docs imply background)? Possibly per-event; unconfirmed beyond this version (2.1.292).
3. How do adapters install hooks for a non-agent-frontmatter, session-level hook (settings vs agent yaml)? Out of scope here; not investigated.
4. Does a wake turn from `asyncRewake` interrupt an in-flight user typing/turn in the interactive UI? Unverified.
