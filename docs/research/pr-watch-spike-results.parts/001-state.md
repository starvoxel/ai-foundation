# PR-watch spike results, part 001: state (S1, S2, S3)

> Plan: AIF-012 (Task 001). Part file; Task 008 consolidates it into `docs/research/pr-watch-spike-results.md`. Run 2026-10-06/07 (UTC dates in API data are 2026-10-07) against `starvoxel/ai-foundation`, bot identity `starvoxel-bot` through `ai-git gh-api`.

**Verdicts**

| ID  | Question                                       | Verdict                                                                                                                   |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| S1  | What state must persist between wakes?         | **Verified**: only edge events need a watermark; everything else derives from GitHub. Gaps listed below.                  |
| S2  | Can `check` be stateless via an opaque cursor? | **Verified**: lost, stale and tampered cursors handled; one residual limit (caller can blind only itself).                |
| S3  | Can "handled/escalated" live on the PR itself? | **Verified** for reaction, label, resolved thread, marker comment, commit status. **Refuted** for check runs (403).       |
|     | (sub-claim)                                    | **Unverified**: how each marker renders in the GitHub web UI, and whether self-written markers wake a subscribed session. |

Prototype code (throwaway, not production, not wired into any CLI): `001-prototypes/`. Raw output: `001-prototypes/real-run.json`.

---

## Principle fit

Target: no persistent state, no lock. Result: **zero files, zero locks, zero concurrency primitives.** The design needs one caller-held opaque string (S2) and, only if "handled" must survive a lost cursor, an optional PR-side marker (S3).

---

## S1: What state must persist between wakes?

### Method

1. Enumerate every field the AIF-010 PR 98 design persisted (head SHA, handled feedback IDs, quiet timer, blocker flag) plus the ones a digest needs, and classify each as derivable from GitHub on every check, derivable only as an edge (needs a watermark), or not derivable.
2. Write a stateless prototype (`state-digest.js` pure, `github-fetch.js` I/O): fetch, normalise, digest. Run it read-only against five real PRs of this repo: 98 (open, 11 reviews, 2 review comments, 2 threads), 105 (open), 88, 95, 107 (merged).

### Field classification

| Field                                        | Derivable from GitHub each check?                                                                                  | Source (calls)                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| PR state (open/closed/merged), draft         | Yes                                                                                                                | `pulls/{n}`                                           |
| Head SHA                                     | Yes                                                                                                                | `pulls/{n}`                                           |
| CI state for the current head                | Yes (level). Check runs + legacy commit status; classification is pure                                             | `commits/{sha}/check-runs`, `commits/{sha}/status`    |
| Mergeable / conflict                         | Yes, but lazy: first read can be `unknown` (below)                                                                 | `pulls/{n}` (`mergeable_state`)                       |
| Unresolved review threads                    | Yes (level, never needs a cursor)                                                                                  | GraphQL `reviewThreads.isResolved`                    |
| Review-comment thread "answered"             | Yes: last comment of the thread is from self                                                                       | `pulls/{n}/comments` (`in_reply_to_id`)               |
| Quiet time, last activity, last self comment | Yes: pure arithmetic on timestamps already fetched                                                                 | the three comment/review lists + check `completed_at` |
| New issue comment / review / review comment  | Edge only: derivable as "id above a watermark". The watermark is the only state                                    | lists above                                           |
| Handled issue comments and review bodies     | **Not derivable.** GitHub has no resolved state for them. Heuristic "newer than my last comment" over/under-counts | n/a                                                   |
| Escalated / blocker flag                     | **Not derivable.** It is the agent's decision, not a GitHub fact. Needs the caller, or a PR marker (S3)            | n/a                                                   |
| Comment edits and deletions                  | **Not derivable from an id watermark.** Edits change `updated_at`, not `id`; deletions vanish                      | n/a                                                   |
| Which agent role wrote a self-login item     | **Not derivable.** See finding F1                                                                                  | n/a                                                   |

### Result and evidence

Fetch per check (lists of at most 100 items, as in all five PRs): **6 REST requests + 1 GraphQL** (pulls, check-runs, status, reviews, review comments, issue comments, reviewThreads). 7 `ai-git gh-api` process calls; paginated lists add one request per extra 100 items.

| PR  | State  | Check runs | Reviews | Review comments | Issue comments | Threads (unresolved) | Level: checks / mergeable | Process calls | Wall (cold, warm) |
| --- | ------ | ---------- | ------- | --------------- | -------------- | -------------------- | ------------------------- | ------------- | ----------------- |
| 98  | open   | 3          | 11      | 2               | 0              | 2 (2)                | passing / dirty           | 7             | 19.7 s, 12.6 s    |
| 105 | open   | 3          | 1       | 0               | 1              | 0 (0)                | passing / behind          | 7             | 26.7 s, 6.3 s     |
| 88  | merged | 3          | 3       | 0               | 0              | 0 (0)                | passing / unknown         | 7             | 23.5 s, 4.8 s     |
| 95  | merged | 3          | 1       | 0               | 0              | 0 (0)                | passing / unknown         | 7             | 21.6 s, 5.0 s     |
| 107 | merged | 3          | 1       | 0               | 0              | 0 (0)                | passing / unknown         | 7             | 16.9 s, 4.9 s     |

"Cold" is the first full run, "warm" the repeat (`real-run.json` holds the warm run). Wall time is dominated by one process start plus secret resolution per `ai-git` call (about 0.7 to 3 s each); not isolated further here (S4/S6 own cost).

Prototype size: `state-digest.js` 250 lines (182 code), `github-fetch.js` 90 (55), 22 passing unit tests. Persisted files: 0. Locks: 0.

### Findings (what could not be derived, and surprises)

- **F1. The bot is both PR author and reviewer.** On PR 98 nine of eleven reviews, and on 88, 95, 105, 107 every review, are posted by `starvoxel-bot`, the same login that authored the PR (`author_association` MEMBER, `user.type` User, not Bot). So "self vs other" by login cannot separate the implementing agent from the review agent. A digest that excludes `selfLogin` silently drops all agent-review feedback (the prototype did this: PR 88's 3 reviews produced no events). An actor rule (S5) cannot rely on login alone for agent-to-agent feedback. **Open question for the plan.**
- **F2. `mergeable_state` is lazy.** PR 98 read `unknown` on the first pass and `dirty` on the next; merged PRs stay `unknown`. A check must treat `unknown` as "retry or ask again later", not as clean.
- **F3. Edits are invisible to an id watermark.** A human editing an earlier comment after the agent read it produces no new id.
- **F4. "Unanswered since my last comment" is a heuristic.** An agent that acts (pushes a fix) without commenting leaves the item looking unanswered; an agent that comments without acting looks answered.
- **F5. `rate_limit` is not a reliable meter.** Reading `rate_limit` before and after a check showed no change in `used` even though 7 calls were made (`restUsed: 0` in the earlier run); `X-Ratelimit-Used` response headers did move. Per-check API cost is S4's job (Task 002); only call counts are claimed here.

### Verdict: **Verified**

Of the four fields PR 98 persisted, head SHA, CI, quiet time and unresolved threads derive from GitHub on every check. "Handled feedback IDs" reduces to one watermark per feedback list (S2). The blocker/escalated flag is the one thing that is genuinely a decision and not a fact. Gaps F1 to F4 stand.

---

## S2: Cursor-in / cursor-out

### Method

`check(snapshot, cursor?) -> { digest, cursor }` with `decodeCursor` doing strict validation. Cursor = base64url JSON of 8 fields: `v` (1), head `sha`, PR state, CI state, `mergeable_state`, and three id watermarks (issue comment, review, review comment). Level state (CI, unresolved threads, mergeable) is always reported from GitHub; the cursor only gates edge events. Scenarios scripted two ways: 22 unit tests on fake GitHub payloads (`state-digest.test.js`), and `run-real.js` against the five real PRs.

Trust rules in the prototype: the digest carries ids, logins, counts and enums only, never comment bodies, titles or check-run names (check-run names are attacker-controllable free text; the digest reports the failing count and the caller fetches names itself if it needs them). Tests plant `IGNORE PREVIOUS INSTRUCTIONS` in comment and review bodies and in a failing check-run name and assert it never reaches the snapshot or digest. The cursor is caller input: schema-validated, length-capped at 400 characters, used only to compute that caller's own diff, never to build a request, path or command.

### Result: scenarios (real PRs, `real-run.json`)

| Scenario                                                | PR 98 events | PR 105 events | PR 88/95/107 events | Behaviour                                                                                |
| ------------------------------------------------------- | ------------ | ------------- | ------------------- | ---------------------------------------------------------------------------------------- |
| No cursor (**lost**)                                    | 8            | 5             | 4                   | Cursor status `lost`; every existing external item reported (over-report, never silence) |
| Round trip (cursor from previous call, nothing changed) | **0**        | **0**         | **0**               | Idempotent; status `ok`                                                                  |
| **Stale** (old head SHA, watermarks at 0)               | 5            | 2             | 1                   | Reports head change plus every item newer than the old watermarks                        |
| **Tampered high** (watermark above any existing id)     | 8            | 5             | 4                   | Detected as `ahead`, treated as lost; cannot hide feedback                               |
| **Garbage** (`not-a-cursor!!`)                          | 8            | 5             | 4                   | Status `invalid`, treated as lost                                                        |

Unit-test coverage beyond the real PRs: 13 malformed cursors (empty-object, extra key, string/negative/fractional id, bad SHA, `<script>` in `mergeable_state`, unknown state, wrong version, 401 characters, array, non-string) are all `invalid` and over-report; forged-low replays old events only (harmless); level state is reported regardless of cursor; the cursor stays under 400 characters even with `Number.MAX_SAFE_INTEGER` ids (typical length 174 to 191).

### Size and concepts

| Measure                | Value                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Code (pure module)     | 182 code lines (250 total) for normalise + classify + diff + cursor; I/O wrapper 55 code lines                        |
| Persisted concepts     | **0 on disk.** 1 caller-held opaque string (about 180 chars, 8 fields)                                                |
| Concurrency primitives | **0** (no lock, lease, revision file or timer). Two callers with the same cursor each get a correct, independent diff |

### Residual limits (honest)

1. **A caller can blind only itself.** A cursor forged to a watermark at or just below the true maximum (not above it) hides items at or below that id from that caller's diff (asserted in a unit test, labelled "documented limitation"). Level state is not hidden: unresolved threads and failing CI still show. This is not a trust-boundary break because the cursor only ever shapes the caller's own view. If it matters, a PR-side marker (S3) is the cross-check.
2. **`ahead` can be a false positive** if a newer comment was deleted (watermark legitimately above the new max). The fallback is over-report, which is safe.
3. **Cursor loss re-reports everything** once. Cheap on these PRs (4 to 8 events). On a PR with hundreds of historical comments it is noisy; the caller (or an S3 marker) should filter.
4. **Not tested:** concurrent callers on a real busy PR; edits (F3) are by design out of scope of an id watermark.

### Verdict: **Verified**

---

## S3: PR-as-state

### Method

Throwaway draft PR #113 on branch `AIF-test/state-spike-s3` (a push of this Task's branch; closed after the spike, no merge). Each mechanism was tried with the bot token through `ai-git gh-api`, recording HTTP status, token scopes (`X-OAuth-Scopes`), and rate cost (`X-Ratelimit-Used` delta; REST core vs GraphQL), then read back as a fresh session would. All endpoints are repo-scoped (`repos/{owner}/{repo}/...`) plus GraphQL queries naming this repo. Cleanup: the auto-created label was deleted; PR closed.

Token: `X-OAuth-Scopes: repo` (a classic PAT), core limit 5000/h, GraphQL 5000 points/h.

### Result

| Mechanism                                | Write                                                                 | Result                                            | Cost (observed)      | Read-back by a fresh session                                                                                                                            | Notes                                                                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Marker comment (hidden HTML comment)     | `POST issues/{n}/comments`, body starts `<!-- aif-watch:v1 {...} -->` | 201                                               | 1 REST               | Already in the issue-comment list the digest fetches: **0 extra calls**; filter by author == self                                                       | Editable in place (`PATCH issues/comments/{id}`, 200; `updated_at` moved). Needs author filter: anyone can post the same text                |
| Reaction on a comment                    | `POST issues/comments/{id}/reactions` (`eyes`)                        | 201                                               | 1 REST               | REST: 1 call per comment (N+1). GraphQL `reactionGroups.viewerHasReacted` for all comments: **1 query**. Comment-list rollup gives counts only, not who | Works on PR itself too (`issues/{n}/reactions`, 201). No `viewerHasReacted` on `IssueComment`, use `reactionGroups`                          |
| Label                                    | `POST issues/{n}/labels`                                              | 200                                               | 1 REST               | Free: `labels` is in the `pulls/{n}` payload                                                                                                            | **Auto-creates the label repo-wide** (grey `ededed`); deleted afterward with `DELETE labels/{name}` (succeeded). PR-level, not per-comment   |
| Resolve review thread                    | GraphQL `resolveReviewThread` (also `unresolveReviewThread`)          | 200, `resolvedBy: starvoxel-bot`                  | 1 GraphQL point each | Free: already `isResolved` in the thread query                                                                                                          | Bot can resolve its own PR's threads (`viewerCanResolve: true`). Applies to inline threads only, not issue comments or reviews               |
| Reply on a review thread                 | `POST pulls/{n}/comments/{id}/replies`                                | 201                                               | 1 REST               | Free from review-comment list (`in_reply_to_id`)                                                                                                        | Basis of the derivable "answered" signal in S1                                                                                               |
| Commit status                            | `POST statuses/{sha}` (`context=aif-watch/handled`)                   | 201                                               | 1 REST               | Free: returned by `commits/{sha}/status`                                                                                                                | **Scoped to a SHA**: a new push loses it. Also counts in the CI classification of S1, so a `pending`/`failure` marker would corrupt CI state |
| Check run                                | `POST check-runs`                                                     | **403 "You must authenticate via a GitHub App."** | 1 REST (counted)     | n/a                                                                                                                                                     | **Refuted** for a PAT                                                                                                                        |
| PR body marker                           | `PATCH pulls/{n}` (body ends with hidden comment)                     | 200                                               | 1 REST               | Free from `pulls/{n}`                                                                                                                                   | Rewrites the human-visible description; collision risk with human or template edits                                                          |
| Review with inline comment (thread root) | `POST pulls/{n}/reviews` (`event: COMMENT`)                           | 200                                               | 1 REST               | free                                                                                                                                                    | The PR author (bot) could review its own PR, confirming F1                                                                                   |

Rate cost: every REST write was one core request; every GraphQL query or mutation was one point. Rate numbers during the spike were polluted by a concurrent read run, so the claim is "1 request each", not a measured hourly budget. Secondary (content-creation) limits were not hit and not tested.

### Visibility and risks

- Visible by design (verified through the API): reactions list their user; labels and commit statuses are visible to anyone who can read the PR; resolved-by is recorded; a marker comment is a real comment with an author and timestamps.
- **Unverified** (no browser session): how each renders in the web UI. Expected, not observed: the hidden HTML comment is not rendered but appears in the comment's raw body and in the edit box; a label adds a timeline entry; a commit status appears in the merge box.
- **Unverified:** whether the bot's own marker, reaction, label or status events are delivered back to a subscribed cloud session as new PR activity (a possible self-wake loop). Needs a live subscription; belongs to the W-group human runs.
- **Spoofing:** markers, labels and statuses are writable by any collaborator with the right access. Trust only a marker whose author equals the watching login, and treat its content as data (the S2 validator applies). Because of F1, that login is shared with the review agent.
- **Token reach (relevant to S6, not claimed in full here):** the PAT scope is `repo` (every repo the bot can reach), and `ai-git gh-api` is a plain passthrough to `gh api`, so "repo-scoped only" is a convention in this spike, not something the tool or token enforces.

### Recommendation for the gate (informational)

Prefer mechanisms that cost no extra read: **resolved thread** and **reply** for inline feedback, **label** or **marker comment** for the PR-level escalated/blocked flag. Reaction is the only per-item marker for issue comments and reviews, readable in one GraphQL query. Avoid check runs (impossible), and avoid commit statuses (SHA-scoped, mixes with CI).

### Verdict: **Verified** (reaction, label, resolved thread, marker comment, commit status, PR body); **Refuted** (check run with PAT); UI rendering and self-wake **Unverified**.

---

## Open questions raised by this Task (not decided here)

1. **F1: shared bot identity for author and reviewers.** Does the actor rule (S5, Task 002) and the digest need a role marker (for example a trailer in the review body, or a distinct review identity) to tell the implementing agent from the review agent?
2. Should "escalated" live on the PR (label or marker comment) or only with the caller? S1 and S3 show it is possible but not derivable.
3. Does a self-written PR marker wake a subscribed session? Needs a human-run live subscription (group W).
4. Treat `mergeable_state: unknown` as "recheck" in the contract (F2).

## Reproduce

```bash
node --test docs/research/pr-watch-spike-results.parts/001-prototypes/state-digest.test.js
node docs/research/pr-watch-spike-results.parts/001-prototypes/run-real.js starvoxel-bot 98 105 88 95 107
```

The second command is read-only and costs about 35 `ai-git gh-api` calls.
