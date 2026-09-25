/**
 * index command — scans a project's decisions or architecture directory and
 * generates an index.json with metadata for each file.
 *
 * This runs in a project directory (not the ai-foundation repo).
 * It reads .aiconfig.json to find the relevant path, then scans
 * the corresponding files for metadata.
 *
 * Plan: AIF-002-014 (added resolveDecisionsPath and the decision-index
 * generation path). Target selection was later switched from -k/-d flags
 * to a positional target, matching the `list`/`validate`/`test` command
 * convention (`aif` CLI subcommand consistency is the kind of secondary case
 * docs/decisions/0005-ai-git-tool-boundary.md's shell-vs-MCP test applies to).
 * The generic `knowledge` target (frontmatter `type` taxonomy) retired
 * under process-model check 13 — decisions and architecture each have
 * their own dedicated indexer, per `steering/engineering/document-types.md`.
 *
 * Usage:
 *   aif index decisions              — generate {paths.decisions}/index.json
 *   aif index decisions --check      — verify the decision index without writing
 *   aif index architecture           — generate {paths.architecture}/index.json
 *   aif index architecture --check   — verify the architecture index without writing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { buildDecisionIndexForDir, diffDecisionIndex } from '../decisions.js';
import { buildArchitectureIndexForDir, diffArchitectureIndex } from '../architecture.js';

/**
 * Read .aiconfig.json from a directory and return the knowledge path.
 * @param {string} projectRoot
 * @returns {string} Absolute path to the knowledge directory
 */
function resolveKnowledgePath(projectRoot) {
  const configPath = join(projectRoot, '.aiconfig.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.paths && config.paths.knowledge) {
        return join(projectRoot, config.paths.knowledge);
      }
    } catch {
      // Fall through to default
    }
  }
  return join(projectRoot, 'knowledge');
}

/**
 * Read .aiconfig.json from a directory and return the decisions path.
 * Configured-value resolution mirrors resolveKnowledgePath exactly: reads
 * paths.decisions if present. If unset (or .aiconfig.json is
 * missing/unparseable), falls back to '{resolveKnowledgePath(projectRoot)}/decisions'
 * — resolveKnowledgePath's own resolved directory (its configured
 * paths.knowledge value, or its own '<projectRoot>/knowledge' default if
 * that too is unset) with 'decisions' appended. This is not a fresh
 * hardcoded default; it depends on resolveKnowledgePath's resolution.
 * @param {string} projectRoot
 * @returns {string} Absolute path to the decisions directory
 */
export function resolveDecisionsPath(projectRoot) {
  const configPath = join(projectRoot, '.aiconfig.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.paths && config.paths.decisions) {
        return join(projectRoot, config.paths.decisions);
      }
    } catch {
      // Fall through to default
    }
  }
  return join(resolveKnowledgePath(projectRoot), 'decisions');
}

/**
 * Read .aiconfig.json from a directory and return the architecture path.
 * Configured-value resolution mirrors resolveDecisionsPath: reads
 * paths.architecture if present, else falls back to
 * '{resolveKnowledgePath(projectRoot)}/architecture'.
 * @param {string} projectRoot
 * @returns {string} Absolute path to the architecture directory
 */
export function resolveArchitecturePath(projectRoot) {
  const configPath = join(projectRoot, '.aiconfig.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      if (config.paths && config.paths.architecture) {
        return join(projectRoot, config.paths.architecture);
      }
    } catch {
      // Fall through to default
    }
  }
  return join(resolveKnowledgePath(projectRoot), 'architecture');
}

/**
 * Read an existing decisions index.json, or null if absent/unparseable.
 * @param {string} indexPath - Absolute path to the decisions index.json
 * @returns {{ generated_at: string, entries: import('../decisions.js').DecisionIndexEntry[] }|null}
 */
function readExistingDecisionIndex(indexPath) {
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Run the decision-index generation/validation path (-d/--decision).
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runDecisionIndex(parsed, repoRoot) {
  const decisionsDir = resolveDecisionsPath(repoRoot);
  const indexPath = join(decisionsDir, 'index.json');

  let index;
  try {
    index = buildDecisionIndexForDir(decisionsDir);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  if (parsed.args.check) {
    const existing = readExistingDecisionIndex(indexPath);
    const diff = diffDecisionIndex(index, existing);
    if (diff.stale) {
      console.error(`✗ Decision index is stale: ${diff.summary}`);
      return 1;
    }
    console.log('✓ Decision index is up to date.');
    return 0;
  }

  if (index.entries.length === 0) {
    console.log(`No ADR files found under: ${decisionsDir}. Writing an empty index.`);
  }

  mkdirSync(decisionsDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Decision index generated: ${index.entries.length} entries → ${indexPath}`);

  return 0;
}

/**
 * Read an existing architecture index.json, or null if absent/unparseable.
 * @param {string} indexPath - Absolute path to the architecture index.json
 * @returns {{ generated_at: string, entries: import('../architecture.js').ArchitectureIndexEntry[], reverse_index: Record<string, string[]> }|null}
 */
function readExistingArchitectureIndex(indexPath) {
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    return null;
  }
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

  let index;
  try {
    index = buildArchitectureIndexForDir(architectureDir, repoRoot);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  if (parsed.args.check) {
    const existing = readExistingArchitectureIndex(indexPath);
    const diff = diffArchitectureIndex(index, existing);
    if (diff.stale) {
      console.error(`✗ Architecture index is stale: ${diff.summary}`);
      return 1;
    }
    const staleDocs = index.entries.filter((e) => e.stale).map((e) => e.path);
    if (staleDocs.length > 0) {
      console.error(`✗ Architecture docs stale against key_files: ${staleDocs.join(', ')}`);
      return 1;
    }
    console.log('✓ Architecture index is up to date.');
    return 0;
  }

  if (index.entries.length === 0) {
    console.log(`No arc42 section files found under: ${architectureDir}. Writing an empty index.`);
  }

  mkdirSync(architectureDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Architecture index generated: ${index.entries.length} entries → ${indexPath}`);

  const staleDocs = index.entries.filter((e) => e.stale).map((e) => e.path);
  if (staleDocs.length > 0) {
    console.log(`  ⚠ stale against key_files: ${staleDocs.join(', ')}`);
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
    console.error('Usage: aif index <decisions|architecture>');
    return 1;
  }

  switch (target) {
    case 'decisions':
      return runDecisionIndex(parsed, repoRoot);
    case 'architecture':
      return runArchitectureIndex(parsed, repoRoot);
    default:
      console.error(`Unknown index target: ${target}. Use: decisions, architecture`);
      return 1;
  }
}
