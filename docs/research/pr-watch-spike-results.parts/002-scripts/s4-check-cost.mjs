// Plan: AIF-012 (Task 002) - S4 throwaway: calls and rate cost of one "check" on a PR.
// usage: node s4-check-cost.mjs <pr-number>
import { gh, REPO } from './ghapi.mjs';

const n = process.argv[2];
const rows = [];
const call = (label, path, extra) => {
  const t = Date.now();
  const r = gh(path, extra);
  rows.push({
    label,
    status: r.status,
    ms: Date.now() - t,
    bytes: r.body.length,
    link: r.headers['link'] ? 'yes' : '',
    remaining: r.headers['x-ratelimit-remaining'],
  });
  return r;
};

const pr = call('pull', `repos/${REPO}/pulls/${n}`).json;
const sha = pr.head.sha;
const cr = call('check-runs', `repos/${REPO}/commits/${sha}/check-runs?per_page=100`).json;
const st = call('combined status', `repos/${REPO}/commits/${sha}/status?per_page=100`).json;
const rv = call('reviews', `repos/${REPO}/pulls/${n}/reviews?per_page=100`).json;
const rc = call('review comments', `repos/${REPO}/pulls/${n}/comments?per_page=100`).json;
const ic = call('issue comments', `repos/${REPO}/issues/${n}/comments?per_page=100`).json;

console.table(rows);
console.log({
  pr: Number(n),
  state: pr.state,
  draft: pr.draft,
  mergeable: pr.mergeable,
  mergeable_state: pr.mergeable_state,
  changed_files: pr.changed_files,
  commits: pr.commits,
  checkRuns: cr.total_count,
  checkRunConclusions: Object.fromEntries(
    cr.check_runs.reduce(
      (m, c) => m.set(c.conclusion ?? c.status, (m.get(c.conclusion ?? c.status) ?? 0) + 1),
      new Map(),
    ),
  ),
  combinedState: st.state,
  combinedTotal: st.total_count,
  reviews: rv.length,
  reviewComments: rc.length,
  issueComments: ic.length,
  calls: rows.length,
  headerCostPerCall:
    (Number(rows[0].remaining) - Number(rows.at(-1).remaining)) / (rows.length - 1),
});
