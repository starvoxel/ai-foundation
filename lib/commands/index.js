/**
 * index command — scans a project's architecture directory and generates an
 * index.json with metadata for each arc42 section.
 *
 * This runs in a project directory (not the ai-foundation repo).
 * It resolves the path via lib/aiconfig.js, then scans the files for metadata.
 *
 * The index.json is generated on demand, is gitignored, and is deterministic
 * (same inputs, byte-identical output). `--check` never reads a stored index;
 * it validates the source docs directly.
 *
 * Usage:
 *   aif index architecture           — generate {paths.architecture}/index.json
 *   aif index architecture --check   — validate the arc42 corpus without writing
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadArchitectureRecords,
  buildArchitectureIndex,
  findStaleDocs,
  findBrokenLinks,
} from '../architecture.js';
import { getConfigPath } from '../aiconfig.js';

/**
 * Resolve a project's architecture directory via the shared .aiconfig.json
 * resolver. Reads the configured
 * paths.architecture value, or its documented default (nested under the
 * resolved paths.knowledge, per lib/aiconfig-defaults.js).
 * @param {string} projectRoot
 * @returns {string} Absolute path to the architecture directory
 */
export function resolveArchitecturePath(projectRoot) {
  return getConfigPath(projectRoot, 'paths.architecture');
}

/**
 * Run the architecture-index generation/validation path.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runArchitectureIndex(parsed, repoRoot) {
  const architectureDir = resolveArchitecturePath(repoRoot);
  const indexPath = join(architectureDir, 'index.json');

  let records;
  try {
    records = loadArchitectureRecords(architectureDir);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  const index = buildArchitectureIndex(records);
  const staleDocs = findStaleDocs(records, repoRoot);

  if (parsed.args.check) {
    if (staleDocs.length > 0) {
      console.error(`✗ Architecture docs stale against key_files: ${staleDocs.join(', ')}`);
      return 1;
    }
    const brokenLinks = findBrokenLinks(architectureDir);
    if (brokenLinks.length > 0) {
      console.error('✗ Broken relative links in docs/architecture:');
      for (const msg of brokenLinks) console.error(`    ${msg}`);
      return 1;
    }
    console.log(`✓ Architecture docs are valid: ${index.entries.length} entries.`);
    return 0;
  }

  if (index.entries.length === 0) {
    console.log(`No arc42 section files found under: ${architectureDir}. Writing an empty index.`);
  }

  mkdirSync(architectureDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Architecture index generated: ${index.entries.length} entries → ${indexPath}`);

  if (staleDocs.length > 0) {
    console.log(`  ⚠ stale against key_files: ${staleDocs.join(', ')}`);
  }

  const brokenLinks = findBrokenLinks(architectureDir);
  if (brokenLinks.length > 0) {
    console.log('  ⚠ broken relative links:');
    for (const msg of brokenLinks) console.log(`    ${msg}`);
  }

  return 0;
}

/**
 * Run the index command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runIndex(parsed, repoRoot) {
  const target = parsed.positional[0];

  if (!target) {
    console.error('Usage: aif index architecture');
    return 1;
  }

  try {
    switch (target) {
      case 'architecture':
        return runArchitectureIndex(parsed, repoRoot);
      default:
        console.error(`Unknown index target: ${target}. Use: architecture`);
        return 1;
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}
