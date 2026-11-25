// ------------------------------
// merge-logic.mjs
//
// Author: Starvoxel AI Agent - 2026-11-25
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Pure decisions for the `/merge` bot (docs/plans/merge-bot.md): who may trigger it, whether a
 * PR passes the gate, which version the merge assigns, and whether the bot's own version commit
 * changed nothing but the version. No I/O: the workflow wrapper feeds it API data and acts on
 * the result.
 */

import { isDeepStrictEqual } from 'node:util';

import { needsPackageBump, readVersion } from './version-bump-logic.mjs';

/** Bump levels a `bump:*` label can name, in increasing size. */
export const LEVELS = ['patch', 'minor', 'major'];

/** Prefix of the PR label that declares the bump level. */
export const BUMP_LABEL_PREFIX = 'bump:';

/** Repo permissions that may trigger a merge. */
const WRITE_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

/** Check conclusions that count as passing for a required check, as GitHub treats them. */
const PASSING_CONCLUSIONS = new Set(['success', 'skipped', 'neutral']);

/** The only files the bot's version commit may touch. */
const VERSION_FILES = ['package.json', 'package-lock.json'];

/** Reason codes a refusal carries, each with the text shown to the commenter. */
export const REFUSALS = {
  'not-a-command': 'The comment is not exactly `/merge`.',
  'bot-commenter': 'Only a human may trigger a merge; the commenter is a bot.',
  'no-write-permission': 'The commenter does not have write permission on this repository.',
  'not-open': 'The PR is not open.',
  draft: 'The PR is a draft.',
  fork: 'The PR is from a fork.',
  'base-not-main': 'The PR does not target the default branch; retarget it before merging.',
  dependabot: 'Dependabot PRs are merged by their own workflow.',
  'not-mergeable': 'GitHub reports the PR as not mergeable (conflicts or a blocked state).',
  'label-missing': 'The PR changes shipped content but has no `bump:patch|minor|major` label.',
  'label-multiple': 'The PR has more than one `bump:*` label.',
  'label-unknown': 'The PR has a `bump:*` label that is not patch, minor or major.',
  'version-hand-edited': 'The PR edits the package version; the bot owns it. Revert that edit.',
  'checks-unknown': 'The required checks could not be determined, so nothing can be verified.',
  'check-missing': 'A required check has not reported on the head commit.',
  'check-pending': 'A required check is still running on the head commit.',
  'check-failed': 'A required check did not pass on the head commit.',
};

/** The reply to a comment that starts with `/merge` but is not exactly it. It never echoes the comment. */
export const UNSUPPORTED_REPLY =
  'That command is not supported. Comment exactly `/merge`, with nothing after it.';

/**
 * Classify a comment: the merge command, a near miss, or not ours. A comment is ours only when its
 * first word is exactly `/merge`, so prose that merely mentions the command, and words such as
 * `/merged`, are left alone. Pure.
 * @param {unknown} body - The comment text
 * @returns {'merge' | 'unsupported' | 'none'} `merge` for exactly `/merge`, `unsupported` for `/merge`
 *   followed by more text, `none` otherwise
 */
export function classifyComment(body) {
  if (typeof body !== 'string') return 'none';
  const text = body.trim();
  if (text === '/merge') return 'merge';
  return /^\/merge\s/.test(text) ? 'unsupported' : 'none';
}

/**
 * Whether a commenter is a bot account, which the bot never answers. Pure.
 * @param {string} login - The commenter's login
 * @param {string} type - The API user type (`User`, `Bot`, ...)
 * @returns {boolean} true for the `Bot` type or any login containing `[bot]`
 */
export function isBotCommenter(login, type) {
  return type === 'Bot' || login.includes('[bot]');
}

/**
 * Whether the commenter may trigger a merge: a non-bot account with write access. Whether the account is a person or an agent acting as one cannot be told from here. Pure.
 * @param {{ commenterType: string, permission: string }} input -
 *   `commenterType` is the API user type (`User`, `Bot`, ...); `permission` the repo permission level
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function decideAuthorization({ commenterType, permission }) {
  if (commenterType !== 'User') return { ok: false, reason: 'bot-commenter' };
  if (!WRITE_PERMISSIONS.has(permission)) return { ok: false, reason: 'no-write-permission' };
  return { ok: true };
}

/**
 * The bump level a PR's labels declare. Pure.
 * @param {string[]} labels - Label names on the PR
 * @returns {{ level: string } | { error: 'label-missing' | 'label-multiple' | 'label-unknown' }}
 */
export function bumpLevelFromLabels(labels) {
  const bumps = labels.filter((name) => name.startsWith(BUMP_LABEL_PREFIX));
  if (bumps.length === 0) return { error: 'label-missing' };
  if (bumps.length > 1) return { error: 'label-multiple' };
  const level = bumps[0].slice(BUMP_LABEL_PREFIX.length);
  return LEVELS.includes(level) ? { level } : { error: 'label-unknown' };
}

/**
 * The version a merge assigns: `current` plus `level`. Below 1.0 a `major` bumps the minor.
 * @param {string} current - Plain `x.y.z` semver of `main`
 * @param {string} level - One of {@link LEVELS}
 * @returns {string}
 * @throws {Error} When `current` is not plain `x.y.z` or `level` is unknown
 */
export function nextVersion(current, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Version '${current}' is not plain x.y.z semver`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'major') return major === 0 ? `0.${minor + 1}.0` : `${major + 1}.0.0`;
  throw new Error(`Unknown bump level '${level}'; expected one of ${LEVELS.join(', ')}`);
}

/**
 * Reason codes for the required checks that are not passing on the head commit. Pure.
 * @param {string[]} requiredChecks - Names of the required checks
 * @param {Array<{ name: string, status: string, conclusion: string|null }>} checks - Check runs on the head commit
 * @returns {string[]} `check-missing`, `check-pending` and/or `check-failed`, without repeats
 */
function checkReasons(requiredChecks, checks) {
  const reasons = new Set();
  for (const name of requiredChecks) {
    const runs = checks.filter((run) => run.name === name);
    if (runs.length === 0) reasons.add('check-missing');
    for (const run of runs) {
      if (run.status !== 'completed') reasons.add('check-pending');
      else if (!PASSING_CONCLUSIONS.has(run.conclusion ?? '')) reasons.add('check-failed');
    }
  }
  return [...reasons];
}

/**
 * Everything the gate looks at, gathered by the wrapper.
 * @typedef {object} GateInput
 * @property {{ state: string, draft: boolean, headRepo: string, baseRepo: string, baseRef: string,
 *   authorLogin: string, mergeable: boolean|null, labels: string[] }} pr
 * @property {string} defaultBranch - The branch merges must target
 * @property {string[]} changedPaths - Repo-relative paths the PR changes
 * @property {string[]} requiredChecks - Names of the required checks
 * @property {Array<{ name: string, status: string, conclusion: string|null }>} checks - Check runs on the head commit
 * @property {{ mergeBase?: string, head?: string }} versions - `package.json` version at the merge base and at the PR head
 * @property {string[]} [dependabotLogins] - Author logins treated as Dependabot
 */

/**
 * Evaluate the gate for a PR. Collects every refusal rather than stopping at the first. Pure.
 * @param {GateInput} input
 * @returns {{ ok: boolean, reasons: string[], level: string|null }} `level` is the declared bump, or null when none applies
 */
export function evaluateGate(input) {
  const { pr, defaultBranch, changedPaths, requiredChecks, checks, versions } = input;
  const dependabotLogins = input.dependabotLogins ?? ['dependabot[bot]'];
  const reasons = [];

  if (pr.state !== 'open') reasons.push('not-open');
  if (pr.draft) reasons.push('draft');
  if (pr.headRepo !== pr.baseRepo) reasons.push('fork');
  if (pr.baseRef !== defaultBranch) reasons.push('base-not-main');
  if (dependabotLogins.includes(pr.authorLogin)) reasons.push('dependabot');
  if (pr.mergeable !== true) reasons.push('not-mergeable');
  if (versions.head !== versions.mergeBase) reasons.push('version-hand-edited');

  let level = null;
  const labelled = bumpLevelFromLabels(pr.labels);
  if ('level' in labelled) {
    level = labelled.level;
  } else if (labelled.error !== 'label-missing' || needsPackageBump(changedPaths)) {
    reasons.push(labelled.error);
  }

  if (requiredChecks.length === 0) reasons.push('checks-unknown');
  reasons.push(...checkReasons(requiredChecks, checks));
  const bumps = needsPackageBump(changedPaths);
  return { ok: reasons.length === 0, reasons, level: bumps ? level : null };
}

/**
 * The full decision for a `/merge` request: refuse with reasons, or merge with the version to assign
 * and whether the branch must be updated from `main` first. Pure.
 * @param {GateInput & { mainVersion: string, behind: boolean }} input - `mainVersion` is `main`'s current
 *   version; `behind` is whether the PR head lacks `main`'s tip
 * @returns {{ action: 'refuse', reasons: string[] } |
 *   { action: 'merge', bump: { level: string, from: string, to: string } | null, updateBranch: boolean }}
 * @throws {Error} When `mainVersion` is not plain `x.y.z` and a bump is needed
 */
export function decideMerge(input) {
  const gate = evaluateGate(input);
  if (!gate.ok) return { action: 'refuse', reasons: gate.reasons };
  const bump =
    gate.level === null
      ? null
      : {
          level: gate.level,
          from: input.mainVersion,
          to: nextVersion(input.mainVersion, gate.level),
        };
  return { action: 'merge', bump, updateBranch: input.behind };
}

/**
 * Text for a refusal, one line per reason. Unknown codes are shown as-is. Pure.
 * @param {string[]} reasons
 * @returns {string}
 */
export function describeRefusal(reasons) {
  return reasons.map((code) => `- ${REFUSALS[code] ?? code}`).join('\n');
}

/**
 * Whether the bot's version commit touches only the version files. Pure.
 * @param {string[]} changedPaths - Paths the commit changes
 * @returns {boolean} false for an empty commit or any other file
 */
export function isVersionOnlyPaths(changedPaths) {
  return changedPaths.length > 0 && changedPaths.every((path) => VERSION_FILES.includes(path));
}

/**
 * Parse a manifest's JSON text and check its shape before use.
 * @param {string} text
 * @returns {Record<string, any>}
 * @throws {Error} When the text is not a JSON object
 */
function parseManifest(text) {
  const parsed = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Manifest is not a JSON object');
  }
  return parsed;
}

/**
 * Set the version fields of a manifest to `version`: `version` in `package.json`, and `version`
 * plus `packages[''].version` in `package-lock.json`. Output is 2-space JSON with a trailing newline.
 * @param {string} text - The manifest's JSON text
 * @param {string} version - Plain `x.y.z`
 * @returns {string} The updated text
 * @throws {Error} When `text` is not a JSON object or `version` is not plain `x.y.z`
 */
export function applyVersion(text, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version '${version}' is not plain x.y.z`);
  const manifest = parseManifest(text);
  manifest.version = version;
  if (manifest.packages?.['']) manifest.packages[''] = { ...manifest.packages[''], version };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Whether `after` differs from `before` only in the version fields, which must equal `version`. Pure.
 * @param {string} before - The manifest text before the bot's commit
 * @param {string} after - The manifest text after it
 * @param {string} version - The version the bot assigned
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyVersionOnly(before, after, version) {
  let a;
  let b;
  try {
    a = parseManifest(before);
    b = parseManifest(after);
  } catch (err) {
    return { ok: false, reason: `Manifest is unreadable: ${err.message}` };
  }
  if (b.version !== version) {
    return { ok: false, reason: `version is '${b.version}', expected '${version}'` };
  }
  if (b.packages?.['']?.version !== undefined && b.packages[''].version !== version) {
    return { ok: false, reason: `packages[''].version is not '${version}'` };
  }
  const strip = (/** @type {Record<string, any>} */ manifest) => {
    /** @type {Record<string, any>} */
    const copy = { ...manifest, version: '' };
    if (copy.packages?.[''])
      copy.packages = { ...copy.packages, '': { ...copy.packages[''], version: '' } };
    return copy;
  };
  return isDeepStrictEqual(strip(a), strip(b))
    ? { ok: true }
    : { ok: false, reason: 'the manifest changed beyond its version fields' };
}

/**
 * One audit line for the PR comment after a merge. Pure.
 * @param {{ commenter: string, bump: { level: string, from: string, to: string } | null,
 *   headSha: string, checks: string[], updatedBranch: boolean }} input
 * @returns {string}
 */
export function formatAudit({ commenter, bump, headSha, checks, updatedBranch }) {
  const version = bump ? `${bump.from} -> ${bump.to} (${bump.level})` : 'no version change';
  const update = updatedBranch ? 'branch updated from main' : 'branch up to date';
  return `Merged by /merge from @${commenter}: ${version}; gated head ${headSha}; ${update}; checks: ${checks.join(', ')}.`;
}

/**
 * Names of the required status checks in a branch's rules (the `rules/branches/{branch}` API
 * response). Pure.
 * @param {unknown} rules - The API response
 * @returns {string[]} Check names; empty when none are found or the shape is unexpected
 */
export function requiredChecksFromRules(rules) {
  if (!Array.isArray(rules)) return [];
  const names = [];
  for (const rule of rules) {
    if (rule?.type !== 'required_status_checks') continue;
    for (const check of rule.parameters?.required_status_checks ?? []) {
      if (typeof check?.context === 'string') names.push(check.context);
    }
  }
  return [...new Set(names)];
}

/**
 * Build the gate input from GitHub API payloads. Pure.
 * @param {{ pull: any, files: Array<{ filename: string }>, checkRuns: any[], requiredChecks: string[],
 *   mergeBaseJson: string|null, headJson: string|null, defaultBranch: string }} data
 * @returns {GateInput}
 */
export function toGateInput({
  pull,
  files,
  checkRuns,
  requiredChecks,
  mergeBaseJson,
  headJson,
  defaultBranch,
}) {
  return {
    pr: {
      state: pull.state,
      draft: Boolean(pull.draft),
      headRepo: pull.head?.repo?.full_name ?? '',
      baseRepo: pull.base?.repo?.full_name ?? '',
      baseRef: pull.base?.ref ?? '',
      authorLogin: pull.user?.login ?? '',
      mergeable: typeof pull.mergeable === 'boolean' ? pull.mergeable : null,
      labels: (pull.labels ?? []).map((/** @type {{ name: string }} */ label) => label.name),
    },
    defaultBranch,
    changedPaths: files.map((file) => file.filename),
    requiredChecks,
    checks: checkRuns.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion ?? null,
    })),
    versions: {
      mergeBase: mergeBaseJson === null ? undefined : readVersion(mergeBaseJson),
      head: headJson === null ? undefined : readVersion(headJson),
    },
  };
}

/**
 * The comment a dry run posts: what the bot would do, and that it did nothing. Pure.
 * @param {ReturnType<typeof decideMerge>} decision
 * @param {{ pullNumber: number, headSha: string }} context
 * @returns {string}
 */
export function renderDryRun(decision, { pullNumber, headSha }) {
  const head = `**/merge dry run** for #${pullNumber} at \`${headSha}\`. Nothing was pushed or merged.`;
  if (decision.action === 'refuse') {
    return `${head}\n\nWould refuse:\n${describeRefusal(decision.reasons)}`;
  }
  const version = decision.bump
    ? `${decision.bump.from} -> ${decision.bump.to} (${decision.bump.level})`
    : 'no version change';
  const update = decision.updateBranch
    ? 'merge `main` into the branch first'
    : 'branch is up to date';
  return `${head}\n\nWould merge:\n- Version: ${version}\n- Branch: ${update}`;
}
