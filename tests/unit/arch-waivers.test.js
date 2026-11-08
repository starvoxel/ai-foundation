/**
 * Unit tests for the `Arch-Unaffected` commit waiver (lib/arch-waivers.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { messageWaivesSection, findUnwaivedSections } from '../../lib/arch-waivers.js';

describe('unit: messageWaivesSection', () => {
  it('matches an em-dash waiver for the section', () => {
    assert.equal(
      messageWaivesSection(
        'Refactor\n\nArch-Unaffected: 05.04 — pure rename, no behavior change',
        '05.04',
      ),
      true,
    );
  });

  it('matches ASCII separators and bullet-prefixed squash bodies', () => {
    assert.equal(
      messageWaivesSection('* Arch-Unaffected: 5.4 - comment-only change', '05.04'),
      true,
    );
    assert.equal(messageWaivesSection('Arch-Unaffected: 05 -- simplification only', '5'), true);
  });

  it('does not match a different section', () => {
    assert.equal(messageWaivesSection('Arch-Unaffected: 05.03 — reason here', '05.04'), false);
  });

  it('requires a reason', () => {
    assert.equal(messageWaivesSection('Arch-Unaffected: 05.04', '05.04'), false);
    assert.equal(messageWaivesSection('Arch-Unaffected: 05.04 —', '05.04'), false);
  });

  it('does not match when the key is not at the start of a line', () => {
    assert.equal(messageWaivesSection('see Arch-Unaffected: 05.04 — because', '05.04'), false);
  });
});

describe('unit: findUnwaivedSections', () => {
  const records = [
    { path: '05_04_x.md', section: '05.04', key_files: ['lib/a.js', 'lib/b.js'] },
    { path: '05_05_y.md', section: '05.05', key_files: ['lib/c.js'] },
  ];
  const arch = 'docs/architecture';

  it('reports a section whose key_file is staged with no doc edit or waiver', () => {
    assert.deepEqual(findUnwaivedSections(records, arch, ['lib/a.js', 'lib/z.js'], 'Change a'), [
      { section: '05.04', files: ['lib/a.js'] },
    ]);
  });

  it('is silent when the doc is staged in the same commit', () => {
    assert.deepEqual(
      findUnwaivedSections(records, arch, ['lib/a.js', 'docs/architecture/05_04_x.md'], 'Change a'),
      [],
    );
  });

  it('is silent when the message waives that section, but not another', () => {
    const msg = 'Change\n\nArch-Unaffected: 5.4 — refactor only';
    assert.deepEqual(findUnwaivedSections(records, arch, ['lib/a.js', 'lib/c.js'], msg), [
      { section: '05.05', files: ['lib/c.js'] },
    ]);
  });

  it('handles a repo-root architecture directory and no staged key_files', () => {
    assert.deepEqual(findUnwaivedSections(records, '', ['05_04_x.md', 'lib/a.js'], 'm'), []);
    assert.deepEqual(findUnwaivedSections(records, arch, ['README.md'], 'm'), []);
  });
});
