import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { transformAgent, transformSteering, getSkillFiles } from '../../lib/harnesses/kiro.js';
import { createTempRepo, destroyTempRepo } from '../helpers/fixture.js';
import YAML from 'yaml';

describe('integration: kiro adapter', () => {
  let repo;

  beforeEach(() => {
    repo = createTempRepo({
      agents: [
        {
          name: 'test-agent',
          version: '0.1.0',
          domain: 'engineering',
          description: 'Test agent.',
          prompt: 'You are a test agent.',
          tools: ['read', 'write', 'grep'],
          approved_tools: ['read', 'grep'],
          skills: ['skill/test-skill'],
        },
      ],
      skills: ['test-skill'],
      steering: { global: ['core.md'] },
    });
  });

  afterEach(() => {
    destroyTempRepo(repo);
  });

  it('transforms an agent YAML file to Kiro JSON format', () => {
    const agentYaml = readFileSync(join(repo, 'agents', 'test-agent.yaml'), 'utf8');
    const agent = YAML.parse(agentYaml);
    const result = transformAgent(agent);

    assert.equal(result.name, 'test-agent');
    assert.deepEqual(result.tools, ['read', 'write', 'grep']);
    assert.deepEqual(result.allowedTools, ['read', 'grep']);
    assert.ok(result.resources.includes('skill://.kiro/skills/test-skill/SKILL.md'));
  });

  it('transforms a steering file with empty file_patterns', () => {
    const steeringPath = join(repo, 'steering', 'global', 'core.md');
    // Rewrite with frontmatter for testing
    const content = '---\nname: "global-core"\nversion: "0.1.0"\ndescription: "Core rules."\nfile_patterns: []\n---\n# Core Rules\n- Rule 1\n';
    const result = transformSteering(content);

    assert.ok(result.includes('inclusion: always'));
    assert.ok(result.includes('# Core Rules'));
    assert.ok(!result.includes('file_patterns'));
  });

  it('gets skill files for a skill directory', () => {
    const files = getSkillFiles('test-skill', repo);
    assert.ok(files.length > 0);
    assert.ok(files.some(f => f.dest.includes('SKILL.md')));
  });
});
