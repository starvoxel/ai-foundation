import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const SERVERS_DIR = join(ROOT, 'servers');

// Full semver per semver.org: MAJOR.MINOR.PATCH[-prerelease][+build]
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getServerFolders() {
  if (!existsSync(SERVERS_DIR)) return [];
  return readdirSync(SERVERS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_template')
    .map(d => d.name);
}

function getAgentYamlFiles() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.yaml') && f !== '_template.yaml');
}

// ── Server schema validation ─────────────────────────────────────────────────

describe('server schemas', () => {
  const folders = getServerFolders();

  if (folders.length === 0) {
    it('no server definitions to validate yet (skipped)', () => {
      assert.ok(true);
    });
  }

  for (const folder of folders) {
    describe(folder, () => {
      let parsed;
      const yamlPath = join(SERVERS_DIR, folder, `${folder}.yaml`);

      it('has a correctly named .yaml file', () => {
        assert.ok(
          existsSync(yamlPath),
          `Expected ${folder}/${folder}.yaml to exist`
        );
      });

      before(() => {
        if (!existsSync(yamlPath)) return;
        const content = readFileSync(yamlPath, 'utf-8');
        parsed = YAML.parse(content);
      });

      it('parses as valid YAML', () => {
        assert.ok(parsed, 'YAML did not parse');
      });

      it('folder name matches definition name', () => {
        assert.equal(parsed.name, folder,
          `Folder "${folder}" does not match definition name "${parsed.name}"`);
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

// ── Agent schema validation ──────────────────────────────────────────────────

describe('agent schemas', () => {
  const files = getAgentYamlFiles();

  if (files.length === 0) {
    it('no agent definitions to validate yet (skipped)', () => {
      assert.ok(true);
    });
  }

  for (const file of files) {
    describe(file, () => {
      let parsed;

      before(() => {
        const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
        parsed = YAML.parse(content);
      });

      it('parses as valid YAML', () => {
        assert.ok(parsed, 'YAML did not parse');
      });

      it('filename matches definition name', () => {
        const expected = file.replace('.yaml', '');
        assert.equal(parsed.name, expected,
          `Filename "${expected}" does not match definition name "${parsed.name}"`);
      });

      it('has required top-level fields', () => {
        const required = ['name', 'version', 'domain', 'description', 'prompt', 'tools', 'approved_tools'];
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

      it('approved_tools is a subset of tools', () => {
        if (!Array.isArray(parsed.approved_tools)) return;
        if (!Array.isArray(parsed.tools)) return;

        const toolSet = new Set(parsed.tools);
        for (const approved of parsed.approved_tools) {
          assert.ok(
            toolSet.has(approved),
            `approved_tool "${approved}" is not in tools list`
          );
        }
      });
    });
  }
});
