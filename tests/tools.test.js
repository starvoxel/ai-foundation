import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const AGENTS_DIR = join(ROOT, 'agents');
const SERVERS_DIR = join(ROOT, 'servers');

function getAgentTomlFiles() {
  if (!existsSync(AGENTS_DIR)) return [];
  return readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.toml') && f !== '_template.toml');
}

function getServerTomlFiles() {
  if (!existsSync(SERVERS_DIR)) return [];
  return readdirSync(SERVERS_DIR)
    .filter(f => f.endsWith('.toml') && f !== '_template.toml');
}

function getAllServerToolNames() {
  const toolNames = new Set();
  for (const file of getServerTomlFiles()) {
    const content = readFileSync(join(SERVERS_DIR, file), 'utf-8');
    const parsed = TOML.parse(content);
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
    const agentFiles = getAgentTomlFiles();
    const serverTools = getAllServerToolNames();

    if (agentFiles.length === 0) {
      it('no agent .toml files to validate yet (skipped)', () => {
        assert.ok(true);
      });
      return;
    }

    for (const file of agentFiles) {
      describe(file, () => {
        let parsed;

        before(() => {
          const content = readFileSync(join(AGENTS_DIR, file), 'utf-8');
          parsed = TOML.parse(content);
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
