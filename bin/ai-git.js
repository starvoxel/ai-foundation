#!/usr/bin/env node

/**
 * ai-git — Git operations with AI agent identity and authentication.
 *
 * A transparent wrapper around git and gh that automatically injects:
 * - AI author/committer identity from .aiconfig.json
 * - Authentication token from the configured env var
 *
 * Usage:
 *   ai-git <command> [args...]
 *
 * Git commands (identity injected):
 *   ai-git commit -m "message"
 *   ai-git push [remote] [branch]
 *   ai-git worktree add <path> -b <branch>
 *   ai-git <any git subcommand>
 *
 * GitHub commands (GH_TOKEN injected):
 *   ai-git gh-pr-create [--title "..." --body "..."]
 *   ai-git gh-pr-list
 *   ai-git gh-<subcommand> [args...]
 *
 * All arguments after the command are passed through verbatim.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  getIdentity,
  buildGitEnv,
  buildGhEnv,
  parseGhCommand,
  isGhCommand,
  needsPushAuth,
  buildAuthUrl,
  injectAuthUrl,
} from '../lib/ai-git.js';

// --- Config resolution ---

/**
 * Walk up from cwd to find .aiconfig.json.
 * @returns {{ config: object, root: string } | null}
 */
function findAiConfig() {
  let dir = process.cwd();
  const root = resolve(dir, '/');

  while (true) {
    const configPath = join(dir, '.aiconfig.json');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf8');
        return { config: JSON.parse(content), root: dir };
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

// --- Command execution ---

/**
 * Run a git command with AI identity and optional push auth.
 * @param {string[]} args - Git arguments (e.g. ['commit', '-m', 'message'])
 * @param {{ name: string, email: string, tokenEnvName: string|null }} identity
 * @returns {number} Exit code
 */
function runGit(args, identity) {
  const env = buildGitEnv(identity, process.env);
  let finalArgs = args;

  // Inject authentication for push/fetch
  if (needsPushAuth(args[0])) {
    const token = identity.tokenEnvName ? process.env[identity.tokenEnvName] : null;
    if (token) {
      // Resolve remote URL
      const remoteName = (args[1] && !args[1].startsWith('-')) ? args[1] : 'origin';
      const result = spawnSync('git', ['remote', 'get-url', remoteName], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (result.status === 0) {
        const remoteUrl = result.stdout.trim();
        const authUrl = buildAuthUrl(remoteUrl, token, identity.name);
        if (authUrl) {
          finalArgs = injectAuthUrl(args, authUrl);
        }
      }
    }
  }

  const result = spawnSync('git', finalArgs, {
    env,
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  return result.status ?? 1;
}

/**
 * Run a gh CLI command with token injected.
 * @param {string} command - The gh- prefixed command name
 * @param {string[]} args - Additional arguments
 * @param {{ tokenEnvName: string|null }} identity
 * @returns {number} Exit code
 */
function runGh(command, args, identity) {
  const token = identity.tokenEnvName ? process.env[identity.tokenEnvName] : null;

  if (!token) {
    const envName = identity.tokenEnvName || 'AI_GIT_TOKEN';
    console.error(`ERROR: ${envName} environment variable is not set.`);
    console.error('Cannot execute GitHub operations without a token.');
    return 1;
  }

  const env = buildGhEnv(token, process.env);
  const ghArgs = [...parseGhCommand(command), ...args];

  const result = spawnSync('gh', ghArgs, {
    env,
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error('ERROR: gh CLI is not installed.');
      console.error('Install from: https://cli.github.com/');
      return 1;
    }
    console.error(`ERROR: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

// --- Main ---

function printUsage() {
  console.log(`ai-git — Git operations with AI agent identity

Usage:
  ai-git <command> [args...]

Git commands (identity + auth injected):
  ai-git commit -m "message"
  ai-git push [remote] [branch]
  ai-git worktree add <path> -b <branch>
  ai-git tag <name>
  ai-git <any git subcommand>

GitHub commands (GH_TOKEN injected):
  ai-git gh-pr-create [--title "..." --body "..." --base main]
  ai-git gh-pr-list [--state open]
  ai-git gh-pr-merge <number> [--squash]
  ai-git gh-pr-view <number>
  ai-git gh-repo-view

Configuration:
  Reads .aiconfig.json from the current directory or any parent.
  Uses ai_identity.git_author_name, ai_identity.git_author_email,
  and the token from the env var named in ai_identity.git_token_env.
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  // Find and load config
  const found = findAiConfig();
  if (!found) {
    console.error('ERROR: No .aiconfig.json found in current directory or any parent.');
    console.error('ai-git requires a project with ai_identity configured.');
    process.exit(1);
  }

  const identity = getIdentity(found.config);
  const command = args[0];
  const commandArgs = args.slice(1);

  // Route to git or gh
  if (isGhCommand(command)) {
    process.exit(runGh(command, commandArgs, identity));
  } else {
    process.exit(runGit(args, identity));
  }
}

main();
