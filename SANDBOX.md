# cloud-sandbox

Empty-history scratch branch for testing Claude Code cloud sessions (AIF-012 spike). Not part of the framework; safe to reset or delete.

## Test 1 — `agent` in committed project settings

Files: `.claude/settings.json` (`{"agent": "engineering-manager"}`) and `.claude/agents/{engineering-manager,principal-engineer}.md`, committed so they exist at startup.

Start a new cloud session on this branch and send, as the first message:

> State which agent you are running as, then dispatch principal-engineer with the prompt "Reply with exactly PONG" and report its reply.

Expected: the session identifies as Engineering-Manager, and the dispatch returns PONG. Compare its tool list with the agent's `tools` frontmatter.

## Test 2 — settings from the environment Setup script

Pending Test 1. Remove `.claude/settings.json` from the branch and set the `agent` key from the Setup script instead.
