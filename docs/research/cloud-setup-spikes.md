---
name: 'cloud-setup-spikes'
tags: ['claude-code', 'cloud', 'setup-script', 'primary-agent', 'bws']
scope: 'all'
description: 'What the AIF-005 spikes (2026-09-29/30) proved about Claude Code cloud Setup scripts: caching, refresh, tool-binary timing, and selecting a primary agent.'
---

# Cloud setup and primary-agent spikes (AIF-005)

Condensed from AIF-005 (2026-09-29/30, Claude Code 2.1.285, Trusted network level). The plan, full spike log and Setup scripts are in [`cloud-setup-spikes.parts/`](./cloud-setup-spikes.parts/README.md).

**Status:** superseded. AIF-005 selected the primary agent from the environment Setup script; it is now selected by a committed project-scope install (`aif install --scope project`, README "Primary agent"), so no Setup-script edit or cache bust is needed to change it. The toolchain findings below still drive the README's Setup script.

## Setup script behaviour

| Finding                                                                                                                                                                      | Evidence                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| The script runs as root before the repo is cloned; its result is cached and later sessions do not re-run it.                                                                 | Stage B sessions 1 and 2 |
| Any edit to the script rebuilds the cache from a clean image; only a human can edit it.                                                                                      | Stage D1                 |
| On the first start after an edit, the environment build and the first session appear to run the script concurrently, so it must be idempotent with no external side effects. | Stage B session 2        |
| A session started right after an edit waits for the whole script; script duration is the first-start delay.                                                                  | Stages A2, D1            |
| The cache needs the script to finish within about five minutes.                                                                                                              | Platform docs, stage A2  |
| Fetching the public repo anonymously and `aif install` took about 15–19s in total.                                                                                           | Stages B, D1             |
| Anything installed under a directory not on `PATH` is invisible to the session; link or install into `/usr/local/bin`.                                                       | Stage C first attempt    |

## Tool binaries: download, don't build

| Method                                                                                                               | Time                                    |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `bws-x86_64-unknown-linux-gnu-2.1.0.zip` from the Bitwarden GitHub release, sha256-checked against its checksum file | 777 ms                                  |
| `cargo install bws --locked`                                                                                         | 232.8 s (about 78% of the cache budget) |

Decision: pinned, checksum-verified release binaries; cargo only as a fallback. `unzip` may be missing from the image (A2 fell back to Python's `zipfile`). Now in the README Setup script for `gh` and `bws`.

## Selecting the primary agent

| Route                                                                           | Result                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Committed `.claude/settings.json` (`agent`) plus `.claude/agents/`              | Works from turn 1 (cloud Test 1)                                          |
| Setup script writes `~/.claude/settings.json` (`agent`) and `~/.claude/agents/` | Works from turn 1 (Test 2, stage B)                                       |
| Both together                                                                   | Works (Test 3)                                                            |
| SessionStart hook installs the agent                                            | Applies only from the next session                                        |
| Misspelled agent name in the Setup script                                       | Default agent runs; the script logged it and left settings untouched (D2) |

- `skills:` frontmatter preloads skills into a subagent but not into a primary agent (canary test); a primary agent loads them with the Skill tool.
- The full plan → approval → decomposition → dispatch loop worked with a primary agent in cloud (Test E). Auto permission mode stopped an earlier attempt with classifier "no verdict" errors.

## Never tested

- D3: a cache bust by changing only a revision variable in the script.
