import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const SERVERS_DIR = join(ROOT, 'servers');

function getAgentYamlFiles() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.yaml') && f !== '_template.yaml');
}

function getServerYamlFiles() {
  if (!existsSync(SERVERS_DIR)) return [];
  return readdirSync(SERVERS_DIR)
    .filter(f => f.endsWith('.yaml') && f !== '_template.yaml');
}

function getAllServerToolNames() {
  const toolNames = new Set();
  for (const file of getServerYamlFiles()) {
    const content = readFileSync(join(SERVERS_DIR, file), 'utf-8');
    const parsed = YAML.parse(content);
    if (Array.isArray(parsed.tools)) {
      for (const tool of parsed.tools) {
        if (tool.name) toolNames.add(tool.name);
      }
    }
  }
  return toolNames;
}

describe('tool availability', () => {
  describe('install script', () => {
    it('install.ps1 exists', () => {
      assert.ok(
        existsSync(join(ROOT, 'install.ps1')),
        'install.ps1 not found in repo root'
      );
    });
  });

  describe('agent tool references', () => {
    const agentFiles = getAgentYamlFiles();
    const serverTools = getAllServerToolNames();

    if (agentFiles.length === 0) {
      it('no agent .yaml files to validate yet (skipped)', () => {
        assert.ok(true);
      });
      return;
    }

    for (const file of agentFiles) {
      describe(file, () => {
        let parsed;

        before(() => {
          const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
          parsed = YAML.parse(content);
        });

        it('has tools field', () => {
          assert.ok(
            Array.isArray(parsed.tools),
            `Agent ${file} missing "tools" array`
          );
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

        it('all tools are documented in a server definition', () => {
          if (!Array.isArray(parsed.tools)) return;
          if (serverTools.size === 0) return; // No servers defined yet

          const undocumented = parsed.tools.filter(t => !serverTools.has(t));
          assert.deepEqual(
            undocumented, [],
            `Tools not found in any server definition: ${undocumented.join(', ')}`
          );
        });
      });
    }
  });
});
