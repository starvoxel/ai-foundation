#!/usr/bin/env node

/**
 * CI check: any file with a tracked `version` field (YAML frontmatter in a
 * `.md` file, or a top-level `version` key in a `.yaml`/`.yml` file) that
 * changed content between two git refs must also change its `version`
 * value. Encodes the "bump frontmatter version on every modified file"
 * convention documented across skills/steering/agents plans.
 *
 * Usage: node check-version-bumps.mjs <baseSha> [headRef]
 * If <baseSha> is empty, the check is skipped (no base to diff against).
 */

import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import YAML from 'yaml';

const [baseSha, headRef = 'HEAD'] = process.argv.slice(2);

if (!baseSha) {
  console.log('No base ref available to diff against — skipping version-bump check.');
  process.exit(0);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function extractVersion(path, content) {
  const ext = extname(path);
  if (ext === '.yaml' || ext === '.yml') {
    let doc;
    try {
      doc = YAML.parse(content);
    } catch {
      return undefined;
    }
    return doc && typeof doc === 'object' ? doc.version : undefined;
  }
  if (ext === '.md') {
    if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return undefined;
    const closeIdx = content.indexOf('\n---', 4);
    if (closeIdx === -1) return undefined;
    const block = content.slice(0, closeIdx);
    let front;
    try {
      front = YAML.parse(block);
    } catch {
      return undefined;
    }
    return front && typeof front === 'object' ? front.version : undefined;
  }
  return undefined;
}

function readAtRef(ref, path) {
  try {
    return git(['show', `${ref}:${path}`]);
  } catch {
    return null; // file doesn't exist at that ref (added/renamed)
  }
}

function isOlder(oldV, newV) {
  const parse = (v) =>
    String(v)
      .split(/[.+-]/)
      .map((n) => (Number.isNaN(Number(n)) ? 0 : Number(n)));
  const a = parse(oldV);
  const b = parse(newV);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (y > x) return true;
    if (y < x) return false;
  }
  return false; // equal
}

const diffOutput = git(['diff', '--name-status', `${baseSha}...${headRef}`]).trim();

if (!diffOutput) {
  console.log('No changed files between base and head — nothing to check.');
  process.exit(0);
}

const errors = [];
let checked = 0;

for (const line of diffOutput.split('\n')) {
  const [status, ...pathParts] = line.split('\t');
  const path = pathParts[pathParts.length - 1]; // renames: use the new path
  if (!status.startsWith('M') && !status.startsWith('R')) continue; // only modified/renamed
  if (!path.endsWith('.md') && !path.endsWith('.yaml') && !path.endsWith('.yml')) continue;

  const oldContent = readAtRef(baseSha, status.startsWith('R') ? pathParts[0] : path);
  if (oldContent === null) continue; // no prior version to compare against

  let newContent;
  try {
    newContent = readAtRef(headRef, path);
  } catch {
    continue;
  }
  if (newContent === null || newContent === oldContent) continue;

  const oldVersion = extractVersion(path, oldContent);
  if (oldVersion === undefined) continue; // not a version-tracked file

  checked++;
  const newVersion = extractVersion(path, newContent);

  if (newVersion === undefined) {
    errors.push(`${path}: had version '${oldVersion}', but its version field was removed`);
  } else if (newVersion === oldVersion) {
    errors.push(`${path}: content changed but version stayed at '${oldVersion}'`);
  } else if (isOlder(newVersion, oldVersion)) {
    errors.push(`${path}: version went backwards ('${oldVersion}' -> '${newVersion}')`);
  }
}

if (errors.length > 0) {
  console.log(`✗ version-bump check (${errors.length} error(s), ${checked} file(s) checked)`);
  for (const err of errors) console.log(`    ${err}`);
  console.log(
    '\nBump the `version` field when changing a versioned component (agent, skill, steering, standard, bundle, or server definition).',
  );
  process.exit(1);
}

console.log(`✓ version-bump check (${checked} versioned file(s) checked, all bumped correctly)`);
