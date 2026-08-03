/**
 * test command — runs the project test suite via Node's test runner.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Run the test command.
 * @param {{ args: Record<string, string>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runTest(parsed, repoRoot) {
  const target = parsed.positional[0];

  const patterns = {
    unit: 'tests/unit/**/*.test.js',
    integration: 'tests/integration/**/*.test.js',
    validation: 'tests/validation/**/*.test.js',
  };

  let glob;
  if (!target) {
    glob = 'tests/**/*.test.js';
  } else if (patterns[target]) {
    glob = patterns[target];
  } else {
    console.error(`Unknown test target: ${target}. Use: unit, integration, validation`);
    return 1;
  }

  const cmd = `node --test "${glob}"`;
  console.log(`Running: ${cmd}\n`);

  try {
    execSync(cmd, { cwd: repoRoot, stdio: 'inherit' });
    return 0;
  } catch (err) {
    return err.status || 1;
  }
}
