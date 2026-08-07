/**
 * uninstall command — reads manifest entry, deletes installed files,
 * deregisters MCP servers, and removes the manifest entry.
 */

import { unlinkSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { getEntry, removeEntry } from '../manifest.js';
import { HARNESSES, manifestKey } from '../constants.js';
import { removeMcpSetting as removeKiroMcpSetting, TARGETS as KIRO_TARGETS } from '../harnesses/kiro.js';
import { removeMcpSetting as removeClaudeMcpSetting, TARGETS as CLAUDE_TARGETS } from '../harnesses/claude.js';

const mcpCleanup = {
  kiro: removeKiroMcpSetting,
  claude: removeClaudeMcpSetting,
};

const serverTargetsMap = {
  kiro: KIRO_TARGETS,
  claude: CLAUDE_TARGETS,
};

/**
 * Run the uninstall command.
 * @param {{ args: Record<string, string>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runUninstall(parsed, repoRoot) {
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

  const key = manifestKey(bundleName, harness);
  const entry = getEntry(repoRoot, key);

  if (!entry) {
    console.error(`Bundle "${bundleName}" is not installed for ${harness}.`);
    return 1;
  }

  let removed = 0;
  let missing = 0;

  for (const file of entry.files) {
    if (existsSync(file.path)) {
      unlinkSync(file.path);
      removed++;
    } else {
      missing++;
    }
  }

  // Clean up server directories and MCP registrations
  if (Array.isArray(entry.servers) && entry.servers.length > 0) {
    const removeMcp = mcpCleanup[harness];
    const targets = serverTargetsMap[harness];

    for (const serverName of entry.servers) {
      // Remove MCP settings entry
      if (removeMcp) {
        removeMcp(serverName);
      }

      // Remove the server directory (includes node_modules, package-lock, etc.)
      if (targets && targets.servers) {
        const serverDir = join(targets.servers, serverName);
        if (existsSync(serverDir)) {
          rmSync(serverDir, { recursive: true, force: true });
        }
      }
    }
  }

  removeEntry(repoRoot, key);

  console.log(`Uninstalled bundle "${bundleName}" from ${harness} (${removed} files removed${missing > 0 ? `, ${missing} already missing` : ''})`);
  return 0;
}
