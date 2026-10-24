/**
 * Unit tests for the `Arch-Unaffected` commit waiver (lib/arch-waivers.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { messageWaivesSection } from '../../lib/arch-waivers.js';

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
