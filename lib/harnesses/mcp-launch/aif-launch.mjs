// ------------------------------
// aif-launch.mjs
//
// Author: Starvoxel AI Agent - 2026-10-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Launcher for a stdio MCP server installed at project scope.
 *
 * `aif install --scope project` copies this file into each stdio server's
 * directory (`.claude/servers/<name>/aif-launch.mjs`) and commits the server
 * without its `node_modules`. Claude Code starts project MCP servers alongside
 * the SessionStart hook, not after it, so a hook cannot install their
 * dependencies in time; the server installs its own on first start instead.
 *
 * On start: if `node_modules` is missing, or was installed for a different
 * `package.json`, run `npm install --omit=dev --ignore-scripts` (its output goes
 * to stderr, keeping stdout for JSON-RPC), stamp the result, then run the
 * server's `index.js` as a child sharing this process's stdio (servers only
 * start when run directly, not when imported). Claude Code gives a server 30
 * seconds to answer, so a
 * slow first install fails that session's connection; the next start reuses
 * the stamped install.
 *
 * Copied verbatim, so it must stay dependency-free with no build step.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stamp written inside node_modules after a complete install. */
export const STAMP_FILE = '.aif-installed';

/** Lock held while one process installs, so concurrent first starts do not race. */
export const LOCK_FILE = '.aif-install.lock';

/** Give up waiting for another process's install after this long (under the 30s connect timeout). */
const LOCK_WAIT_MS = 25000;

/** A lock older than this was left by a killed install and is taken over. */
export const LOCK_STALE_MS = 120000;

/**
 * Whether dependencies must be (re)installed. Pure.
 * @param {string|null} stamp - Stamp file content, or null when absent
 * @param {string} packageHash - Hash of the current package.json
 * @returns {boolean}
 */
export function needsInstall(stamp, packageHash) {
  return stamp === null || stamp.trim() !== packageHash;
}

/**
 * Whether a lock file is old enough to have been abandoned. Pure.
 * @param {number} lockMtimeMs
 * @param {number} nowMs
 * @param {number} [staleMs]
 * @returns {boolean}
 */
export function isStaleLock(lockMtimeMs, nowMs, staleMs = LOCK_STALE_MS) {
  return nowMs - lockMtimeMs > staleMs;
}

/** @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Take the install lock, waiting for another holder; a stale lock is taken over.
 * @param {string} lockPath
 * @returns {boolean} false when another install still holds it after LOCK_WAIT_MS
 */
function acquireLock(lockPath) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lockPath, 'wx'));
      return true;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    try {
      if (isStaleLock(statSync(lockPath).mtimeMs, Date.now())) {
        console.error(`aif-launch: removing stale install lock ${lockPath}`);
        unlinkSync(lockPath);
        continue;
      }
    } catch {
      continue; // the holder released it between our two calls
    }
    if (Date.now() > deadline) return false;
    sleep(250);
  }
}

/**
 * Read the stamp, or null when absent.
 * @param {string} stampPath
 * @returns {string|null}
 */
function readStamp(stampPath) {
  return existsSync(stampPath) ? readFileSync(stampPath, 'utf8') : null;
}

/**
 * Install dependencies unless a matching install exists. One process installs
 * at a time; a waiting process re-reads the stamp once it holds the lock.
 * @param {string} dir - Server directory
 * @returns {boolean} true when dependencies are ready
 */
function ensureDependencies(dir) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return true;
  const packageHash = createHash('sha256').update(readFileSync(pkgPath)).digest('hex');
  const stampPath = join(dir, 'node_modules', STAMP_FILE);
  if (!needsInstall(readStamp(stampPath), packageHash)) return true;

  const lockPath = join(dir, LOCK_FILE);
  if (!acquireLock(lockPath)) {
    console.error(`aif-launch: another install still holds ${lockPath}; try again`);
    return false;
  }
  try {
    if (!needsInstall(readStamp(stampPath), packageHash)) return true;
    console.error(`aif-launch: installing dependencies in ${dir}`);
    const result = spawnSync(
      'npm',
      ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      // stdout must stay clean for JSON-RPC, so npm's output goes to stderr.
      { cwd: dir, stdio: ['ignore', 2, 2], shell: process.platform === 'win32' },
    );
    if (result.status !== 0) {
      const cause = result.error ? result.error.message : `exit ${result.status}`;
      console.error(`aif-launch: npm install failed (${cause}) in ${dir}`);
      return false;
    }
    // npm creates no node_modules for a package with no dependencies.
    mkdirSync(dirname(stampPath), { recursive: true });
    writeFileSync(stampPath, `${packageHash}\n`);
    return true;
  } finally {
    unlinkSync(lockPath);
  }
}

/**
 * Install dependencies if needed, then run the server until it exits. The
 * server runs as a child sharing this process's stdio; SIGINT, SIGTERM and
 * SIGHUP are forwarded and its exit code is passed through. A launcher killed
 * with SIGKILL cannot forward it, so the server then stops only when its stdin
 * closes.
 * @param {string} [dir] - Server directory; defaults to this file's directory
 * @returns {void}
 */
export function launch(dir = dirname(fileURLToPath(import.meta.url))) {
  if (!ensureDependencies(dir)) {
    process.exitCode = 1;
    return;
  }
  const child = spawn(process.execPath, [join(dir, 'index.js')], { stdio: 'inherit' });
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
