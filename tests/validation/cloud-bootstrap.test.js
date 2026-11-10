/**
 * The Setup script that `aif init` prints and the README links to
 * (scripts/cloud-setup-bootstrap.sh) must install ai-foundation in a way that works, and hand
 * over to scripts/cloud-setup.sh.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const bootstrap = () => readFileSync(join(ROOT, 'scripts', 'cloud-setup-bootstrap.sh'), 'utf8');
const commandLines = (text) =>
  text.split('\n').filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

describe('cloud Setup script bootstrap', () => {
  it('runs scripts/cloud-setup.sh from the global install (a command, not a comment)', () => {
    assert.ok(
      commandLines(bootstrap()).some((line) =>
        /^bash ".*\/ai-foundation\/scripts\/cloud-setup\.sh"$/.test(line),
      ),
    );
  });

  it('installs from the codeload tarball, never `npm install -g github:`', () => {
    // npm 10 links a global git dependency to its temporary clone, which it then partly deletes,
    // so scripts/ is missing afterwards. A tarball URL is extracted into a real directory.
    const install = commandLines(bootstrap()).filter((line) => line.startsWith('npm install -g'));
    assert.equal(install.length, 1);
    assert.match(
      install[0],
      /^npm install -g https:\/\/codeload\.github\.com\/[^/]+\/[^/]+\/tar\.gz\/\S+ /,
    );
    assert.match(install[0], /--ignore-scripts/);
    assert.doesNotMatch(bootstrap(), /npm install -g github:/);
  });

  it('is linked from the README, which carries none of its command lines', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    assert.ok(readme.includes('(scripts/cloud-setup-bootstrap.sh)'));
    for (const line of commandLines(bootstrap()).filter((l) => !l.startsWith('set '))) {
      assert.ok(!readme.includes(line), `README copies the bootstrap line: ${line}`);
    }
  });
});
