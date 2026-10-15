// Plan: AIF-012 (Task 002) - S4 throwaway: pagination behaviour on a large PR through `ai-git gh-api`.
// usage: node s4-pagination.mjs <pr-number>
import { gh, parse, REPO } from './ghapi.mjs';

const n = process.argv[2];
const pr = gh(`repos/${REPO}/pulls/${n}`).json;
console.log({
  pr: Number(n),
  commits: pr.commits,
  changed_files: pr.changed_files,
  comments: pr.comments,
  review_comments: pr.review_comments,
});

const rows = [];
for (const [label, p] of Object.entries({
  commits: `repos/${REPO}/pulls/${n}/commits`,
  files: `repos/${REPO}/pulls/${n}/files`,
  reviews: `repos/${REPO}/pulls/${n}/reviews`,
  'review comments': `repos/${REPO}/pulls/${n}/comments`,
  'issue comments': `repos/${REPO}/issues/${n}/comments`,
})) {
  const d = gh(p); // default page size
  const b = gh(`${p}?per_page=100`);
  rows.push({
    label,
    defaultPageItems: d.json?.length,
    defaultHasLink: Boolean(d.headers['link']),
    per100Items: b.json?.length,
    per100HasLink: Boolean(b.headers['link']),
    link: (b.headers['link'] ?? '')
      .replace(/https:\/\/api\.github\.com\/repositories\/\d+/g, '...')
      .slice(0, 120),
  });
}
console.table(rows);

// --paginate through the wrapper: shape of output with -i, and with --slurp.
const endpoint = `repos/${REPO}/pulls/${n}/comments?per_page=10`;
const pg = gh(endpoint, ['--paginate']);
const blocks = pg.body.split(/\r?\n(?=HTTP\/)/).length;
console.log({
  paginateWithI: {
    exit: pg.exit,
    firstStatus: pg.status,
    httpStatusLinesInOutput: (pg.body.match(/^HTTP\//gm) ?? []).length,
    bodyStartsWith: pg.body.slice(0, 60).replace(/\s+/g, ' '),
    blocks,
  },
});
const ps = gh(endpoint, ['--paginate', '--slurp']);
console.log({
  paginateSlurp: {
    exit: ps.exit,
    status: ps.status,
    httpStatusLinesInOutput: (ps.body.match(/^HTTP\//gm) ?? []).length,
    outerArrayPages: Array.isArray(ps.json) ? ps.json.length : null,
    pageSizes: Array.isArray(ps.json) ? ps.json.map((x) => x.length) : null,
    headersAreFromWhichPage: ps.headers['link']
      ? 'first page (has Link next)'
      : 'last or only page',
  },
});
void parse;
