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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Stamp written inside node_modules after a complete install. */
export const STAMP_FILE = '.aif-installed';

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
 * Install dependencies if needed, then run the server until it exits.
 * @param {string} [dir] - Server directory; defaults to this file's directory
 * @returns {void}
 */
export function launch(dir = dirname(fileURLToPath(import.meta.url))) {
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const packageHash = createHash('sha256').update(readFileSync(pkgPath)).digest('hex');
    const stampPath = join(dir, 'node_modules', STAMP_FILE);
    const stamp = existsSync(stampPath) ? readFileSync(stampPath, 'utf8') : null;
    if (needsInstall(stamp, packageHash)) {
      console.error(`aif-launch: installing dependencies in ${dir}`);
      const result = spawnSync(
        'npm',
        ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
        // stdout must stay clean for JSON-RPC, so npm's output goes to stderr.
        { cwd: dir, stdio: ['ignore', 2, 2], shell: process.platform === 'win32' },
      );
      if (result.status !== 0) {
        console.error(`aif-launch: npm install failed (exit ${result.status}) in ${dir}`);
        process.exitCode = 1;
        return;
      }
      // npm creates no node_modules for a package with no dependencies.
      mkdirSync(dirname(stampPath), { recursive: true });
      writeFileSync(stampPath, `${packageHash}\n`);
    }
  }
  const child = spawn(process.execPath, [join(dir, 'index.js')], { stdio: 'inherit' });
  for (const signal of /** @type {const} */ (['SIGINT', 'SIGTERM'])) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
