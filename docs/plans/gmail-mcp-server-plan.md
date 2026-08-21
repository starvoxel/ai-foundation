# Gmail MCP Server + Generic Bundle — Implementation Plan

> Status: Draft
> Created: 2026-08-21
> Approved by: Pending

---

## Goal

Add a `gmail` MCP server exposing the common Gmail operations (search/read/organize/send), package it into a new `generic` install bundle, and enforce — via a new steering rule — that no email may ever be sent, drafted-and-sent, or replied-to without an explicit, per-action human approval question asked and answered in the affirmative. No assumed consent, ever.

---

## Components Affected

| Component | Action | Notes |
|---|---|---|
| `servers/gmail/gmail.yaml` | Create | Server definition, tool catalog |
| `servers/gmail/index.js` | Create | MCP protocol entry point (thin wrapper) |
| `servers/gmail/logic.js` | Create | Pure logic (MIME building, query building, response shaping) + I/O functions (Gmail API calls via `googleapis`) |
| `servers/gmail/auth.js` | Create | OAuth2 token loading/refreshing helper, isolated from tool logic |
| `servers/gmail/package.json` | Create | Runtime deps: `googleapis`, `@modelcontextprotocol/sdk` |
| `servers/gmail/tests/unit/gmail.test.js` | Create | Pure logic tests (MIME construction, query building) |
| `servers/gmail/tests/integration/gmail.test.js` | Create | I/O-layer tests against a mocked/fake Gmail API client |
| `servers/gmail/tests/integration/gmail.mcp.test.js` | Create | MCP protocol tests (tool listing + invocation) |
| `servers/gmail/README.md` | Create | One-time OAuth setup instructions (not loaded by agents per AGENTS.md loading rules, but needed for a human to obtain credentials) |
| `steering/generic/gmail-send-approval.md` | Create | New steering rule: explicit human approval required before any send-type action |
| `bundles/generic/bundle.yaml` | Create | New bundle, explicit lists: `servers: ["gmail"]`, `steering: ["steering/generic/gmail-send-approval.md"]` |
| `tests/validation/*.test.js` | Check only | Confirm existing repo-wide validation tests (schema/cross-ref checks) pass against the new files — no new validation test file planned unless investigation shows a gap |

---

## Approach

1. **Define the tool catalog in `gmail.yaml`.** Tools, split into read-only and send-type (the latter gated by the new steering rule):
   - Read-only: `gmail_list_messages` (query/label/pagination), `gmail_get_message` (full content + headers by id), `gmail_get_attachment`, `gmail_list_labels`, `gmail_list_drafts`, `gmail_get_draft`
   - Mutating, non-send: `gmail_modify_labels` (add/remove labels — covers archive, mark read/unread, star), `gmail_trash_message`, `gmail_create_draft`, `gmail_delete_draft`
   - Send-type (steering-gated, see step 5): `gmail_send_message`, `gmail_send_draft`, `gmail_reply_message`
   Every send-type tool's `description` field explicitly states "Requires prior human approval per steering — never call without it" so the rule is visible at the tool-definition layer, not just in steering text.

2. **Design OAuth2 handling in `auth.js`.** Google's OAuth2 flow needs one-time human setup (obtaining a refresh token via consent screen) that cannot happen inside an agent session. Approach: a documented one-time manual step (human runs a small local script or Google's OAuth playground) to obtain a refresh token, which is then supplied to the server via environment variables (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) — no token file written to the repo or committed anywhere. `auth.js` exchanges the refresh token for short-lived access tokens at runtime via `googleapis`' `google.auth.OAuth2`. This keeps all credential material out of git entirely. Document the one-time setup in `servers/gmail/README.md`.

3. **Split `logic.js` per Rule 6 (design for testability).** Pure functions: building a MIME `RFC 2822` message from `{to, cc, bcc, subject, body, inReplyTo}`, building Gmail search query strings from structured filters, shaping raw Gmail API responses into the tool's documented `outputs`. I/O functions: thin wrappers that call the Gmail API client (via `googleapis`) and pass results through the pure shaping functions. Unit tests exercise only the pure functions; integration tests exercise the I/O wrappers against a fake/mock Gmail client (no real network calls, no real mailbox required).

4. **Implement `index.js`** as the MCP entry point per `skill/server-authoring`'s standard pattern — imports from `logic.js`, registers each tool with zod input schemas, connects `StdioServerTransport`.

5. **Write the new steering rule** at `steering/generic/gmail-send-approval.md` per `skill/steering-authoring`. Core rule: before invoking `gmail_send_message`, `gmail_send_draft`, or `gmail_reply_message` (or any future tool that transmits an email), the agent must ask the human an explicit, unambiguous approval question naming the recipient(s), subject, and a summary of the body, and must receive an explicit affirmative response in that same conversation turn-exchange. A prior general instruction ("send my emails for me") does not count as approval for an individual send — each send needs its own explicit yes. No exceptions (this mirrors the "Never Fabricate" / security-style absolute rules already in this repo's steering, per `skill/steering-authoring`'s guidance that rules can be absolute when justified). Enforcement section: violating this rule is a security-severity finding, not a style finding, consistent with `steering/global/core.md` Rule 3's treatment of security requirements.

6. **Create the `generic` bundle** at `bundles/generic/bundle.yaml` using the explicit-list resolution strategy (no `domain` field — no agent domain named "generic" exists, and none is being created by this plan). Lists: `servers: ["gmail"]`, `steering: ["steering/generic/gmail-send-approval.md"]`. `agents` and `skills` left empty — this bundle is for direct MCP tool installation into a harness (e.g. Claude Desktop/Claude Code) without an ai-foundation agent persona attached.

7. **Write tests** per `skill/server-authoring` Step 6: unit tests for MIME/query building, integration tests for the I/O wrappers against a fake Gmail client, and MCP protocol tests (tool listing, valid invocation, error handling) using `InMemoryTransport`.

8. **Self-validate** against both `skill/server-authoring` and `skill/bundle-authoring` checklists, then run the full test suite.

---

## Open Questions

1. **OAuth credential delivery mechanism** — this plan proposes environment variables (`GMAIL_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN`) set by the human outside the repo, with no token file ever written by the server. Confirm this is acceptable, or specify a different mechanism (e.g. OS keychain) before implementation begins.
2. **Scope of "usual things"** — the tool list in Approach step 1 is my best-effort coverage of common Gmail actions (search, read, label/archive/trash, draft, send, reply, attachments). Confirm this list is complete enough, or flag anything missing (e.g. forwarding as a distinct tool vs. reusing send with quoted body, calendar/contacts are explicitly out of scope per below).
3. **Bundle naming casing** — bundle folder/`name` field will be `generic` (kebab-case, per schema) even though referred to as "Generic" — confirm this is fine, since bundle names are lowercase identifiers throughout the repo.

---

## Risks

- **Destructive/irreversible actions beyond sending** — `gmail_trash_message` and `gmail_delete_draft` are reversible (trash) or low-risk (draft deletion), so this plan does not extend the explicit-approval gate to them, only to actual sends. Flagging this trade-off explicitly rather than silently deciding it — if the human wants approval gating on trash/delete too, say so and this plan will be revised before implementation.
- **OAuth setup friction** — the human must complete a one-time Google Cloud Console app registration + consent flow outside of any agent's control before the server is usable. This is unavoidable for Gmail API access and will be documented, not automated.
- **No production Gmail account available for integration testing** — integration tests will use a mocked/fake Gmail API client rather than a real mailbox, per `skill/server-authoring`'s "external infrastructure" edge case. This means send behavior is verified structurally (correct API calls made) but not against a live inbox.

---

## Validation

- `node --test "servers/gmail/tests/unit/**/*.test.js"`
- `node --test "servers/gmail/tests/integration/**/*.test.js"`
- `node --test "tests/validation/**/*.test.js"` (repo-wide schema/cross-reference checks, run from repo root)
- Manual cross-reference check: bundle's `servers`/`steering` entries resolve to real files; server YAML tool list matches implemented tools in `index.js`/`logic.js`
- Self-validation checklists from `skill/server-authoring`, `skill/bundle-authoring`, and `skill/steering-authoring` walked explicitly before declaring done

---

## Out of Scope

- Google Calendar, Google Contacts, or any non-Gmail Google API
- Any agent definition wiring this server into an existing agent's `tools`/`approved_tools` (this plan only creates the server + bundle; attaching it to an agent persona is a separate, future decision)
- Automating the initial OAuth consent flow (documented manual step only)
- Extending the approval gate to non-send mutating actions (trash/label/draft) — see Risks
