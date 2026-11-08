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
 *   aif index architecture --commit-msg <file>
 *                                    — `commit-msg` hook: warn (never fail) when the staged
 *                                      files touch a section's key_files with no doc edit or
 *                                      Arch-Unaffected waiver
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  loadArchitectureRecords,
  buildArchitectureIndex,
  findStaleDocs,
  findBrokenLinks,
} from '../architecture.js';
import { findUnwaivedSections } from '../arch-waivers.js';
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
 * `commit-msg` hook entry: warn about sections whose key_files are staged
 * without a doc edit or waiver. Advisory only — the doc may legitimately be
 * updated in a later commit — so it always returns 0, and any failure (no git,
 * unreadable message file) is silent.
 * @param {string} messageFile
 * @param {string} repoRoot
 * @returns {number} always 0
 */
function runCommitMsgCheck(messageFile, repoRoot) {
  try {
    const architectureDir = resolveArchitecturePath(repoRoot);
    const records = loadArchitectureRecords(architectureDir);
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--no-renames'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const architectureRel = relative(repoRoot, architectureDir).split(sep).join('/');
    const message = readFileSync(messageFile, 'utf8');
    for (const { section, files } of findUnwaivedSections(
      records,
      architectureRel,
      staged,
      message,
    )) {
      console.error(
        `⚠ arc42 §${section}: ${files.join(', ')} is a key_file but the doc is not in this commit.\n` +
          `  Update the doc, or if it is still accurate add to the message:\n` +
          `    Arch-Unaffected: ${section} — <why the doc is still accurate>\n` +
          `  (A later commit on the branch can still do either.)`,
      );
    }
  } catch {
    // advisory hook: never block a commit
  }
  return 0;
}

/**
 * Run the architecture-index generation/validation path.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runArchitectureIndex(parsed, repoRoot) {
  if (typeof parsed.args['commit-msg'] === 'string') {
    return runCommitMsgCheck(parsed.args['commit-msg'], repoRoot);
  }

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
  const staleDocs = findStaleDocs(records, repoRoot, architectureDir);

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
