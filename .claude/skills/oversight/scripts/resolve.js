#!/usr/bin/env node
// ------------------------------
// resolve.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Resolves the effective oversight level: how much human sign-off the engineer
 * agent waits for. Levels, lowest to highest: none | by-size | always.
 *
 * A level the human asked for in their prompt (--request) overrides the
 * configured default, unless `.aiconfig.json` marks oversight as enforced, in
 * which case a request can only raise the level, never lower it.
 *
 * Zero dependencies on purpose: this script is installed with its skill, away
 * from the repo's node_modules.
 *
 * Usage: node resolve.js [--request <level>] [--config .aiconfig.json]
 * Prints the level on stdout; a note (e.g. a request ignored because of
 * enforcement) goes to stderr.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const OVERSIGHT_LEVELS = ['none', 'by-size', 'always'];

/** Defaults when `.aiconfig.json` does not set them; mirrors lib/aiconfig-defaults.js (a test keeps them in sync). */
export const DEFAULT_LEVEL = 'by-size';
export const DEFAULT_ENFORCED = false;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isOversightLevel(value) {
  return typeof value === 'string' && OVERSIGHT_LEVELS.includes(value);
}

/**
 * Resolve the effective oversight level.
 * @param {{ configured: unknown, enforced: unknown, requested?: string|undefined }} input
 * @returns {{ level: string, source: 'config'|'request', note?: string }}
 * @throws {Error} When `configured` or `requested` is not a valid level
 */
export function resolveOversight({ configured, enforced, requested }) {
  const valid = OVERSIGHT_LEVELS.join(', ');
  if (!isOversightLevel(configured)) {
    throw new Error(`Invalid oversight.default "${configured}". Use one of: ${valid}`);
  }
  if (enforced !== undefined && typeof enforced !== 'boolean') {
    throw new Error(`Invalid oversight.enforced "${enforced}". Use true or false`);
  }
  if (requested === undefined) return { level: configured, source: 'config' };
  if (!isOversightLevel(requested)) {
    throw new Error(`Invalid oversight level "${requested}". Use one of: ${valid}`);
  }

  const lowered = OVERSIGHT_LEVELS.indexOf(requested) < OVERSIGHT_LEVELS.indexOf(configured);
  if (enforced === true && lowered) {
    return {
      level: configured,
      source: 'config',
      note: `Requested "${requested}" ignored: oversight is enforced at "${configured}" and a request can only raise it.`,
    };
  }
  return { level: requested, source: 'request' };
}

/**
 * Entry point.
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  const flagIndex = argv.indexOf('--request');
  const requested = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  if (flagIndex !== -1 && (requested === undefined || requested.startsWith('--'))) {
    console.error('Usage: node resolve.js [--request <none|by-size|always>] [--config <path>]');
    return 1;
  }
  const configIndex = argv.indexOf('--config');
  const configPath = resolve(configIndex === -1 ? '.aiconfig.json' : argv[configIndex + 1]);

  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.error(`${configPath} is not valid JSON: ${err.message}`);
      return 1;
    }
  }

  try {
    const result = resolveOversight({
      configured: config.oversight?.default ?? DEFAULT_LEVEL,
      enforced: config.oversight?.enforced ?? DEFAULT_ENFORCED,
      requested,
    });
    if (result.note) console.error(result.note);
    console.log(result.level);
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
