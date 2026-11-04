# Cloud-setup spike material (AIF-005)

The original AIF-005 plan and spike log, and the cloud Setup scripts they tested, moved from the `claude/sweet-goldberg-3lskdg` branch (plan, spike) and `cloud-sandbox` (scripts). Superseded: the primary agent now comes from a committed project-scope install, not the Setup script. Summary: [`../cloud-setup-spikes.md`](../cloud-setup-spikes.md). None of this is production code.

| Path                          | What it is                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `plan.md`                     | The AIF-005 Feature Plan (Draft, never approved), with its open-items table and work log.                |
| `spike-main-thread-agent.md`  | Full spike log: local headless tests, cloud Tests 1–3, stages A2, B, C, D1, D2, Test E, proposed D3.     |
| `cloud-tests/A2-toolchain.sh` | Times a checksum-verified `bws` release binary against `cargo install bws`.                              |
| `cloud-tests/B-install.sh`    | Setup script: fetch a pinned ai-foundation, install a bundle, verify the agent file, merge `agent`, log. |
| `cloud-tests/D1-refbump.sh`   | `B-install.sh` pinned to an older commit, to prove a ref bump rebuilds the cached environment.           |
| `cloud-tests/D2-badagent.sh`  | `B-install.sh` with a misspelled agent name, to prove the agent is not set and the log says so.          |
