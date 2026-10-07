/**
 * index command — scans a project's decisions or architecture directory and
 * generates an index.json with metadata for each file.
 *
 * This runs in a project directory (not the ai-foundation repo).
 * It resolves the relevant path via lib/aiconfig.js, then scans
 * the corresponding files for metadata.
 *
 * Plan: AIF-002-014, AIF-013 (on-demand index; added resolveDecisionsPath and the decision-index
 * generation path; Task 003 added the --base/--head PR-range gate to --check). Target selection was later switched from -k/-d flags
 * to a positional target, matching the `list`/`validate`/`test` command
 * convention (`aif` CLI subcommand consistency is the kind of secondary case
 * docs/decisions/0005-ai-git-tool-boundary.md's shell-vs-MCP test applies to).
 * The generic `knowledge` target (frontmatter `type` taxonomy) retired
 * under process-model check 13 — decisions and architecture each have
 * their own dedicated indexer, per `steering/engineering/document-types.md`.
 *
 * Both index.json files are generated on demand, are gitignored, and are
 * deterministic (same inputs, byte-identical output). `--check` never reads a
 * stored index; it validates the source docs directly.
 *
 * Usage:
 *   aif index decisions              — generate {paths.decisions}/index.json
 *   aif index decisions --check      — validate the ADR corpus without writing
 *   aif index architecture           — generate {paths.architecture}/index.json
 *   aif index architecture --check   — validate the arc42 corpus without writing
 *   aif index architecture --check --base <ref> [--head <ref>]
 *                                    — also run the PR-range gate: every key_file
 *                                      changed in base...head needs a change to a doc
 *                                      listing it, or an `Arch-Unaffected:` commit
 *                                      waiver. Without --base, the merge-base with
 *                                      origin/main (then main) is used; if neither
 *                                      resolves the gate is skipped with a notice.
 *                                      An explicit --base that does not resolve fails.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { buildDecisionIndexForDir } from '../decisions.js';
import {
  loadArchitectureRecords,
  buildArchitectureIndex,
  findStaleDocs,
  findBrokenLinks,
  checkRangeGate,
  findDefaultBase,
} from '../architecture.js';
import { getConfigPath } from '../aiconfig.js';

/**
 * Resolve a project's decisions directory via the shared .aiconfig.json
 * resolver (lib/aiconfig.js): the configured paths.decisions value, or its
 * documented default.
 * @param {string} projectRoot
 * @returns {string} Absolute path to the decisions directory
 */
export function resolveDecisionsPath(projectRoot) {
  return getConfigPath(projectRoot, 'paths.decisions');
}

/**
 * Resolve a project's architecture directory via the shared .aiconfig.json
 * resolver. Mirrors resolveDecisionsPath: reads the configured
 * paths.architecture value, or its documented default (nested under the
 * resolved paths.knowledge, per lib/aiconfig-defaults.js).
 * @param {string} projectRoot
 * @returns {string} Absolute path to the architecture directory
 */
export function resolveArchitecturePath(projectRoot) {
  return getConfigPath(projectRoot, 'paths.architecture');
}

/**
 * Run the decision-index generation/validation path (decisions target).
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runDecisionIndex(parsed, repoRoot) {
  const decisionsDir = resolveDecisionsPath(repoRoot);
  const indexPath = join(decisionsDir, 'index.json');

  let index;
  try {
    index = buildDecisionIndexForDir(decisionsDir);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  if (parsed.args.check) {
    // Parsing succeeded above (buildDecisionIndexForDir throws on any
    // malformed record); there is no stored index to compare against.
    console.log(`✓ Decision records are valid: ${index.entries.length} entries.`);
    return 0;
  }

  if (index.entries.length === 0) {
    console.log(`No ADR files found under: ${decisionsDir}. Writing an empty index.`);
  }

  mkdirSync(decisionsDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Decision index generated: ${index.entries.length} entries → ${indexPath}`);

  return 0;
}

/**
 * Make untrusted text (commit messages, paths) safe to print: control
 * characters (including ANSI escapes) become spaces.
 * @param {string} text
 * @returns {string}
 */
function printable(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

/**
 * Print accepted and rejected waivers from a range-gate result.
 * @param {import('../architecture.js').RangeGateResult} gate
 */
function printWaivers(gate) {
  for (const w of gate.acceptedWaivers) {
    console.log(
      `  accepted waiver (${w.sha.slice(0, 7)}): section ${printable(w.section)} covers ${w.coveredFiles.map(printable).join(', ')} — ${printable(w.reason)}`,
    );
  }
  for (const w of gate.rejectedWaivers) {
    console.error(
      `  rejected waiver (${w.sha.slice(0, 7)}): section ${printable(w.section) || '?'} — ${printable(w.rejection)}`,
    );
  }
}

/**
 * Run the PR-range gate for `--check --base/--head` (or the default base).
 * @param {{ args: Record<string, string|boolean> }} parsed
 * @param {string} repoRoot
 * @param {string} architectureDir
 * @param {import('../architecture.js').ArchitectureRecord[]} records
 * @returns {boolean} true when the gate passed or was skipped
 */
function runRangeGate(parsed, repoRoot, architectureDir, records) {
  const rawBase = parsed.args.base;
  const rawHead = parsed.args.head;
  if (rawBase === true || rawBase === false || rawHead === true || rawHead === false) {
    console.error('✗ --base and --head each require a git ref value.');
    return false;
  }

  const head = rawHead ?? 'HEAD';
  /** @type {string|null|undefined} */
  let base = rawBase;
  try {
    if (base === undefined) {
      base = findDefaultBase(repoRoot, head);
      if (base === null) {
        console.log(
          '  ℹ Range gate skipped: no --base given and neither origin/main nor main resolves.',
        );
        return true;
      }
    }
    const gate = checkRangeGate({ records, architectureDir, repoRoot, base, head });
    printWaivers(gate);
    if (gate.violations.length === 0) {
      console.log(
        `✓ Range gate passed (${gate.base.slice(0, 7)}...${gate.head.slice(0, 7)}): ${gate.coveredFiles.length} changed key_file(s) covered.`,
      );
      return true;
    }
    console.error(
      `✗ Range gate failed (${gate.base.slice(0, 7)}...${gate.head.slice(0, 7)}): changed key_files with no doc update or waiver:`,
    );
    for (const v of gate.violations) {
      console.error(`    ${printable(v.file)} (listed by: ${v.docs.map(printable).join(', ')})`);
    }
    console.error(
      '  Fix: update a doc that lists the file in this range, or add a commit message line\n' +
        '       "Arch-Unaffected: <section> — <reason the doc is still accurate>".',
    );
    return false;
  } catch (err) {
    console.error(`✗ Range gate could not run: ${printable(err.message)}`);
    return false;
  }
}

/**
 * Run the architecture-index generation/validation path.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
function runArchitectureIndex(parsed, repoRoot) {
  const architectureDir = resolveArchitecturePath(repoRoot);
  const indexPath = join(architectureDir, 'index.json');

  let records;
  try {
    records = loadArchitectureRecords(architectureDir);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  const index = buildArchitectureIndex(records);
  const staleDocs = findStaleDocs(records, repoRoot);

  if (parsed.args.check) {
    if (staleDocs.length > 0) {
      console.error(`✗ Architecture docs stale against key_files: ${staleDocs.join(', ')}`);
      return 1;
    }
    const brokenLinks = findBrokenLinks(architectureDir);
    if (brokenLinks.length > 0) {
      console.error('✗ Broken relative links in docs/architecture:');
      for (const msg of brokenLinks) console.error(`    ${msg}`);
      return 1;
    }
    console.log(`✓ Architecture docs are valid: ${index.entries.length} entries.`);
    return runRangeGate(parsed, repoRoot, architectureDir, records) ? 0 : 1;
  }

  if (parsed.args.base !== undefined || parsed.args.head !== undefined) {
    console.error('✗ --base and --head are only valid with --check.');
    return 1;
  }

  if (index.entries.length === 0) {
    console.log(`No arc42 section files found under: ${architectureDir}. Writing an empty index.`);
  }

  mkdirSync(architectureDir, { recursive: true });
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`✓ Architecture index generated: ${index.entries.length} entries → ${indexPath}`);

  if (staleDocs.length > 0) {
    console.log(`  ⚠ stale against key_files: ${staleDocs.join(', ')}`);
  }

  const brokenLinks = findBrokenLinks(architectureDir);
  if (brokenLinks.length > 0) {
    console.log('  ⚠ broken relative links:');
    for (const msg of brokenLinks) console.log(`    ${msg}`);
  }

  return 0;
}

/**
 * Run the index command.
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} repoRoot
 * @returns {number} exit code
 */
export function runIndex(parsed, repoRoot) {
  const target = parsed.positional[0];

  if (!target) {
    console.error('Usage: aif index <decisions|architecture>');
    return 1;
  }

  try {
    switch (target) {
      case 'decisions':
        return runDecisionIndex(parsed, repoRoot);
      case 'architecture':
        return runArchitectureIndex(parsed, repoRoot);
      default:
        console.error(`Unknown index target: ${target}. Use: decisions, architecture`);
        return 1;
    }
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }
}
