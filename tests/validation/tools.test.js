import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseYaml,
  getAgentFiles,
  getAllServerToolNames,
  getServerToolMap,
} from '../../lib/test-helpers.js';
import { TOOLS } from '../../lib/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const AGENTS_DIR = join(ROOT, 'agents');
const SERVERS_DIR = join(ROOT, 'servers');

// Built-in harness tools — these are provided by the harness, not by custom servers
const BUILTIN_TOOLS = new Set(Object.values(TOOLS));

describe('tool availability', () => {
  describe('install script', () => {
    it('install.ps1 exists', () => {
      assert.ok(existsSync(join(ROOT, 'install.ps1')), 'install.ps1 not found in repo root');
    });
  });

  describe('agent tool references', () => {
    const agentFiles = getAgentFiles(AGENTS_DIR);
    const serverTools = getAllServerToolNames(SERVERS_DIR);
    const serverToolMap = getServerToolMap(SERVERS_DIR);

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
          parsed = parseYaml(join(AGENTS_DIR, file));
        });

        it('all tools are documented in a server definition', () => {
          if (!Array.isArray(parsed.tools)) return;
          if (serverTools.size === 0) return;

          const undocumented = parsed.tools.filter((t) => {
            if (BUILTIN_TOOLS.has(t)) return false;
            // @server/tool_name format — validate server owns this tool
            const match = t.match(/^@([^/]+)\/(.+)$/);
            if (match) {
              const [, serverName, toolName] = match;
              const serverDef = serverToolMap.get(serverName);
              return !serverDef || !serverDef.has(toolName);
            }
            return !serverTools.has(t);
          });
          assert.deepEqual(
            undocumented,
            [],
            `Tools not found in any server definition: ${undocumented.join(', ')}`,
          );
        });
      });
    }
  });
});
