import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEMVER_PATTERN,
  KEBAB_CASE_PATTERN,
  parseYaml,
  getAgentFiles,
  getServerFolders,
} from '../../lib/test-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(ROOT, 'agents');
const SERVERS_DIR = join(ROOT, 'servers');

// ── Server schema validation ─────────────────────────────────────────────────

describe('server schemas', () => {
  const folders = getServerFolders(SERVERS_DIR);

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
        assert.ok(existsSync(yamlPath), `Expected ${folder}/${folder}.yaml to exist`);
      });

      before(() => {
        parsed = parseYaml(yamlPath);
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
          assert.ok(parsed[field] !== undefined, `Missing required field: ${field}`);
        }
      });

      it('name is kebab-case', () => {
        assert.match(parsed.name, KEBAB_CASE_PATTERN);
      });

      it('version is valid semver', () => {
        assert.match(parsed.version, SEMVER_PATTERN);
      });

      it('has at least one tool defined', () => {
        assert.ok(Array.isArray(parsed.tools) && parsed.tools.length > 0);
      });

      it('each tool has required fields', () => {
        if (!Array.isArray(parsed.tools)) return;
        for (const tool of parsed.tools) {
          assert.ok(tool.name, `Tool missing "name"`);
          assert.ok(tool.description, `Tool "${tool.name}" missing "description"`);
          assert.ok(Array.isArray(tool.inputs), `Tool "${tool.name}" missing "inputs"`);
          assert.ok(tool.outputs, `Tool "${tool.name}" missing "outputs"`);
        }
      });

      it('tool names are kebab-case', () => {
        if (!Array.isArray(parsed.tools)) return;
        for (const tool of parsed.tools) {
          assert.match(tool.name, KEBAB_CASE_PATTERN);
        }
      });
    });
  }
});

// ── Agent schema validation ──────────────────────────────────────────────────

describe('agent schemas', () => {
  const files = getAgentFiles(AGENTS_DIR);

  if (files.length === 0) {
    it('no agent definitions to validate yet (skipped)', () => {
      assert.ok(true);
    });
  }

  for (const file of files) {
    describe(file, () => {
      let parsed;

      before(() => {
        parsed = parseYaml(join(AGENTS_DIR, file));
      });

      it('parses as valid YAML', () => {
        assert.ok(parsed, 'YAML did not parse');
      });

      it('filename matches definition name', () => {
        const expected = file.replace('.yaml', '');
        assert.equal(parsed.name, expected);
      });

      it('has required top-level fields', () => {
        const required = ['name', 'version', 'domain', 'description', 'prompt', 'tools', 'approved_tools'];
        for (const field of required) {
          assert.ok(parsed[field] !== undefined, `Missing required field: ${field}`);
        }
      });

      it('name is kebab-case', () => {
        assert.match(parsed.name, KEBAB_CASE_PATTERN);
      });

      it('version is valid semver', () => {
        assert.match(parsed.version, SEMVER_PATTERN);
      });

      it('approved_tools is a subset of tools', () => {
        if (!Array.isArray(parsed.approved_tools) || !Array.isArray(parsed.tools)) return;
        const toolSet = new Set(parsed.tools);
        for (const approved of parsed.approved_tools) {
          assert.ok(toolSet.has(approved), `approved_tool "${approved}" not in tools`);
        }
      });
    });
  }
});
