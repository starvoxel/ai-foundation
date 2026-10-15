<!-- Plan: AIF-012 (Task 002). Part file; Task 008 consolidates into pr-watch-spike-results.md. -->

# Part 002 — GitHub data spikes S4, S5, S6

Run 2026-10-06/07 from a local desktop session (Windows, Git Bash) as the `starvoxel-bot` PAT through `ai-git gh-api`. Repo `starvoxel/ai-foundation` (organisation-owned, public). Scripts: `002-scripts/` (throwaway). GitHub writes were limited to throwaway PRs 111, 112 and 115 (`AIF-test/s4*` branches); all closed and the branches deleted.

Verdict key: **Verified** (observed here), **Refuted**, **Unverified** (not observed; labelled with what is needed).

## Summary of verdicts

| ID  | Item                                                        | Verdict                                                                               |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| S4a | Calls and rate cost per check                               | Verified (6 calls, 1 core unit each)                                                  |
| S4b | Conditional requests work through `ai-git gh-api`           | Verified (304, costs 0; exit code 1)                                                  |
| S4c | Check runs vs combined status                               | Verified: use check runs; combined status is useless here                             |
| S4d | `mergeable_state` behaviour                                 | Verified (lazy: `null`/`unknown` on a first read, settles on re-read)                 |
| S4e | Pagination on large PRs                                     | Verified (30 default, 100 max; `--paginate` quirks with `-i`)                         |
| S4f | Rate headroom for the bot PAT                               | Verified locally (5000/h core); cloud limits Unverified                               |
| S4g | What the cloud proxy blocks / conditional requests in cloud | **Unverified** (needs a cloud session, W7, human)                                     |
| S5a | Actor fields on real data                                   | Verified (sample: 106 PRs, 236 items)                                                 |
| S5b | `author_association` is viewer-dependent                    | Verified (changes the rule design)                                                    |
| S5c | Bot, `[bot]` apps, forks, read-only collaborators           | Partly: machine-user bot Verified; App bots, forks, read collaborators **Unverified** |
| S6  | Transport: `ai-git gh-api` is sufficient                    | Verified (with `-i`; no `ai-git` change required)                                     |

## S4 — API cost and limits

### Method

`s4-check-cost.mjs`, `s4-conditional.mjs`, `s4-pagination.mjs`, `s4-paginate-shape.mjs`, `s4-throwaway.mjs`, `s4-etag-flip.mjs`. Every call goes through `ai-git gh-api -i` so the response status and headers are visible. Rate cost is read from `X-RateLimit-Remaining` between consecutive calls.

### Calls per check

A full check of one PR is 6 REST calls, each costing 1 core unit (`headerCostPerCall = 1`):

| Call                                       | Needed for                        |
| ------------------------------------------ | --------------------------------- |
| `pulls/{n}`                                | state, draft, head SHA, mergeable |
| `commits/{sha}/check-runs?per_page=100`    | CI                                |
| `pulls/{n}/reviews?per_page=100`           | reviews                           |
| `pulls/{n}/comments?per_page=100`          | inline review comments            |
| `issues/{n}/comments?per_page=100`         | PR conversation comments          |
| `commits/{sha}/status` (do not use, below) | none                              |

Payload and latency, small PR (105: 11 files, 4-5 commits) vs large PR (98: 34 files, 45 commits, 11 reviews):

| Call            | 105 bytes | 98 bytes |
| --------------- | --------- | -------- |
| pull            | 17,774    | 20,318   |
| check-runs      | 10,708    | 10,738   |
| reviews         | 3,781     | 56,271   |
| review comments | 2         | 6,414    |

Latency per call 0.5 s to 3.2 s (median about 1 s); the high end coincided with a concurrent sampling run and includes `ai-git` plus `gh` process start. A full check is therefore roughly 4 to 15 s wall time if sequential.

### Conditional requests

`-H 'If-None-Match: <etag as received, weak prefix included>'` works through `ai-git gh-api`:

| Endpoint (PR 105)     | first | conditional | cost of the 304 | wrong ETag |
| --------------------- | ----- | ----------- | --------------- | ---------- |
| `pulls/{n}`           | 200   | 304         | 0               | 200        |
| `issues/{n}/comments` | 200   | 304         | 0               | 200        |
| `pulls/{n}/reviews`   | 200   | 304         | 0               | 200        |

- A 304 returns no body, still carries `ETag` and `X-RateLimit-*` headers (with `-i`), and costs **0** rate-limit units (remaining unchanged across repeated 304s).
- `gh` exits **1** on a 304 and prints `gh: HTTP 304` on stderr. A caller must treat exit 1 with status 304 as "unchanged", not as a failure. Without `-i` the status is invisible.
- `Cache-Control: private, max-age=60` is sent. The conditional request still hit GitHub (the rate counter proves it was not served by `gh`).

What flips which ETag (throwaway PRs 111, 112 and 115; each probe taken immediately after the event, so propagation lag cannot be fully excluded):

| Event                        | PR object `pulls/{n}` | check-runs for head SHA | issue comments |
| ---------------------------- | --------------------- | ----------------------- | -------------- |
| CI run starts or completes   | **no** (304)          | **yes** (200)           | n/a            |
| Issue comment posted         | yes                   | no                      | yes            |
| Inline review comment posted | yes                   | n/a                     | n/a            |
| Review submitted (COMMENT)   | **no** (304)          | n/a                     | n/a            |
| New commit pushed to head    | **no** (304)          | n/a (new SHA, new URL)  | n/a            |
| Label added / removed        | yes                   | n/a                     | n/a            |

Consequences: the PR object ETag is **not** a sufficient "anything changed" gate. CI needs its own conditional call on `check-runs`, reviews need `pulls/{n}/reviews`, and a new head SHA changes the check-runs URL itself, so the head SHA must be read from `pulls/{n}` (which returned fresh data via a 200 on the next full read). The two "no flip" results on review submission and on push are surprising; they were taken in the same second as the write. **Treat them as Unverified until repeated with a few seconds of delay** (cheap, throwaway PR; recommended before any design relies on a single gate).

Working cheap idle poll (all Verified individually): 4 conditional GETs (`pulls/{n}`, `check-runs`, `reviews`, `issues/{n}/comments`) plus `pulls/{n}/comments`, 5 calls, **0 units when nothing changed**, full 6-call re-read only on a 200.

### Check runs vs combined status

Commit status (`commits/{sha}/status`) returned `state: "pending"`, `total_count: 0` on every PR here, including after CI finished with all checks green. Cause: CI is GitHub Actions, which reports check runs, not commit statuses. Treating combined status as authoritative would show every PR pending forever. Use `check-runs` (paginate if `total_count` > 100). Observed conclusions: `success`, `skipped` (the Node matrix jobs on a docs-only change), `in_progress`. `skipped` must classify as pass or neutral.

### mergeable and mergeable_state

Observed values and when:

| Value                        | Seen on                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `mergeable: null`, `unknown` | first read of PR 105 after a push; first read of PR 98                                      |
| same PR, next read           | 105: `true` / `behind`; 98: `false` / `dirty` (stable on 3 more reads)                      |
| `dirty` / `false`            | throwaway add/add conflict PR, immediately                                                  |
| `blocked` / `true`           | draft PR while required checks pending                                                      |
| `clean` / `true`             | same draft PR after CI passed (REST does not report `draft` here; read the `draft` boolean) |

Rule: `mergeable === null` means "not computed yet", re-read once after a short delay; never treat it as a conflict or as clean.

### Pagination

Default page size is 30; `per_page=100` is the maximum. PR 98 needed 2 pages at the default for commits (45) and files (34); reviews (11) did not. At `per_page=100` every list fit in one call. `Link` appears only when more pages exist.

Behaviour through `ai-git gh-api` (all Verified):

| Invocation                    | Result                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `--paginate`                  | pages merged into one valid JSON array; no status or headers                  |
| `--paginate -i`               | a full header block precedes **each** page's body: not a single JSON document |
| `--paginate --slurp`          | one JSON array of page arrays (valid)                                         |
| `--paginate --slurp -i`       | headers spliced inside the array: **invalid JSON**                            |
| `--paginate --jq` / `-i --jq` | jq output (headers first with `-i`)                                           |

So the status and headers are only trustworthy for single requests; for lists, loop pages by hand (`per_page=100`, stop when fewer than 100 items return) or use `--paginate` without `-i` and accept losing headers. `--paginate` costs one unit per page.

### Rate headroom

The bot PAT: 5000 core units per hour (`X-RateLimit-Limit: 5000`, resource `core`), scope `repo`. `GET rate_limit` itself did not consume units. The PAT is shared by every agent and the sampling in this task: it dropped from 4974 to 4508 over the session (about 490 used, mostly this task's 330-call sampling). The PAT also reports `Github-Authentication-Token-Expiration` (2027-01-31): token expiry is an operational failure mode for any long-running watcher.

| Cadence, 1 PR, full 6-call re-read | units/hour | share of 5000 |
| ---------------------------------- | ---------- | ------------- |
| every 60 s                         | 360        | 7%            |
| every 30 s                         | 720        | 14%           |
| every 60 s, conditional (idle)     | about 0    | about 0%      |

With four concurrent PRs at 30 s and no conditional requests: 2880/h, 58% of the budget. Secondary limits (burst, concurrency) were not hit and not probed.

### S4g — Unverified (needs the human, cloud session)

`ai-git gh-api` against `repos/{owner}/{repo}/...` works locally including non-repo paths (`user` returned 200). `skill/pr-stewardship` documents that a cloud proxy blocks GraphQL and non-repo paths; not re-observed here. Needed from a cloud session (W7): rerun `s4-check-cost.mjs 105` and `s4-conditional.mjs 105` and report whether the proxy passes `If-None-Match`, returns 304, and exposes `X-RateLimit-*`.

## S5 — Permitted-actor rule on real data

### Method

Read-only `s5-sample.mjs` over all 106 PRs (state=all), all reviews, review comments and issue comments: 236 items. Only login, `user.type`, `author_association`, review state and body length were kept (no bodies persisted). `s5-viewer.mjs` fetched the same items authenticated and anonymously. `s5-org.mjs` queried org and collaborator permission.

### Actors seen

| Count | Kind                                     | Login                     | `user.type` | `author_association` (as the bot sees it) |
| ----- | ---------------------------------------- | ------------------------- | ----------- | ----------------------------------------- |
| 68    | review                                   | jsmellie                  | User        | MEMBER                                    |
| 80    | review comment                           | jsmellie                  | User        | MEMBER                                    |
| 8     | issue comment                            | jsmellie                  | User        | MEMBER                                    |
| 56    | review                                   | starvoxel-bot             | User        | MEMBER                                    |
| 14    | review comment                           | starvoxel-bot             | User        | MEMBER                                    |
| 3     | issue comment                            | starvoxel-bot             | User        | MEMBER                                    |
| 4     | review, review comment, 2 issue comments | jsmellie-test             | User        | NONE                                      |
| 3     | review, review comment, issue comment    | jsmellie-test-contributor | User        | NONE                                      |

PR authors: 25 starvoxel-bot (MEMBER), 11 jsmellie (MEMBER), 1 jsmellie-test-contributor (PR object says `FIRST_TIME_CONTRIBUTOR`, the same actor's comments say `NONE`). No `performed_via_github_app`, no `[bot]` login, no `user.type: Bot`, no null user, no dependabot, no github-actions comments in 236 items. Review states: COMMENTED 113, CHANGES_REQUESTED 7, APPROVED 5, DISMISSED 1.

### Findings

1. **The bot is `user.type: User`.** `starvoxel-bot` is a machine user, not an App. A `type !== 'Bot'` filter does not identify agent-authored content and admits the bot. Its reviews are by design the agent findings (Principal-Engineer findings are posted through the bot, per the Software-Engineer correction process), so they are both "permitted" and "agent output".
2. **`author_association` depends on the viewer (Verified).** Same items, 42 comparisons:

   | Actor                     | as seen by bot token (org member) | as seen anonymously |
   | ------------------------- | --------------------------------- | ------------------- |
   | starvoxel-bot             | MEMBER (24 items)                 | **NONE**            |
   | jsmellie (org admin)      | MEMBER (11)                       | **COLLABORATOR**    |
   | jsmellie-test             | NONE (4)                          | NONE                |
   | jsmellie-test-contributor | NONE (3)                          | NONE                |

   Org membership is private for both real actors (`orgs/{org}/public_members` is empty; `members` lists both). Private membership is exactly the case where the label changes with the viewer. A rule keyed on `author_association` therefore **wrongly escalates (or refuses) legitimate actors** whenever the watching token is not itself an org member, and its result in a cloud session (whose identity may differ) is Unverified.

3. **Authoritative alternative exists and works (Verified):** `GET repos/{o}/{r}/collaborators/{login}/permission` returned `admin` (jsmellie), `write` (bot), `read` (jsmellie-test-contributor). It is viewer-independent and works for private members. It needs push access on the caller (the bot has it) and costs 1 unit per distinct actor (cacheable by login for the session; 304-able).
4. **Over-permit risk, not observed (Unverified):** a read-only invited collaborator is reported `COLLABORATOR`, so `{OWNER, MEMBER, COLLABORATOR}` can permit a read-only user. No such actor exists here; needs a human to add one, or a documentation read (R).
5. **Self-feedback:** the bot passes any association rule. A watcher acting on "permitted" feedback will act on its own comments unless it excludes its own login (or the agent identity) explicitly.
6. **Adversarial text.** The only non-permitted actor content in this repo's history (PRs 102 and 103) is plain test text ("General PR comment from a rando"), not an injection attempt. The actor rule inspects actor fields only, so text content cannot influence it, but this data does not test injection. Not Verified beyond that.

### Rule comparison on the sample

| Rule                                                   | Permitted     | Refused                                  | Wrong on this data?                                   |
| ------------------------------------------------------ | ------------- | ---------------------------------------- | ----------------------------------------------------- |
| R1 association in {OWNER, MEMBER, COLLABORATOR}        | jsmellie, bot | jsmellie-test, jsmellie-test-contributor | No, but only as seen by a member token (finding 2)    |
| R2 R1 and `type == User`                               | same as R1    | same                                     | No difference; `type` adds nothing for a machine user |
| R3 login allowlist                                     | jsmellie      | bot, both test users                     | Refuses the bot's own legitimate findings             |
| R4 collaborator permission in {admin, maintain, write} | jsmellie, bot | both test users (`read`)                 | No                                                    |

### Recommended final rule

Permit an actor only when `collaborators/{login}/permission` is `admin`, `maintain` or `write`. Do not use `author_association` to permit; use it only as a free pre-filter to skip the permission call for `NONE` (still escalate rather than silently drop if the permission call fails: 403/404/error means "not permitted, escalate"). Always exclude the agent's own identity from "feedback to act on", but keep it visible as its own event class (the bot's reviews are the legitimate findings channel). Actors with `user.type == 'Bot'` (Apps) are never permitted to instruct; surface them as informational (CI bots), which is Unverified here because none exist in the data.

Where it lives: **in code**, as a pure function over fetched facts `{login, permission, selfLogin}`. A prose rule in agent instructions would depend on the model correctly interpreting a viewer-dependent label, which is the exact failure found here; the repo's prior test PRs show the rule is cheap to unit-test with fixed fixtures. Agent instructions should only say "act on digest items marked permitted".

## S6 — Transport

### What `ai-git gh-api` exposes today

From `bin/ai-git.js` (`runGh`): `ai-git gh-<x> args...` becomes `gh <x> args...` with `GH_TOKEN` injected, `stdio: 'inherit'`, exit code propagated. `ai-git gh-api` is therefore `gh api` verbatim; the token never reaches the caller (ADR 0005), only the child process environment. Verified behaviour:

| Aspect               | Observed                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Status code          | invisible by default; `-i` prints `HTTP/2.0 NNN` plus headers on stdout, including for errors                                          |
| Exit code            | 0 for 2xx; 1 for 304 and every 4xx (stderr `gh: <message> (HTTP n)`)                                                                   |
| Headers              | only with `-i`: `ETag`, `Link`, `X-RateLimit-*`, `Retry-After` (documented for throttling, not observed), token-expiry                 |
| Request headers      | `-H` works, including `If-None-Match`                                                                                                  |
| Methods and bodies   | `--method`, `-f`, `-F` work (PR create, contents PUT, comments, labels, refs DELETE all used here)                                     |
| Pagination           | `--paginate` (merged array without `-i`); see S4 table for the `-i` and `--slurp` interaction                                          |
| Filtering            | `--jq` works, also with `-i`                                                                                                           |
| Secrets re-exec path | with the token env var unset, the `bws run` wrapper path preserved `&`, `"`, spaces and `W/"..."` in args (Verified, Windows Git Bash) |
| Retry or backoff     | none                                                                                                                                   |
| Token in output      | not observed in the captured 404, 304, 422 and `user` responses (string search for the token value, not printed)                       |

### Gaps

1. Success and "unchanged" are not distinguished by exit code (304 exits 1). Caller must parse `-i` output.
2. Status and headers are only available through `-i`, and `-i` composes badly with `--paginate` and `--slurp` (S4).
3. No structured envelope; headers and body share stdout with a blank-line separator that a caller must parse.
4. No rate-limit awareness (no sleep on `Retry-After`/secondary limit).
5. Cloud proxy behaviour and path restrictions Unverified (S4g).

### Smallest change, if any (sketch only; not implemented)

None is required: a consumer can run `ai-git gh-api -i <single request>` and parse the header block (about 25 lines; `002-scripts/ghapi.mjs` does it), and loop pages itself. If the human wants the friction removed inside `ai-git`, the smallest addition is one new subcommand, not a change to `gh-api`:

- `ai-git gh-fetch <path> [--etag <v>]`: a thin I/O wrapper that runs `gh api -i <path> [-H If-None-Match: <v>]` through the existing `runGh` env injection, and a new pure `parseGhInclude(stdout)` in `lib/ai-git.js` returning `{ status, etag, link, rateRemaining, rateReset, retryAfter, body }`, printed as one JSON line, exit 0 for 2xx and 304, exit 1 otherwise.
- Size: about 40 lines plus unit tests for the pure parser; credentials stay inside `ai-git`; unaffected existing commands.
- Tradeoff: a second way to call GitHub next to `gh-api` (ADR 0005 keeps `ai-git` as an unconstrained passthrough CLI; this is an additive helper, not an MCP conversion). Recommend deferring until the placement gate (G3) shows a consumer that needs it.

## Open questions raised (not decided here)

1. **Rule key.** Adopt collaborator-permission as the actor rule (S5), and is a code-level pure function the home? Gate G2/G4 decision.
2. **Re-test the two no-flip results** (review submitted, commit pushed) with a delay before relying on any single PR-object gate for polling. Cheap; a throwaway PR.
3. **Cloud session run** of the S4/S5 scripts (S4g, and whether the cloud token sees `author_association` as MEMBER or NONE for the bot and the human). Human, W7.
4. **Read-only collaborator and App-bot data** (S5 finding 4): needs a human to add a read-only collaborator, or a documentation read; this repo has no such actors.
5. **Token expiry** (2027-01-31 on the bot PAT): operational note for any long-running watcher; out of scope here.
