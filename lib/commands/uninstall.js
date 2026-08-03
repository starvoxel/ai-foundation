/**
 * uninstall command — reads manifest entry, deletes installed files,
 * removes the manifest entry.
 */

import { unlinkSync, existsSync } from 'node:fs';

import { getEntry, removeEntry } from '../manifest.js';
import { HARNESSES, manifestKey } from '../constants.js';

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

  removeEntry(repoRoot, key);

  console.log(`Uninstalled bundle "${bundleName}" from ${harness} (${removed} files removed${missing > 0 ? `, ${missing} already missing` : ''})`);
  return 0;
}
