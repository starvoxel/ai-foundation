// Plan: AIF-012 (Task 002) - S5 throwaway: read-only. Owner type, token identity, collaborator
// permission and org-membership visibility for the actors seen in the sample.
// usage: node s5-org.mjs login1 login2 ...
import { gh, REPO } from './ghapi.mjs';

const owner = REPO.split('/')[0];
const repo = gh(`repos/${REPO}`).json;
console.log({
  ownerType: repo.owner.type,
  private: repo.private,
  forks: repo.forks_count,
  permissionsOfToken: repo.permissions,
});
const me = gh('user');
console.log({
  tokenUser: me.json?.login,
  type: me.json?.type,
  scopes: me.headers['x-oauth-scopes'],
});
const pub = gh(`orgs/${owner}/public_members?per_page=100`);
console.log({
  publicMembersStatus: pub.status,
  publicMembers: Array.isArray(pub.json) ? pub.json.map((u) => u.login) : pub.body.slice(0, 100),
});
const mem = gh(`orgs/${owner}/members?per_page=100`);
console.log({
  allMembersStatus: mem.status,
  members: Array.isArray(mem.json) ? mem.json.map((u) => u.login) : mem.body.slice(0, 100),
});
for (const l of process.argv.slice(2)) {
  const perm = gh(`${`repos/${REPO}`}/collaborators/${l}/permission`);
  const m = gh(`orgs/${owner}/memberships/${l}`);
  const pm = gh(`orgs/${owner}/public_members/${l}`);
  console.log({
    login: l,
    collaboratorPermission: perm.json?.permission ?? perm.status,
    orgMembership: m.json ? `${m.json.state}/${m.json.role}` : m.status,
    publicMember: pm.status === 204,
  });
}
