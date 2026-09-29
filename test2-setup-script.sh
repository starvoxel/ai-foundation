#!/bin/bash
# AIF-012 spike Test 2: provision a primary agent from the environment Setup script only.
mkdir -p /root/.claude/agents

cat > /root/.claude/agents/engineering-manager.md <<'AGENT'
---
name: engineering-manager
description: Test agent provisioned by the environment Setup script.
tools: Agent, Read, Bash
---
You are the Engineering-Manager test agent, provisioned by the environment Setup script. Begin your first reply with the exact marker SETUP_SCRIPT_AGENT.
AGENT

# Merge the agent key into any existing user settings instead of overwriting them.
node -e '
const fs = require("fs");
const p = "/root/.claude/settings.json";
let s = {};
try { s = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
s.agent = "engineering-manager";
fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
' || true

exit 0
