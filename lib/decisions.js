// ------------------------------
// decisions.js
//
// Author: Starvoxel AI Agent - 2026-08-19
// Plan: AIF-002-014, AIF-003-001
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Decision-record metadata parsing, index building, and diffing for the
 * `aif index -d` command (lib/commands/index.js).
 *
 * Pure logic (parsing, inversion, diffing) is exported with no I/O so it can
 * be unit tested against synthetic in-memory fixtures. The io wrapper
 * functions at the bottom of this file (collectDecisionFiles,
 * buildDecisionIndexForDir) compose the pure functions with real filesystem
 * access, mirroring the lib/snapshot/{pure,io}.js split.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Only `Decision ID` and `Status` are strictly required. `Tier`/`Domain` are
// optional to tolerate legacy records (e.g. AIF-ARCH-001/002/003) that
// predate the AIF-META-001 Tier x Domain model and were deliberately
// migrated (chunk AIF-002-009, "light-touch") without those fields rather
// than being retrofitted. Human-approved fix, no formal Plan ID, per chat
// approval 2026-08-24 — mirrors the ai-git token-leak fix (commit 5543cc4).
const REQUIRED_FIELDS = ['Decision ID', 'Status'];
const TITLE_PATTERN = /^# (?:Decision Record|Decision Brief): (.+)$/m;

/**
 * @typedef {object} DecisionRecord
 * @property {string} id
 * @property {string|null} tier
 * @property {string|null} domain
 * @property {string} title
 * @property {string} status
 * @property {string} path
 * @property {string[]} references
 * @property {string[]} supersedes
 * @property {string[]} tags
 */

/**
 * @typedef {object} DecisionIndexEntry
 * @property {string} id
 * @property {string|null} tier
 * @property {string|null} domain
 * @property {string} title
 * @property {string} status
 * @property {string} path
 * @property {string[]} supersedes
 * @property {string[]} superseded_by
 * @property {string[]} references
 * @property {string[]} referenced_by
 * @property {string[]} tags
 */

/**
 * Split a comma-separated Metadata table field into a trimmed array.
 * Treats an empty string or the "—" placeholder (this repo's established
 * empty-value convention) as no values.
 * @param {string|undefined} value - Raw field value from the Metadata table
 * @returns {string[]}
 */
function parseListField(value) {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '—') return [];
  return trimmed
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v !== '—');
}

/**
 * Parse the "## Metadata" markdown table into a field-name -> value map.
 * @param {string} content - Raw file content
 * @returns {Record<string, string>|null} null if no "## Metadata" section is found
 */
function parseMetadataTable(content) {
  const lines = content.split(/\r?\n/);
  const metaIdx = lines.findIndex((line) => line.trim() === '## Metadata');
  if (metaIdx === -1) return null;

  let i = metaIdx + 1;
  while (i < lines.length && !lines[i].trim().startsWith('|')) i++;
  if (i >= lines.length) return null;

  // Header row, then a "|---|---|"-style separator row.
  i++;
  if (i < lines.length && /^\|[\s:-]+\|[\s:-]+\|?$/.test(lines[i].trim())) i++;

  const fields = {};
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length >= 2 && cells[0]) {
      fields[cells[0]] = cells.slice(1).join('|').trim();
    }
  }

  return fields;
}

/**
 * Parse a .decision.md file's Metadata table into a structured record.
 * @param {string} content - Raw file content
 * @param {string} relPath - Path relative to paths.decisions, used for `path` and error messages
 * @returns {{ record: DecisionRecord } | { error: string }}
 */
export function parseDecisionRecord(content, relPath) {
  const titleMatch = content.match(TITLE_PATTERN);
  if (!titleMatch) {
    return {
      error: `${relPath}: missing "# Decision Record: {Title}" or "# Decision Brief: {Title}" heading`,
    };
  }

  const fields = parseMetadataTable(content);
  if (!fields) {
    return { error: `${relPath}: missing "## Metadata" section or metadata table` };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) {
      return { error: `${relPath}: missing required Metadata field "${field}"` };
    }
  }

  return {
    record: {
      id: fields['Decision ID'],
      tier: fields['Tier'] || null,
      domain: fields['Domain'] || null,
      title: titleMatch[1].trim(),
      status: fields['Status'],
      path: relPath,
      references: parseListField(fields['References']),
      supersedes: parseListField(fields['Supersedes']),
      tags: parseListField(fields['Tags']),
    },
  };
}

/**
 * Compute referenced_by/superseded_by for every record by inverting
 * References/Supersedes across the whole set, and assemble the final
 * index.json structure.
 * @param {DecisionRecord[]} records - Parsed records (from parseDecisionRecord)
 * @returns {{ generated_at: string, entries: DecisionIndexEntry[] }}
 */
export function buildDecisionIndex(records) {
  const entries = records.map((record) => ({
    id: record.id,
    tier: record.tier,
    domain: record.domain,
    title: record.title,
    status: record.status,
    path: record.path,
    supersedes: record.supersedes || [],
    superseded_by: [],
    references: record.references || [],
    referenced_by: [],
    tags: record.tags || [],
  }));

  for (const entry of entries) {
    entry.referenced_by = entries
      .filter((other) => other.id !== entry.id && other.references.includes(entry.id))
      .map((other) => other.id);
    entry.superseded_by = entries
      .filter((other) => other.id !== entry.id && other.supersedes.includes(entry.id))
      .map((other) => other.id);
  }

  return {
    generated_at: new Date().toISOString(),
    entries,
  };
}

/**
 * Structurally compare two index entries, ignoring array element order.
 * @param {DecisionIndexEntry} a
 * @param {DecisionIndexEntry} b
 * @returns {boolean}
 */
function entriesEqual(a, b) {
  const normalize = (entry) =>
    JSON.stringify({
      ...entry,
      supersedes: [...entry.supersedes].sort(),
      superseded_by: [...entry.superseded_by].sort(),
      references: [...entry.references].sort(),
      referenced_by: [...entry.referenced_by].sort(),
      tags: [...entry.tags].sort(),
    });
  return normalize(a) === normalize(b);
}

/**
 * Diff a freshly built index against a previously-read one.
 * @param {{ entries: DecisionIndexEntry[] }} computed
 * @param {{ entries: DecisionIndexEntry[] }|null} existing
 * @returns {{ stale: boolean, summary: string }}
 */
export function diffDecisionIndex(computed, existing) {
  if (!existing) {
    const added = computed.entries.map((e) => e.id);
    return {
      stale: true,
      summary:
        added.length > 0
          ? `No existing index found. Would add: ${added.join(', ')}`
          : 'No existing index found.',
    };
  }

  const computedById = new Map(computed.entries.map((e) => [e.id, e]));
  const existingById = new Map(existing.entries.map((e) => [e.id, e]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [id, entry] of computedById) {
    if (!existingById.has(id)) {
      added.push(id);
    } else if (!entriesEqual(entry, existingById.get(id))) {
      changed.push(id);
    }
  }

  for (const id of existingById.keys()) {
    if (!computedById.has(id)) removed.push(id);
  }

  const stale = added.length > 0 || removed.length > 0 || changed.length > 0;
  const parts = [];
  if (added.length) parts.push(`Added: ${added.join(', ')}`);
  if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);
  if (changed.length) parts.push(`Changed: ${changed.join(', ')}`);

  return {
    stale,
    summary: stale ? parts.join('; ') : 'Index is up to date.',
  };
}

// --- io wrappers ---

/**
 * Recursively collect all .decision.md files under a directory (io wrapper).
 * @param {string} decisionsDir - Absolute path to paths.decisions
 * @returns {string[]} Relative paths
 */
export function collectDecisionFiles(decisionsDir) {
  if (!existsSync(decisionsDir)) return [];

  const results = [];

  const walk = (dir, basePath) => {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relPath);
      } else if (entry.name.endsWith('.decision.md')) {
        results.push(relPath);
      }
    }
  };

  walk(decisionsDir, '');
  return results;
}

/**
 * Read, parse, and build the full index for a directory (io wrapper,
 * composes the pure functions above). Throws with a clear message naming
 * the offending file on any parse failure.
 * @param {string} decisionsDir - Absolute path to paths.decisions
 * @returns {{ generated_at: string, entries: DecisionIndexEntry[] }}
 * @throws {Error} When a .decision.md file fails to parse
 */
export function buildDecisionIndexForDir(decisionsDir) {
  const files = collectDecisionFiles(decisionsDir);
  /** @type {DecisionRecord[]} */
  const records = [];

  for (const relPath of files) {
    const content = readFileSync(join(decisionsDir, relPath), 'utf8');
    const result = parseDecisionRecord(content, relPath);
    if ('error' in result) {
      throw new Error(`Failed to parse decision record — ${result.error}`);
    }
    records.push(result.record);
  }

  return buildDecisionIndex(records);
}
