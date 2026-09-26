/**
 * Generic file, hash, and frontmatter helpers with no harness-specific
 * behavior. Reused by the harness adapters (lib/harnesses/*.js), the
 * decisions/architecture indexers (lib/decisions.js, lib/architecture.js),
 * and the snapshot builder (lib/snapshot/io.js) alike.
 */

import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';

/**
 * Parse YAML frontmatter from markdown content.
 * @param {string} content
 * @returns {{ frontmatter: Record<string, any>|null, body: string }}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: content };
  }
  const frontmatter = YAML.parse(match[1]);
  const body = match[2];
  return { frontmatter, body };
}

/**
 * SHA-256 hash with prefix.
 * @param {string|Buffer} content
 * @returns {string}
 */
export function hashContent(content) {
  const data = typeof content === 'string' ? content : content.toString('utf8');
  return 'sha256:' + createHash('sha256').update(data).digest('hex');
}

/**
 * Write content to a target path, creating directories as needed.
 * @param {string} filePath
 * @param {string|Buffer} content
 */
export function writeToTarget(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}

/**
 * Recursively collect all files in a directory, returning paths relative to dir.
 * Skips directories named '_template'.
 * @param {string} dir
 * @param {string} [prefix='']
 * @returns {string[]}
 */
export function collectFiles(dir, prefix = '') {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== '_template') {
        results.push(...collectFiles(join(dir, entry.name), relPath));
      }
    } else {
      results.push(relPath);
    }
  }
  return results;
}
