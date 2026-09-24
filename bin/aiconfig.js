#!/usr/bin/env node

/**
 * aiconfig — deterministic .aiconfig.json field resolution for agents.
 *
 * A narrow, runtime-invoked CLI (same shape as bin/ai-git.js — see
 * docs/decisions/architecture/AIF-ARCH-006_ai-git-tool-boundary.decision.md
 * for why that kind of tool stays a separate script rather than an `aif`
 * subcommand): `aif` installs/manages ai-foundation itself and is invoked
 * by a human occasionally; `aiconfig` is read by agents mid-task, possibly
 * many times per session, from whatever directory they're in.
 *
 * Resolution is delegated entirely to lib/aiconfig.js — this file is I/O
 * only (argv parsing, project-root discovery, stdout/exit code).
 *
 * Usage:
 *   aiconfig get <key>          — print the resolved value (config value,
 *                                  else its documented default)
 *   aiconfig get <key> --abs    — print an absolute path (for paths.* keys)
 */

import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getConfigValue, getConfigPath, findProjectRoot } from '../lib/aiconfig.js';

const __filename = fileURLToPath(import.meta.url);

export function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : null;
  const rest = command ? argv.slice(1) : argv;

  const args = {};
  const positional = [];

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { command, args, positional };
}

function printUsage() {
  console.log(`aiconfig — deterministic .aiconfig.json field resolution

Usage:
  aiconfig get <key>          Print the resolved value for a dotted field
                               path (e.g. paths.decisions, ai_identity.git_author_name).
                               Uses the config value if set, else its
                               documented default. Never writes anything
                               back to .aiconfig.json.
  aiconfig get <key> --abs    Print an absolute path instead of the raw
                               (repo-root-relative) resolved value.

Resolution:
  Walks up from the current directory to find .aiconfig.json (same
  discovery as ai-git). If none is found, the current directory is
  treated as the project root and only defaults apply.
`);
}

/**
 * @param {{ command: string|null, args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} cwd
 * @returns {number} exit code
 */
export function run(parsed, cwd) {
  if (!parsed.command || parsed.args.help || parsed.args.h) {
    printUsage();
    return parsed.command ? 1 : 0;
  }

  if (parsed.command !== 'get') {
    console.error(`Unknown command: ${parsed.command}. Use: get`);
    return 1;
  }

  const key = parsed.positional[0];
  if (!key) {
    console.error('Usage: aiconfig get <key>');
    return 1;
  }

  const projectRoot = findProjectRoot(cwd) ?? cwd;

  try {
    const value = parsed.args.abs
      ? getConfigPath(projectRoot, key)
      : getConfigValue(projectRoot, key);
    console.log(value);
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}

// --- Main (only when run directly) ---

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(__filename) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

if (isMain()) {
  const parsed = parseArgs(process.argv.slice(2));
  process.exitCode = run(parsed, process.cwd());
}
