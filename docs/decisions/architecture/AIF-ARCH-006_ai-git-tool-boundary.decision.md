# Decision Record: `ai-git` Tool Boundary — CLI Script vs. MCP Server

## Metadata

| Field | Value |
|---|---|
| Decision ID | AIF-ARCH-006 |
| Project | ai-foundation |
| Tier | A |
| Domain | architecture |
| Status | Approved |
| Author (Agent) | Architect |
| Approved By | Jeremy |
| Created | 2026-08-23 |
| Referenced By | — |
| References | AIF-ARCH-005 |
| Tags | mcp, ai-git, tooling, cross-harness, credentials |

> **Note:** This record is the follow-up audit item flagged in AIF-ARCH-005's Impact on Planning — whether `ai-git` (currently a CLI script invoked via the generic `shell` tool) should be rebuilt as an MCP server, applying the same reasoning framework used for the DAG tool. Unlike AIF-ARCH-005, this is not retrospective: `ai-git` remains exactly as implemented today (`bin/ai-git.js` + `lib/ai-git.js`) regardless of this record's outcome unless a human separately commissions the conversion work.

---

## Problem Statement

`ai-git` is the mandatory wrapper for every git and GitHub operation any agent performs — steering states "Never use `git` or `gh` directly" — and it is currently a Node CLI script invoked through the generic `shell` tool, not a declared, named tool in any agent's `tools` list. It also carries a credential-handling responsibility (`GH_TOKEN` and git author identity injection, with an explicit "never log or echo the token value" rule) that AIF-ARCH-005 flagged as exactly the kind of contract that might benefit from a typed tool boundary. AIF-ARCH-005 established MCP as the default pattern for cross-harness, deterministic, multi-agent tooling. The question: does that same reasoning actually transfer to `ai-git`, or does something about its design mean it doesn't?

---

## Constraints & Requirements

What was non-negotiable:
- Must continue to support the full git subcommand surface already in active use across this repo's skills — not just a fixed handful. `skill/worktree-management` alone already invokes `worktree add`, `worktree remove --force`, `worktree list`, `worktree prune`, `worktree unlock`, and `branch -d`; `skill/plan-lifecycle`/`skill/decision-brief` invoke plain commits; `steering/engineering/git-workflow-*.md` document `gh-pr-create`, `gh-pr-list`, `gh-pr-merge`, `gh-pr-view`, `gh-repo-view` as a non-exhaustive example set, explicitly "any `gh-<subcommand>`" and "any git subcommand" are supported today.
- Must never weaken the existing credential-injection guarantee: token values are only ever injected as environment variables (`GH_TOKEN`, or embedded once into a push/fetch remote URL) — never accepted as a logged CLI argument, never printed.
- Must remain invocable by every agent that currently uses it (Software-Engineer, Engineering-Manager, and any future agent following git-workflow steering), regardless of harness.

What was a preference but not a hard requirement:
- Apply AIF-ARCH-005's general guidance ("default to MCP for cross-harness deterministic tooling") consistently rather than special-casing `ai-git` without a stated reason either way.
- Reuse `skill/server-authoring`'s standard shape if conversion is warranted.

---

## Options Explored

### Option A: Status quo — remain a CLI script invoked via `shell`

**Summary**: No change. `ai-git` stays exactly as implemented: `bin/ai-git.js` (I/O — env resolution, `spawnSync` into `git`/`gh`) wrapping `lib/ai-git.js` (already-pure logic: `getIdentity`, `buildGitEnv`, `buildGhEnv`, `parseGhCommand`, `buildAuthUrl`, `injectAuthUrl`). Agents keep invoking it as `ai-git <anything>` through the `shell` tool they already hold for other purposes (running tests, other CLI work).
**Strengths**: Already supports the full, open-ended git subcommand surface with zero per-subcommand schema or maintenance burden — new git usage (e.g. a skill that starts needing `ai-git stash` next month) works today with no code change. Every agent that needs `ai-git` already holds `shell` for unrelated reasons (Software-Engineer, Engineering-Manager, Test-Engineer all declare `shell` independent of git needs), so there is no broad-grant to narrow — converting to a named MCP tool would not actually reduce any agent's effective tool-access surface. Credential handling is already correctly scoped (env-var injection only, `spawnSync` with `stdio: 'inherit'`, no token ever passed as a loggable argument) — the risk AIF-ARCH-005 flagged as a reason to reconsider is already mitigated by design, not by the invocation mechanism.
**Weaknesses**: No structured/typed response — a calling agent still has to interpret a raw process exit code plus `stdio: 'inherit'` output rather than a schema-validated success/error object. No `@server/tool` discoverability signal in an agent's YAML (its `tools` list just says `shell`, same as any other shell use).
**Verdict**: Chosen.

### Option B: Full typed MCP tool set — one tool per git/gh operation

**Summary**: Build `servers/ai-git/` per `skill/server-authoring`, exposing a distinct typed tool per operation actually in use — `git_commit`, `git_push`, `git_worktree_add`, `git_worktree_remove`, `git_worktree_list`, `git_worktree_prune`, `git_worktree_unlock`, `git_branch_delete`, `gh_pr_create`, `gh_pr_list`, `gh_pr_merge`, `gh_pr_view`, `gh_repo_view`, etc., each with a real input schema (branch name, path, flags as typed fields).
**Strengths**: The strongest typed contract of the three options — invalid input (a malformed path, a missing required flag) can be rejected by schema validation before a subprocess is ever spawned. Matches AIF-ARCH-005's `dag-validate`/`dag-compute-waves` pattern most closely.
**Weaknesses**: git's operation surface, as documented in Constraints above, is already open-ended and actively growing across this repo's own skills — this is the opposite shape from DAG's fixed two-operation surface that made Option B viable there. Every new git/gh usage a future skill needs would require a server code change, test additions, and a redeploy/reinstall cycle before it's usable — a materially slower path than the CLI's zero-maintenance passthrough, for a repo whose own steering already documents "any git subcommand" as supported by design, not as an oversight to close off.
**Verdict**: Not chosen — the operation surface this tool must cover is fundamentally unbounded, which is precisely the condition that made Option B work for DAG's two fixed operations and precisely the condition absent here.

### Option C: Single generic MCP tool wrapping the same passthrough (`git_exec(args)`, `gh_exec(args)`)

**Summary**: Move the exact same passthrough architecture behind an MCP boundary instead of a CLI: `servers/ai-git/logic.js` would be `lib/ai-git.js` almost unchanged; `index.js` would register `git_exec`/`gh_exec` tools each taking `args: string[]`, spawn the subprocess exactly as `bin/ai-git.js` does today, and return a structured `{ exitCode, stdout, stderr }` object instead of relying on process exit/`stdio: 'inherit'`.
**Strengths**: Preserves the passthrough flexibility Option B loses, while gaining a named, declarable `@ai-git/*` tool in an agent's YAML and a structured response object instead of raw exit-code interpretation. Reuses the already-written, already-tested pure logic in `lib/ai-git.js` nearly as-is.
**Weaknesses**: The input schema is still just `args: string[]` — almost none of MCP's typed-validation benefit actually materializes, since the tool still accepts an arbitrary argument array the same way `shell` does today. Does not narrow any agent's effective access (per Option A's strength, `shell` is already granted to every consumer for unrelated reasons) and does not reduce token-exposure risk beyond what Option A already provides (the mitigation in both cases is identical: never accept a token as a direct parameter, inject via env only). Adds real, ongoing cost — a server scaffold, three test layers, an SDK dependency, and an install/registration step — for a contract only marginally stronger than what exists today.
**Verdict**: Not chosen — the specific benefit MCP conversion would offer (typed, validated input) does not materialize for a tool whose whole design is deliberate passthrough; converting for the sake of consistency with AIF-ARCH-005 alone is not, on its own, a sufficient reason once the actual costs and benefits are compared.

---

## Decision

**Chosen approach**: Option A — keep `ai-git` as a CLI script invoked via `shell`. Explicitly not converted to MCP.

**Rationale**: AIF-ARCH-005's MCP-by-default guidance rests on three properties: the operation set is fixed and enumerable, the logic is deterministic in a way that benefits from schema-validated typed I/O, and converting narrows or clarifies what capability a consuming agent actually holds. `ai-git` fails the first property by design — its entire value is unconstrained passthrough of an open-ended git/gh surface that this repo's own skills are already actively expanding — which is exactly the condition that made Option B unworkable for DAG and remains unworkable here. It fails the third property incidentally, not by design: every current consumer already holds `shell` for other reasons, so there is no access-narrowing benefit available to capture, unlike a hypothetical agent that holds `shell` *only* for git operations. What would remain — a structured response object instead of an exit code — is real but marginal, and does not justify the server scaffold, SDK dependency, and install/registration cost against a script that already correctly isolates its credential-handling logic (`lib/ai-git.js` is already pure and already tested independently of the CLI I/O layer, satisfying the testability goal a conversion would otherwise be partly justified by). Applying AIF-ARCH-005's guidance faithfully means recognizing when its preconditions don't hold, not converting every cross-harness script to MCP by reflex.

**Trade-offs accepted**:
- `ai-git` remains discoverable only as "the agent has `shell`," not as a named `@ai-git/*` capability in an agent's `tools` list. Accepted because no agent's actual tool grant would narrow as a result of fixing this, per Option A's strength above.
- Error handling for `ai-git` invocations remains exit-code-and-stdout based rather than a structured response object. Accepted as a real but minor ergonomic gap, not a correctness or security gap — `lib/ai-git.js`'s credential-handling logic is already unit-testable in isolation, so the testability motivation for a conversion doesn't apply here the way it might for untested logic.

**Revisit trigger**: If `ai-git`'s operation surface stabilizes into a small, fixed, well-known set (unlikely given git's own breadth, but possible if this repo ever wraps only a narrow subset of git deliberately), or if a future agent needs `ai-git` capability *without* otherwise needing broad `shell` access (making the access-narrowing benefit real rather than moot), reopen this decision in favor of Option C first — it preserves passthrough flexibility at lower cost than Option B and would be the correct next option to evaluate, not B.

---

## Impact on Planning

- No Epic or Chunk Plan follows from this decision — it is a decision *not* to build something, so nothing changes in `bin/ai-git.js` or `lib/ai-git.js` as a result.
- Confirms, rather than expands, the general guidance recorded in AIF-ARCH-005: MCP-by-default applies specifically when the operation set is fixed/enumerable and callers benefit from typed validation — not to every cross-harness script uniformly. Future audits of other scripts (e.g. `aif index -d` and other `aif` CLI subcommands, noted as a smaller secondary instance in AIF-ARCH-005) should apply this same two-part test rather than assuming MCP conversion is the default outcome.
- If a future decision revisits this per the Revisit trigger above, it should start from Option C, not restart the full options-exploration from scratch — Option B remains rejected for a structural reason (unbounded operation surface) unlikely to change.

---

## Resolved Items

| # | Item | Resolution |
|---|---|---|
| 1 | Should `ai-git` become an MCP server, applying AIF-ARCH-005's default guidance? | No — its unbounded, deliberately-passthrough operation surface fails the precondition that made MCP the right fit for the DAG tool, and no consumer's effective access would narrow as a result of converting. |
| 2 | Does this decision generalize to other CLI-script tooling in this repo? | It generalizes the *test* to apply (fixed/enumerable operation set + typed-validation benefit + real access-narrowing benefit), not a blanket conclusion — each future case still needs to be checked against that test individually. |
| 3 | Under what condition should this be revisited? | If `ai-git`'s surface becomes fixed/small, or a future agent needs `ai-git` without otherwise needing broad `shell` — see Revisit trigger. |
