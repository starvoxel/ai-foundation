/**
 * index command — scans a project's knowledge or decisions directory and
 * generates an index.json with metadata for each file.
 *
 * This runs in a project directory (not the ai-foundation repo).
 * It reads .aiconfig.json to find the relevant path, then scans
 * the corresponding files for metadata.
 *
 * Plan: AIF-002-014 (added resolveDecisionsPath and the decision-index
 * generation path; the pre-existing knowledge-index logic below is
 * unmodified in behavior). Target selection was later switched from
 * -k/-d flags to a positional target, matching the `list`/`validate`/`test`
 * command convention (see AIF-ARCH-006's audit note on `aif` CLI consistency).
 *
 * Usage:
 *   aif index knowledge            — generate knowledge/index.json
 *   aif index decisions            — generate {paths.decisions}/index.json
 *   aif index decisions --check    — verify the decision index without writing
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseFrontmatter } from '../harnesses/base.js';
import { validateKnowledgeFrontmatter, buildIndexEntry } from '../knowledge.js';
import { buildDecisionIndexForDir, diffDecisionIndex } from '../decisions.js';

/**
 * Recursively collect all .md files in a directory.
 * @param {string} dir
 * @param {string} [basePath=''] - Relative path prefix
 * @returns {string[]} Relative paths
 */
function collectMdFiles(dir, basePath = '') {
  if (!existsSync(dir)) return [];

  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(join(dir, entry.name), relPath));
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
      results.push(relPath);
    }
  }

  return results;
}

/**
 * Parse a knowledge file's frontmatter into an index entry.
 * @param {string} filePath - Absolute path to the file
 * @param {string} relPath - Relative path from knowledge root
 * @returns {object|null} Index entry or null if invalid frontmatter
 */
function parseKnowledgeEntry(filePath, relPath) {
  const content = readFileSync(filePath, 'utf8');
  const { frontmatter } = parseFrontmatter(content);

  const { valid } = validateKnowledgeFrontmatter(frontmatter);
  if (!valid) return null;

  return buildIndexEntry(frontmatter, relPath);
}

/**
 * Build the knowledge index for a directory.
 * @param {string} knowledgeDir - Absolute path to the knowledge directory
 * @returns {{ generated_at: string, entries: object[] }}
 */
export function buildKnowledgeIndex(knowledgeDir) {
  const mdFiles = collectMdFiles(knowledgeDir);
  const entries = [];

  for (const relPath of mdFiles) {
    const absPath = join(knowledgeDir, relPath);
    const entry = parseKnowledgeEntry(absPath, relPath);
    if (entry) {
      entries.push(entry);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    entries,
  };
}

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
 * Run the knowledge-index generation path (existing behavior, unchanged).
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runKnowledgeIndex(parsed, repoRoot) {
  const knowledgeDir = resolveKnowledgePath(repoRoot);

  if (!existsSync(knowledgeDir)) {
    console.log(`No knowledge directory found at: ${knowledgeDir}`);
    console.log('Create a knowledge/ directory with .md files to generate an index.');
    return 0;
  }

  const index = buildKnowledgeIndex(knowledgeDir);

  if (index.entries.length === 0) {
    console.log('No knowledge files with valid frontmatter found.');
    return 0;
  }

  const indexPath = join(knowledgeDir, 'index.json');
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Knowledge index generated: ${index.entries.length} entries → ${indexPath}`);

  return 0;
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
    console.log(`No .decision.md files found under: ${decisionsDir}. Writing an empty index.`);
  }

  mkdirSync(decisionsDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Decision index generated: ${index.entries.length} entries → ${indexPath}`);

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
    console.error('Usage: aif index <knowledge|decisions>');
    return 1;
  }

  switch (target) {
    case 'decisions':
      return runDecisionIndex(parsed, repoRoot);
    case 'knowledge':
      return runKnowledgeIndex(parsed, repoRoot);
    default:
      console.error(`Unknown index target: ${target}. Use: knowledge, decisions`);
      return 1;
  }
}
