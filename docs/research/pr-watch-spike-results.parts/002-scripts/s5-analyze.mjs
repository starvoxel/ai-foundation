// Plan: AIF-012 (Task 002) - S5 throwaway: tabulate the sample written by s5-sample.mjs and test candidate rules.
// usage: node s5-analyze.mjs <sample.json>
import { readFileSync } from 'node:fs';
const { prs, rows } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log({ prs, rows: rows.length });
const tally = (keyFn) => {
  const m = new Map();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) ?? 0) + 1);
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n}\t${k}`)
    .join('\n');
};
console.log('\ncount\tkind | login | type | association');
console.log(tally((r) => `${r.kind} | ${r.login} | ${r.type} | ${r.assoc}`));
console.log('\ncount\tPR author | type | assoc (PRs)');
const pm = new Map();
for (const r of rows) pm.set(r.pr, `${r.prAuthor} | ${r.prAuthorType} | ${r.prAuthorAssoc}`);
const t2 = new Map();
for (const v of pm.values()) t2.set(v, (t2.get(v) ?? 0) + 1);
console.log([...t2].map(([k, n]) => `${n}\t${k}`).join('\n'));
console.log('\nactors with bot-ish login but type User:', [
  ...new Set(rows.filter((r) => r.loginHasBotSuffix && r.type === 'User').map((r) => r.login)),
]);
console.log('performed via app:', [
  ...new Set(rows.filter((r) => r.performedViaApp).map((r) => r.performedViaApp)),
]);
console.log('null user rows:', rows.filter((r) => !r.login).length);
console.log(
  'review states:',
  Object.fromEntries(
    rows
      .filter((r) => r.kind === 'review')
      .reduce((m, r) => m.set(r.state, (m.get(r.state) ?? 0) + 1), new Map()),
  ),
);

// Candidate rules, evaluated against the sample. "permitted" = actor an agent may act on.
const rules = {
  'R1 assoc in {OWNER,MEMBER,COLLABORATOR}': (r) =>
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(r.assoc),
  'R2 R1 and type==User': (r) =>
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(r.assoc) && r.type === 'User',
  'R3 login in allowlist {jsmellie}': (r) => r.login === 'jsmellie',
};
const out = {};
for (const [name, fn] of Object.entries(rules)) {
  const permitted = new Set();
  const refused = new Set();
  for (const r of rows) (fn(r) ? permitted : refused).add(`${r.login}(${r.type},${r.assoc})`);
  out[name] = { permittedActors: [...permitted], refusedActors: [...refused] };
}
console.log(JSON.stringify(out, null, 1));
