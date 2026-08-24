/**
 * ai-git — Pure logic for AI git identity and auth injection.
 * No I/O — provides parsing, config extraction, and arg transformation.
 *
 * No Plan ID — small human-approved security bugfix (see chat approval
 * 2026-08-23) for the push/fetch auth-injection argument-order bug that
 * could echo the auth token to stdout or persist it into .git/config.
 */

/**
 * Extract AI identity fields from a parsed .aiconfig.json.
 * @param {object} config - Parsed .aiconfig.json content
 * @returns {{ name: string, email: string, tokenEnvName: string|null }}
 */
export function getIdentity(config) {
  const ai = config.ai_identity || {};
  const name = ai.git_author_name || 'AI Agent';
  const email = ai.git_author_email || 'ai@localhost';
  const tokenEnvName = ai.git_token_env || null;

  return { name, email, tokenEnvName };
}

/**
 * Build git environment variables with AI identity injected.
 * @param {{ name: string, email: string }} identity
 * @param {object} [baseEnv={}] - Base environment to extend
 * @returns {object} Environment variables object
 */
export function buildGitEnv(identity, baseEnv = {}) {
  return {
    ...baseEnv,
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  };
}

/**
 * Build gh environment variables with token injected.
 * @param {string|null} token - The token value
 * @param {object} [baseEnv={}] - Base environment to extend
 * @returns {object} Environment variables object
 */
export function buildGhEnv(token, baseEnv = {}) {
  const env = { ...baseEnv };
  if (token) {
    env.GH_TOKEN = token;
  }
  return env;
}

/**
 * Map a gh- prefixed command to gh CLI arguments.
 * "gh-pr-create" → ["pr", "create"]
 * "gh-pr-list"   → ["pr", "list"]
 * "gh-repo-view" → ["repo", "view"]
 * @param {string} command - The gh- prefixed command
 * @returns {string[]} gh CLI subcommand parts
 */
export function parseGhCommand(command) {
  const parts = command.slice(3).split('-');
  return parts;
}

/**
 * Determine if a command is a GitHub (gh-) command.
 * @param {string} command
 * @returns {boolean}
 */
export function isGhCommand(command) {
  return command.startsWith('gh-');
}

/**
 * Determine if a git subcommand needs push authentication.
 * @param {string} subcommand - The git subcommand (e.g. 'push', 'commit')
 * @returns {boolean}
 */
export function needsPushAuth(subcommand) {
  return subcommand === 'push' || subcommand === 'fetch';
}

/**
 * Determine the git http config scope prefix for a GitHub HTTPS remote
 * URL (e.g. "https://github.com/"). Returns null if the URL is not a
 * GitHub HTTPS URL, since auth injection only supports github.com.
 * @param {string} remoteUrl - The git remote URL
 * @returns {string|null}
 */
export function getAuthScope(remoteUrl) {
  const match = remoteUrl.match(/^(https:\/\/github\.com\/)/);
  return match ? match[1] : null;
}

/**
 * Build the value for a git `http.<scope>.extraheader` config entry that
 * authenticates over HTTPS using a Basic auth header. The token is never
 * embedded in a URL, so it cannot appear in git's "To <url>"/"From <url>"
 * progress output and is never written into .git/config as a URL
 * substring.
 * @param {string} token - The authentication token
 * @param {string} username - The username for auth (derived from identity name)
 * @returns {string} Header value, e.g. "AUTHORIZATION: basic <base64>"
 */
export function buildAuthHeaderValue(token, username) {
  const safeUsername = username.replace(/\s+/g, '-').toLowerCase();
  const encoded = Buffer.from(`${safeUsername}:${token}`, 'utf8').toString('base64');
  return `AUTHORIZATION: basic ${encoded}`;
}

/**
 * Build the `-c` config-override arguments that inject push/fetch
 * authentication for a GitHub HTTPS remote, scoped to that remote's
 * host+scheme prefix. Returns [] if the remote is not a GitHub HTTPS
 * URL. These args are transient — passed as `git -c ...` on argv only —
 * so they are never written to .git/config and never require rewriting
 * the caller's own push/fetch arguments (remote name, refspec, flags
 * like -u/--set-upstream can appear in any order and are left untouched).
 * @param {string} remoteUrl - The git remote URL
 * @param {string} token - The authentication token
 * @param {string} username - The username for auth (derived from identity name)
 * @returns {string[]} Config-override args to prepend before the subcommand
 */
export function buildAuthConfigArgs(remoteUrl, token, username) {
  const scope = getAuthScope(remoteUrl);
  if (!scope) return [];

  const headerValue = buildAuthHeaderValue(token, username);
  return ['-c', `http.${scope}.extraheader=${headerValue}`];
}

/**
 * Find the remote name argument for a git push/fetch command, ignoring
 * flags regardless of where they appear (e.g. `push -u origin main` and
 * `push origin -u main` both yield "origin"). Falls back to 'origin'
 * when no positional remote argument is present.
 * @param {string[]} args - Full git args (e.g. ['push', '-u', 'origin', 'main'])
 * @returns {string}
 */
export function findRemoteName(args) {
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith('-')) return args[i];
  }
  return 'origin';
}
