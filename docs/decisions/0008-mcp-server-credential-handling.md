---
status: accepted
date: 2026-09-25
decision-makers: [Jeremy]
tags: [mcp, credentials, servers, oauth]
links:
  supersedes: []
affects:
  - servers/gmail/auth.js
  - servers/youtrack/youtrack.yaml
---

# MCP Server Credential Handling: OAuth vs. Static Token

## Context and Problem Statement

`servers/gmail` (a locally-implemented server) uses OAuth2 with a refreshable token
store; `servers/youtrack` (a vendor-hosted, declarative-only server) uses a static
bearer token from an env var. Two real patterns exist with no record explaining when
each applies — `0005-ai-git-tool-boundary.md` already treats this class of question
as ADR-worthy but didn't resolve it.

## Decision Drivers

- Credential handling must fit whether the server has local code to run at all
- Long-lived scoped access needs revocability and expiry without hand-rotating a
  secret
- A vendor-hosted server has no local process to hold a refresh flow's state

## Considered Options

- OAuth2 with a local, refreshable token store (`servers/gmail`'s pattern)
- Static bearer token from an environment variable (`servers/youtrack`'s pattern)
- One unified credential mechanism forced onto both server shapes

## Decision Outcome

Chosen: the pattern follows the server's own shape, not a forced single mechanism.
A locally-implemented server (`hosted` unset or `local`) that talks to a third-party
API on the human's behalf uses OAuth2, stored under `~/.aif/` with expiry-aware
refresh (`servers/gmail/auth.js`) — scoped, revocable, no long-lived secret typed
into a config file. A vendor-hosted server (`hosted: vendor` in its `*.yaml`, no
local process at all) has nowhere to run a refresh flow, so it uses a static token
injected via environment variable interpolation in its declarative config
(`servers/youtrack/youtrack.yaml`'s `Authorization: "Bearer ${YOUTRACK_TOKEN}"`).

## Consequences

- Two credential-handling code paths to maintain instead of one, but each is the
  minimum viable mechanism for its server shape — forcing OAuth onto a vendor-hosted
  server with no local process isn't possible, and forcing a static token onto a
  locally-implemented server would mean hand-rotating a long-lived secret.
- A future locally-implemented server that talks to a third-party API should default
  to the OAuth pattern; a future vendor-hosted server should default to the static
  env-var token pattern — this record is the reference for that choice, not a case
  to re-litigate each time.
- Neither pattern is itself new — this records an existing split, it doesn't change
  either server's implementation.
