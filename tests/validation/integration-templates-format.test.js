// ------------------------------
// integration-templates-format.test.js
//
// Author: Starvoxel AI Agent - 2026-11-26
//
// Copyright (c) StarVoxel. All rights reserved.
// ------------------------------

/**
 * `aif install -I` writes the workflow templates into projects that run their own formatter. A
 * template the formatter would rewrite reads as "modified locally" for ever, so each one must be
 * stable under both quote styles. The templates carry `{{AIF_SHA}}` placeholders, so they are
 * checked as rendered.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { format } from 'prettier';

const DIR = resolve(import.meta.dirname, '../../lib/integrations/assets');

describe('integration workflow templates', () => {
  for (const name of readdirSync(DIR).filter((file) => file.endsWith('.yml'))) {
    for (const singleQuote of [true, false]) {
      it(`${name} is formatter-stable with singleQuote ${singleQuote}`, async () => {
        const text = readFileSync(join(DIR, name), 'utf8')
          .replaceAll('{{AIF_SHA}}', 'a'.repeat(40))
          .replaceAll('{{AIF_VERSION}}', 'v1.0.0');
        const formatted = await format(text, { parser: 'yaml', singleQuote, printWidth: 100 });
        assert.equal(formatted, text);
      });
    }
  }
});
