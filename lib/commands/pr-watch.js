/**
 * pr-watch command — the deterministic half of `skill/pr-stewardship`.
 *
 * Plan: AIF-010 (Task 005, plan Q11).
 *
 *   aif pr-watch check <pr> [--repo o/r] [--human login] [--self login] [--consumer id] [--state-dir dir]
 *   aif pr-watch check --branch <name> [--base main] [same options]   (a branch with no PR)
 *   aif pr-watch ack <pr> --keys kind:id,kind:id [--repo o/r] [--consumer id] [--state-dir dir]
 *   aif pr-watch blocker <pr> [--repo o/r] [--consumer id] [--state-dir dir]
 *   aif pr-watch stop <pr> [--repo o/r] [--consumer id] [--state-dir dir]
 *   aif pr-watch classify --login L [--association A] [--type T] --pr-author P [--human H]
 *
 * Put positional values (the PR number) before flags: the CLI's flag parser
 * lets a flag consume the next bare word.
 *
 * `check` is the one entry point for every wake source: it re-reads the PR
 * itself through `ai-git gh-api` and prints one JSON digest on stdout and one
 * human line on stderr. `classify` exposes the actor rule for metadata that
 * arrives some other way (a wake notification), so both paths use the same
 * function. `--human` and `--self` come only from the caller's own message,
 * never from anything fetched.
 */

import { classifyActor } from '../pr-watch/actors.js';
import { runAck, runBlocker, runCheck, runStop } from '../pr-watch/engine.js';
import { isValidBranch, isValidRepo, makeGhApi, runAiGit } from '../pr-watch/github.js';
import { defaultConsumer, defaultStateDir, isValidConsumer } from '../pr-watch/store.js';

const USAGE =
  'Usage: aif pr-watch <check|ack|blocker|stop|classify> ... (see lib/commands/pr-watch.js)';

/**
 * Parse `owner/name` out of a GitHub remote URL (https or ssh form).
 * @param {string} url
 * @returns {string|null}
 */
export function parseRemoteRepo(url) {
  const m = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

/**
 * @param {Record<string, string|boolean>} args
 * @param {string} name
 * @returns {string|undefined}
 */
function str(args, name) {
  const v = args[name];
  return typeof v === 'string' ? v : undefined;
}

/**
 * @param {{ args: Record<string, string|boolean>, positional: string[] }} parsed
 * @param {string} cwd
 * @param {{runAiGit?: typeof runAiGit, now?: () => number}} [deps]
 * @returns {number} exit code
 */
export function runPrWatch(parsed, cwd, deps = {}) {
  const run = deps.runAiGit ?? runAiGit;
  const now = deps.now ?? Date.now;
  const [sub, prArg] = parsed.positional;
  const { args } = parsed;

  if (sub === 'classify') {
    const verdict = classifyActor(
      { login: str(args, 'login'), association: str(args, 'association'), type: str(args, 'type') },
      { prAuthor: str(args, 'pr-author'), human: str(args, 'human') },
    );
    console.log(JSON.stringify(verdict));
    return 0;
  }

  if (!['check', 'ack', 'blocker', 'stop'].includes(sub ?? '')) {
    console.error(USAGE);
    return 1;
  }

  /** @type {string|undefined} */
  let repo = str(args, 'repo');
  if (repo === undefined) {
    const r = run(['remote', 'get-url', 'origin']);
    repo = (r.status === 0 && parseRemoteRepo(r.stdout)) || undefined;
  }
  if (repo === undefined || !isValidRepo(repo)) {
    console.error('Cannot determine the repository: pass --repo owner/name');
    return 1;
  }

  const branch = str(args, 'branch');
  const pr = prArg === undefined ? undefined : Number(prArg);
  if (branch !== undefined) {
    if (!isValidBranch(branch)) {
      console.error('Invalid --branch');
      return 1;
    }
  } else if (pr === undefined || !Number.isInteger(pr) || pr < 1) {
    console.error('A positive integer PR number (or --branch) is required');
    return 1;
  }

  const consumer = str(args, 'consumer') ?? defaultConsumer(cwd);
  if (!isValidConsumer(consumer)) {
    console.error('Invalid --consumer (letters, digits, ".", "_", "-"; max 64)');
    return 1;
  }
  const base = str(args, 'base') ?? 'main';
  if (!isValidBranch(base)) {
    console.error('Invalid --base');
    return 1;
  }

  const deps2 = {
    ghApi: makeGhApi(run),
    stateDir: str(args, 'state-dir') ?? defaultStateDir(),
    consumer,
    now,
  };
  const target =
    branch !== undefined ? { repo, branch, base } : { repo, pr: /** @type {number} */ (pr) };

  try {
    if (sub === 'check') {
      const digest = runCheck(deps2, target, {
        human: str(args, 'human'),
        self: str(args, 'self'),
      });
      console.log(JSON.stringify(digest));
      console.error(digest.summary);
    } else if (sub === 'ack') {
      const keys = (str(args, 'keys') ?? '').split(',').filter(Boolean);
      console.log(JSON.stringify(runAck(deps2, target, keys)));
    } else if (sub === 'blocker') {
      runBlocker(deps2, target);
      console.log(JSON.stringify({ blocker_reported: true }));
    } else {
      runStop(deps2, target);
      console.log(JSON.stringify({ stopped: true }));
    }
  } catch (err) {
    console.error(`pr-watch: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  return 0;
}
