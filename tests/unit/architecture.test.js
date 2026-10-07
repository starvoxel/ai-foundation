/**
 * Unit tests for arc42 architecture-section parsing and deterministic index
 * building (lib/architecture.js). Plan: AIF-013. All fixtures are synthetic in-memory
 * strings — no real disk or git I/O, per this repo's testability convention
 * (mirrors tests/unit/decisions.test.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseArchitectureSection,
  buildReverseIndex,
  buildArchitectureIndex,
  extractRelativeLinks,
} from '../../lib/architecture.js';

function wellFormedSection({
  section = '01',
  title = 'Introduction and Goals',
  lifecycle = 'published',
  last_verified = 'abc1234',
  tags = ['overview'],
  key_files = ['README.md'],
  summaryLines = ['One-sentence summary of what this section covers.'],
} = {}) {
  const tagsYaml = `[${tags.join(', ')}]`;
  const keyFilesYaml = key_files.map((f) => `  - ${f}`).join('\n');
  const summary = summaryLines.map((l) => `> ${l}`).join('\n');
  return `---
section: "${section}"
title: "${title}"
lifecycle: ${lifecycle}
last_verified: ${last_verified}
tags: ${tagsYaml}
key_files:
${keyFilesYaml}
---

${summary}

## Body

Some content.
`;
}

describe('parseArchitectureSection', () => {
  it('parses a well-formed section', () => {
    const result = parseArchitectureSection(wellFormedSection(), '01_introduction.md');
    assert.ok('record' in result, JSON.stringify(result));
    assert.deepEqual(result.record, {
      path: '01_introduction.md',
      section: '01',
      title: 'Introduction and Goals',
      summary: 'One-sentence summary of what this section covers.',
      lifecycle: 'published',
      tags: ['overview'],
      key_files: ['README.md'],
      last_verified: 'abc1234',
    });
  });

  it('joins a multi-line blockquote summary into one string', () => {
    const content = wellFormedSection({
      summaryLines: ['First line of the summary', 'continues on a second line.'],
    });
    const result = parseArchitectureSection(content, '01.md');
    assert.equal(result.record.summary, 'First line of the summary continues on a second line.');
  });

  it('stops the summary at the first non-blockquote line', () => {
    const content = `---
section: "01"
title: "T"
lifecycle: published
last_verified: abc1234
tags: []
key_files: []
---

> Summary line.

## Body

Not part of the summary.
`;
    const result = parseArchitectureSection(content, '01.md');
    assert.equal(result.record.summary, 'Summary line.');
  });

  it('defaults tags and key_files to [] when absent', () => {
    const content = `---
section: "01"
title: "T"
lifecycle: published
last_verified: abc1234
---

> Summary.
`;
    const result = parseArchitectureSection(content, '01.md');
    assert.deepEqual(result.record.tags, []);
    assert.deepEqual(result.record.key_files, []);
  });

  it('errors on missing frontmatter', () => {
    const result = parseArchitectureSection('no frontmatter here', '01.md');
    assert.ok('error' in result);
    assert.match(result.error, /missing YAML frontmatter/);
  });

  for (const field of ['section', 'title', 'lifecycle', 'last_verified']) {
    it(`errors when "${field}" is missing`, () => {
      const lines = wellFormedSection().split('\n');
      const filtered = lines.filter(
        (l) => !l.startsWith(`${field}:`) && !l.startsWith(`${field} `),
      );
      const content = filtered.join('\n');
      const result = parseArchitectureSection(content, '01.md');
      assert.ok('error' in result, `expected an error when ${field} is missing`);
      assert.match(result.error, new RegExp(field));
    });
  }
});

describe('buildReverseIndex', () => {
  it('inverts key_files across records, sorted', () => {
    const records = [
      { path: '01.md', key_files: ['a.js', 'b.js'] },
      { path: '02.md', key_files: ['b.js', 'c.js'] },
    ];
    const reverse = buildReverseIndex(records);
    assert.deepEqual(reverse, {
      'a.js': ['01.md'],
      'b.js': ['01.md', '02.md'],
      'c.js': ['02.md'],
    });
  });

  it('returns {} for no records', () => {
    assert.deepEqual(buildReverseIndex([]), {});
  });
});

describe('buildArchitectureIndex', () => {
  const records = () => [
    {
      path: '02.md',
      section: '02',
      title: 'T02',
      summary: 's',
      lifecycle: 'published',
      tags: [],
      key_files: ['b.js'],
      last_verified: 'x',
    },
    {
      path: '01.md',
      section: '01',
      title: 'T01',
      summary: 's',
      lifecycle: 'published',
      tags: [],
      key_files: ['a.js'],
      last_verified: 'x',
    },
  ];

  it('assembles entries without per-entry stale state', () => {
    const index = buildArchitectureIndex(records());
    assert.equal(index.entries.length, 2);
    for (const entry of index.entries) assert.ok(!('stale' in entry));
  });

  it('sorts entries by path regardless of input order', () => {
    const index = buildArchitectureIndex(records());
    assert.deepEqual(
      index.entries.map((e) => e.path),
      ['01.md', '02.md'],
    );
  });

  it('includes a reverse_index built from the same records, with sorted keys', () => {
    const index = buildArchitectureIndex(records());
    assert.deepEqual(index.reverse_index, { 'a.js': ['01.md'], 'b.js': ['02.md'] });
    assert.deepEqual(Object.keys(index.reverse_index), ['a.js', 'b.js']);
  });

  it('has no generated_at timestamp', () => {
    assert.ok(!('generated_at' in buildArchitectureIndex([])));
  });

  it('is deterministic: the same records always serialize identically', () => {
    const first = JSON.stringify(buildArchitectureIndex(records()));
    const second = JSON.stringify(buildArchitectureIndex(records().reverse()));
    assert.equal(first, second);
  });
});

describe('extractRelativeLinks', () => {
  it('extracts a plain inline link', () => {
    const links = extractRelativeLinks('See [Bundle resolution](05_01_bundle_resolution.md).');
    assert.deepEqual(links, [{ text: 'Bundle resolution', target: '05_01_bundle_resolution.md' }]);
  });

  it('skips absolute URLs (URI scheme present)', () => {
    const links = extractRelativeLinks('[arc42](https://arc42.org/template)');
    assert.deepEqual(links, []);
  });

  it('skips mailto: links', () => {
    const links = extractRelativeLinks('[email](mailto:someone@example.com)');
    assert.deepEqual(links, []);
  });

  it('skips pure same-page anchors', () => {
    const links = extractRelativeLinks('[Motivation](#motivation)');
    assert.deepEqual(links, []);
  });

  it('skips repo-root-absolute paths', () => {
    const links = extractRelativeLinks('[x](/docs/architecture/05_building_blocks.md)');
    assert.deepEqual(links, []);
  });

  it('keeps a target with a #fragment attached', () => {
    const links = extractRelativeLinks('[x](05_building_blocks.md#overview-diagram)');
    assert.deepEqual(links, [{ text: 'x', target: '05_building_blocks.md#overview-diagram' }]);
  });

  it('strips a quoted link title from the target', () => {
    const links = extractRelativeLinks('[x](05_building_blocks.md "Level 1 whitebox")');
    assert.deepEqual(links, [{ text: 'x', target: '05_building_blocks.md' }]);
  });

  it('does not scan inside fenced code blocks', () => {
    const content = ['```', 'See [example](not_real.md).', '```'].join('\n');
    assert.deepEqual(extractRelativeLinks(content), []);
  });

  it('finds multiple links across multiple lines', () => {
    const content = ['[a](a.md)', 'prose', '[b](b.md)'].join('\n');
    const links = extractRelativeLinks(content);
    assert.deepEqual(
      links.map((l) => l.target),
      ['a.md', 'b.md'],
    );
  });
});
