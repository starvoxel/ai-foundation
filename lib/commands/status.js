/**
 * status command — reads the manifest, reports what's installed,
 * flags stale files (hash mismatch with installed content),
 * and reports source freshness by comparing against the snapshot.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { readManifest } from '../manifest.js';
import { readSnapshot } from './snapshot.js';

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

    // Target integrity check
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
    const hasTargetIssues = missing > 0 || stale > 0;

    // Source freshness check
    const snapshot = readSnapshot(bundle, repoRoot);
    let outdated = 0;
    let added = 0;
    let orphaned = 0;
    let hasFreshness = false;

    if (snapshot && snapshot.sources && entry.sourceHashes) {
      hasFreshness = true;

      // Outdated: hash in manifest sourceHashes doesn't match current snapshot
      for (const [path, hash] of Object.entries(entry.sourceHashes)) {
        if (path in snapshot.sources) {
          if (snapshot.sources[path] !== hash) {
            outdated++;
          }
        } else {
          orphaned++;
        }
      }

      // New: in snapshot but not in manifest sourceHashes
      for (const path of Object.keys(snapshot.sources)) {
        if (!(path in entry.sourceHashes)) {
          added++;
        }
      }
    }

    const hasSourceIssues = outdated > 0 || added > 0 || orphaned > 0;
    const status = hasTargetIssues || hasSourceIssues ? '⚠' : '✓';

    console.log(`${status} ${bundle} → ${harness} (v${entry.version})`);
    console.log(`    ${total} files: ${current} current, ${stale} stale, ${missing} missing`);

    if (hasFreshness && hasSourceIssues) {
      const parts = [];
      if (outdated > 0) parts.push(`${outdated} outdated`);
      if (added > 0) parts.push(`${added} new`);
      if (orphaned > 0) parts.push(`${orphaned} orphaned`);
      console.log(`    Source freshness: ${parts.join(', ')}`);
    }

    if (hasTargetIssues || hasSourceIssues) {
      console.log('    Run `aif install` to update.');
    } else if (!hasFreshness && !snapshot) {
      console.log('    No snapshot found. Run `aif snapshot` to enable freshness detection.');
    }
  }

  return 0;
}
