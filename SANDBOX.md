# cloud-sandbox

Empty-history scratch branch for testing Claude Code cloud sessions (AIF-005 spike). Not part of the framework; safe to reset or delete.

## Test 1 — `agent` in committed project settings

Files (moved to `test1/` when Test 2 was staged; move them back to the repo root to rerun): `.claude/settings.json` (`{"agent": "engineering-manager"}`) and `.claude/agents/{engineering-manager,principal-engineer}.md`, committed so they exist at startup.

Start a new cloud session on this branch and send, as the first message:

> State which agent you are running as, then dispatch principal-engineer with the prompt "Reply with exactly PONG" and report its reply.

Expected: the session identifies as Engineering-Manager, and the dispatch returns PONG. Compare its tool list with the agent's `tools` frontmatter.

## Test 2 — settings and agent from the environment Setup script

The repo root has no `.claude/`. Paste `test2-setup-script.sh` into the environment's Setup script field, start a new cloud session on this branch, and send:

> State which agent you are running as and your first-reply marker. List every tool you can call.

Expected if it works: the reply starts with `SETUP_SCRIPT_AGENT`. Note the Setup script is cached, so changing it triggers a rebuild on the next session.

## Test 3 — committed `.claude/` without `agent`, plus Setup-script `agent`

Repo root has `.claude/settings.json` (an `env` marker `SANDBOX_MARKER=project-settings-loaded`, no `agent` key) and `.claude/agents/principal-engineer.md`. The Setup script is the same `test2-setup-script.sh` as Test 2: it writes the user-level `engineering-manager` agent and `agent` setting. Start a new cloud session on this branch and send:

> State your first-reply marker and which agent you are. Run `echo $SANDBOX_MARKER` with Bash and report the output. Then dispatch principal-engineer with the prompt "Reply with exactly PONG" and report its reply.

Pass: `SETUP_SCRIPT_AGENT` marker (user-level `agent` applied), `project-settings-loaded` (committed project settings also loaded), and `PONG` (project-scope agent found alongside the user-scope one). Which one fails tells us which settings source is dropped.

## Cloud test ladder (AIF-005)

Staged tests with a decision point after each are described in `docs/plans/features/AIF-005/spike-main-thread-agent.md` on the `claude/bundles-install-check-f73zcv` branch of this repo. Setup scripts: `cloud-tests/A2-toolchain.sh` (bws binary vs cargo), `cloud-tests/B-install.sh` (fetch a pinned aif, install the real bundle, set the agent, log reach and timing; also the base for stages C and D). Paste one at a time into the sandbox environment's Setup script field.
