/**
 * install command — resolves a bundle and delegates installation to the
 * harness adapter. Records results in the manifest.
 */

import { resolveBundle } from '../resolver.js';
import * as kiro from '../harnesses/kiro.js';
import * as claude from '../harnesses/claude.js';
import { setEntry } from '../manifest.js';
import { HARNESSES, manifestKey } from '../constants.js';

const adapters = {
  kiro,
  claude,
};

/**
 * Run the install command.
 * @param {{ args: Record<string, string>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runInstall(parsed, repoRoot) {
  const bundleName = parsed.args.bundle;
  const harness = parsed.args.harness;

  if (!bundleName) {
    console.error('Missing required option: --bundle <name>');
    return 1;
  }
  if (!harness) {
    console.error('Missing required option: --harness <name>');
    return 1;
  }
  if (!HARNESSES.includes(harness)) {
    console.error(`Unknown harness: ${harness}. Supported: ${HARNESSES.join(', ')}`);
    return 1;
  }

  // Resolve bundle
  let resolved;
  try {
    resolved = resolveBundle(bundleName, repoRoot);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  // Get adapter for harness
  const adapter = adapters[harness];

  // Delegate to harness adapter
  const files = [
    ...adapter.installAgents(resolved.agents, repoRoot),
    ...adapter.installSteering(resolved.steering, repoRoot),
    ...adapter.installSkills(resolved.skills, repoRoot),
    ...adapter.installServers(resolved.servers, repoRoot),
  ];

  // Record in manifest
  const key = manifestKey(bundleName, harness);
  setEntry(repoRoot, key, {
    version: resolved.version,
    files,
  });

  console.log(`\nInstalled bundle "${bundleName}" to ${harness} (${files.length} files)`);
  return 0;
}
