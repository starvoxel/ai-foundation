/**
 * Integration tests for `aif index architecture` — real filesystem and git
 * operations. Architecture staleness depends on real git
 * history (a doc's last commit vs. its key_files), so each test operates against a
 * throwaway git repo in a temp directory.
 *
 *  */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectArchitectureFiles,
  isStaleAgainstGit,
  buildArchitectureIndexForDir,
  loadArchitectureRecords,
  findStaleDocs,
  findBrokenLinks,
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

function sectionContent({ keyFiles = ['src/thing.js'] } = {}) {
  const keyFilesYaml = keyFiles.map((f) => `  - ${f}`).join('\n');
  return `---
section: "01"
title: "T"
lifecycle: published
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

  const DOC = 'docs/architecture/01_intro.md';

  /** Commit src/thing.js, then the doc that lists it. */
  function commitCodeThenDoc(keyFiles = ['src/thing.js']) {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    for (const f of keyFiles) writeFileSync(join(repoRoot, f), 'export const x = 1;\n');
    commitAll(repoRoot, 'add code');
    mkdirSync(join(repoRoot, 'docs', 'architecture'), { recursive: true });
    writeFileSync(join(repoRoot, DOC), sectionContent({ keyFiles }));
    commitAll(repoRoot, 'add doc');
  }

  it('is not stale when key_files have not changed since the doc was last committed', () => {
    commitCodeThenDoc();
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), false);
  });

  it('is not stale when the doc and its key_file change in the same commit', () => {
    commitCodeThenDoc();
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    writeFileSync(join(repoRoot, DOC), sectionContent() + '\nUpdated.\n');
    commitAll(repoRoot, 'change both');
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), false);
  });

  it('becomes stale once a key_files entry changes after the doc was last committed', () => {
    commitCodeThenDoc();
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), true);
  });

  it('is not stale when the key_file commit carries an Arch-Unaffected waiver for the doc', () => {
    commitCodeThenDoc();
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(
      repoRoot,
      'Simplify thing\n\nArch-Unaffected: 01 — pure simplification, behavior unchanged',
    );
    assert.equal(
      isStaleAgainstGit({ key_files: ['src/thing.js'], section: '01' }, repoRoot, DOC),
      false,
    );
  });

  it('is still stale when a later key_file commit has no waiver', () => {
    commitCodeThenDoc();
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(
      repoRoot,
      'Simplify thing\n\nArch-Unaffected: 01 — pure simplification, behavior unchanged',
    );
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 3;\n');
    commitAll(repoRoot, 'Change behavior');
    assert.equal(
      isStaleAgainstGit({ key_files: ['src/thing.js'], section: '01' }, repoRoot, DOC),
      true,
    );
  });

  it('becomes fresh again once the doc is committed after the key_file change', () => {
    commitCodeThenDoc();
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');
    writeFileSync(join(repoRoot, DOC), sectionContent() + '\nVerified.\n');
    commitAll(repoRoot, 'update doc');
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), false);
  });

  it('is stale if ANY of several key_files changed, not just the first', () => {
    commitCodeThenDoc(['src/a.js', 'src/b.js']);
    writeFileSync(join(repoRoot, 'src', 'b.js'), 'b2');
    commitAll(repoRoot, 'change b.js only');
    const record = { key_files: ['src/a.js', 'src/b.js'] };
    assert.equal(isStaleAgainstGit(record, repoRoot, DOC), true);
  });

  it('is stale when a key_files entry does not exist on disk', () => {
    commitCodeThenDoc();
    assert.equal(isStaleAgainstGit({ key_files: ['src/missing.js'] }, repoRoot, DOC), true);
  });

  it('is stale when a key_file was deleted after the doc was committed', () => {
    commitCodeThenDoc();
    git(repoRoot, 'rm', '-q', 'src/thing.js');
    commitAll(repoRoot, 'delete thing.js');
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), true);
  });

  it('is not stale while the doc is uncommitted or has uncommitted edits', () => {
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 1;\n');
    commitAll(repoRoot, 'add code');
    mkdirSync(join(repoRoot, 'docs', 'architecture'), { recursive: true });
    writeFileSync(join(repoRoot, DOC), sectionContent());
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), false);

    commitAll(repoRoot, 'add doc');
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');
    writeFileSync(join(repoRoot, DOC), sectionContent() + '\nWIP.\n');
    assert.equal(isStaleAgainstGit({ key_files: ['src/thing.js'] }, repoRoot, DOC), false);
  });

  it('buildArchitectureIndexForDir + findStaleDocs wire parsing and git staleness end to end', () => {
    commitCodeThenDoc();
    const archDir = join(repoRoot, 'docs', 'architecture');

    const index = buildArchitectureIndexForDir(archDir);
    assert.equal(index.entries.length, 1);
    assert.ok(!('stale' in index.entries[0]));
    assert.ok(!('last_verified' in index.entries[0]));
    assert.deepEqual(index.reverse_index, { 'src/thing.js': ['01_intro.md'] });
    const stale = () => findStaleDocs(loadArchitectureRecords(archDir), repoRoot, archDir);
    assert.deepEqual(stale(), []);

    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');

    assert.deepEqual(stale(), ['01_intro.md']);
  });

  it('findBrokenLinks resolves a link relative to its own file, not the arch root', () => {
    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(join(archDir, 'sub'), { recursive: true });
    writeFileSync(join(archDir, 'sub', 'target.md'), 'x');
    writeFileSync(join(archDir, 'sub', 'source.md'), '[ok](target.md)\n[broken](../target.md)\n');

    const errors = findBrokenLinks(archDir);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /sub\/source\.md/);
    assert.match(errors[0], /\.\.\/target\.md/);
  });

  it('findBrokenLinks is empty for a link that resolves', () => {
    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, '05_building_blocks.md'), 'x');
    writeFileSync(
      join(archDir, '05_01_bundle_resolution.md'),
      '[Level 1](05_building_blocks.md)\n',
    );

    assert.deepEqual(findBrokenLinks(archDir), []);
  });

  it('findBrokenLinks flags a renamed/deleted target', () => {
    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, '01_intro.md'), '[gone](05_deleted.md)\n');

    const errors = findBrokenLinks(archDir);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /01_intro\.md/);
    assert.match(errors[0], /05_deleted\.md/);
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
    commitAll(repoRoot, 'add thing.js and .aiconfig.json');

    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(join(archDir, '01_intro.md'), sectionContent());
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
    assert.ok(!('stale' in written.entries[0]));
    assert.ok(!('generated_at' in written));
  });

  it('--check passes when nothing is stale, with or without an index.json present', () => {
    const { archDir } = setup();
    assert.ok(!existsSync(join(archDir, 'index.json')));
    assert.equal(runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot), 0);
    runIndex(parseArgs(['index', 'architecture']), repoRoot);
    const exitCode = runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot);
    assert.equal(exitCode, 0);
  });

  it('--check fails when a key_files entry changed since the doc was last committed', () => {
    setup();
    runIndex(parseArgs(['index', 'architecture']), repoRoot);

    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'export const x = 2;\n');
    commitAll(repoRoot, 'change thing.js');

    const exitCode = runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot);
    assert.equal(exitCode, 1);
  });

  it('--check does not read or require a stored index (a corrupt one is ignored)', () => {
    const { archDir } = setup();
    writeFileSync(join(archDir, 'index.json'), '{ not json');
    assert.equal(runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot), 0);
  });

  it('generation is deterministic: two runs write byte-identical index.json', () => {
    const { archDir } = setup();
    runIndex(parseArgs(['index', 'architecture']), repoRoot);
    const first = readFileSync(join(archDir, 'index.json'), 'utf8');
    runIndex(parseArgs(['index', 'architecture']), repoRoot);
    const second = readFileSync(join(archDir, 'index.json'), 'utf8');
    assert.equal(first, second);
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

  it('--check fails when a section file has a broken relative link', () => {
    const { archDir } = setup();
    runIndex(parseArgs(['index', 'architecture']), repoRoot);

    writeFileSync(
      join(archDir, '02_broken_link.md'),
      sectionContent({ lastVerified: git(repoRoot, 'rev-parse', 'HEAD') }).replace(
        '> Summary.',
        '> Summary.\n\n[gone](does_not_exist.md)',
      ),
    );
    commitAll(repoRoot, 'add doc with a broken link');

    const exitCode = runIndex(parseArgs(['index', 'architecture', '--check']), repoRoot);
    assert.equal(exitCode, 1);
  });

  it('generation warns, but still succeeds, on a broken relative link', () => {
    useDocsArchitecture();
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', 'thing.js'), 'x');
    commitAll(repoRoot, 'add thing.js and .aiconfig.json');

    const archDir = join(repoRoot, 'docs', 'architecture');
    mkdirSync(archDir, { recursive: true });
    writeFileSync(
      join(archDir, '01_intro.md'),
      sectionContent().replace('> Summary.', '> Summary.\n\n[gone](does_not_exist.md)'),
    );
    commitAll(repoRoot, 'add architecture doc with a broken link');

    const exitCode = runIndex(parseArgs(['index', 'architecture']), repoRoot);
    assert.equal(exitCode, 0);
  });
});
