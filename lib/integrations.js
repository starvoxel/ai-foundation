// ------------------------------
// integrations.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Project integrations: the files every project that uses ai-foundation wants
 * (git hooks, the session-start script, and the CI workflows that call AIF's
 * actions). Installed by `aif install -I <name>` at project scope. They are not
 * bundles: they are harness-agnostic and recorded in `.aif/.installs.yaml`.
 *
 * Pure: no I/O. The registry, the pin handling and the decisions about what to
 * write live here; `lib/commands/install-integrations.js` reads and writes the
 * files. Plan: aif-project-integrations (Milestone 3). See docs/architecture/05_08.
 */

import { hashContent } from './file-utils.js';

/**
 * @typedef {object} IntegrationFile
 * @property {string} target - Path in the project, with forward slashes
 * @property {string} source - Path of the template, relative to the ai-foundation root
 * @property {boolean} [executable] - Written with the executable bit
 * @property {boolean} [pinned] - Carries `uses: ...@<sha> # vX.Y.Z` pins, which Dependabot owns
 */

/**
 * @typedef {object} Integration
 * @property {string} description
 * @property {IntegrationFile[]} files
 * @property {string[]} snippets - Names of snippets printed after install (see SNIPPETS)
 */

const TEMPLATE = 'projects/_template';
const ASSETS = 'lib/integrations/assets';

/** @type {Record<string, Integration>} */
export const INTEGRATIONS = {
  checks: {
    description: 'CI workflow that runs the AIF index and bundle-drift checks',
    files: [
      {
        target: '.github/workflows/aif-checks.yml',
        source: `${ASSETS}/aif-checks.yml`,
        pinned: true,
      },
    ],
    snippets: ['dependabot'],
  },
  update: {
    description: 'Daily workflow that refreshes the installed AIF bundles and opens one PR',
    files: [
      {
        target: '.github/workflows/aif-update.yml',
        source: `${ASSETS}/aif-update.yml`,
        pinned: true,
      },
    ],
    snippets: ['dependabot'],
  },
  merge: {
    description: 'The /merge bot: merges a PR on a human comment once its required checks pass',
    files: [
      {
        target: '.github/workflows/aif-merge.yml',
        source: `${ASSETS}/aif-merge.yml`,
        pinned: true,
      },
    ],
    snippets: ['dependabot'],
  },
  hooks: {
    description: 'Git hooks: rebuild the architecture index, and warn on undocumented key_files',
    files: ['commit-msg', 'post-checkout', 'post-merge', 'post-rewrite', 'refresh-index'].map(
      (name) => ({
        target: `.githooks/${name}`,
        source: `${TEMPLATE}/.githooks/${name}`,
        executable: true,
      }),
    ),
    snippets: [],
  },
  'session-start': {
    description: 'Claude Code SessionStart script: enables the git hooks, builds the index',
    files: [
      {
        target: 'scripts/session-start.sh',
        source: `${TEMPLATE}/scripts/session-start.sh`,
        executable: true,
      },
    ],
    snippets: ['session-start-hook'],
  },
};

export const INTEGRATION_NAMES = Object.keys(INTEGRATIONS);

/**
 * Whether a name is a registered integration. Own properties only: `constructor` and
 * `toString` are on every object but are not integrations.
 * @param {unknown} name
 * @returns {boolean}
 */
export function isIntegration(name) {
  return typeof name === 'string' && Object.hasOwn(INTEGRATIONS, name);
}

/** Where the integrations manifest lives, relative to the project root. */
export const INTEGRATIONS_DIR = '.aif';

/** Printed after an install, for files the project owns and AIF never rewrites. */
export const SNIPPETS = {
  dependabot: {
    file: '.github/dependabot.yml',
    text: `Add to the github-actions entry so AIF releases arrive as one reviewed PR:
    cooldown:
      default-days: 7
      exclude:
        - 'starvoxel/ai-foundation*'
    groups:
      aif:
        patterns:
          - 'starvoxel/ai-foundation*'
  and add exclude-patterns: ['starvoxel/ai-foundation*'] to any patches or minors group.`,
  },
  'session-start-hook': {
    file: '.claude/settings.json',
    text: `Add the SessionStart hook so the script runs:
    "hooks": { "SessionStart": [ { "matcher": "startup|resume", "hooks": [
      { "type": "command", "command": "bash \\"$CLAUDE_PROJECT_DIR\\"/scripts/session-start.sh" } ] } ] }`,
  },
};

/**
 * Resolve the names given to `--integration`.
 * @param {string|boolean|undefined} arg - Comma-separated names, or `all`
 * @returns {{ names: string[], unknown: string[] }}
 */
export function expandIntegrationNames(arg) {
  const wanted =
    typeof arg === 'string'
      ? arg
          .split(',')
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
  if (wanted.includes('all')) return { names: [...INTEGRATION_NAMES], unknown: [] };
  const unknown = wanted.filter((name) => !isIntegration(name));
  return { names: [...new Set(wanted.filter(isIntegration))], unknown };
}

const PIN_PATTERN = /@[0-9a-f]{40} # v\d+\.\d+\.\d+/g;

/**
 * Line endings as LF. Files compare equal whatever a Windows checkout did to them, and shell
 * templates are written with LF so `#!/usr/bin/env bash\r` can never reach a hook.
 * @param {string} text
 * @returns {string}
 */
export function normalizeEol(text) {
  return text.replaceAll('\r\n', '\n');
}

/**
 * Replace every `@<sha> # vX.Y.Z` pin with a placeholder, so two copies of a
 * workflow compare equal when only the pins differ. Dependabot owns the pins.
 * @param {string} text
 * @returns {string}
 */
export function normalizePins(text) {
  return text.replace(PIN_PATTERN, '@<pin>');
}

/**
 * Fill the AIF pin placeholders of a template.
 * @param {string} template
 * @param {{ sha: string, version: string }|null} pin
 * @returns {string}
 */
export function renderAsset(template, pin) {
  if (!pin) return template;
  return template.replaceAll('{{AIF_SHA}}', pin.sha).replaceAll('{{AIF_VERSION}}', pin.version);
}

/**
 * Hash of a file's content with its pins ignored: what the manifest records.
 * @param {string} content
 * @returns {string}
 */
export function pinlessHash(content) {
  return hashContent(normalizePins(normalizeEol(content)));
}

const USES_PIN = /^(\s*(?:- )?uses: [^@\s]+)(@[0-9a-f]{40} # v\d+\.\d+\.\d+)\s*$/;

/**
 * Keep the pins already in a file when its template is rewritten. Dependabot may have bumped a
 * pin past the release this checkout knows, and a template change must not move it backwards.
 * A pin older than the one rendered for this release is advanced instead, since the new
 * template may need it. A `uses:` line with no counterpart in the file keeps its fresh pin.
 * @param {string} desired - Rendered template
 * @param {string} onDisk - Current file
 * @returns {string}
 */
export function carryPins(desired, onDisk) {
  /** @param {string} pin @returns {number[]|null} */
  const versionOf = (pin) => {
    const match = /# v(\d+)\.(\d+)\.(\d+)/.exec(pin);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  /** The file's pin is kept unless it is older than the one rendered for this release. */
  const keepable = (/** @type {string} */ kept, /** @type {string} */ fresh) => {
    const [a, b] = [versionOf(kept), versionOf(fresh)];
    if (!a || !b) return false;
    return (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0;
  };
  /** @type {Map<string, string>} */
  const existing = new Map();
  for (const line of normalizeEol(onDisk).split('\n')) {
    const match = USES_PIN.exec(line);
    if (match) existing.set(match[1].trim(), match[2]);
  }
  return normalizeEol(desired)
    .split('\n')
    .map((line) => {
      const match = USES_PIN.exec(line);
      const kept = match ? existing.get(match[1].trim()) : undefined;
      return match && kept && keepable(kept, match[2]) ? `${match[1]}${kept}` : line;
    })
    .join('\n');
}

/**
 * Decide what to do with one integration file.
 * @param {object} input
 * @param {string} input.desired - Rendered template
 * @param {string|null} input.onDisk - Current content, or null when absent
 * @param {string|null} input.recorded - pinlessHash recorded at the last install, if any
 * @param {boolean} [input.force]
 * @returns {{ action: 'write'|'current'|'adopt'|'skip', reason: string }}
 */
export function planFile({ desired, onDisk, recorded, force = false }) {
  if (onDisk === null) return { action: 'write', reason: 'new file' };
  const current = pinlessHash(onDisk);
  const wanted = pinlessHash(desired);
  if (current === wanted) {
    return recorded === wanted
      ? { action: 'current', reason: 'already current' }
      : { action: 'adopt', reason: 'already matches; now recorded' };
  }
  if (recorded !== null && current === recorded) {
    return { action: 'write', reason: 'template updated' };
  }
  if (force) return { action: 'write', reason: 'overwritten with --force' };
  return {
    action: 'skip',
    reason: recorded === null ? 'exists and was not installed by aif' : 'modified locally',
  };
}

/**
 * What `--check` reports for one recorded file, if anything.
 * @param {{ desired: string, onDisk: string|null, recorded: string|null }} input
 * @returns {'missing'|'modified locally'|'update available'|null}
 */
export function describeDrift({ desired, onDisk, recorded }) {
  if (onDisk === null) return 'missing';
  const current = pinlessHash(onDisk);
  const wanted = pinlessHash(desired);
  if (current === wanted) return null;
  return recorded !== null && current === recorded ? 'update available' : 'modified locally';
}

/**
 * Whether a recorded file is refreshed by a bare `--update`: only files with no
 * pins. Pinned workflow files are refreshed by re-running `aif install -I <name>`.
 * @param {IntegrationFile} file
 * @returns {boolean}
 */
export function refreshedByUpdate(file) {
  return file.pinned !== true;
}

/**
 * Project paths a bare `--update` may rewrite: the integrations manifest and every file
 * without pins. The daily update commits exactly these (with the harness directories).
 * @returns {string[]}
 */
export function refreshedPaths() {
  const files = Object.values(INTEGRATIONS)
    .flatMap((integration) => integration.files)
    .filter(refreshedByUpdate)
    .map((file) => file.target);
  return [INTEGRATIONS_DIR, ...files];
}
