#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — blocks Bash commands matching an agent's
 * blocked_commands patterns.
 *
 * Invoked by Claude Code (via a subagent's frontmatter `hooks.PreToolUse`)
 * as: node cli.js "<pattern1>" "<pattern2>" ...
 *
 * Reads the PreToolUse hook JSON payload from stdin, extracts
 * `tool_input.command`, and checks it against the patterns passed as argv.
 * Exit code 2 blocks the tool call (Claude Code hook convention, with the
 * stderr message surfaced to the agent); exit code 0 allows it.
 *
 * Fails open (exit 0) on any read/parse error — this hook enforces workflow
 * discipline (e.g. "use ai-git, not raw git"), not a security boundary, so
 * an unexpected input shape should not block all Bash usage.
 */

import { matchesBlockedCommand } from './logic.js';

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const patterns = process.argv.slice(2);

  let input;
  try {
    input = await readStdin();
  } catch {
    process.exit(0);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
    return;
  }

  const command = payload && payload.tool_input && payload.tool_input.command;
  const matched = matchesBlockedCommand(command, patterns);

  if (matched) {
    process.stderr.write(`Blocked by ai-foundation blocked_commands: matches pattern '${matched}'\n`);
    process.exit(2);
    return;
  }

  process.exit(0);
}

main();
