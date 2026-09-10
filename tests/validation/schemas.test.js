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
        assert.equal(
          parsed.name,
          folder,
          `Folder "${folder}" does not match definition name "${parsed.name}"`,
        );
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

      it('tool names are kebab-case (hosted: self only — vendor tool names are dictated by the vendor)', () => {
        if (!Array.isArray(parsed.tools)) return;
        if (parsed.hosted === 'vendor') return;
        for (const tool of parsed.tools) {
          assert.match(tool.name, KEBAB_CASE_PATTERN);
        }
      });

      it('hosted, if present, is "self" or "vendor"', () => {
        if (parsed.hosted === undefined) return;
        assert.ok(
          ['self', 'vendor'].includes(parsed.hosted),
          `hosted must be "self" or "vendor", got "${parsed.hosted}"`,
        );
      });

      it('vendor-hosted servers have no local implementation files', () => {
        if (parsed.hosted !== 'vendor') return;
        const serverDir = join(SERVERS_DIR, folder);
        for (const forbidden of ['index.js', 'logic.js', 'package.json', 'tests']) {
          assert.ok(
            !existsSync(join(serverDir, forbidden)),
            `hosted: vendor server "${folder}" should not have ${forbidden} (vendor implements/runs this server, not us)`,
          );
        }
      });

      it('http transport has a literal url; vendor-hosted url is not a secret placeholder', () => {
        if (parsed.transport !== 'http') return;
        assert.ok(
          typeof parsed.url === 'string' && parsed.url.length > 0,
          `Server "${folder}" has transport: http but no url field`,
        );
        assert.ok(
          !/\$\{[A-Z0-9_]+\}/.test(parsed.url),
          `Server "${folder}" url should be a literal value, not a placeholder — urls are not secret`,
        );
      });

      it('headers, if present, never contain a literal secret-shaped value', () => {
        if (!parsed.headers) return;
        for (const [key, value] of Object.entries(parsed.headers)) {
          if (typeof value !== 'string') continue;
          const looksLikeBearerWithoutPlaceholder = /^Bearer\s+(?!\$\{)\S+/.test(value);
          assert.ok(
            !looksLikeBearerWithoutPlaceholder,
            `Server "${folder}" header "${key}" looks like a literal secret — use a \${ENV_VAR_NAME} placeholder instead`,
          );
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
        const required = [
          'name',
          'version',
          'domain',
          'description',
          'prompt',
          'tools',
          'approved_tools',
        ];
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

      it('blocked_commands is an array of strings when present', () => {
        if (parsed.blocked_commands === undefined) return;
        assert.ok(Array.isArray(parsed.blocked_commands), 'blocked_commands must be an array');
        for (const cmd of parsed.blocked_commands) {
          assert.equal(
            typeof cmd,
            'string',
            `blocked_commands entry must be a string, got: ${typeof cmd}`,
          );
        }
      });
    });
  }
});
