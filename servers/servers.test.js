import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVERS_DIR = __dirname;

// Full semver per semver.org: MAJOR.MINOR.PATCH[-prerelease][+build]
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function getServerFiles() {
  return readdirSync(SERVERS_DIR)
    .filter(f => f.endsWith('.yaml') && f !== '_template.yaml');
}

describe('server definitions', () => {
  const files = getServerFiles();

  if (files.length === 0) {
    it('no server definitions to validate yet (skipped)', () => {
      assert.ok(true);
    });
  }

  for (const file of files) {
    describe(file, () => {
      let parsed;

      before(() => {
        const content = readFileSync(join(SERVERS_DIR, file), 'utf-8');
        parsed = YAML.parse(content);
      });

      it('parses as valid YAML', () => {
        assert.ok(parsed, 'YAML did not parse');
      });

      it('has required top-level fields', () => {
        const required = ['name', 'version', 'protocol', 'transport', 'description'];
        for (const field of required) {
          assert.ok(
            parsed[field] !== undefined,
            `Missing required field: ${field}`
          );
        }
      });

      it('name is kebab-case', () => {
        assert.match(parsed.name, KEBAB_CASE_PATTERN,
          `name "${parsed.name}" is not kebab-case`);
      });

      it('version is valid semver', () => {
        assert.match(parsed.version, SEMVER_PATTERN,
          `version "${parsed.version}" is not valid semver`);
      });

      it('has at least one tool defined', () => {
        assert.ok(
          Array.isArray(parsed.tools) && parsed.tools.length > 0,
          'Must have at least one tool entry'
        );
      });

      it('each tool has required fields', () => {
        if (!Array.isArray(parsed.tools)) return;

        for (const tool of parsed.tools) {
          assert.ok(tool.name, `Tool missing "name" field`);
          assert.ok(tool.description, `Tool "${tool.name}" missing "description"`);
          assert.ok(
            Array.isArray(tool.inputs),
            `Tool "${tool.name}" missing "inputs" array`
          );
          assert.ok(tool.outputs, `Tool "${tool.name}" missing "outputs"`);
        }
      });

      it('tool names are kebab-case', () => {
        if (!Array.isArray(parsed.tools)) return;

        for (const tool of parsed.tools) {
          assert.match(tool.name, KEBAB_CASE_PATTERN,
            `Tool name "${tool.name}" is not kebab-case`);
        }
      });
    });
  }
});
