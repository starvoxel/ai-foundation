#!/usr/bin/env node

/**
 * ai-git — Git operations with AI agent identity and authentication.
 *
 * A transparent wrapper around git and gh that automatically injects:
 * - AI author/committer identity from .aiconfig.json
 * - Authentication token from the configured env var
 *
 * Usage:
 *   ai-git <command> [args...]
 *
 * Git commands (identity injected):
 *   ai-git commit -m "message"
 *   ai-git push [remote] [branch]
 *   ai-git <any git subcommand>
 *
 * GitHub commands (GH_TOKEN injected):
 *   ai-git gh-pr-create [--title "..." --body "..."]
 *   ai-git gh-pr-list
 *   ai-git gh-<subcommand> [args...]
 *
 * All arguments after the command are passed through verbatim.
 *
 * Plan: AIF-008 (Task 001: re-exec argument transport and failure policy;
 * Task 002: the `ai-git doctor` I/O wrapper).
 *
 * Plan: docs/plans/ai-git-ssh-signing.md (milestone 2) — SSH commit signing.
 *
 * No Plan ID for the original body — small human-approved security bugfix (see chat approval
 * 2026-08-23) for the push/fetch auth-injection argument-order bug.
 */

import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  existsSync,
  statSync,
  accessSync,
  constants,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { resolve, join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  getIdentity,
  buildGitEnv,
  buildGhEnv,
  parseGhCommand,
  isGhCommand,
  needsPushAuth,
  findRemoteName,
  buildAuthConfigArgs,
  isDoctorCommand,
  buildDoctorReport,
  DOCTOR_TOOLS,
  DOCTOR_PROBE_ENV,
  buildDoctorProbeArgs,
  findUnsafeArg,
  makeIsExecutableFile,
  isOnPath,
  getSigningKeyEnvName,
  isSigningRequired,
  needsSigning,
  normalizePrivateKey,
  buildSigningConfigArgs,
  describeSigningFailure,
} from '../lib/ai-git.js';
import {
  getSecretsConfig,
  parseDotenv,
  resolvePlaceholders,
  isAlreadyWrapped,
  buildWrapperInvocation,
  REEXEC_GUARD_ENV,
  REEXEC_ARGS_ENV,
  REEXEC_ARGS_TOO_LARGE,
  encodeReexecArgs,
  decodeReexecArgs,
  describeTokenFailure,
} from '../lib/secrets.js';

const __filename = fileURLToPath(import.meta.url);

// --- Config resolution ---

/**
 * Walk up from cwd to find .aiconfig.json.
 * @returns {{ config: object, root: string } | null}
 */
function findAiConfig() {
  let dir = process.cwd();

  while (true) {
    const configPath = join(dir, '.aiconfig.json');
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf8');
        return { config: JSON.parse(content), root: dir };
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

// --- Command execution ---

/**
 * Write the signing key to a private temp file for git to read.
 * @param {string} keyText - Normalised private key
 * @returns {{ dir: string, path: string }}
 */
function writeTempKey(keyText) {
  // mkdtemp creates the directory 0700 on POSIX; the key file is 0600.
  const dir = mkdtempSync(join(tmpdir(), 'ai-git-sign-'));
  const path = join(dir, 'key');
  writeFileSync(path, keyText, { mode: 0o600 });
  return { dir, path };
}

/**
 * Prepare commit signing from the key env var: validate the key, check
 * ssh-keygen, write the temp key file. Never throws and never returns key
 * material in `cause`. Exactly one of `cause` (failure) or `path` + `dir`
 * (success) is set.
 * @param {string} keyEnvName
 * @param {string|null} priorCause - Why resolving the key already failed, if it did
 * @returns {{ cause: string|null, dir: string|null, path: string|null }}
 */
function prepareSigning(keyEnvName, priorCause) {
  const failed = (/** @type {string} */ cause) => ({ cause, dir: null, path: null });
  if (priorCause) return failed(priorCause);
  const raw = process.env[keyEnvName];
  if (!raw) return failed(`${keyEnvName} is not set`);
  if (!toolResolves('ssh-keygen')) return failed('ssh-keygen not found on PATH');
  let keyText;
  try {
    keyText = normalizePrivateKey(raw);
  } catch (err) {
    return failed(`${keyEnvName}: ${err.message}`);
  }
  try {
    return { cause: null, ...writeTempKey(keyText) };
  } catch (err) {
    return failed(`cannot write temporary signing key (${err.code ?? 'error'})`);
  }
}

/**
 * Run a git command with AI identity, optional push auth and optional
 * commit signing.
 * @param {string[]} args - Git arguments (e.g. ['commit', '-m', 'message'])
 * @param {{ name: string, email: string, tokenEnvName: string|null }} identity
 * @param {{ keyEnvName: string, required: boolean, cause: string|null }|null} [signing] - Set when this command creates commits and signing is configured
 * @returns {number} Exit code
 */
function runGit(args, identity, signing = null) {
  const env = buildGitEnv(identity, process.env);
  let finalArgs = args;

  // Inject authentication for push/fetch. This uses a transient
  // `-c http.<scope>.extraheader=...` config override rather than
  // embedding the token in the remote URL, so the token is never
  // echoed by git's own progress output ("To <url>" / "From <url>")
  // and is never written into .git/config. Because the override is
  // prepended before the subcommand, the caller's own args (remote
  // name, refspec, flags such as -u/--set-upstream) are passed through
  // completely unchanged — auth injection no longer depends on where
  // those flags appear.
  if (needsPushAuth(args[0])) {
    const token = identity.tokenEnvName ? process.env[identity.tokenEnvName] : null;
    if (token) {
      const remoteName = findRemoteName(args);
      const result = spawnSync('git', ['remote', 'get-url', remoteName], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (result.status === 0) {
        const remoteUrl = result.stdout.trim();
        const authConfigArgs = buildAuthConfigArgs(remoteUrl, token, identity.name);
        if (authConfigArgs.length > 0) {
          finalArgs = [...authConfigArgs, ...args];
        }
      }
    }
  }

  // Commit signing: transient `-c` overrides pointing at a temp key file
  // that is removed afterwards, so nothing is persisted in .git/config.
  let keyDir = null;
  if (signing) {
    const prepared = prepareSigning(signing.keyEnvName, signing.cause);
    if (prepared.path) {
      keyDir = prepared.dir;
      finalArgs = [...buildSigningConfigArgs(prepared.path), ...finalArgs];
    } else {
      const failure = describeSigningFailure(signing.required, signing.keyEnvName, prepared.cause);
      console.error(failure.message);
      if (failure.fatal) return 1;
    }
  }

  try {
    const result = spawnSync('git', finalArgs, {
      env,
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    return result.status ?? 1;
  } finally {
    if (keyDir) rmSync(keyDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/**
 * Run a gh CLI command with token injected.
 * @param {string} command - The gh- prefixed command name
 * @param {string[]} args - Additional arguments
 * @param {{ tokenEnvName: string|null }} identity
 * @returns {number} Exit code
 */
function runGh(command, args, identity) {
  const token = identity.tokenEnvName ? process.env[identity.tokenEnvName] : null;

  if (!token) {
    const envName = identity.tokenEnvName || 'AI_GIT_TOKEN';
    console.error(`ERROR: ${envName} environment variable is not set.`);
    console.error('Cannot execute GitHub operations without a token.');
    return 1;
  }

  const env = buildGhEnv(token, process.env);
  const ghArgs = [...parseGhCommand(command), ...args];

  const result = spawnSync('gh', ghArgs, {
    env,
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      console.error('ERROR: gh CLI is not installed.');
      console.error('Install from: https://cli.github.com/');
      return 1;
    }
    console.error(`ERROR: ${result.error.message}`);
    return 1;
  }

  return result.status ?? 1;
}

// --- doctor (Plan AIF-008, Task 002) ---

const DOCTOR_PROBE_SCRIPT = fileURLToPath(new URL('../lib/doctor-probe.js', import.meta.url));

/** @returns {boolean} whether the tool is a file on PATH (nothing is executed). */
function toolResolves(tool) {
  return isOnPath(tool, {
    pathVar: process.env.PATH ?? process.env.Path ?? '',
    delimiter,
    platform: process.platform,
    pathext: process.env.PATHEXT,
    exists: makeIsExecutableFile({
      statSync,
      accessSync,
      platform: process.platform,
      xOk: constants.X_OK,
    }),
    join,
  });
}

/**
 * Report tool presence, config found and token resolution (yes/no only;
 * never prints a token). Returns the process exit code.
 */
function runDoctor() {
  const tools = {};
  for (const t of DOCTOR_TOOLS) tools[t] = toolResolves(t);

  const found = findAiConfig();
  let tokenEnvName = null;
  let tokenSource = null;
  let unsetPlaceholder = null;
  let unsafeProbePath = null;
  if (found) {
    tokenEnvName = getIdentity(found.config).tokenEnvName;
    if (tokenEnvName) {
      const { run, allowInsecureDotenv } = getSecretsConfig(found.config);
      if (process.env[tokenEnvName]) {
        tokenSource = 'env';
      } else if (run) {
        try {
          const [cmd, ...rest] = run.map((p) => resolvePlaceholders(p, process.env));
          const probeArgs = buildDoctorProbeArgs(DOCTOR_PROBE_SCRIPT);
          unsafeProbePath = findUnsafeArg(probeArgs);
          if (!unsafeProbePath) {
            const r = spawnSync(cmd, [...rest, ...probeArgs], {
              env: { ...process.env, [DOCTOR_PROBE_ENV]: tokenEnvName },
              stdio: 'ignore',
            });
            if (!r.error && r.status === 0) tokenSource = 'wrapper';
          }
        } catch (err) {
          const m = /unset environment variable ([A-Z0-9_]+)/.exec(err.message);
          if (!m) throw err;
          unsetPlaceholder = m[1];
        }
      }
      if (!tokenSource && allowInsecureDotenv) {
        const dotenvPath = join(found.root, '.env');
        if (existsSync(dotenvPath) && parseDotenv(readFileSync(dotenvPath, 'utf8'))[tokenEnvName]) {
          tokenSource = 'dotenv';
        }
      }
    }
  }

  const { ok, lines } = buildDoctorReport({
    tools,
    configFound: Boolean(found),
    tokenEnvName,
    tokenSource,
    unsetPlaceholder,
    unsafeProbePath,
  });
  for (const line of lines) console.log(line);
  return ok ? 0 : 1;
}

// --- Main ---

function printUsage() {
  console.log(`ai-git — Git operations with AI agent identity

Usage:
  ai-git <command> [args...]

Git commands (identity + auth injected):
  ai-git commit -m "message"
  ai-git push [remote] [branch]
  ai-git tag <name>
  ai-git <any git subcommand>

GitHub commands (GH_TOKEN injected):
  ai-git gh-pr-create [--title "..." --body "..." --base main]
  ai-git gh-pr-list [--state open]
  ai-git gh-pr-merge <number> [--squash]
  ai-git gh-pr-view <number>
  ai-git gh-repo-view

Diagnostics:
  ai-git doctor   Report whether ai-git, gh, bws, .aiconfig.json and the token resolve

Configuration:
  Reads .aiconfig.json from the current directory or any parent.
  Uses ai_identity.git_author_name, ai_identity.git_author_email,
  and the token from the env var named in ai_identity.git_token_env.
`);
}

/**
 * If the configured AI_GIT_TOKEN-equivalent env var is missing, try to
 * resolve it before any git/gh operation runs: re-exec through
 * `secrets.run` (a provider-agnostic run-wrapper, e.g. `bws run
 * --project-id X --`) if configured, else load a gitignored `.env` if
 * `secrets.allow_insecure_dotenv` is explicitly true. Re-exec never
 * returns — it replaces this process with the wrapped child's exit code.
 * Mirrors runGit/runGh's existing discipline: the secret is never logged
 * or echoed, only passed via `stdio: 'inherit'` env injection.
 * Returns instead of reporting so each caller applies its own failure
 * policy (token: describeTokenFailure; signing key: describeSigningFailure).
 * @param {object} config - Parsed .aiconfig.json
 * @param {string} root - Project root (where .aiconfig.json was found)
 * @param {string|null} envName - Name of the env var to resolve
 * @returns {{ resolved: boolean, cause: string|null }}
 */
function resolveSecrets(config, root, envName) {
  if (!envName || process.env[envName]) return { resolved: true, cause: null };

  const { run, allowInsecureDotenv } = getSecretsConfig(config);
  let cause = null;

  if (run && !isAlreadyWrapped(process.env)) {
    // Bare "node" rather than process.execPath: some secrets-manager run
    // wrappers (confirmed with `bws run` on Windows) relay the wrapped
    // command through a shell without quoting, so an absolute path
    // containing spaces (e.g. "C:\Program Files\nodejs\node.exe") breaks.
    // node must already be resolvable on PATH here regardless, since
    // this script itself only runs via `node ...` or a PATH-based shim.
    //
    // The original arguments travel as JSON in REEXEC_ARGS_ENV, never in
    // argv: such wrappers join argv into one string and run it through a
    // shell, which would split, expand, or execute user arguments.
    try {
      const { command, args: wrapperArgs } = buildWrapperInvocation(
        run,
        'node',
        __filename,
        process.env,
      );
      const encodedArgs = encodeReexecArgs(process.argv.slice(2));
      const result = spawnSync(command, wrapperArgs, {
        env: { ...process.env, [REEXEC_GUARD_ENV]: '1', [REEXEC_ARGS_ENV]: encodedArgs },
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      if (result.error) {
        cause =
          'code' in result.error && result.error.code === 'ENOENT'
            ? `${command} not found on PATH`
            : `secrets.run failed to start: ${result.error.message}`;
      } else {
        process.exit(result.status ?? 1);
      }
    } catch (err) {
      // Unset placeholder variable (e.g. BWS_PROJECT_ID) or oversize args.
      if (err.code === REEXEC_ARGS_TOO_LARGE) {
        console.error(`ERROR: ${err.message}`);
        process.exit(1);
      }
      cause = `secrets.run ${err.message}`;
    }
  }

  if (allowInsecureDotenv) {
    const dotenvPath = join(root, '.env');
    if (existsSync(dotenvPath)) {
      console.error(
        `⚠ secrets.allow_insecure_dotenv is enabled — loading ${dotenvPath} in plaintext. Not for production use.`,
      );
      const parsed = parseDotenv(readFileSync(dotenvPath, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (!(key in process.env)) process.env[key] = value;
      }
    }
  }

  const resolved = Boolean(process.env[envName]);
  return { resolved, cause: resolved ? null : cause };
}

/**
 * Argv for this invocation. In a secrets-wrapper re-exec child the
 * original arguments arrive as JSON in REEXEC_ARGS_ENV (see
 * resolveSecrets); the variable is removed so git/gh don't inherit it.
 * @returns {string[]}
 */
function getEffectiveArgs() {
  const encoded = process.env[REEXEC_ARGS_ENV];
  if (!isAlreadyWrapped(process.env) || encoded === undefined) {
    return process.argv.slice(2);
  }
  delete process.env[REEXEC_ARGS_ENV];
  try {
    return decodeReexecArgs(encoded);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function main() {
  const args = getEffectiveArgs();

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  if (isDoctorCommand(args[0])) process.exit(runDoctor());

  // Find and load config
  const found = findAiConfig();
  if (!found) {
    console.error('ERROR: No .aiconfig.json found in current directory or any parent.');
    console.error('ai-git requires a project with ai_identity configured.');
    process.exit(1);
  }

  const identity = getIdentity(found.config);
  const command = args[0];
  const commandArgs = args.slice(1);

  // Only resolve secrets for operations that actually need them — every
  // other invocation (add, status, log, worktree, ...) must stay fast and
  // must not depend on a secrets backend being installed/reachable.
  if (isGhCommand(command) || needsPushAuth(command)) {
    const { resolved, cause } = resolveSecrets(found.config, found.root, identity.tokenEnvName);
    // Failure policy: gh-* stop; push/fetch warn and proceed. Names the
    // variable, never a value.
    if (!resolved) {
      const failure = describeTokenFailure(isGhCommand(command), identity.tokenEnvName, cause);
      console.error(failure.message);
      if (failure.fatal) process.exit(1);
    }
  }

  // Commit signing applies only when a key env var is configured and the
  // subcommand creates commits. The key normally arrives in the session
  // environment; only when it is missing is it fetched through secrets.run.
  let signing = null;
  const keyEnvName = getSigningKeyEnvName(found.config);
  if (keyEnvName && needsSigning(command)) {
    const { cause } = resolveSecrets(found.config, found.root, keyEnvName);
    signing = { keyEnvName, required: isSigningRequired(found.config), cause };
  }

  // Route to git or gh
  if (isGhCommand(command)) {
    process.exit(runGh(command, commandArgs, identity));
  } else {
    process.exit(runGit(args, identity, signing));
  }
}

main();
