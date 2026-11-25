/**
 * The environment variables `aif init` prints (CLOUD_ENV_VARS) and the README's
 * "Environment variables" table are two copies of one list; this keeps them in step both ways.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CLOUD_ENV_VARS } from '../../lib/cloud-setup-steps.js';

const ROOT = resolve(import.meta.dirname, '../..');

/** Variable names in the first column of the table under "#### Environment variables". */
function readmeEnvVarNames(readme) {
  const section = readme.split('#### Environment variables')[1]?.split(/^#{1,4} /m)[0] ?? '';
  return [...section.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]);
}

describe('cloud environment variables', () => {
  it('are the same names in lib/cloud-setup-steps.js and the README table', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const inReadme = readmeEnvVarNames(readme).sort();
    const inCode = CLOUD_ENV_VARS.map((v) => v.name).sort();
    assert.ok(inReadme.length > 0, 'README table not found');
    assert.deepEqual(inCode, inReadme);
  });
});
