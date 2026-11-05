/**
 * I/O layer for source-freshness hashing — filesystem reads and hashing.
 * Nothing is stored: hashes are computed on demand and compared with the ones
 * recorded in the install manifest. Pure decision logic (what counts as stale,
 * what a runtime file is) lives in lib/source-hashes/pure.js and is unit tested there.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { resolveBundle } from '../resolver.js';
import { SOURCE_DIRS } from '../constants.js';
import { collectFiles, hashContent } from '../file-utils.js';
import { isRuntimeFile } from './pure.js';

/**
 * Hash a file's contents with sha256 prefix.
 * @param {string} filePath
 * @returns {string}
 */
function hashFile(filePath) {
  return hashContent(readFileSync(filePath));
}

/**
 * Hash the runtime files of a directory (excludes tests/ and .test.js), keyed
 * by a caller-supplied relative-path prefix.
 * @param {string} dir - Absolute directory path
 * @param {string} relPrefix - Prefix for relative paths in the result, e.g. "servers/git"
 * @returns {Record<string, string>}
 */
function hashRuntimeFiles(dir, relPrefix) {
  const sources = {};
  const allFiles = collectFiles(dir);
  for (const file of allFiles.filter(isRuntimeFile)) {
    sources[`${relPrefix}/${file}`] = hashFile(join(dir, file));
  }
  return sources;
}

/**
 * Compute source hashes for a resolved bundle's own sources (agents, steering,
 * skills). Servers are shared resources hashed on their own (see
 * computeServerSourceHashes).
 * @param {import('../resolver.js').ResolvedBundle} resolved
 * @param {string} repoRoot
 * @returns {Record<string, string>} relative path → hash
 */
export function computeBundleSourceHashes(resolved, repoRoot) {
  const sources = {};

  for (const file of resolved.agents) {
    const relPath = `agents/${file}`;
    const absPath = join(repoRoot, relPath);
    if (existsSync(absPath)) {
      sources[relPath] = hashFile(absPath);
    }
  }

  for (const relPath of resolved.steering) {
    const absPath = join(repoRoot, relPath);
    if (existsSync(absPath)) {
      sources[relPath] = hashFile(absPath);
    }
  }

  for (const skillName of resolved.skills) {
    const skillDir = join(repoRoot, 'skills', skillName);
    for (const file of collectFiles(skillDir)) {
      sources[`skills/${skillName}/${file}`] = hashFile(join(skillDir, file));
    }
  }

  return sources;
}

/**
 * Compute source hashes for a server's own runtime files.
 * @param {string} serverName
 * @param {string} repoRoot
 * @returns {Record<string, string>}
 */
export function computeServerSourceHashes(serverName, repoRoot) {
  const serverDir = join(repoRoot, SOURCE_DIRS.servers, serverName);
  return hashRuntimeFiles(serverDir, `${SOURCE_DIRS.servers}/${serverName}`);
}

/**
 * Compute source hashes for a harness-level shared hook resource's own source files.
 * @param {string} hookName
 * @param {string} repoRoot
 * @returns {Record<string, string>}
 */
export function computeHookSourceHashes(hookName, repoRoot) {
  const hookDir = join(repoRoot, SOURCE_DIRS.hookAssets, hookName);
  return hashRuntimeFiles(hookDir, `${SOURCE_DIRS.hookAssets}/${hookName}`);
}

/**
 * @typedef {'bundle'|'server'|'hook'} ResourceKind
 */

/**
 * Compute the current source hashes of a bundle, server, or hook resource.
 * Throws when the resource cannot be resolved (e.g. an unknown bundle), so a
 * caller never mistakes "could not hash" for "unchanged".
 * @param {ResourceKind} kind
 * @param {string} name
 * @param {string} repoRoot
 * @returns {Record<string, string>} relative path → hash
 */
export function computeResourceHashes(kind, name, repoRoot) {
  switch (kind) {
    case 'bundle':
      return computeBundleSourceHashes(resolveBundle(name, repoRoot), repoRoot);
    case 'server':
      return computeServerSourceHashes(name, repoRoot);
    case 'hook':
      return computeHookSourceHashes(name, repoRoot);
    default:
      throw new Error(`Unknown resource kind: ${kind}`);
  }
}
