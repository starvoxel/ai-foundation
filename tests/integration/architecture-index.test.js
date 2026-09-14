/**
 * Integration tests for `aif index architecture` — real filesystem and git
 * operations, mirroring tests/integration/decisions-index.test.js's
 * structure. Unlike decisions, architecture staleness depends on real git
 * history (last_verified vs. key_files), so each test operates against a
 * throwaway git repo in a temp directory.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectArchitectureFiles,
  isStaleAgainstGit,
  buildArchitectureIndexForDir,
} from '../../lib/architecture.js';
import { runIndex, resolveArchitecturePath } from '../../lib/commands/index.js';
import { parseArgs } from '../../bin/aif.js';

/** @returns {string} the new commit's SHA */
function git(repoRoot, ...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function initRepo(repoRoot) {
  git(repoRoot, 'init', '-q');
  git(repoRoot, 'config', 'user.email', 'test@example.com');
  git(repoRoot, 'config', 'user.name', 'Test');
}

function commitAll(repoRoot, message) {
  git(repoRoot, 'add', '-A');
  git(repoRoot, 'commit', '-q', '-m', message);
  return git(repoRoot, 'rev-parse', 'HEAD');
}

function sectionContent({ lastVerified, keyFiles = ['src/thing.js'] }) {
  const keyFilesYaml = keyFiles.map((f) => `  - ${f}`).join('\n');
  return `---
section: "01"
title: "T"
lifecycle: published
last_verified: ${lastVerified}
tags: []
key_files:
${keyFilesYaml}
---

> Summary.
`;
}

describe('architecture index — real git integration', () => {
  let repoRoot;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aif-arch-test-'));
    initRepo(repoRoot);
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('collectArchitectureFiles excludes underscore-prefixed files and recurses', () => {
    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, '01_intro.md'), 'x');
    writeFileSync(join(archDir, '_template.md'), 'x');
    mkdirSync(join(archDir, 'sub'), { recursive: true });
    writeFileSync(join(archDir, 'sub', '05_01_nested.md'), 'x');

    const files = collectArchitectureFiles(archDir).sort();
    assert.deepEqual(files, ['01_intro.md', 'sub/05_01_nested.md']);
  });

  it('is not stale when key_files have not changed since last_verified', () => {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 1;\n');
    const commitA = commitAll(repoRoot, 'add thing.js');

    const record = { key_files: ['src/thing.js'], last_verified: commitA };
    assert.equal(isStaleAgainstGit(record, repoRoot), false);
  });

  it('becomes stale once a key_files entry changes after last_verified', () => {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 1;\n');
    const commitA = commitAll(repoRoot, 'add thing.js');

    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');

    const record = { key_files: ['src/thing.js'], last_verified: commitA };
    assert.equal(isStaleAgainstGit(record, repoRoot), true);
  });

  it('treats an unresolvable last_verified SHA as stale, not as clean', () => {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'x');
    commitAll(repoRoot, 'add thing.js');

    const record = { key_files: ['src/thing.js'], last_verified: 'deadbeef' };
    assert.equal(isStaleAgainstGit(record, repoRoot), true);
  });

  it('is stale if ANY of several key_files changed, not just the first', () => {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'a.js'), 'a');
    writeFileSync(join(repoRoot, 'src', 'b.js'), 'b');
    const commitA = commitAll(repoRoot, 'add a.js and b.js');

    writeFileSync(join(repoRoot, 'src', 'b.js'), 'b2');
    commitAll(repoRoot, 'change b.js only');

    const record = { key_files: ['src/a.js', 'src/b.js'], last_verified: commitA };
    assert.equal(isStaleAgainstGit(record, repoRoot), true);
  });

  it('buildArchitectureIndexForDir wires real parsing + git staleness end to end', () => {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 1;\n');
    const commitA = commitAll(repoRoot, 'add thing.js');

    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, '01_intro.md'), sectionContent({ lastVerified: commitA }));
    commitAll(repoRoot, 'add architecture doc');

    const index = buildArchitectureIndexForDir(archDir, repoRoot);
    assert.equal(index.entries.length, 1);
    assert.equal(index.entries[0].stale, false);
    assert.deepEqual(index.reverse_index, { 'src/thing.js': ['01_intro.md'] });

    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');

    const index2 = buildArchitectureIndexForDir(archDir, repoRoot);
    assert.equal(index2.entries[0].stale, true);
  });
});

describe('aif index architecture — CLI wiring', () => {
  let repoRoot;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'aif-arch-cli-test-'));
    initRepo(repoRoot);
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  function useDocsArchitecture() {
    writeFileSync(
      join(repoRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { architecture: 'docs/architecture' } }),
    );
  }

  function setup() {
    useDocsArchitecture();
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 1;\n');
    const commitA = commitAll(repoRoot, 'add thing.js and .aiconfig.json');

    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, '01_intro.md'), sectionContent({ lastVerified: commitA }));
    commitAll(repoRoot, 'add architecture doc');

    return { archDir };
  }

  it('resolveArchitecturePath falls back to {knowledge}/architecture', () => {
    const resolved = resolveArchitecturePath(repoRoot);
    assert.equal(resolved, join(repoRoot, 'knowledge', 'architecture'));
  });

  it('resolveArchitecturePath honors .aiconfig.json paths.architecture', () => {
    writeFileSync(
      join(repoRoot, '.aiconfig.json'),
      JSON.stringify({ paths: { architecture: 'docs/architecture' } }),
    );
    assert.equal(resolveArchitecturePath(repoRoot), join(repoRoot, 'docs', 'architecture'));
  });

  it('generates index.json on a plain run', () => {
    const { archDir } = setup();
    const exitCode = runIndex(parseArgs(['index', 'architecture']), repoRoot);
    assert.equal(exitCode, 0);
    const written = JSON.parse(readFileSync(join(archDir, 'index.json'), 'utf8'));
    assert.equal(written.entries.length, 1);
    assert.equal(written.entries[0].stale, false);
  });

  it('--check passes when the written index matches and nothing is stale', () => {
    setup();
    runIndex(parseArgs(['index', 'architecture']), repoRoot);
    const exitCode = runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot);
    assert.equal(exitCode, 0);
  });

  it('--check fails when a key_files entry changed since last_verified', () => {
    setup();
    runIndex(parseArgs(['index', 'architecture']), repoRoot);

    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');

    const exitCode = runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot);
    assert.equal(exitCode, 1);
  });

  it('--check fails with no existing index.json', () => {
    setup();
    const exitCode = runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot);
    assert.equal(exitCode, 1);
  });

  it('writes an empty index when no section files exist', () => {
    useDocsArchitecture();
    mkdirSync(join(repoRoot, 'docs', 'architecture'), { recursive: true });
    commitAll(repoRoot, 'init');
    const exitCode = runIndex(parseArgs(['index', 'architecture']), repoRoot);
    assert.equal(exitCode, 0);
    const written = JSON.parse(
      readFileSync(join(repoRoot, 'docs', 'architecture', 'index.json'), 'utf8'),
    );
    assert.deepEqual(written.entries, []);
  });

  it('fails cleanly on a malformed section file', () => {
    useDocsArchitecture();
    mkdirSync(join(repoRoot, 'docs', 'architecture'), { recursive: true });
    writeFileSync(join(repoRoot, 'docs', 'architecture', '01_bad.md'), 'no frontmatter');
    commitAll(repoRoot, 'add bad doc');
    const exitCode = runIndex(parseArgs(['index', 'architecture']), repoRoot);
    assert.equal(exitCode, 1);
    assert.ok(!existsSync(join(repoRoot, 'docs', 'architecture', 'index.json')));
  });
});
