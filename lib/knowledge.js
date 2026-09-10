/**
 * Pure logic for knowledge file validation and index entry construction.
 * No I/O — takes data in, returns data out.
 */

import { KNOWLEDGE_TYPES } from './constants.js';

/**
 * @typedef {object} KnowledgeFrontmatter
 * @property {string} [name]
 * @property {string} [description]
 * @property {string[]} [tags]
 * @property {string} [type]
 * @property {string} [scope]
 * @property {string} [status]
 */

/**
 * Validate knowledge file frontmatter.
 * @param {KnowledgeFrontmatter|null} frontmatter - Parsed YAML frontmatter
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateKnowledgeFrontmatter(frontmatter) {
  const errors = [];

  if (!frontmatter || typeof frontmatter !== 'object') {
    return { valid: false, errors: ['Missing or invalid frontmatter'] };
  }

  if (!frontmatter.name || typeof frontmatter.name !== 'string') {
    errors.push('Missing required field: name');
  }

  if (!frontmatter.description || typeof frontmatter.description !== 'string') {
    errors.push('Missing required field: description');
  }

  if (!Array.isArray(frontmatter.tags)) {
    errors.push('Missing required field: tags (must be an array)');
  } else if (frontmatter.tags.length === 0) {
    errors.push('tags must contain at least one entry');
  }

  if (frontmatter.type && !KNOWLEDGE_TYPES.includes(frontmatter.type)) {
    errors.push(
      `Invalid type: "${frontmatter.type}". Must be one of: ${KNOWLEDGE_TYPES.join(', ')}`,
    );
  }

  if (frontmatter.scope && typeof frontmatter.scope !== 'string') {
    errors.push('scope must be a string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build an index entry from validated frontmatter.
 * Applies defaults for optional fields.
 * @param {KnowledgeFrontmatter} frontmatter - Parsed (and validated) YAML frontmatter
 * @param {string} relPath - Relative path from knowledge root
 * @returns {object} Index entry
 */
export function buildIndexEntry(frontmatter, relPath) {
  const entry = {
    path: relPath,
    name: frontmatter.name,
    type: frontmatter.type || 'reference',
    tags: frontmatter.tags || [],
    scope: frontmatter.scope || 'all',
    description: frontmatter.description || '',
  };

  if (frontmatter.status) {
    entry.status = frontmatter.status;
  }

  return entry;
}
