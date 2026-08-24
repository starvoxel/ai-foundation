# YouTrack Setup for DR Status Tracking — Issue-Type Exploration

> Research notes, not a Decision Record. Explores concrete YouTrack configuration for giving Decision Records an enforced `Status` field (Draft/Approved/Deferred) with permission-gated approval, following on from the chat thread that produced `youtrack-tracking-config-notes.md`. Written 2026-08-19, pending any decision to actually pursue this.

## Correction to prior notes

`youtrack-tracking-config-notes.md` Section 12 assumed YouTrack **Articles** could carry custom fields (`Decision ID`, `Tier`, `Domain`, `Status`, `Approved By`, etc. as real queryable fields on the Article entity). This is wrong — confirmed against the [Articles API reference](https://www.jetbrains.com/help/youtrack/devportal/resource-api-articles.html): Article's schema is fixed (`summary`, `content`, `project`, `parentArticle`/`childArticles`, `tags`, `visibility`, `attachments`, `comments`, `reporter`, `updatedBy`, timestamps). No custom fields, no workflow engine, no field-level permission gating. Only **Issues** get custom fields and workflow rules.

This note replaces Section 12's design with an Issue-based one, per the decision below.

## Decision inputs (from user)

- DR structured metadata (Status, Tier, Domain, etc.) lives on an **Issue**; the readable markdown body lives on a **linked Article**. Two entities per DR, linked.
- Target is **YouTrack Cloud, free tier** (up to 10 users, per [current JetBrains pricing](https://www.jetbrains.com/help/youtrack/server/custom-fields.html) — see open risk below).
- Approver group will be **more than one person** — set up as a real YouTrack group/role, not a single hardcoded user.

## Open risk to verify before committing time to setup

Secondary sources (not JetBrains-official) claim the Cloud Free plan has some restriction on "custom fields" as an "advanced functionality." This wasn't confirmed against JetBrains' own docs and may be inaccurate, may refer to a field-count cap, or may refer to something unrelated (e.g. AI-assisted features). **Verify directly in a real free-tier instance** — create one custom enum field and one JS workflow rule — before designing further. If the free tier genuinely blocks workflow rules, the entire permission-gating value proposition (Section 11 of the prior notes) collapses and this approach needs to be reconsidered.

## Two structural options (both viable, low-cost to switch between later)

Because `Type` and `project` are both just filter dimensions in YouTrack queries and the REST API, moving DR issues from "own project" to "own Type within an existing project" later is a bulk re-file + field remap, not a rebuild. Pick either now without much lock-in risk.

### Option A: Dedicated project (e.g. `AIF-DR`)

- Own permission scheme, independent of whatever project(s) track chunk/epic work.
- Own field scheme (no conditional-visibility rules needed — every issue in the project is a DR).
- Queryable as `project: AIF-DR` in any saved search or `GET /api/issues?query=project:AIF-DR`.
- Cleaner separation of "source of truth for decisions" from "day-to-day work tracking," matching the instinct that prompted this exploration.

### Option B: Shared project, `Type = Decision Record`

- Less initial setup (no new project/permission-scheme to stand up).
- Requires YouTrack's **conditional custom fields** feature (show `Status`/`Tier`/`Domain` only when `Type = Decision Record`) to keep DR fields from cluttering other issue types.
- Permission gating on the `Approved` transition must be scoped inside the workflow rule (`if (issue.type == 'Decision Record') { guard on Status transition }`) rather than inherited from project-level permissions — one more condition to get right and keep right as the project evolves.

**Recommendation carried over from chat:** Option A, because the permission-scheme boundary is the one part of this that isn't purely cosmetic — it's what actually prevents the agent's own token from ever being in the approver group. Everything else (fields, queries) is equally cheap in either option.

## Concrete config (applies to either option, Issue-side)

### Custom fields — mirrors the DR Metadata table exactly

| DR Metadata field | YouTrack field | Type |
|---|---|---|
| Decision ID | `idReadable` (built-in) or a `Decision ID` string field if the project's own ID scheme (`AIF-###`) must be preserved verbatim | string / built-in |
| Project | `project` (built-in) | built-in |
| Tier | `Tier` | enum: `A`, `B`, `C` |
| Domain | `Domain` | enum, values per `AIF-META-001`'s domain list |
| Status | `Status` | enum: `Draft`, `Approved`, `Deferred` |
| Author (Agent) | `Author Agent` | string or enum (Architect, Tech-Lead, Engineering-Manager, ...) |
| Approved By | `Approved By` | user field |
| Created | `created` (built-in) | built-in |
| Referenced By / References | Issue link type, not a field (see below) | link |
| Supersedes | Issue link type, not a field (see below) | link |

### Link types

- `references` / `referenced by` — directional link type between DR issues, replacing the free-text `References`/`Referenced By` table cells. Closes the same gap AIF-002-014 already identified for the git-file format.
- `supersedes` / `superseded by` — directional link type, same rationale.
- `documented in` — link from the DR Issue to its paired Article (Option: use YouTrack's existing "Issue → linked Article" relation if Cloud exposes one natively; otherwise a generic link type pointed at the Article's URL in a text field).

### Workflow rule (JS) — the actual gate

- Guard condition on `Status` field change: transition to `Approved` is blocked unless `context.currentUser` is a member of the `DR Approvers` group.
- `Approved By` field itself: on-change guard restricted the same way, so an agent's service account can set every other field but never write its own name (or any name) into `Approved By`.
- Agent service account is explicitly **excluded** from the `DR Approvers` group — this is the enforcement boundary, mirroring the `ai-git` identity separation pattern already used for git.

### Permission scheme

- `DR Approvers` group: created fresh (not reusing an existing role), members = you + whoever else should hold approval authority. Add members here rather than hardcoding a single user in the workflow rule, so growing the approver set later doesn't require touching the rule script.
- Agent service account: separate YouTrack user/token, granted create/edit on the DR project(s) but not added to `DR Approvers`.

### API/automation plumbing

- Dedicated YouTrack service account + permanent API token for agents (env var, never logged — same rule as `AI_GIT_TOKEN`).
- `aif index -d` / `lib/decisions.js`'s io layer (per the pure/io split already built for AIF-002-014) swaps its file-crawl for a REST call: `GET /api/issues?query=project:AIF-DR&fields=idReadable,customFields(name,value),links(...)`. Pure functions (`parseDecisionRecord`, `buildDecisionIndex`, `diffDecisionIndex`) are unchanged.
- `index.json` stays the committed, offline discovery layer exactly as today — only entries with `Status = Approved` are ever surfaced, matching `global-knowledge-consumption.md`'s existing rule against referencing Draft/Pending records.
- `--check` (drift detection) stops being a fully offline operation once the source of truth is remote — needs a token and a network call. Decide whether that's acceptable for its current use as a routine local command, or whether it becomes a separately scheduled step (same open question as the prior notes file raised for the Epic/Chunk case).

## Decisions

1. **ID scheme: keep `AIF-###`, as a `Decision ID` custom field, not `idReadable`.** Note for accuracy: under Option A (dedicated `AIF-DR` project), YouTrack's own `idReadable` would actually be `AIF-DR-{n}` — close to, not wildly different from, the existing `AIF-{n}` scheme, since YouTrack derives it from the project shortname either way. The conclusion still holds regardless: `idReadable`'s numbering is a fresh per-project counter unrelated to the existing `AIF-{n}` allocation history, so preserving the current ID as an explicit `Decision ID` field avoids renumbering every migrated record and keeps existing cross-references (`Referenced By: AIF-001`, commit messages, etc.) valid without translation. `idReadable` still exists as YouTrack's own internal handle for UI links/URLs; it's just not the canonical ID surfaced to agents or humans.
2. **Article creation is automatic.** The agent's create-DR flow performs both API calls in the same step: create the Issue with fields, then create the linked Article with the markdown body, then set the `documented in` link. If the Article create call fails, the Issue create should be treated as not-yet-complete (retry or surface the error) rather than left as an orphan Issue with no readable content — needs a concrete rollback/retry behavior decided during actual planning, not just "call two APIs."
3. **Migrate the existing 11+ `.decision.md` files.** One-time bulk-import script against the REST API: for each file, `parseDecisionRecord` (already pure per the AIF-002-014 split) supplies the field values, the script creates the Issue + Article pair, sets links (`references`/`supersedes`) after all records exist (so link targets resolve), and sets `Status = Approved` directly via the migration script's elevated/admin credential rather than the agent service account — the normal `DR Approvers`-gated workflow rule shouldn't need to be bypassed for records that were already human-approved historically, but the migration path itself needs an explicit note that it's exempt from the gate for exactly this reason, not a backdoor left open by accident. Old `.decision.md` files: keep in git history (do not delete) as the pre-migration audit trail, but stop treating `docs/decisions/*.md` as the live source of truth once migration completes — `index.json` generation switches fully to the YouTrack REST crawl at that point.

Sources:
- [Articles API — Developer Portal, YouTrack/Hub Documentation](https://www.jetbrains.com/help/youtrack/devportal/resource-api-articles.html)
- [Custom Fields | YouTrack Server Documentation](https://www.jetbrains.com/help/youtrack/server/custom-fields.html)
- [Manage Custom Fields Per Project | YouTrack Server Documentation](https://www.jetbrains.com/help/youtrack/server/manage-custom-fields-per-project.html)
- [YouTrack Workflows | Developer Portal for YouTrack and Hub Documentation](https://www.jetbrains.com/help/youtrack/devportal/youtrack-workflow-reference.html)
