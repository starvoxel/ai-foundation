#!/usr/bin/env node
// ------------------------------
// resolve.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Resolves which standards files apply to a project: tag matching plus
 * depends_on closure, printed in load order (dependencies first).
 *
 * Zero dependencies on purpose: this script is installed with its skill into
 * the harness's skills directory, away from the repo's node_modules.
 *
 * Usage: node resolve.js [--config .aiconfig.json] [--domain engineering] [--json]
 *
 * A standard matches when ALL of its `tags` are among the project's tags
 * (`standards.<domain>` plus `standards.all` in .aiconfig.json). Standards are
 * looked up in ./standards first, then ~/.claude/standards, then
 * ~/.kiro/standards; the first directory holding a name wins. The project's
 * own override file (`project_standards`, default ./project-standards.md) is
 * listed last when it exists; it need not.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Read a flow list (`[a, b]`) or block list (`- a`) value for a frontmatter key.
 * @param {string[]} lines - Frontmatter lines
 * @param {string} key
 * @returns {string[]}
 */
function readList(lines, key) {
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i === -1) return [];
  const inline = lines[i].slice(key.length + 1).trim();
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  const items = [];
  for (const line of lines.slice(i + 1)) {
    const m = /^\s*-\s*(.+)$/.exec(line);
    if (!m) break;
    items.push(m[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return items;
}

/**
 * Parse the name, tags, and depends_on of a standards file.
 * @param {string} content
 * @returns {{ name: string, tags: string[], dependsOn: string[] } | null} null without frontmatter
 */
export function parseStandard(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const nameLine = lines.find((l) => l.startsWith('name:'));
  if (!nameLine) return null;
  return {
    name: nameLine
      .slice(5)
      .trim()
      .replace(/^['"]|['"]$/g, ''),
    tags: readList(lines, 'tags'),
    dependsOn: readList(lines, 'depends_on'),
  };
}

/**
 * Pick the standards whose tags are all among the project tags, add their
 * depends_on closure, and order them dependencies-first.
 * @param {Array<{ name: string, tags: string[], dependsOn: string[] }>} standards
 * @param {string[]} projectTags
 * @returns {string[]} Standard names in load order
 * @throws {Error} On a missing dependency or a dependency cycle
 */
export function resolveStandards(standards, projectTags) {
  const byName = new Map(standards.map((s) => [s.name, s]));
  const tagSet = new Set(projectTags);
  const matched = standards
    .filter((s) => s.tags.length > 0 && s.tags.every((t) => tagSet.has(t)))
    .map((s) => s.name)
    .sort();

  const ordered = [];
  const state = new Map();
  const visit = (name, chain) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      throw new Error(`Dependency cycle: ${[...chain, name].join(' -> ')}`);
    }
    const standard = byName.get(name);
    if (!standard) {
      throw new Error(`Missing standard "${name}" (required by ${chain.at(-1) ?? 'config'})`);
    }
    state.set(name, 'visiting');
    for (const dep of standard.dependsOn) visit(dep, [...chain, name]);
    state.set(name, 'done');
    ordered.push(name);
  };
  for (const name of matched) visit(name, []);
  return ordered;
}

/**
 * Collect standards from the given directories; the first directory holding a
 * name wins.
 * @param {string[]} dirs
 * @returns {Array<{ name: string, tags: string[], dependsOn: string[], path: string }>}
 */
function loadStandards(dirs) {
  const seen = new Map();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith('.md') || file.startsWith('_') || file === 'README.md') continue;
      const path = join(dir, file);
      const parsed = parseStandard(readFileSync(path, 'utf8'));
      if (parsed && !seen.has(parsed.name)) seen.set(parsed.name, { ...parsed, path });
    }
  }
  return [...seen.values()];
}

/** Default location of the optional project override; mirrors lib/aiconfig-defaults.js (a test keeps them in sync). */
export const DEFAULT_PROJECT_STANDARDS = 'project-standards.md';

/**
 * Where the project's own standards override lives (it need not exist).
 * @param {{ project_standards?: unknown }} config
 * @returns {string} Absolute path
 */
export function projectOverridePath(config) {
  const configured = config.project_standards;
  return resolve(
    typeof configured === 'string' && configured ? configured : DEFAULT_PROJECT_STANDARDS,
  );
}

/**
 * Entry point.
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const arg = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i === -1 ? fallback : argv[i + 1];
  };
  const configPath = resolve(arg('--config', '.aiconfig.json'));
  const domain = arg('--domain', 'engineering');

  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(`${configPath} is not valid JSON: ${err.message}`);
      return 1;
    }
  }
  const tags = [...(config.standards?.[domain] ?? []), ...(config.standards?.all ?? [])];

  try {
    const standards = loadStandards([
      resolve('standards'),
      join(homedir(), '.claude', 'standards'),
      join(homedir(), '.kiro', 'standards'),
    ]);
    const names = resolveStandards(standards, tags);
    const byName = new Map(standards.map((s) => [s.name, s]));
    const result = names.map((n) => ({ name: n, path: byName.get(n).path }));
    const override = projectOverridePath(config);
    if (existsSync(override)) result.push({ name: 'project-standards', path: override });
    if (argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else for (const r of result) console.log(r.path);
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
