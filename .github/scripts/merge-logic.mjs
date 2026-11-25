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

/** Reason codes a refusal carries, each with the line shown to the commenter: what is wrong and what to do. */
export const REFUSALS = {
  'not-a-command': 'Comment exactly `/merge`.',
  'bot-commenter': 'Bots cannot trigger a merge.',
  'no-write-permission': 'You need write access to merge this PR.',
  'not-open': 'The PR is not open.',
  draft: 'The PR is a draft. Mark it ready for review and try again.',
  fork: 'PRs from forks cannot be merged this way.',
  'base-not-main': 'The PR does not target `main`. Retarget it and try again.',
  dependabot: 'Dependabot PRs are merged by their own workflow.',
  'not-mergeable': 'GitHub says the PR is not mergeable. Resolve any conflicts and try again.',
  'label-missing': 'Add a `bump:patch`, `bump:minor` or `bump:major` label and try again.',
  'label-multiple': 'Use only one `bump:` label and try again.',
  'label-unknown': 'Use `bump:patch`, `bump:minor` or `bump:major` and try again.',
  'version-hand-edited': 'Revert the change to the package version. The bot sets it.',
  'checks-unknown': 'Could not read the required checks. Try again.',
  'head-moved': 'The branch changed while merging. Try again.',
  'update-conflict': 'Merging `main` into the branch conflicts. Resolve it and try again.',
  'check-missing':
    'Required checks have not run on this commit. Push a commit so they run, then try again.',
  'check-pending': 'Not all checks have finished. Try again once all are done.',
  'check-failed': 'A required check failed. Fix it and try again.',
  'queue-expired': 'Checks did not finish within 4 hours. Comment `/merge` to try again.',
  'queue-head-moved': 'The branch changed while waiting. Comment `/merge` to try again.',
  'queue-lost': 'The waiting merge request could not be found. Comment `/merge` to try again.',
};

/** The label that marks a PR waiting for its checks. Removing it cancels the wait. */
export const QUEUE_LABEL = 'merge-queued';

/** How long a `/merge` waits for checks before it is dropped. */
export const QUEUE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

const MARKER = /<!-- merge-queued login=([A-Za-z0-9-]{1,39}) sha=([0-9a-f]{40}) at=(\d{10,15}) -->/;

/**
 * Whether a refusal only means "not yet": some required check is still running and nothing else is
 * wrong. A check that has not started counts as waiting when another one is running. Pure.
 * @param {string[]} reasons - Refusal reason codes
 * @returns {boolean}
 */
export function isWaitingOnly(reasons) {
  return (
    reasons.includes('check-pending') &&
    reasons.every((code) => code === 'check-pending' || code === 'check-missing')
  );
}

/**
 * The comment that records a waiting `/merge`: who asked, for which head, and when. The hidden marker is
 * what the wake-up run trusts, together with the label. Pure.
 * @param {{ login: string, sha: string, at: number }} request - `at` is epoch milliseconds
 * @returns {string}
 */
export function renderQueued({ login, sha, at }) {
  return [
    '**Waiting for checks**',
    `Will merge when they pass, for up to 4 hours. Remove the \`${QUEUE_LABEL}\` label to cancel.`,
    `<!-- merge-queued login=${login} sha=${sha} at=${at} -->`,
  ].join('\n');
}

/**
 * Read the marker out of a comment body. Pure.
 * @param {string} body
 * @returns {{ login: string, sha: string, at: number } | null} null when absent or malformed
 */
export function parseQueueMarker(body) {
  const match = MARKER.exec(body ?? '');
  return match ? { login: match[1], sha: match[2], at: Number(match[3]) } : null;
}

/**
 * Whether a waiting request has outlived its timeout. Pure.
 * @param {number} at - When it was queued, epoch milliseconds
 * @param {number} now - Epoch milliseconds
 * @returns {boolean}
 */
export function queueExpired(at, now) {
  return now - at > QUEUE_TIMEOUT_MS;
}

/** The reply to a comment that starts with `/merge` but is not exactly it. It never echoes the comment. */
export const UNSUPPORTED_REPLY = 'Unsupported command. Comment exactly `/merge`.';

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
 * The lines for a refusal: one per reason, without repeats, since several reasons share a line. Unknown
 * codes are shown as-is. Pure.
 * @param {string[]} reasons
 * @returns {string[]}
 */
export function describeRefusal(reasons) {
  return [...new Set(reasons.map((code) => REFUSALS[code] ?? code))];
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
 * A version with the `v` prefix the comments use. Pure.
 * @param {string} version - Plain `x.y.z`
 * @returns {string}
 */
function tag(version) {
  return `v${version}`;
}

/**
 * The lines that say what a merge changed or would change: the version, and whether `main` was merged
 * into the branch. Pure.
 * @param {{ bump: { from: string, to: string } | null, updatedBranch: boolean }} what
 * @param {boolean} done - `true` for a merge that happened, `false` for a dry run
 * @returns {string[]}
 */
function changeLines({ bump, updatedBranch }, done) {
  const version = bump
    ? `${done ? 'Version bumped from' : 'Version would be bumped from'} ${tag(bump.from)} -> ${tag(bump.to)}`
    : 'No version change';
  const lines = [version];
  if (updatedBranch)
    lines.push(done ? '`main` merged to branch' : '`main` would be merged to branch');
  return lines;
}

/**
 * The comment for a merge that went through. Pure.
 * @param {{ bump: { from: string, to: string } | null, updatedBranch: boolean }} what
 * @returns {string}
 */
export function renderSuccess(what) {
  return ['**Merge successful**', ...changeLines(what, true)].join('\n');
}

/**
 * The comment for a merge that did not go through. Pure.
 * @param {string[]} lines - What went wrong and what to do, one per line
 * @returns {string}
 */
export function renderFailure(lines) {
  return ['**Merge failed**', ...lines].join('\n');
}

/**
 * The comment for a refused live `/merge`. Pure.
 * @param {string[]} reasons - Refusal reason codes
 * @returns {string}
 */
export function renderRefusal(reasons) {
  return renderFailure(describeRefusal(reasons));
}

/**
 * The comment for a merge that failed on an API call: GitHub's status and message, then what to try.
 * An error that did not come from the API has no status and shows only its message. Pure.
 * @param {{ message: string, status?: number, detail?: string }} err - `detail` is GitHub's own message
 * @returns {string}
 */
export function renderApiFailure({ message, status, detail }) {
  const error = status ? `Error ${status}: ${detail || message}` : `Error: ${message}`;
  return renderFailure([
    error,
    'Try again. If the branch was just updated, push a commit so the checks run on it.',
  ]);
}

/**
 * The comment a dry run posts: what the bot would do. Nothing was changed. Pure.
 * @param {ReturnType<typeof decideMerge>} decision
 * @returns {string}
 */
export function renderDryRun(decision) {
  if (decision.action === 'refuse') {
    return ['**Dry run: would fail**', ...describeRefusal(decision.reasons)].join('\n');
  }
  const what = { bump: decision.bump, updatedBranch: decision.updateBranch };
  return ['**Dry run: would merge**', ...changeLines(what, false)].join('\n');
}

/**
 * Message for the commit that merges the default branch into a PR branch. `[skip ci]` keeps the
 * runners idle: the bot has already verified the PR and merges it straight after. Pure.
 * @param {string} branch - The PR branch
 * @param {string} defaultBranch - The branch merged into it
 * @returns {string}
 */
export function updateCommitMessage(branch, defaultBranch) {
  return `Merge ${defaultBranch} into ${branch} [skip ci]`;
}

/**
 * Message for the bot's version commit. See {@link updateCommitMessage} for `[skip ci]`. Pure.
 * @param {string} version - Plain `x.y.z`
 * @returns {string}
 */
export function versionCommitMessage(version) {
  return `Set the version to ${version} [skip ci]`;
}

/**
 * Whether the first parent of a commit is `sha`, i.e. the commit was made on top of the head that was
 * checked and not on top of something pushed since. Pure.
 * @param {Array<{ sha: string }>|undefined} parents - The commit's parents
 * @param {string} sha - The expected first parent
 * @returns {boolean}
 */
export function firstParentIs(parents, sha) {
  return Array.isArray(parents) && parents.length > 0 && parents[0]?.sha === sha;
}
