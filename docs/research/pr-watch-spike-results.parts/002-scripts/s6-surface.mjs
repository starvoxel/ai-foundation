// Plan: AIF-012 (Task 002) - S6 throwaway: what `ai-git gh-api` exposes to the caller today.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gh, REPO } from './ghapi.mjs';

const AI_GIT = fileURLToPath(new URL('../../../../bin/ai-git.js', import.meta.url));
const raw = (...a) => {
  const r = spawnSync(process.execPath, [AI_GIT, 'gh-api', ...a], { encoding: 'utf8' });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
};
const show = (label, r) =>
  console.log(
    label,
    JSON.stringify({
      exit: r.exit,
      stdoutHead: r.stdout.slice(0, 90).replace(/\s+/g, ' '),
      stderr: r.stderr.trim().slice(0, 160),
    }),
  );

const P = `repos/${REPO}`;
// without -i: no status or headers at all
show('200 no -i', raw(`${P}/pulls/98`, '--jq', '.number'));
show('404 no -i', raw(`${P}/pulls/99999`));
// with -i
const a = gh(`${P}/pulls/99999`);
console.log(
  '404 -i',
  JSON.stringify({
    exit: a.exit,
    status: a.status,
    body: a.body.slice(0, 120),
    stderr: a.stderr.trim().slice(0, 120),
  }),
);
const e = gh(`${P}/pulls/98`).headers.etag;
const c = gh(`${P}/pulls/98`, ['-H', `If-None-Match: ${e}`]);
console.log(
  '304 -i',
  JSON.stringify({
    exit: c.exit,
    status: c.status,
    bodyLen: c.body.length,
    etag: c.headers.etag === e,
    stderr: c.stderr.trim().slice(0, 120),
  }),
);
const w = gh(`${P}/pulls`, ['--method', 'POST', '-f', 'title=x']);
console.log(
  '422 -i',
  JSON.stringify({
    exit: w.exit,
    status: w.status,
    body: w.body.slice(0, 120),
    stderr: w.stderr.trim().slice(0, 120),
  }),
);
// unauthenticated-looking / non-repo path locally (the cloud proxy blocks these; local does not)
const u = gh('user', ['--jq', '.login']);
console.log(
  'non-repo path /user',
  JSON.stringify({ exit: u.exit, status: u.status, body: u.body.slice(0, 60) }),
);
// pagination without -i: concatenated arrays?
const pg = raw(`${P}/pulls/98/commits?per_page=10`, '--paginate');
console.log(
  'paginate no -i',
  JSON.stringify({
    exit: pg.exit,
    joins: (pg.stdout.match(/\]\[/g) ?? []).length,
    validJson: (() => {
      try {
        JSON.parse(pg.stdout);
        return true;
      } catch {
        return false;
      }
    })(),
    len: pg.stdout.length,
  }),
);
const sl = raw(`${P}/pulls/98/commits?per_page=10`, '--paginate', '--slurp');
const parsed = (() => {
  try {
    return JSON.parse(sl.stdout);
  } catch {
    return null;
  }
})();
console.log(
  'paginate --slurp no -i',
  JSON.stringify({ exit: sl.exit, pages: parsed?.length, sizes: parsed?.map((x) => x.length) }),
);
// --jq + -i: headers then jq output
const j = gh(`${P}/pulls/98`, ['--jq', '.number']);
console.log('-i + --jq', JSON.stringify({ status: j.status, bodyIsJq: j.body.trim() }));
// token in output? never
const all = JSON.stringify([a, c, w, u]);
console.log(
  'token echo check (length of token var not printed):',
  process.env.AI_GIT_TOKEN ? all.includes(process.env.AI_GIT_TOKEN) : 'token not in env',
);
