import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOOL_MAP,
  TARGETS,
  mapToolName,
  transformAgent,
  transformSteering,
  parseFrontmatter,
} from '../../lib/harnesses/claude.js';

describe('unit: claude adapter', () => {
  describe('TARGETS', () => {
    it('all paths are under .claude/', () => {
      for (const [key, value] of Object.entries(TARGETS)) {
        assert.ok(
          value.includes('.claude'),
          `TARGETS.${key} should be under .claude/, got ${value}`
        );
      }
    });
  });

  describe('TOOL_MAP', () => {
    it('maps to Claude Code PascalCase names', () => {
      assert.equal(TOOL_MAP['read'], 'Read');
      assert.equal(TOOL_MAP['write'], 'Write');
      assert.equal(TOOL_MAP['shell'], 'Bash');
      assert.equal(TOOL_MAP['web_search'], 'WebSearch');
      assert.equal(TOOL_MAP['web_fetch'], 'WebFetch');
      assert.equal(TOOL_MAP['grep'], 'Grep');
      assert.equal(TOOL_MAP['glob'], 'Glob');
      assert.equal(TOOL_MAP['code'], 'LSP');
      assert.equal(TOOL_MAP['subagent'], 'Agent');
    });
  });

  describe('mapToolName()', () => {
    it('maps generic names to Claude Code names', () => {
      assert.equal(mapToolName('read'), 'Read');
      assert.equal(mapToolName('shell'), 'Bash');
      assert.equal(mapToolName('code'), 'LSP');
    });

    it('passes through unknown names unchanged', () => {
      assert.equal(mapToolName('@git/git_status'), '@git/git_status');
      assert.equal(mapToolName('some-future-tool'), 'some-future-tool');
    });
  });

  describe('transformAgent()', () => {
    const agent = {
      name: 'architect',
      version: '0.1.0',
      domain: 'engineering',
      description: 'Technical decision-making agent.',
      prompt: 'You are the Architect agent.\n\nYour role is to evaluate options.',
      tools: ['read', 'write', 'web_search', 'shell', 'grep', 'glob'],
      approved_tools: ['read', 'grep', 'glob'],
      skills: ['skill/decision-record'],
    };

    it('produces markdown with YAML frontmatter', () => {
      const result = transformAgent(agent);
      assert.ok(result.startsWith('---\n'));
      assert.ok(result.includes('---\n\n'));
    });

    it('includes name and description in frontmatter', () => {
      const result = transformAgent(agent);
      assert.ok(result.includes('name: architect'));
      assert.ok(result.includes('description: Technical decision-making agent.'));
    });

    it('maps tools to Claude Code names as comma-separated string', () => {
      const result = transformAgent(agent);
      assert.ok(result.includes('tools: Read, Write, WebSearch, Bash, Grep, Glob'));
    });

    it('includes prompt as markdown body', () => {
      const result = transformAgent(agent);
      assert.ok(result.includes('You are the Architect agent.'));
      assert.ok(result.includes('Your role is to evaluate options.'));
    });

    it('handles agent with no tools', () => {
      const noTools = { ...agent, tools: [] };
      const result = transformAgent(noTools);
      assert.ok(result.includes('tools: ""'));
    });
  });

  describe('transformSteering()', () => {
    it('strips frontmatter for always-loaded rules (empty file_patterns)', () => {
      const input = '---\nname: "test"\nversion: "0.1.0"\nfile_patterns: []\n---\n# Rules\nContent here.\n';
      const result = transformSteering(input);
      assert.ok(!result.includes('---'));
      assert.ok(result.includes('# Rules'));
      assert.ok(result.includes('Content here.'));
    });

    it('emits paths frontmatter for conditional rules', () => {
      const input = '---\nname: "test"\nfile_patterns:\n  - "**/*.ts"\n  - "src/**"\n---\n# TS Rules\n';
      const result = transformSteering(input);
      assert.ok(result.includes('paths:'));
      assert.ok(result.includes('**/*.ts'));
      assert.ok(result.includes('src/**'));
      assert.ok(result.includes('# TS Rules'));
    });

    it('strips framework fields from output', () => {
      const input = '---\nname: "test"\nversion: "0.1.0"\ndescription: "Desc"\nfile_patterns:\n  - "**/*.ts"\n---\n# Body\n';
      const result = transformSteering(input);
      assert.ok(!result.includes('name:'));
      assert.ok(!result.includes('version:'));
      assert.ok(!result.includes('description:'));
      assert.ok(!result.includes('file_patterns:'));
    });

    it('passes through content with no frontmatter unchanged', () => {
      const input = '# No frontmatter\nJust rules.';
      const result = transformSteering(input);
      assert.equal(result, input);
    });
  });
});
