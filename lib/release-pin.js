// ------------------------------
// release-pin.js
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * The pin written into installed workflows: the commit of ai-foundation's latest
 * release tag, with the tag as the version comment. A file cannot hold the SHA of
 * the commit that releases it, so the pin is the most recent release visible in
 * the AIF checkout. Pure: no I/O. `lib/commands/install-integrations.js` runs git.
 */

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * The highest plain-semver tag (`vX.Y.Z`), ignoring any other tag.
 * @param {string[]} tags
 * @returns {string|null}
 */
export function pickLatestTag(tags) {
  const versions = tags
    .map((tag) => ({ tag, match: TAG.exec(tag.trim()) }))
    .filter((entry) => entry.match !== null)
    .map(({ tag, match }) => ({
      tag: tag.trim(),
      parts: [match[1], match[2], match[3]].map(Number),
    }));
  if (versions.length === 0) return null;
  versions.sort(
    (a, b) => b.parts[0] - a.parts[0] || b.parts[1] - a.parts[1] || b.parts[2] - a.parts[2],
  );
  return versions[0].tag;
}

/**
 * Validate an explicit `--pin`/`--pin-version` pair.
 * @param {string|boolean|undefined} sha
 * @param {string|boolean|undefined} version
 * @returns {{ sha: string, version: string }}
 * @throws {Error} when either is missing or malformed
 */
export function explicitPin(sha, version) {
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error('--pin needs a full 40-character commit SHA.');
  }
  if (typeof version !== 'string' || !TAG.test(version)) {
    throw new Error('--pin-version needs a release tag such as v0.6.0.');
  }
  return { sha, version };
}
