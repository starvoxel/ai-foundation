#!/usr/bin/env node

/**
 * CI check: any file with a tracked `version` field (YAML frontmatter in a
 * `.md` file, or a top-level `version` key in a `.yaml`/`.yml` file) that
 * changed content between two git refs must also change its `version`
 * value. Encodes the "bump frontmatter version on every modified file"
 * convention documented across skills/steering/agents plans.
 *
 * Files under `.github/` are never checked: no versioned component lives there,
 * and their `version` keys belong to other tools (e.g. `version: 2` in
 * `dependabot.yml` is Dependabot's schema version and cannot be bumped).
 *
 * A change to shipped content (agents, skills, steering, standards, servers,
 * bundles, projects, bin, lib) must also raise `package.json`'s `version`, so the
 * release workflow tags one release per merged change, unless VERSION_POLICY=bot: then the
 * `/merge` bot sets the version at merge and a PR must leave it alone. Dependency manifests
 * (`package.json`, `package-lock.json`) do not count, which keeps Dependabot PRs
 * exempt. The rule lives in version-bump-logic.mjs.
 *
 * Usage:
 *   node check-version-bumps.mjs sha <baseSha> [headRef]
 *     Diff explicitly against <baseSha>. If <baseSha> is empty or the
 *     all-zeros SHA, the check is skipped (no base to diff against) —
 *     used for pushes to `main`, where <baseSha> is the previous tip of
 *     `main` (github.event.before, which GitHub sets to all-zeros on the
 *     very first push to a ref).
 *
 *   node check-version-bumps.mjs auto-parent <currentBranch> [headRef]
 *     Auto-detect the branch <currentBranch> most recently forked from —
 *     the still-existing remote branch whose merge-base with HEAD is most
 *     recent — and diff against its current tip. If a branch was cut from
 *     another feature branch that has since been merged and deleted, the
 *     next-nearest surviving ancestor (e.g. main) is found automatically,
 *     since deleted branches are simply absent from the candidate list.
 */

import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import YAML from 'yaml';

import {
  isOlder,
  needsPackageBump,
  packageBumpError,
  packageVersionEditError,
  pickParentRef,
} from './version-bump-logic.mjs';

const [mode, modeArg, headRef = 'HEAD'] = process.argv.slice(2);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/**
 * Finds the still-existing remote branch this one was most recently forked
 * from: among all other origin branches, the one whose merge-base with HEAD
 * is the most recent commit. A branch cut from a feature branch has a later
 * merge-base with that feature branch than with main, since the feature
 * branch's own fork-from-main point necessarily predates it. On a tie `main`
 * wins (see `pickParentRef`), so an unrelated open PR that also contains
 * main's tip is never mistaken for the parent.
 *
 * @param {string} currentBranch
 * @returns {string|null} e.g. "origin/feature-x", or null if no candidates.
 */
function findParentBranchBase(currentBranch) {
  const refs = git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin'])
    .trim()
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((r) => r !== 'refs/remotes/origin/HEAD')
    .filter((r) => r !== `refs/remotes/origin/${currentBranch}`);

  const candidates = [];
  for (const ref of refs) {
    let mergeBase;
    try {
      mergeBase = git(['merge-base', 'HEAD', ref]).trim();
    } catch {
      continue; // unrelated history
    }
    const date = Number(git(['show', '-s', '--format=%ct', mergeBase]).trim());
    candidates.push({ ref, date });
  }
  return pickParentRef(candidates, 'refs/remotes/origin/main');
}

let baseSha;

if (mode === 'auto-parent') {
  const parentRef = findParentBranchBase(modeArg);
  if (!parentRef) {
    console.log(
      `No other branch found to diff '${modeArg}' against — skipping version-bump check.`,
    );
    process.exit(0);
  }
  console.log(`Detected parent branch: ${parentRef}`);
  baseSha = parentRef;
} else if (mode === 'sha') {
  const ZERO_SHA = '0000000000000000000000000000000000000000'; // github.event.before on a first push
  if (!modeArg || modeArg === ZERO_SHA) {
    console.log('No base ref available to diff against — skipping version-bump check.');
    process.exit(0);
  }
  baseSha = modeArg;
} else {
  console.error(`Unknown mode '${mode}' — expected 'sha' or 'auto-parent'.`);
  process.exit(1);
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

const diffOutput = git(['diff', '--name-status', `${baseSha}...${headRef}`]).trim();

if (!diffOutput) {
  console.log('No changed files between base and head — nothing to check.');
  process.exit(0);
}

// Repo-relative prefix whose files are skipped; see the header comment.
const EXCLUDED_PREFIX = '.github/';

const errors = [];
let checked = 0;

for (const line of diffOutput.split('\n')) {
  const [status, ...pathParts] = line.split('\t');
  const path = pathParts[pathParts.length - 1]; // renames: use the new path
  if (!status.startsWith('M') && !status.startsWith('R')) continue; // only modified/renamed
  if (path.startsWith(EXCLUDED_PREFIX)) continue;
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

// Shipped content changed: package.json's version must move too, so the release
// workflow tags one release per merged change (see version-bump-logic.mjs).
//
// With VERSION_POLICY=bot the `/merge` bot assigns the version when it merges, so a PR must not edit it
// (the rule below flips). A push to `main` (`sha` mode) always keeps the original rule: the merge the bot
// makes carries both the shipped change and the new version.
const changedPaths = diffOutput.split('\n').flatMap((line) => line.split('\t').slice(1));
const botOwnsVersion = process.env.VERSION_POLICY === 'bot' && mode === 'auto-parent';
const baseJson = readAtRef(baseSha, 'package.json');
const headJson = readAtRef(headRef, 'package.json');
if (botOwnsVersion) {
  // Compare with the version where the branch forked, not the parent's tip: a PR that is merely behind
  // after a release has not edited the version, and the bot's own gate compares the same way.
  const forkPoint = git(['merge-base', baseSha, headRef]).trim();
  const editError = packageVersionEditError({
    baseJson: readAtRef(forkPoint, 'package.json'),
    headJson,
  });
  if (editError) errors.push(editError);
} else if (needsPackageBump(changedPaths)) {
  const packageError = packageBumpError({ changedPaths, baseJson, headJson });
  if (packageError) errors.push(packageError);
}

if (errors.length > 0) {
  console.log(`✗ version-bump check (${errors.length} error(s), ${checked} file(s) checked)`);
  for (const err of errors) console.log(`    ${err}`);
  const packageHint = botOwnsVersion
    ? "Leave `package.json`'s version alone: the /merge bot sets it when it merges."
    : "and `package.json`'s version when changing shipped content (agents, skills, steering, standards, servers, bundles, projects, bin, lib).";
  console.log(
    `\nBump the \`version\` field when changing a versioned component (agent, skill, steering, standard, bundle, or server definition)${botOwnsVersion ? '. ' : ', '}${packageHint}`,
  );
  process.exit(1);
}

console.log(`✓ version-bump check (${checked} versioned file(s) checked, all bumped correctly)`);
