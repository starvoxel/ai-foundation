# Session-waking spike material

Throwaway AIF-012 prototypes and the human test procedure, kept as starting points for the waking work. None of it is wired into an agent, bundle or setting, and none of it is production code.

| Path                      | What it is                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spike-guide.md`          | Step-by-step procedure for the test matrix in [`../session-waking-spikes.md`](../session-waking-spikes.md) (W1–W8 and the hook cases).                              |
| `hook-prototypes/`        | `stop-hook.sh`, `rewake-hook.sh`, `session-start-hook.sh` and `idle-driver.cjs`, which holds a headless session open on stdin to stand in for an idle one.          |
| `state-digest-prototype/` | A stateless PR-state digest with fake-data tests: the shape a watcher would report. Only a watermark for edge events persists; everything else derives from GitHub. |
