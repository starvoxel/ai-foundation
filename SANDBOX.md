# cloud-sandbox

Empty-history scratch branch for testing Claude Code cloud sessions (AIF-012 spike). Not part of the framework; safe to reset or delete.

## Test 1 — `agent` in committed project settings

Files (moved to `test1/` when Test 2 was staged; move them back to the repo root to rerun): `.claude/settings.json` (`{"agent": "engineering-manager"}`) and `.claude/agents/{engineering-manager,principal-engineer}.md`, committed so they exist at startup.

Start a new cloud session on this branch and send, as the first message:

> State which agent you are running as, then dispatch principal-engineer with the prompt "Reply with exactly PONG" and report its reply.

Expected: the session identifies as Engineering-Manager, and the dispatch returns PONG. Compare its tool list with the agent's `tools` frontmatter.

## Test 2 — settings and agent from the environment Setup script

The repo root has no `.claude/`. Paste `test2-setup-script.sh` into the environment's Setup script field, start a new cloud session on this branch, and send:

> State which agent you are running as and your first-reply marker. List every tool you can call.

Expected if it works: the reply starts with `SETUP_SCRIPT_AGENT`. Note the Setup script is cached, so changing it triggers a rebuild on the next session.
