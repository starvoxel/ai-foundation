/**
 * Gmail MCP server — OAuth2 token store and client construction.
 *
 * Split per steering/engineering/core.md Rule 6 (design for testability):
 * pure decision logic (token expiry, shape validation) is separated from the
 * I/O functions that touch the filesystem and the Google OAuth2 client.
 *
 * Plan ID: docs/plans/gmail-mcp-server-plan.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { google } from 'googleapis';

export const GMAIL_SCOPES = ['https://mail.google.com/'];

export const DEFAULT_TOKEN_PATH = join(homedir(), '.aif', 'gmail-token.json');

// A 60-second safety margin so a token that's about to expire is refreshed
// proactively rather than failing mid-call.
const EXPIRY_SKEW_MS = 60_000;

// ── Pure Logic ───────────────────────────────────────────────────────────────

/**
 * Resolve the token file path: explicit override, else GMAIL_TOKEN_PATH env
 * var, else the default location under the user's home directory.
 *
 * @param {{ GMAIL_TOKEN_PATH?: string }} env
 * @param {string} [override]
 * @returns {string}
 */
export function resolveTokenPath(env = {}, override) {
  if (override) return override;
  if (env.GMAIL_TOKEN_PATH) return env.GMAIL_TOKEN_PATH;
  return DEFAULT_TOKEN_PATH;
}

/**
 * Decide whether stored OAuth credentials have the required shape.
 * @param {unknown} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTokenShape(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    errors.push('Token file content is not a valid JSON object');
    return { valid: false, errors };
  }
  for (const field of ['client_id', 'client_secret', 'refresh_token']) {
    if (typeof data[field] !== 'string' || !data[field]) {
      errors.push(`Token file missing required field "${field}"`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Decide whether a cached access token is expired (or within the safety
 * margin of expiring) and should be refreshed before use.
 *
 * @param {number|undefined|null} expiryDateMs - epoch ms, as googleapis stores it
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isAccessTokenExpired(expiryDateMs, nowMs = Date.now()) {
  if (!expiryDateMs) return true;
  return expiryDateMs - EXPIRY_SKEW_MS <= nowMs;
}

// ── I/O Layer ────────────────────────────────────────────────────────────────

/**
 * Read and validate the token file from disk.
 * @param {string} tokenPath
 * @returns {{ client_id: string, client_secret: string, refresh_token: string, access_token?: string, expiry_date?: number }}
 * @throws {Error} with a message directing the human to run scripts/authorize.js
 */
export function loadTokenFile(tokenPath) {
  if (!existsSync(tokenPath)) {
    throw new Error(
      `No Gmail OAuth token found at ${tokenPath}. Run "node servers/gmail/scripts/authorize.js" ` +
      `once to authorize this server (see servers/gmail/README.md).`
    );
  }
  let raw;
  try {
    raw = readFileSync(tokenPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read Gmail token file at ${tokenPath}: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Gmail token file at ${tokenPath} is not valid JSON: ${err.message}`);
  }
  const { valid, errors } = validateTokenShape(data);
  if (!valid) {
    throw new Error(
      `Gmail token file at ${tokenPath} is invalid: ${errors.join('; ')}. ` +
      `Re-run "node servers/gmail/scripts/authorize.js" to regenerate it.`
    );
  }
  return data;
}

/**
 * Write token data to disk, creating the parent directory if needed.
 * @param {string} tokenPath
 * @param {object} tokenData
 */
export function saveTokenFile(tokenPath, tokenData) {
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), 'utf-8');
}

/**
 * Build an OAuth2 client from stored token data, wired to persist rotated
 * refresh tokens back to the token file automatically.
 *
 * @param {string} tokenPath
 * @returns {import('googleapis').Auth.OAuth2Client}
 */
export function buildOAuth2Client(tokenPath) {
  const stored = loadTokenFile(tokenPath);
  const client = new google.auth.OAuth2(stored.client_id, stored.client_secret);
  client.setCredentials({
    refresh_token: stored.refresh_token,
    access_token: stored.access_token,
    expiry_date: stored.expiry_date,
  });

  // Persist any rotated refresh token (Google occasionally rotates it) and
  // the latest access token so subsequent runs don't need to re-auth.
  client.on('tokens', (tokens) => {
    const next = {
      client_id: stored.client_id,
      client_secret: stored.client_secret,
      refresh_token: tokens.refresh_token || stored.refresh_token,
      access_token: tokens.access_token || stored.access_token,
      expiry_date: tokens.expiry_date || stored.expiry_date,
    };
    saveTokenFile(tokenPath, next);
  });

  return client;
}

/**
 * Get an authorized OAuth2 client, refreshing the access token first if it's
 * expired or missing. This is the single entry point tool implementations use.
 *
 * @param {string} [tokenPath]
 * @returns {Promise<import('googleapis').Auth.OAuth2Client>}
 */
export async function getAuthorizedClient(tokenPath = resolveTokenPath(process.env)) {
  const client = buildOAuth2Client(tokenPath);
  if (isAccessTokenExpired(client.credentials.expiry_date)) {
    await client.getAccessToken(); // triggers refresh + the 'tokens' listener above
  }
  return client;
}
