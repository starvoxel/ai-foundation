# YouTrack as an Epic/Chunk Tracking Backend — Config Notes

> Research notes, not a Decision Record. Captures what configuring YouTrack to replace/complement the `chunks.json` + committed Chunk Plan model (per the now-deleted `docs/plans/chunk-epic-planning-redesign-plan.md`, superseded by `docs/process-model.md`) would require. Written 2026-08-19, pending any decision to actually pursue this. **Stale as of the Feature/Task redesign** — the target tracking model is now Feature/Task, not Epic/Chunk; see `docs/plans/youtrack-integration-plan.md` for the current design.

## Context

The chunk/epic planning redesign plan proposes collapsing per-chunk approval into a single epic-level gate, tracked in `chunks.json` alongside the Epic Plan document. This note explores YouTrack (JetBrains) as a possible external tracking system for that model, as an alternative to Plane, and lists everything that would need to be configured to get an implementation that matches the redesign's schema and gates.

## 1. Issue types

- **Epic** — top-level type
- **Chunk** — child type
- Define both as custom issue types (not YouTrack's stock "Epic"/"Task") so the field schema can match the redesign exactly.

## 2. Link types

- **Epic ↔ Chunk**: YouTrack's built-in Subtask link type (parent/child), directional. Gives the Agile board's Epic-swimlane grouping for free.
- **Chunk depends_on Chunk**: custom directional link type (e.g. "depends on" / "is required for") — replaces the `depends_on` array in `chunks.json`. `dag-validate`/`dag-compute-waves` would need to read this via the REST API's issue-links endpoint instead of a JSON file.

## 3. Custom fields — Epic

- `Status` — enum: `Draft`, `Approved`, `Deferred`, `In Progress`, `Blocked`, `Complete` (or split plan-status vs. execution-status into two fields)
- `Approved By` — user field, settable only by a human account (see Permissions)
- `Security Considerations` — long text field, or a linked Article if richer formatting/reuse is wanted
- `Epic Test Plan` — long text field or linked Article; the four subsections (feature verification, integration points, regression scope, sign-off) likely read better as an Article with tables than a plain field
- `Plan ID` — string field (e.g. `AIF-0XX`) for traceability back into git commits/PRs (Rule 2 requires this)

## 4. Custom fields — Chunk

- `Tier` — enum: `1`, `2`, `3`
- `High Risk` — boolean
- `Status` — enum: `Ready`, `Implementing`, `Done`
- `Files` — multi-line text (files/components touched)
- `Acceptance Criteria` — multi-line text or checklist field
- `Agents` — enum, multi-value (SE, TE, PE)

## 5. Workflow rules (JS)

- Epic `Draft → Approved` blocked unless `Approved By` is set to a human account AND `Security Considerations`/`Epic Test Plan` are non-empty.
- `Approved By` field itself restricted so an AI-agent service account can propose but not self-approve.
- Chunk `→ Ready` blocked unless parent Epic's `Status = Approved`.
- Chunk `→ Implementing` for Tier 2/3 or `High Risk = true` requires a linked TE/PE issue or comment marker before `→ Done`; Tier 1 non-high-risk skips that check.
- Chunk `→ Done` blocked if any "depends on" linked chunk is not `Done`.
- Epic `→ Complete` blocked unless all child Chunks are `Done` AND a sign-off condition (e.g. a `Sign-off Complete` boolean, set manually or via automated test-run webhook) is true.

## 6. Permissions scheme

- Separate group/role for the AI agent's service account vs. human accounts, mirroring the `ai-git` identity pattern.
- Field-level permission: only humans can set `Approved By` or transition Epic to `Approved`/sign-off-gated `Complete`. Agents can create/edit everything else.

## 7. Templates

- Epic issue template pre-populated with the 9 template sections as field prompts/description skeleton (Goal, Scope, Features, Security Considerations, Epic Test Plan, Chunk Decomposition, Acceptance Criteria, Work Log).
- Chunk issue template with Goal/Files/Acceptance Criteria skeleton.

## 8. Agile board

- One board, swimlanes = Epic, columns = Chunk `Status`, replacing the visual role `chunks.json` + wave dispatch currently plays for humans watching progress.

## 9. API/automation plumbing

- Dedicated YouTrack service account + permanent API token for agents (env var, never logged — same rule as the GitHub token).
- Replace `chunks.json` reads/writes in `chunk-orchestration`, `dag-compute-waves`, `dag-validate` with YouTrack REST API calls (list child issues + links for an Epic, read/write custom fields). This is the largest actual code change — those two DAG server tools currently assume a local JSON file, not a remote API.
- Decide webhook vs. polling for `chunk-orchestration` to notice `Done`/`Approved` transitions.

## 10. Open question to resolve before configuring any of this

Do committed plan `.md` files in git go away entirely (YouTrack becomes sole source of truth), or does YouTrack become the *tracking* layer while `.md` content still gets committed for git-log audit trail? This changes whether `Security Considerations`/`Epic Test Plan` are YouTrack fields, git files, or both — worth pinning down first since it affects roughly half the field list above.

## Comparison note vs. Plane

Plane's Epic → Issue → Sub-issue model maps close to 1:1 out of the box with less configuration, and Plane is open-source/AGPL with unlimited self-hosted users. YouTrack's free self-hosted tier caps at 10 users, but offers a scriptable workflow engine (JS) that could enforce the Draft→Approved gate as an actual state-transition rule rather than a git-commit convention — a real capability edge if gate-enforcement living in the tracker matters more than setup simplicity.

## 11. Permission-gated Approval as an equivalent (or stronger) objectivity check

The core requirement behind Rule 1/Rule 8 (`engineering-core.md`) isn't "must be a git commit" — it's "approval must be objectively checkable and not something the agent itself can produce by assertion." A YouTrack workflow rule that checks the acting user's group membership before allowing a `Draft → Approved` transition (or a similarly gated field like `Approved By`) satisfies that, using a `guard` condition in a workflow script — a well-supported YouTrack feature. This is enforced server-side on every API call, regardless of what the agent's own instructions say.

This is arguably **stronger** than the current framework-repo git flow: `git-workflow-framework.md` permits direct commits to `main`, including the commit that sets a plan's `Status: Approved`. Nothing at the git layer stops an agent from writing that commit itself — the only thing preventing it today is the agent choosing to follow Rule 1/Rule 8 (a behavioral convention). A YouTrack permission/workflow gate with the agent's service account excluded from the "approvers" group makes self-approval technically impossible, not just against the rules.

What this requires to actually hold up:

1. **Enforcement**: a workflow-rule `guard` condition checking `context.currentUser`'s group/role — confirmed real YouTrack capability. (Whether YouTrack additionally has a native per-field ACL distinct from workflow-rule logic is unconfirmed; not needed either way since the workflow-rule approach achieves the same enforcement outcome.)
2. **Audit trail**: YouTrack's per-issue/Article activity/history log records field changes with actor + timestamp — the equivalent of `git log` for this purpose, though it's a mutable app-DB record rather than git's content-addressed history. Practically sufficient for internal audit, just a different trust model.
3. **Service account separation must be verified, not assumed** — a misconfigured permission group is a silent failure mode with no equivalent to "read git log to audit who committed." Test that the agent's token is actually rejected on the gated transition before relying on it.
4. **Steering files would need updating** — `engineering-core.md` Rule 8 and both git-workflow files currently hardcode "committed to git" as the mechanism. Adopting this approach means rewording them to something tool-agnostic (e.g. "a system that structurally prevents the agent's identity from performing the Approved transition"), so the rule stays accurate rather than being contradicted by the new setup.

## 12. Decision-index synthesis: YouTrack Articles as DR source of truth, `index.json` stays the discovery layer

> **Correction (2026-08-19):** the custom-fields-on-Articles premise below is wrong — Articles have a fixed schema with no custom field support. See `youtrack-dr-issue-setup-notes.md` for the corrected Issue-based design (structured fields on an Issue, readable body on a linked Article).

This resolves the Open Question 10 fork above (for Decision Records specifically) without giving up the filesystem-based discovery the standards/knowledge-loading rules depend on — and it reuses plumbing already being built in AIF-002.

AIF-002-014 (`aif index -d` / `lib/decisions.js`) already splits into pure functions (`parseDecisionRecord`, `buildDecisionIndex`, `diffDecisionIndex` — data in, data out, no I/O) and thin io wrappers (`collectDecisionFiles`, `buildDecisionIndexForDir`), per Rule 6 (design for testability). If DRs move to YouTrack Articles as the source of truth:

- Only the io layer changes: swap `collectDecisionFiles` (crawls `**/*.decision.md`) for a function that calls the YouTrack REST API and lists Articles tagged as decision records, and swap the markdown-table parsing in `parseDecisionRecord` for reading YouTrack custom fields off each Article.
- `buildDecisionIndex`'s inversion logic and the `index.json` output shape are unchanged — the pure/io split pays for itself exactly as intended.
- The committed, grep-able `index.json` stays the cheap offline discovery layer; `global-knowledge-consumption.md` doesn't need to change, since it operates on the index regardless of where the index was generated from. Agents only pay a network cost when fetching a specific Article's full body — same shape as today's "load matching knowledge files" step, just a fetch instead of a local read for the entries actually loaded.

Config implications this adds to Section 3/4 above, applied to the Article type instead of Epic/Chunk:

- Custom fields mirroring the DR Metadata table exactly: `Decision ID`, `Tier`, `Domain`, `Status`, `Approved By`, `Created`, `Tags` — as real fields, not embedded markdown text, so they're queryable via API.
- `References`/`Supersedes` become Article-to-Article link types (same pattern as the Chunk `depends_on` link type in Section 2), so `referenced_by`/`superseded_by` inversion works off structured links. This also closes AIF-002-014's Risk 3 (no `Supersedes` field exists in the current template) for free — a link type is a cleaner fit than adding a markdown field would have been.
- The index entry's `path` field becomes an Article URL/ID instead of a repo-relative path — still resolvable by agents, just resolves to an API fetch instead of a file read.
- `--check` (drift detection) changes character: today it's fully offline (compare committed index against a fresh local crawl); against YouTrack it necessarily requires a network call and a token, so it's no longer a pure/offline operation. Decide whether that's acceptable for `--check`'s existing use as a routine local command, or whether it becomes a separately-scheduled step.
- The `Approved` transition gate from Section 11 above is exactly the field the index crawler reads for `status` — the two ideas compose directly: YouTrack enforces who can approve a DR, and the local index reflects that state for cheap agent discovery without exposing Draft/Pending records (consistent with `global-knowledge-consumption.md`'s existing rule to never reference Draft/Pending DRs).
