import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CLOUD_ENV_VARS, formatCloudSetupSteps } from '../../lib/cloud-setup-steps.js';

const BOOTSTRAP = '#!/bin/bash\n# rev: 1\nset -euo pipefail\necho "$(pwd)"\n';
const base = { bootstrap: BOOTSTRAP, readmePath: '/opt/aif/README.md', bundlesInstalled: false };

describe('formatCloudSetupSteps', () => {
  it('prints the bootstrap flush left, line for line, so it can be pasted exactly', () => {
    const lines = formatCloudSetupSteps(base).split('\n');
    const start = lines.findIndex((l) => l.includes('start of script'));
    const end = lines.findIndex((l) => l.includes('end of script'));
    assert.deepEqual(lines.slice(start + 1, end), BOOTSTRAP.trimEnd().split('\n'));
    assert.equal(lines[start + 1], '#!/bin/bash');
  });

  it('lists every environment variable by name, with a placeholder, never a real value', () => {
    const text = formatCloudSetupSteps(base);
    for (const { name } of CLOUD_ENV_VARS) assert.ok(text.includes(`${name}=`), name);
    assert.match(text, /BWS_ACCESS_TOKEN=<machine-account token>/);
    assert.match(text, /BWS_PROJECT_ID=<project id>/);
  });

  it('tells the human to run the project-scope install when init did not', () => {
    const text = formatCloudSetupSteps(base);
    assert.match(text, /aif install --scope project -B engineering -H claude/);
  });

  it('only asks to commit .claude/ when init already installed the bundles', () => {
    const text = formatCloudSetupSteps({ ...base, bundlesInstalled: true });
    assert.match(text, /Commit the project-scope install in \.claude\//);
    assert.doesNotMatch(text, /aif install --scope project/);
  });

  it('mentions the AIF_AGENT override and points at the README for details', () => {
    const text = formatCloudSetupSteps(base);
    assert.match(text, /export AIF_AGENT=<name>/);
    assert.ok(text.includes('/opt/aif/README.md'));
  });

  it('ends with a single trailing newline', () => {
    const text = formatCloudSetupSteps(base);
    assert.ok(text.endsWith('\n'));
    assert.ok(!text.endsWith('\n\n'));
  });
});
