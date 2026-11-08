/**
 * The Setup script that `aif init` prints (scripts/cloud-setup-bootstrap.sh) and the one the
 * README tells people to paste must be the same text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

describe('cloud Setup script bootstrap', () => {
  it('matches the README "Setup script" block exactly', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const bootstrap = readFileSync(join(ROOT, 'scripts', 'cloud-setup-bootstrap.sh'), 'utf8');
    assert.ok(
      readme.includes(`\`\`\`bash\n${bootstrap}\`\`\``),
      'README Setup script block differs from scripts/cloud-setup-bootstrap.sh',
    );
  });

  it('runs scripts/cloud-setup.sh from the global install', () => {
    const bootstrap = readFileSync(join(ROOT, 'scripts', 'cloud-setup-bootstrap.sh'), 'utf8');
    assert.match(bootstrap, /ai-foundation\/scripts\/cloud-setup\.sh/);
  });
});
