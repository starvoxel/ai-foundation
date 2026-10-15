// Plan: AIF-012 (Task 002) - S5 throwaway: READ-ONLY sampling of actor fields across this repo's PRs.
// Writes only identity-shaped fields (login, type, association, state), never comment bodies, to the
// output file given as argv[2]. usage: node s5-sample.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { gh, REPO } from './ghapi.mjs';

/** Fetch every page of a list endpoint (per_page=100, stop on a short page). */
function all(path) {
  const rows = [];
  for (let page = 1; ; page++) {
    const r = gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (r.status !== 200 || !Array.isArray(r.json))
      throw new Error(`${path} p${page}: ${r.status}`);
    rows.push(...r.json);
    if (r.json.length < 100) return rows;
  }
}

const slim = (kind, pr, x) => ({
  kind,
  pr: pr.number,
  prAuthor: pr.user?.login,
  prAuthorType: pr.user?.type,
  prAuthorAssoc: pr.author_association,
  login: x.user?.login ?? null,
  type: x.user?.type ?? null,
  assoc: x.author_association,
  state: x.state ?? null,
  performedViaApp: x.performed_via_github_app?.slug ?? null,
  bodyLen: (x.body ?? '').length,
  // lets the analysis spot "login looks like a bot but type is User"
  loginHasBotSuffix: /\[bot\]$|-bot$/i.test(x.user?.login ?? ''),
});

const prs = all(`repos/${REPO}/pulls?state=all`);
const out = [];
for (const pr of prs) {
  for (const x of all(`repos/${REPO}/pulls/${pr.number}/reviews`)) out.push(slim('review', pr, x));
  for (const x of all(`repos/${REPO}/pulls/${pr.number}/comments`))
    out.push(slim('review_comment', pr, x));
  for (const x of all(`repos/${REPO}/issues/${pr.number}/comments`))
    out.push(slim('issue_comment', pr, x));
  process.stderr.write(`PR ${pr.number} done (${out.length} rows)\n`);
}
writeFileSync(process.argv[2], JSON.stringify({ prs: prs.length, rows: out }, null, 1));
