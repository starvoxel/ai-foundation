// Plan: AIF-012 (Task 002) - throwaway spike helper, not shipped.
// Thin wrapper over `ai-git gh-api -i` that returns status, headers and body.
// The token never appears here: ai-git injects it (ADR 0005).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AI_GIT = fileURLToPath(new URL('../../../../bin/ai-git.js', import.meta.url));
export const REPO = 'starvoxel/ai-foundation';

/** Count of ai-git invocations made by this process (each is one `gh api` process). */
export let invocations = 0;

/**
 * Run `ai-git gh-api -i <path> ...extra`, parse the HTTP response.
 * @param {string} path
 * @param {string[]} [extra] more gh api flags, e.g. ['-H','If-None-Match: "x"']
 * @returns {{exit:number,status:number|null,headers:Record<string,string>,body:string,json:any,stderr:string}}
 */
export function gh(path, extra = []) {
  invocations++;
  const r = spawnSync(process.execPath, [AI_GIT, 'gh-api', '-i', path, ...extra], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return parse(r.stdout ?? '', r.status ?? -1, r.stderr ?? '');
}

/** Parse a `gh api -i` stdout blob. With --paginate several header blocks may appear. */
export function parse(out, exit, stderr = '') {
  const m = out.match(/^HTTP\/[\d.]+ (\d{3})/);
  const status = m ? Number(m[1]) : null;
  const idx = out.indexOf('\r\n\r\n') >= 0 ? out.indexOf('\r\n\r\n') : out.indexOf('\n\n');
  const head = idx >= 0 ? out.slice(0, idx) : out;
  const body = idx >= 0 ? out.slice(idx).replace(/^\r?\n\r?\n/, '') : '';
  const headers = {};
  for (const line of head.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* non-JSON body (304, error text) */
  }
  return { exit, status, headers, body, json, stderr };
}

/** Rate-limit snapshot from /rate_limit (this endpoint does not count against the limit). */
export function rate() {
  const r = gh('rate_limit');
  return r.json?.resources;
}
