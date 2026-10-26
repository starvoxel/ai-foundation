#!/usr/bin/env node
// ------------------------------
// findings.js
//
// Author: Starvoxel AI Agent - 2026-10-24
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * Findings: durable, conflict-free tracking of review and scan results that
 * are not worth blocking a PR. Each finding is a GitHub issue labelled
 * `finding`; this script derives a map of file path -> findings from the open
 * ones, so an engineer can see what is already known about the files in play.
 * Nothing is stored in the repo, so nothing can conflict or go stale.
 *
 * Zero dependencies on purpose: installed with its skill, away from the
 * repo's node_modules. GitHub is reached only through `ai-git gh-api`.
 *
 * Usage:
 *   node findings.js [path ...] [--json]      findings touching those paths (all when none given)
 *   node findings.js file --title T --severity S --source X --rule R --files a,b [--effort E] [--detail D]
 *                                             comment on a matching finding, or open a new one
 *   Both accept --repo owner/name (default: derived from the origin remote) and
 *   --from-file <issues.json> (offline: read issues from a file instead of GitHub).
 *
 * Issue body format (first lines, then free text):
 *   files: a.js, b.js
 *   rule: <standard or check violated>
 *   source: <review | scan name>
 *   effort: <optional>
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FINDING_LABEL = 'finding';
export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Parse the `key: value` header lines of a finding body.
 * @param {string|null|undefined} body
 * @returns {{ files: string[], rule: string, source: string, effort: string }}
 */
export function parseBody(body) {
  const out = { files: [], rule: '', source: '', effort: '' };
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const m = /^(files|rule|source|effort):\s*(.*)$/i.exec(line.trim());
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'files') out.files = splitFiles(m[2]);
    else out[key] = m[2].trim();
  }
  return out;
}

/**
 * @param {string} value - Comma-separated paths
 * @returns {string[]}
 */
export function splitFiles(value) {
  return value
    .split(',')
    .map((s) => s.trim().replace(/^`|`$/g, ''))
    .filter(Boolean);
}

/**
 * Severity from an issue's `severity:<level>` label ('' when unlabelled).
 * @param {{ labels?: Array<string|{name:string}> }} issue
 * @returns {string}
 */
export function severityOf(issue) {
  for (const label of issue.labels ?? []) {
    const name = typeof label === 'string' ? label : label.name;
    const m = /^severity:(.+)$/.exec(name ?? '');
    if (m && SEVERITIES.includes(m[1])) return m[1];
  }
  return '';
}

/**
 * Invert open finding issues into { path: [entry] }. An issue appears under
 * every file it lists. Pull requests (which the issues API also returns) and
 * issues without a `files:` line are skipped.
 * @param {Array<any>} issues - GitHub issue objects
 * @returns {Record<string, Array<{n:number,title:string,rule:string,severity:string,source:string,effort:string,files:string[]}>>}
 */
export function buildMap(issues) {
  const map = {};
  for (const issue of issues) {
    if (issue.pull_request || issue.state === 'closed') continue;
    const parsed = parseBody(issue.body);
    const entry = {
      n: issue.number,
      title: issue.title,
      rule: parsed.rule,
      severity: severityOf(issue),
      source: parsed.source,
      effort: parsed.effort,
      files: parsed.files,
    };
    for (const file of parsed.files) (map[file] ??= []).push(entry);
  }
  return map;
}

/**
 * Entries for the given paths, de-duplicated by issue number. No paths: all.
 * @param {ReturnType<typeof buildMap>} map
 * @param {string[]} paths
 * @returns {Array<ReturnType<typeof buildMap>[string][number]>}
 */
export function lookup(map, paths) {
  const keys = paths.length ? paths : Object.keys(map);
  const seen = new Map();
  for (const key of keys) for (const entry of map[key] ?? []) seen.set(entry.n, entry);
  return [...seen.values()];
}

/**
 * Map keys that no longer exist in the repo: the file was deleted or renamed.
 * @param {ReturnType<typeof buildMap>} map
 * @param {(path: string) => boolean} exists
 * @returns {string[]}
 */
export function staleKeys(map, exists) {
  return Object.keys(map).filter((p) => !exists(p));
}

/**
 * Decide how to file a finding: comment on an open one that shares a file and
 * a rule, otherwise open a new issue.
 * @param {ReturnType<typeof buildMap>} map
 * @param {{title:string,severity:string,source:string,rule:string,files:string[],effort?:string,detail?:string}} f
 * @returns {{action:'comment',n:number,body:string,missingFiles:string[]}|{action:'create',title:string,body:string,labels:string[]}}
 */
export function planFiling(map, f) {
  if (!SEVERITIES.includes(f.severity)) {
    throw new Error(`Invalid severity "${f.severity}". Use one of: ${SEVERITIES.join(', ')}`);
  }
  if (!f.files.length || !f.rule || !f.title)
    throw new Error('A finding needs --title, --rule and --files');
  const match = lookup(map, f.files).find((e) => e.rule === f.rule);
  const detail = f.detail ? `\n\n${f.detail}` : '';
  if (match) {
    const missingFiles = f.files.filter((p) => !match.files.includes(p));
    const extra = missingFiles.length ? `\n\nAlso affects: ${missingFiles.join(', ')}` : '';
    return {
      action: 'comment',
      n: match.n,
      missingFiles,
      body: `Seen again (${f.source}).${extra}${detail}`,
    };
  }
  const header = [`files: ${f.files.join(', ')}`, `rule: ${f.rule}`, `source: ${f.source}`];
  if (f.effort) header.push(`effort: ${f.effort}`);
  return {
    action: 'create',
    title: f.title,
    body: header.join('\n') + detail,
    labels: [FINDING_LABEL, `severity:${f.severity}`, `source:${f.source}`],
  };
}

/**
 * One compact line per finding.
 * @param {{n:number,severity:string,files:string[],rule:string,title:string,effort:string}} e
 * @returns {string}
 */
export function formatLine(e) {
  const parts = [`#${e.n}`, e.severity || '-', e.files.join(','), e.rule || e.title];
  if (e.effort) parts.push(`(${e.effort})`);
  return parts.join(' ');
}

// ---- I/O -----------------------------------------------------------------

/**
 * Run `ai-git gh-api` and return its stdout.
 * @param {string[]} args
 * @param {string} [input] - Optional stdin
 * @returns {string}
 * @throws {Error} When the call fails
 */
function gh(args, input) {
  const r = spawnSync('ai-git', ['gh-api', ...args], { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'ai-git gh-api failed').trim());
  return r.stdout;
}

/**
 * "owner/name" from a GitHub remote URL (https or ssh), dots in the name allowed.
 * @param {string} url
 * @returns {string|null}
 */
export function parseRepoSlug(url) {
  const m = /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\s*$/.exec(url.trim());
  return m ? m[1] : null;
}

/**
 * The repo to query: --repo, else the origin remote.
 * @param {string[]} argv
 * @returns {string} "owner/name"
 */
function repoSlug(argv) {
  const i = argv.indexOf('--repo');
  if (i !== -1) return argv[i + 1];
  const r = spawnSync('ai-git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  const slug = parseRepoSlug(r.stdout ?? '');
  if (!slug) throw new Error('Cannot derive the repo; pass --repo owner/name');
  return slug;
}

/**
 * Open finding issues, from --from-file or GitHub.
 * @param {string[]} argv
 * @param {string} repo
 * @returns {Array<any>}
 */
function loadIssues(argv, repo) {
  const i = argv.indexOf('--from-file');
  if (i !== -1) return JSON.parse(readFileSync(argv[i + 1], 'utf8'));
  const out = gh([
    `repos/${repo}/issues?labels=${FINDING_LABEL}&state=open&per_page=100`,
    '--paginate',
    '--slurp',
  ]);
  return JSON.parse(out).flat();
}

/**
 * Value of `--name <value>`, if given.
 * @param {string[]} argv
 * @param {string} name
 * @returns {string|undefined}
 */
function flag(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

/**
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function main(argv) {
  try {
    const repo = argv.includes('--from-file') ? '' : repoSlug(argv);
    const map = buildMap(loadIssues(argv, repo));

    if (argv[0] === 'file') {
      const plan = planFiling(map, {
        title: flag(argv, 'title') ?? '',
        severity: flag(argv, 'severity') ?? '',
        source: flag(argv, 'source') ?? 'review',
        rule: flag(argv, 'rule') ?? '',
        files: splitFiles(flag(argv, 'files') ?? ''),
        effort: flag(argv, 'effort'),
        detail: flag(argv, 'detail'),
      });
      if (argv.includes('--from-file')) {
        console.log(JSON.stringify(plan));
        return 0;
      }
      if (plan.action === 'comment') {
        gh([
          `repos/${repo}/issues/${plan.n}/comments`,
          '--method',
          'POST',
          '-f',
          `body=${plan.body}`,
        ]);
        console.log(
          `Commented on #${plan.n}${plan.missingFiles.length ? ` (new files: ${plan.missingFiles.join(', ')}; update its files: line)` : ''}`,
        );
      } else {
        const args = [
          `repos/${repo}/issues`,
          '--method',
          'POST',
          '-f',
          `title=${plan.title}`,
          '-f',
          `body=${plan.body}`,
        ];
        for (const label of plan.labels) args.push('-f', `labels[]=${label}`);
        console.log(`Opened #${JSON.parse(gh(args)).number}`);
      }
      return 0;
    }

    const paths = argv.filter(
      (a, i) => !a.startsWith('--') && argv[i - 1] !== '--repo' && argv[i - 1] !== '--from-file',
    );
    const found = lookup(map, paths);
    if (argv.includes('--json')) console.log(JSON.stringify(paths.length ? found : map, null, 2));
    else for (const e of found) console.log(formatLine(e));
    for (const p of staleKeys(map, existsSync))
      console.error(
        `stale: ${p} no longer exists (${map[p].map((e) => `#${e.n}`).join(' ')}); fix its files: line or close it`,
      );
    return 0;
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
