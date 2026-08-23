# Gmail MCP Server — Setup

This server needs a Google OAuth2 "Desktop app" client (a Client ID + Client Secret) before it can authenticate. That one step must be done by a human in the Google Cloud Console — no script can do it for you. Everything after that is automated by this server.

Plan ID: `docs/plans/gmail-mcp-server-plan.md`

## Step 1 — Create an OAuth client (one-time, manual)

**Authoritative source (always current — prefer this if anything below looks out of date):**

- Google Identity — OAuth 2.0 overview: https://developers.google.com/identity/protocols/oauth2
- Google Workspace — Create access credentials: https://developers.google.com/workspace/guides/create-credentials
- Gmail API Node.js quickstart (documents the Desktop-app client type this server needs): https://developers.google.com/gmail/api/quickstart/nodejs

**Condensed walkthrough** (steps verified against the Google Cloud Console as of **2026-08-21** — if the console's UI has since changed, defer to the official docs linked above):

1. Go to https://console.cloud.google.com/ and create a new project (or select an existing one).
2. In **APIs & Services > Library**, search for "Gmail API" and click **Enable**.
3. In **APIs & Services > OAuth consent screen**, configure it (choose "External" unless you have a Google Workspace org; add your own Google account as a test user if the app stays in "Testing" status).
4. In **APIs & Services > Credentials**, click **Create Credentials > OAuth client ID**.
5. Choose application type **Desktop app**, give it a name (e.g. "AIF Gmail MCP"), and click **Create**.
6. Copy the generated **Client ID** and **Client Secret** — you'll need them in Step 2.

## Step 2 — Run the one-time authorization script

From the repo root, using whichever shell you actually have open (the multi-line `\`-continued form doesn't paste reliably into every terminal — pick the single-line variant for your shell instead):

**Git Bash / macOS / Linux (bash or zsh):**

```bash
GMAIL_CLIENT_ID="<your client id>" GMAIL_CLIENT_SECRET="<your client secret>" node servers/gmail/scripts/authorize.js
```

**Windows PowerShell:**

```powershell
$env:GMAIL_CLIENT_ID="<your client id>"; $env:GMAIL_CLIENT_SECRET="<your client secret>"; node servers/gmail/scripts/authorize.js
```

**Windows cmd.exe:**

```cmd
set GMAIL_CLIENT_ID=<your client id>&& set GMAIL_CLIENT_SECRET=<your client secret>&& node servers/gmail/scripts/authorize.js
```

If pasting a single long line still gets mangled, set the variables one at a time instead, then run the script on its own:

```bash
# bash/zsh
export GMAIL_CLIENT_ID="<your client id>"
export GMAIL_CLIENT_SECRET="<your client secret>"
node servers/gmail/scripts/authorize.js
```

```powershell
# PowerShell
$env:GMAIL_CLIENT_ID = "<your client id>"
$env:GMAIL_CLIENT_SECRET = "<your client secret>"
node servers/gmail/scripts/authorize.js
```

This will:
1. Print a Google consent screen URL — open it in your browser and approve access.
2. Catch the redirect on a local loopback listener (`http://127.0.0.1:8765` by default — override the port with `GMAIL_AUTH_PORT` if that's taken).
3. Exchange the authorization code for a refresh token.
4. Save `{ client_id, client_secret, refresh_token }` to a local token file — by default `~/.aif/gmail-token.json`, or the path in `GMAIL_TOKEN_PATH` if set.

This token file is **never written into the repo** and should never be committed. It contains a long-lived credential — treat it like a password.

## Step 3 — Run the server

No further setup is needed. `servers/gmail/index.js` reads the token file automatically, refreshes access tokens as needed, and persists any rotated refresh token back to the same file.

If the token file is missing or invalid, tool calls will fail with an error message pointing back to Step 2.

## Re-authorizing / revoking access

To revoke this server's access entirely, visit https://myaccount.google.com/permissions, remove the app, and re-run Step 2 to generate a fresh token.

## Re-authorizing after a scope change

`GMAIL_SCOPES` in `auth.js` was extended (2026-08-22) to add `https://www.googleapis.com/auth/gmail.settings.basic`, needed by the filter tools (`gmail-create-filter`, `gmail-list-filters`, `gmail-delete-filter`). If you already have a token file from before this change:

- All existing tools (messages, labels, drafts, send/delete) keep working with your current token — no action needed for those.
- The filter tools will fail with a Google insufficient-scope error until you re-run Step 2 above. Re-running it (with `prompt: 'consent'` already baked into the script) re-issues a token covering the new scope automatically — no code changes needed, just run the script again.
