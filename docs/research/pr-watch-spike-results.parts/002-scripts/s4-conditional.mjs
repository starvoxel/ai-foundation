// Plan: AIF-012 (Task 002) - S4 throwaway: do conditional requests work through `ai-git gh-api`,
// and does a 304 cost rate limit? usage: node s4-conditional.mjs <pr-number>
import { gh, REPO } from './ghapi.mjs';

const n = process.argv[2];
const paths = {
  pull: `repos/${REPO}/pulls/${n}`,
  'issue comments': `repos/${REPO}/issues/${n}/comments?per_page=100`,
  reviews: `repos/${REPO}/pulls/${n}/reviews?per_page=100`,
};
const out = [];
for (const [label, p] of Object.entries(paths)) {
  const a = gh(p);
  const etag = a.headers['etag'];
  const remA = Number(a.headers['x-ratelimit-remaining']);
  // identical conditional request, ETag passed back verbatim (weak validator included)
  const b = gh(p, ['-H', `If-None-Match: ${etag}`]);
  const remB = Number(b.headers['x-ratelimit-remaining']);
  const c = gh(p, ['-H', `If-None-Match: ${etag}`]);
  const remC = Number(c.headers['x-ratelimit-remaining']);
  // wrong etag: must return 200
  const d = gh(p, ['-H', 'If-None-Match: W/"deadbeef"']);
  out.push({
    label,
    etagPresent: Boolean(etag),
    first: a.status,
    cond1: b.status,
    cond1Exit: b.exit,
    cond1BodyBytes: b.body.length,
    cond2: c.status,
    remainingFirst: remA,
    remainingCond1: remB,
    remainingCond2: remC,
    costOfFirst: 'baseline 1',
    costOf304_1: remA - remB,
    costOf304_2: remB - remC,
    wrongEtag: d.status,
    cacheControl: a.headers['cache-control'],
    lastModified: a.headers['last-modified'] ?? '',
  });
}
console.table(out);
