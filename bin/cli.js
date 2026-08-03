#!/usr/bin/env node

/**
 * aif — AI Foundation CLI
 *
 * Entry point for installing, uninstalling, and managing ai-foundation
 * components across supported harnesses.
 */

import { COMMANDS, HARNESSES } from '../lib/constants.js';

// --- Argument parsing ---

/**
 * Parses raw argv into a structured command object.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ command: string|null, args: Record<string, string|boolean>, positional: string[] }}
 */
export function parseArgs(argv) {
  const result = { command: null, args: {}, positional: [] };

  if (argv.length === 0) {
    return result;
  }

  // First non-flag argument is the command
  let commandFound = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!commandFound && !arg.startsWith('-')) {
      result.command = arg;
      commandFound = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      // If next arg exists and isn't a flag, treat as the value
      if (next && !next.startsWith('-')) {
        result.args[key] = next;
        i++;
      } else {
        result.args[key] = true;
      }
    } else if (!commandFound) {
      // Flag before command
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        result.args[key] = next;
        i++;
      } else {
        result.args[key] = true;
      }
    } else {
      // Non-flag after command
      result.positional.push(arg);
    }
  }

  return result;
}

// --- Help ---

const USAGE = `
aif — AI Foundation CLI

Usage:
  aif <command> [options]

Commands:
  install     Install a bundle to a harness
  uninstall   Uninstall a bundle from a harness
  status      Show what is currently installed
  list        List available bundles, agents, skills, or servers
  validate    Check repo health (schema, refs, bundles)
  test        Run test suite (unit, integration, validation)

Options:
  --bundle <name>    Bundle to install/uninstall
  --harness <name>   Target harness (${HARNESSES.join(', ')})
  --help             Show this help message

Examples:
  aif install --bundle engineering --harness kiro
  aif uninstall --bundle engineering --harness kiro
  aif status
  aif list bundles
  aif validate
  aif validate schema
  aif test unit
`.trim();

function printHelp() {
  console.log(USAGE);
}

// --- Command routing ---

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

import { runInstall } from '../lib/commands/install.js';
import { runUninstall } from '../lib/commands/uninstall.js';
import { runStatus } from '../lib/commands/status.js';
import { runList } from '../lib/commands/list.js';
import { runValidate } from '../lib/commands/validate.js';
import { runTest } from '../lib/commands/test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

/**
 * Routes a parsed command to the appropriate handler.
 * @param {{ command: string|null, args: Record<string, string|boolean>, positional: string[] }} parsed
 * @returns {Promise<number>} exit code
 */
export async function run(parsed) {
  if (!parsed.command || parsed.args.help) {
    printHelp();
    return parsed.args.help ? 0 : 1;
  }

  if (!COMMANDS.includes(parsed.command)) {
    console.error(`Unknown command: ${parsed.command}`);
    console.error(`Available commands: ${COMMANDS.join(', ')}`);
    return 1;
  }

  switch (parsed.command) {
    case 'install':
      return runInstall(parsed, REPO_ROOT);
    case 'uninstall':
      return runUninstall(parsed, REPO_ROOT);
    case 'status':
      return runStatus(parsed, REPO_ROOT);
    case 'list':
      return runList(parsed, REPO_ROOT);
    case 'validate':
      return runValidate(parsed, REPO_ROOT);
    case 'test':
      return runTest(parsed, REPO_ROOT);
    default:
      return 1;
  }
}

// --- Main (only when run directly) ---

const currentFile = __filename;
const entryFile = process.argv[1] ? resolve(process.argv[1]) : null;

if (currentFile === entryFile) {
  const parsed = parseArgs(process.argv.slice(2));
  const exitCode = await run(parsed);
  process.exitCode = exitCode;
}
