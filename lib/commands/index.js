/**
 * index command — scans a project's knowledge directory and generates
 * knowledge/index.json with metadata for each knowledge file.
 *
 * This runs in a project directory (not the ai-foundation repo).
 * It reads .aiconfig.json to find the knowledge path, then scans
 * all .md files for frontmatter metadata.
 *
 * Usage:
 *   aif index              — generate knowledge/index.json in the current project
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseFrontmatter } from '../harnesses/base.js';
import { validateKnowledgeFrontmatter, buildIndexEntry } from '../knowledge.js';

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
 * Run the index command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runIndex(parsed, repoRoot) {
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
