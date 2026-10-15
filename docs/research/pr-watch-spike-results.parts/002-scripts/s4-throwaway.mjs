// Plan: AIF-012 (Task 002) - S4 throwaway: writes to GitHub ONLY on AIF-test/ branches and their PRs,
// then cleans up (closes PRs, deletes the branches). Observes mergeable_state transitions, ETag
// behaviour as CI progresses, and combined status vs check runs.
// usage: node s4-throwaway.mjs   (about 3-6 minutes, polls CI)
import { gh, REPO } from './ghapi.mjs';

const P = `repos/${REPO}`;
const log = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (s) => Buffer.from(s).toString('base64');
const FILE = 'docs/research/pr-watch-spike-results.parts/002-scripts/_throwaway-s4.txt';
const mk = (path, extra) => {
  const r = gh(path, extra);
  if (r.status && r.status >= 400) throw new Error(`${path}: ${r.status} ${r.body.slice(0, 200)}`);
  return r;
};

const created = { branches: [], prs: [] };
async function main() {
  const main = mk(`${P}/git/ref/heads/main`).json.object.sha;
  log({ step: 'main sha', sha: main.slice(0, 8) });
  const branch = (name, content) => {
    mk(`${P}/git/refs`, ['-f', `ref=refs/heads/${name}`, '-f', `sha=${main}`]);
    created.branches.push(name);
    mk(`${P}/contents/${FILE}`, [
      '--method',
      'PUT',
      '-f',
      `message=AIF-012 throwaway ${name}`,
      '-f',
      `content=${b64(content)}`,
      '-f',
      `branch=${name}`,
    ]);
  };
  branch('AIF-test/s4-base', 'base side\n');
  branch('AIF-test/s4-conflict', 'conflicting side\n');
  branch('AIF-test/s4-clean', 'clean side (unique file content)\n');
  // the "clean" branch must not collide with main: it adds a file that main lacks, and so does base/conflict;
  // base vs conflict add the same path with different content -> add/add conflict.

  const open = (head, base, draft, title) => {
    const r = mk(`${P}/pulls`, [
      '-f',
      `title=${title}`,
      '-f',
      `head=${head}`,
      '-f',
      `base=${base}`,
      '-f',
      'body=AIF-012 spike S4 throwaway; will be closed',
      '-F',
      `draft=${draft}`,
    ]);
    created.prs.push(r.json.number);
    return r.json.number;
  };

  // A: conflict PR (head -> base, both added the same path differently)
  const conflictPr = open(
    'AIF-test/s4-conflict',
    'AIF-test/s4-base',
    false,
    'AIF-012 S4 throwaway conflict',
  );
  // B: draft PR to main, then ready
  const cleanPr = open('AIF-test/s4-clean', 'main', true, 'AIF-012 S4 throwaway clean');
  log({ step: 'opened', conflictPr, cleanPr });

  // mergeable_state immediately after create and while it settles
  const trace = (n, label, tries = 8) => {
    const out = [];
    for (let i = 0; i < tries; i++) {
      const t0 = Date.now();
      const r = gh(`${P}/pulls/${n}`);
      out.push({
        i,
        status: r.status,
        mergeable: r.json?.mergeable,
        state: r.json?.mergeable_state,
        draft: r.json?.draft,
        remaining: r.headers['x-ratelimit-remaining'],
        ms: Date.now() - t0,
      });
      if (r.json?.mergeable !== null && r.json?.mergeable !== undefined) break;
    }
    log({ step: `mergeable trace ${label}`, out });
  };
  trace(conflictPr, 'conflict PR (immediately after create)');
  trace(cleanPr, 'draft clean PR (immediately after create)');

  // Poll the clean PR while CI runs: check-runs ETag vs PR ETag vs combined status ETag.
  const tag = {};
  const conds = (key, path) => {
    const r = gh(path, tag[key] ? ['-H', `If-None-Match: ${tag[key]}`] : []);
    if (r.status === 200) tag[key] = r.headers.etag;
    return r;
  };
  const sha = gh(`${P}/pulls/${cleanPr}`).json.head.sha;
  const rows = [];
  for (let i = 0; i < 40; i++) {
    const pr = conds('pr', `${P}/pulls/${cleanPr}`);
    const cr = conds('cr', `${P}/commits/${sha}/check-runs?per_page=100`);
    const st = conds('st', `${P}/commits/${sha}/status?per_page=100`);
    const crj = cr.status === 200 ? cr.json : null;
    rows.push({
      i,
      t: new Date().toISOString().slice(11, 19),
      pr: pr.status,
      checkRuns: cr.status,
      combined: st.status,
      runs: crj
        ? crj.check_runs.map((c) => `${c.name}:${c.conclusion ?? c.status}`).join(',')
        : '(304 unchanged)',
      remaining: st.headers['x-ratelimit-remaining'],
    });
    if (crj && crj.total_count > 0 && crj.check_runs.every((c) => c.status === 'completed')) break;
    await sleep(15000);
  }
  log({ step: 'CI poll (200 = changed, 304 = unchanged)', rows });

  const full = gh(`${P}/pulls/${cleanPr}`);
  const st = gh(`${P}/commits/${sha}/status`).json;
  const cr = gh(`${P}/commits/${sha}/check-runs`).json;
  log({
    step: 'after CI',
    draft: full.json.draft,
    mergeable: full.json.mergeable,
    mergeable_state: full.json.mergeable_state,
    combinedState: st.state,
    combinedTotal: st.total_count,
    checkRuns: cr.check_runs.map((c) => `${c.name}:${c.conclusion}`),
  });

  // mark ready: is that a PR-object change? (GraphQL is the documented path; REST PATCH cannot clear draft)
  // Comment: which ETags flip?
  const before = { pr: tag.pr, cr: tag.cr };
  const ic0 = conds('ic', `${P}/issues/${cleanPr}/comments?per_page=100`);
  mk(`${P}/issues/${cleanPr}/comments`, ['-f', 'body=AIF-012 spike S4 throwaway comment']);
  const prAfter = conds('pr', `${P}/pulls/${cleanPr}`);
  const crAfter = conds('cr', `${P}/commits/${sha}/check-runs?per_page=100`);
  const icAfter = conds('ic', `${P}/issues/${cleanPr}/comments?per_page=100`);
  log({
    step: 'after one issue comment',
    icFirst: ic0.status,
    prObject: prAfter.status,
    checkRuns: crAfter.status,
    issueComments: icAfter.status,
    prEtagChanged: before.pr !== tag.pr,
  });
  void sha;
}

async function cleanup() {
  for (const n of created.prs) {
    const r = gh(`${P}/pulls/${n}`, ['--method', 'PATCH', '-f', 'state=closed']);
    log({ cleanup: 'close PR', n, status: r.status });
  }
  for (const b of created.branches) {
    const r = gh(`${P}/git/refs/heads/${b}`, ['--method', 'DELETE']);
    log({ cleanup: 'delete branch', b, status: r.status });
  }
}

main()
  .catch((e) => log({ error: String(e.message ?? e) }))
  .finally(cleanup);
