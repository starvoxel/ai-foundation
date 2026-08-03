/**
 * status command — reads the manifest, reports what's installed,
 * and flags stale files (hash mismatch with current installed content).
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { readManifest } from '../manifest.js';

/**
 * Run the status command.
 * @param {{ args: Record<string, string>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runStatus(parsed, repoRoot) {
  const manifest = readManifest(repoRoot);
  const keys = Object.keys(manifest);

  if (keys.length === 0) {
    console.log('Nothing installed.');
    return 0;
  }

  for (const key of keys) {
    const entry = manifest[key];
    const [bundle, harness] = key.split('_');
    let current = 0;
    let stale = 0;
    let missing = 0;

    for (const file of entry.files) {
      if (!existsSync(file.path)) {
        missing++;
      } else {
        const content = readFileSync(file.path, 'utf8');
        const hash = 'sha256:' + createHash('sha256').update(content).digest('hex');
        if (hash === file.hash) {
          current++;
        } else {
          stale++;
        }
      }
    }

    const total = entry.files.length;
    const status = missing > 0 || stale > 0 ? '⚠' : '✓';
    console.log(`${status} ${bundle} → ${harness} (v${entry.version})`);
    console.log(`    ${total} files: ${current} current, ${stale} stale, ${missing} missing`);

    if (stale > 0) {
      console.log('    Run `aif install` to update stale files.');
    }
    if (missing > 0) {
      console.log('    Some files were deleted externally. Reinstall or uninstall to clean up.');
    }
  }

  return 0;
}
