/**
 * Unit tests for lib/ai-git.js — pure logic for AI git identity and auth.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getIdentity,
  buildGitEnv,
  buildGhEnv,
  parseGhCommand,
  isGhCommand,
  needsPushAuth,
  buildAuthUrl,
  injectAuthUrl,
} from '../../lib/ai-git.js';

describe('unit: ai-git', () => {
  describe('getIdentity()', () => {
    it('extracts identity from complete config', () => {
      const config = {
        ai_identity: {
          git_author_name: 'Bot',
          git_author_email: 'bot@example.com',
          git_token_env: 'MY_TOKEN',
        },
      };
      const identity = getIdentity(config);
      assert.equal(identity.name, 'Bot');
      assert.equal(identity.email, 'bot@example.com');
      assert.equal(identity.tokenEnvName, 'MY_TOKEN');
    });

    it('returns defaults when ai_identity is missing', () => {
      const identity = getIdentity({});
      assert.equal(identity.name, 'AI Agent');
      assert.equal(identity.email, 'ai@localhost');
      assert.equal(identity.tokenEnvName, null);
    });

    it('returns defaults for partial ai_identity', () => {
      const config = { ai_identity: { git_author_name: 'Custom' } };
      const identity = getIdentity(config);
      assert.equal(identity.name, 'Custom');
      assert.equal(identity.email, 'ai@localhost');
      assert.equal(identity.tokenEnvName, null);
    });
  });

  describe('buildGitEnv()', () => {
    it('injects all four identity env vars', () => {
      const env = buildGitEnv({ name: 'Bot', email: 'bot@test.com' });
      assert.equal(env.GIT_AUTHOR_NAME, 'Bot');
      assert.equal(env.GIT_AUTHOR_EMAIL, 'bot@test.com');
      assert.equal(env.GIT_COMMITTER_NAME, 'Bot');
      assert.equal(env.GIT_COMMITTER_EMAIL, 'bot@test.com');
    });

    it('preserves base env vars', () => {
      const env = buildGitEnv({ name: 'Bot', email: 'bot@test.com' }, { PATH: '/usr/bin', HOME: '/home/user' });
      assert.equal(env.PATH, '/usr/bin');
      assert.equal(env.HOME, '/home/user');
      assert.equal(env.GIT_AUTHOR_NAME, 'Bot');
    });

    it('overrides existing git identity in base env', () => {
      const base = { GIT_AUTHOR_NAME: 'Old', GIT_AUTHOR_EMAIL: 'old@test.com' };
      const env = buildGitEnv({ name: 'New', email: 'new@test.com' }, base);
      assert.equal(env.GIT_AUTHOR_NAME, 'New');
      assert.equal(env.GIT_AUTHOR_EMAIL, 'new@test.com');
    });
  });

  describe('buildGhEnv()', () => {
    it('injects GH_TOKEN when token is provided', () => {
      const env = buildGhEnv('abc123', { PATH: '/usr/bin' });
      assert.equal(env.GH_TOKEN, 'abc123');
      assert.equal(env.PATH, '/usr/bin');
    });

    it('does not inject GH_TOKEN when token is null', () => {
      const env = buildGhEnv(null, { PATH: '/usr/bin' });
      assert.equal(env.GH_TOKEN, undefined);
      assert.equal(env.PATH, '/usr/bin');
    });

    it('does not inject GH_TOKEN when token is empty string', () => {
      const env = buildGhEnv('', { PATH: '/usr/bin' });
      assert.equal(env.GH_TOKEN, undefined);
    });
  });

  describe('parseGhCommand()', () => {
    it('parses gh-pr-create to ["pr", "create"]', () => {
      assert.deepEqual(parseGhCommand('gh-pr-create'), ['pr', 'create']);
    });

    it('parses gh-pr-list to ["pr", "list"]', () => {
      assert.deepEqual(parseGhCommand('gh-pr-list'), ['pr', 'list']);
    });

    it('parses gh-pr-merge to ["pr", "merge"]', () => {
      assert.deepEqual(parseGhCommand('gh-pr-merge'), ['pr', 'merge']);
    });

    it('parses gh-repo-view to ["repo", "view"]', () => {
      assert.deepEqual(parseGhCommand('gh-repo-view'), ['repo', 'view']);
    });

    it('parses single subcommand gh-auth to ["auth"]', () => {
      assert.deepEqual(parseGhCommand('gh-auth'), ['auth']);
    });
  });

  describe('isGhCommand()', () => {
    it('returns true for gh- prefixed commands', () => {
      assert.equal(isGhCommand('gh-pr-create'), true);
      assert.equal(isGhCommand('gh-repo-view'), true);
    });

    it('returns false for regular git commands', () => {
      assert.equal(isGhCommand('commit'), false);
      assert.equal(isGhCommand('push'), false);
      assert.equal(isGhCommand('status'), false);
    });
  });

  describe('needsPushAuth()', () => {
    it('returns true for push', () => {
      assert.equal(needsPushAuth('push'), true);
    });

    it('returns true for fetch', () => {
      assert.equal(needsPushAuth('fetch'), true);
    });

    it('returns false for commit', () => {
      assert.equal(needsPushAuth('commit'), false);
    });

    it('returns false for status', () => {
      assert.equal(needsPushAuth('status'), false);
    });

    it('returns false for worktree', () => {
      assert.equal(needsPushAuth('worktree'), false);
    });
  });

  describe('buildAuthUrl()', () => {
    it('builds authenticated URL from GitHub HTTPS remote', () => {
      const url = buildAuthUrl(
        'https://github.com/org/repo.git',
        'token123',
        'Bot Name'
      );
      assert.equal(url, 'https://bot-name:token123@github.com/org/repo.git');
    });

    it('handles username with multiple spaces', () => {
      const url = buildAuthUrl(
        'https://github.com/org/repo.git',
        'tok',
        'My AI Agent'
      );
      assert.equal(url, 'https://my-ai-agent:tok@github.com/org/repo.git');
    });

    it('returns null for SSH URLs', () => {
      const url = buildAuthUrl(
        'git@github.com:org/repo.git',
        'token123',
        'Bot'
      );
      assert.equal(url, null);
    });

    it('returns null for non-GitHub HTTPS URLs', () => {
      const url = buildAuthUrl(
        'https://gitlab.com/org/repo.git',
        'token123',
        'Bot'
      );
      assert.equal(url, null);
    });
  });

  describe('injectAuthUrl()', () => {
    it('replaces remote name with auth URL', () => {
      const result = injectAuthUrl(
        ['push', 'origin', 'main'],
        'https://bot:tok@github.com/org/repo.git'
      );
      assert.deepEqual(result, ['push', 'https://bot:tok@github.com/org/repo.git', 'main']);
    });

    it('inserts auth URL when no remote specified', () => {
      const result = injectAuthUrl(
        ['push'],
        'https://bot:tok@github.com/org/repo.git'
      );
      assert.deepEqual(result, ['push', 'https://bot:tok@github.com/org/repo.git']);
    });

    it('inserts auth URL when args start with flags', () => {
      const result = injectAuthUrl(
        ['push', '--force'],
        'https://bot:tok@github.com/org/repo.git'
      );
      assert.deepEqual(result, ['push', 'https://bot:tok@github.com/org/repo.git', '--force']);
    });

    it('does not modify args that already have an https URL', () => {
      const args = ['push', 'https://existing@github.com/org/repo.git', 'main'];
      const result = injectAuthUrl(args, 'https://bot:tok@github.com/org/repo.git');
      assert.deepEqual(result, args);
    });

    it('does not mutate the original args array', () => {
      const args = ['push', 'origin', 'main'];
      injectAuthUrl(args, 'https://bot:tok@github.com/org/repo.git');
      assert.deepEqual(args, ['push', 'origin', 'main']);
    });
  });
});
