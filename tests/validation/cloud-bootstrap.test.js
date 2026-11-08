/**
 * The Setup script that `aif init` prints and the README links to
 * (scripts/cloud-setup-bootstrap.sh) must hand over to scripts/cloud-setup.sh.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

describe('cloud Setup script bootstrap', () => {
  it('runs scripts/cloud-setup.sh from the global install', () => {
    const bootstrap = readFileSync(join(ROOT, 'scripts', 'cloud-setup-bootstrap.sh'), 'utf8');
    assert.match(bootstrap, /ai-foundation\/scripts\/cloud-setup\.sh/);
  });

  it('is linked from the README, which no longer carries a copy of it', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    assert.ok(readme.includes('(scripts/cloud-setup-bootstrap.sh)'));
    assert.ok(!readme.includes('npm install -g github:starvoxel/ai-foundation'));
  });
});
