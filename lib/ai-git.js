/**
 * ai-git — Pure logic for AI git identity and auth injection.
 * No I/O — provides parsing, config extraction, and arg transformation.
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
 * Build an authenticated GitHub URL from a remote URL and token.
 * Returns null if the URL is not a GitHub HTTPS URL.
 * @param {string} remoteUrl - The git remote URL
 * @param {string} token - The authentication token
 * @param {string} username - The username for auth (derived from identity name)
 * @returns {string|null} Authenticated URL or null
 */
export function buildAuthUrl(remoteUrl, token, username) {
  const match = remoteUrl.match(/^https:\/\/github\.com\/(.+)$/);
  if (!match) return null;

  const repoPath = match[1];
  const safeUsername = username.replace(/\s+/g, '-').toLowerCase();
  return `https://${safeUsername}:${token}@github.com/${repoPath}`;
}

/**
 * Transform push/fetch args to use an authenticated URL.
 * If the args already contain an https:// URL, returns unchanged.
 * @param {string[]} args - Full git args (e.g. ['push', 'origin', 'main'])
 * @param {string} authUrl - The authenticated URL to inject
 * @returns {string[]} Modified args
 */
export function injectAuthUrl(args, authUrl) {
  // If args already have an explicit URL, don't inject
  if (args.some(a => a.startsWith('https://'))) return args;

  const newArgs = [...args];
  const subcommand = args[0]; // 'push' or 'fetch'

  if (args.length > 1 && !args[1].startsWith('-')) {
    // Second arg is likely the remote name — replace it with auth URL
    newArgs[1] = authUrl;
  } else {
    // No remote specified — insert after subcommand
    newArgs.splice(1, 0, authUrl);
  }

  return newArgs;
}
