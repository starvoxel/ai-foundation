// Plan: AIF-012 (Task 002) - S4/S6 throwaway: output shape of `ai-git gh-api --paginate` with -i / --slurp.
import { gh, REPO } from './ghapi.mjs';
const p = `repos/${REPO}/pulls/98/commits?per_page=10`;
for (const extra of [
  ['--paginate'],
  ['--paginate', '--slurp'],
  ['--paginate', '--jq', '.[].sha'],
]) {
  const r = gh(p, extra);
  console.log(
    JSON.stringify({
      extra,
      exit: r.exit,
      status: r.status,
      httpLines: (r.body.match(/^HTTP\//gm) ?? []).length,
      headerKeys: Object.keys(r.headers).length,
      starts: r.body.slice(0, 40),
      arrayJoins: (r.body.match(/\]\[/g) ?? []).length,
      outerPages: Array.isArray(r.json) ? r.json.length : null,
      pageSizes:
        Array.isArray(r.json) && Array.isArray(r.json[0]) ? r.json.map((x) => x.length) : null,
      lines: r.body.split('\n').filter(Boolean).length,
    }),
  );
}
