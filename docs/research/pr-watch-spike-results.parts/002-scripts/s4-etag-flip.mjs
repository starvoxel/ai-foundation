// Plan: AIF-012 (Task 002) - S4 throwaway: which PR events flip the ETag of the PR object, so a single
// conditional GET on pulls/{n} could gate the heavier calls. Throwaway AIF-test/ branch + PR, cleaned up.
import { gh, REPO } from './ghapi.mjs';
const P = `repos/${REPO}`;
const FILE = 'docs/research/pr-watch-spike-results.parts/002-scripts/_throwaway-s4b.txt';
const log = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = (path, extra) => {
  const r = gh(path, extra);
  if (r.status && r.status >= 400) throw new Error(`${path}: ${r.status} ${r.body.slice(0, 200)}`);
  return r;
};
const BR = 'AIF-test/s4b-etag-flip';
let pr = null;
try {
  const main = mk(`${P}/git/ref/heads/main`).json.object.sha;
  mk(`${P}/git/refs`, ['-f', `ref=refs/heads/${BR}`, '-f', `sha=${main}`]);
  mk(`${P}/contents/${FILE}`, [
    '--method',
    'PUT',
    '-f',
    'message=AIF-012 throwaway s4b',
    '-f',
    `content=${Buffer.from('a\nb\nc\n').toString('base64')}`,
    '-f',
    `branch=${BR}`,
  ]);
  pr = mk(`${P}/pulls`, [
    '-f',
    'title=AIF-012 S4b throwaway etag flip',
    '-f',
    `head=${BR}`,
    '-f',
    'base=main',
    '-f',
    'body=AIF-012 spike; will be closed',
    '-F',
    'draft=true',
  ]).json;
  const n = pr.number;
  const sha = pr.head.sha;
  let etag = null;
  const probe = (label) => {
    const r = gh(`${P}/pulls/${n}`, etag ? ['-H', `If-None-Match: ${etag}`] : []);
    const changed = r.status === 200;
    if (changed) etag = r.headers.etag;
    log({ event: label, prObject: r.status, flipped: changed });
  };
  probe('baseline');
  probe('no event (control)');
  await sleep(1500);
  mk(`${P}/pulls/${n}/comments`, [
    '-f',
    'body=inline throwaway',
    '-f',
    `commit_id=${sha}`,
    '-f',
    `path=${FILE}`,
    '-F',
    'line=2',
    '-f',
    'side=RIGHT',
  ]);
  probe('inline review comment');
  mk(`${P}/pulls/${n}/reviews`, ['-f', 'body=review throwaway', '-f', 'event=COMMENT']);
  probe('submitted review (COMMENT)');
  mk(`${P}/issues/${n}/comments`, ['-f', 'body=issue comment throwaway']);
  probe('issue comment');
  mk(`${P}/issues/${n}/labels`, ['-f', 'labels[]=stale']);
  probe('label added (stale)');
  mk(`${P}/issues/${n}/labels/stale`, ['--method', 'DELETE']);
  probe('label removed');
  const c = gh(`${P}/issues/comments`, ['--jq', '.[0].id']);
  void c;
  mk(`${P}/contents/${FILE}`, [
    '--method',
    'PUT',
    '-f',
    'message=AIF-012 throwaway s4b push',
    '-f',
    `content=${Buffer.from('a\nb\nc\nd\n').toString('base64')}`,
    '-f',
    `branch=${BR}`,
    '-f',
    `sha=${mk(`${P}/contents/${FILE}?ref=${BR}`).json.sha}`,
  ]);
  probe('new commit pushed to head');
} catch (e) {
  log({ error: String(e.message ?? e) });
} finally {
  if (pr)
    log({
      cleanup: 'close',
      status: gh(`${P}/pulls/${pr.number}`, ['--method', 'PATCH', '-f', 'state=closed']).status,
    });
  log({
    cleanup: 'delete branch',
    status: gh(`${P}/git/refs/heads/${BR}`, ['--method', 'DELETE']).status,
  });
}
