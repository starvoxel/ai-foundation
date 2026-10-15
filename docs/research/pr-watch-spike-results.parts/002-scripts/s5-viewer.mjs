// Plan: AIF-012 (Task 002) - S5 throwaway: READ-ONLY. Does author_association depend on who is looking?
// Same items fetched (a) with the bot token via ai-git and (b) anonymously (no Authorization header,
// no token involved). usage: node s5-viewer.mjs 98 102 103 105
import { gh, REPO } from './ghapi.mjs';

const anon = async (p) => {
  const r = await fetch(`https://api.github.com/${p}?per_page=100`, {
    headers: { 'user-agent': 'aif-012-spike', accept: 'application/vnd.github+json' },
  });
  return r.json();
};
const cells = new Map(); // login|type -> Map("authed/anon" -> count)
for (const n of process.argv.slice(2)) {
  for (const k of [`pulls/${n}/reviews`, `pulls/${n}/comments`, `issues/${n}/comments`]) {
    const a = gh(`repos/${REPO}/${k}?per_page=100`).json;
    const b = await anon(`repos/${REPO}/${k}`);
    if (!Array.isArray(a) || !Array.isArray(b)) {
      console.log('skip', n, k, Array.isArray(b) ? '' : b.message);
      continue;
    }
    const byId = new Map(b.map((x) => [x.id, x]));
    for (const x of a) {
      const y = byId.get(x.id);
      const key = `${x.user.login} (${x.user.type})`;
      const pair = `authed=${x.author_association} / anon=${y?.author_association ?? 'missing'}`;
      const m = cells.get(key) ?? new Map();
      m.set(pair, (m.get(pair) ?? 0) + 1);
      cells.set(key, m);
    }
  }
}
for (const [k, m] of cells) console.log(k, Object.fromEntries(m));
