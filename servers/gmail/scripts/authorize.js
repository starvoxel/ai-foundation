#!/usr/bin/env node
/**
 * One-time interactive OAuth setup for the Gmail MCP server.
 *
 * Run this locally after registering a Google Cloud OAuth "Desktop app"
 * client (see servers/gmail/README.md for how to do that). This script:
 *   1. Starts a short-lived local loopback HTTP listener
 *   2. Opens (prints) the Google consent screen URL
 *   3. Receives the auth code on the loopback redirect
 *   4. Exchanges it for a refresh token
 *   5. Writes { client_id, client_secret, refresh_token } to the token file
 *
 * After this completes, the server authenticates itself automatically —
 * no further manual steps are needed.
 *
 * Usage:
 *   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node servers/gmail/scripts/authorize.js
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { google } from 'googleapis';

import { GMAIL_SCOPES, resolveTokenPath, saveTokenFile } from '../auth.js';

const LOOPBACK_PORT = Number(process.env.GMAIL_AUTH_PORT || 8765);
const REDIRECT_URI = `http://127.0.0.1:${LOOPBACK_PORT}/oauth2callback`;

/**
 * Runs the full loopback OAuth flow and returns the credentials to persist.
 * @param {{ clientId: string, clientSecret: string }} params
 * @returns {Promise<{ client_id: string, client_secret: string, refresh_token: string, access_token?: string, expiry_date?: number }>}
 */
export function runAuthorizeFlow({ clientId, clientSecret }) {
  return new Promise((resolve, reject) => {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // forces a refresh_token to be issued even on repeat authorizations
      scope: GMAIL_SCOPES,
    });

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Authorization failed: ${error}`);
          server.close();
          reject(new Error(`Google returned an error: ${error}`));
          return;
        }
        const { tokens } = await oauth2Client.getToken(code);
        res.writeHead(200, { 'Content-Type': 'text/plain' })
          .end('Gmail authorization complete. You can close this tab and return to the terminal.');
        server.close();
        resolve({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          expiry_date: tokens.expiry_date,
        });
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Authorization failed. See terminal.');
        server.close();
        reject(err);
      }
    });

    server.listen(LOOPBACK_PORT, () => {
      console.log('Open this URL in your browser to authorize Gmail access:\n');
      console.log(authUrl);
      console.log(`\nWaiting for you to complete the consent flow (listening on ${REDIRECT_URI})...`);
    });
  });
}

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      'Missing GMAIL_CLIENT_ID and/or GMAIL_CLIENT_SECRET environment variables.\n' +
      'Create an OAuth "Desktop app" client in Google Cloud Console first — see servers/gmail/README.md.'
    );
    process.exit(1);
  }

  const tokenData = await runAuthorizeFlow({ clientId, clientSecret });
  if (!tokenData.refresh_token) {
    console.error(
      'Google did not return a refresh_token. This usually means a token already exists for this ' +
      'client/account. Revoke access at https://myaccount.google.com/permissions and re-run this script.'
    );
    process.exit(1);
  }

  const tokenPath = resolveTokenPath(process.env);
  saveTokenFile(tokenPath, tokenData);
  console.log(`\nSaved Gmail credentials to ${tokenPath}. The server can now authenticate itself.`);
}

// Only run when invoked directly (not when imported by tests). Compared as
// file:// URLs (via pathToFileURL) rather than string concatenation, since
// process.argv[1] is a native path (backslashes on Windows) and naive
// `file://${...}` concatenation never matches import.meta.url there.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Gmail authorization failed:', err.message);
    process.exit(1);
  });
}
