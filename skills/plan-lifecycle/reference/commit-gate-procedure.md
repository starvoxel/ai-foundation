# Commit-Gate Procedure

The mechanical sequence behind `skill/plan-lifecycle` Steps 1-4, for quick reference.

```
1. Write artifact, Status: Draft            → commit ("Add draft plan: ...")
2. Present to human
3. Human requests changes?
     yes → edit, Status stays Draft         → commit ("Revise plan: ...")
           → go to 2
     no  → go to 4
4. Human decision:
     Approved  → update Status + approver field → commit ("Approve plan: ...")
                 → gate satisfied, dependent work may begin
     Deferred  → update Status + reason          → commit ("Defer plan: ...")
                 → gate NOT satisfied, dependent work may not begin
5. (Later) Work described by the artifact completes
     → update Status: Done                       → commit ("Complete plan: ...")
```

## Rules

- Every transition in the sequence above is its own commit. Never combine a Draft commit with a revision, or a revision with the Approved commit.
- Never amend or force-push a plan commit. The revision history is the record of what changed between drafts and why.
- The Approved commit must exist and be reachable on the branch/repo before any implementation commit that depends on it. If working in a framework repo (direct commits to main), this simply means the Approved commit lands on `main` first, in its own commit, before implementation commits follow.
- Verbal or chat-only "yes, go ahead" is never sufficient — only the committed `Approved` status satisfies a plan-approval gate elsewhere in steering.
- Commit messages should be unambiguous about which stage of the lifecycle they represent (`Add draft plan`, `Revise plan`, `Approve plan`, `Defer plan`, `Complete plan`) so the history is scannable without opening every commit.
- For Decision Records, the `{paths.decisions}/index.json` update (Tier A/B only) happens in the same commit as the Draft and Approved steps respectively — see Decision Record Tier Variants below. This does not add a new commit to the sequence; it is content within the existing Draft/Approved commits.

## Decision Record Tier Variants

*(AIF-002-004)* Same sequence numbers as above (1-5); source of the Tier definitions themselves is AIF-META-001's Design section Tier table, referenced here, not re-derived.

- **Tier A**: Follows the sequence above unchanged.
- **Tier B**: a shortened sequence:
  ```
  1. Write record, Status: Draft          → commit ("Add draft decision: ...")
  2. Present to human for confirmation
  3. Human confirms → Status: Approved     → commit ("Approve decision: ...")
     (If the human requests changes instead, follow the full Draft → revision
     → Approved sequence above — Tier B does not prohibit revision, it just
     does not expect it.)
  4. Update {paths.decisions}/index.json in the same commit as step 1 and step 3
     (see skill/decision-record / skill/decision-brief for the index-update
     procedure itself)
  ```
- **Tier C**: No sequence applies. The decision is recorded inline in the governing plan (Chunk Plan/Epic Plan) and is fully covered by that plan's own Draft → Approved sequence above. `{paths.decisions}/index.json` is never touched for a Tier C decision.

## Decision Record Amendment Ladder

*(AIF-003-006)* Source of truth: `AIF-META-002` (`docs/decisions/meta-process/AIF-META-002_partial-amendment-of-approved-decisions.decision.md`), Design section. This section reproduces the ladder table, the errata test, and the two-commit sequence in full so a reader does not need to open the record to get the exact wording.

### The Ladder

| Change | Path | Author | Gate |
|---|---|---|---|
| Provably cannot alter the decision | `## Errata` entry | Anyone | None |
| Alters the record, but the original rationale still holds | `## Amendments` entry + in-place edit | Domain owner | `Amending` + two-commit confirmation |
| The original rationale no longer holds, or the decision reverses | `Status: Superseded` + new record | Domain owner | Full Tier A cycle |

### The Errata Test

Errata is a change that provably leaves the rendered meaning of a record's substantive sections unchanged — `Options Explored`, `Decision`, `Design`, and `Impact on Planning` at Tier A; `Rationale`, `Decision`, and `Impact` at Tier B. Any change that alters, adds to, or removes from the solution space considered, the chosen approach, or how it is to be implemented is not errata — regardless of how small it appears or which section of the record it occupies.

Two properties of this test matter and are easy to get wrong:

- **It is about meaning, not location.** A typo inside `Decision` is errata. A clarifying rewrite of an option's stated weakness in `Options Explored` — or its Tier B analogue, a rewrite of `Rationale` — is not.
- **Doubt disqualifies.** If it is not obvious that a change leaves meaning unchanged, it is not errata. Default-deny: an author cannot reason their way into the ungated path, because uncertainty itself removes the option.
- `Status`, `Tier`, and `Domain` changes are never errata; other metadata corrections may be.

Worked examples:

| Errata | Not errata |
|---|---|
| Typos, grammar, formatting | Correcting a factual claim in an option's strengths or weaknesses |
| Broken or moved link/path fixes | Adding an option that was not originally considered |
| ID renumbering where the referent is identical (`AIF-004` → `AIF-PROC-001`) | Sharpening vague wording in `Decision`, `Design` or `Rationale` |
| Metadata corrections other than `Status`, `Tier`, `Domain` | Any change to `Status`, `Tier`, or `Domain` |

The second row of the right-hand column is the case most likely to be misfiled: a factual correction to an option's strengths or weaknesses is the case most often misfiled as errata, because it undermines the reasoning that rejected an option rather than merely fixing prose.

### Amendment Gate — Two Commits

```
1. Domain owner applies the body edit, adds the inline marker
   (*(amended — see Amendment N)*), appends the Amendments row
   (Outcome: Pending), sets Status: Amending.
                                        → commit ("Propose amendment: ...")
2. Present to human.
3a. Human confirms → Outcome: Approved by {name}, update Last Amended,
    Status back to Approved.            → commit ("Amend decision: ...")
3b. Human rejects  → revert the body edit and inline marker,
    Outcome: Rejected by {name} (the row stays),
    Status back to Approved.            → commit ("Reject amendment: ...")
```

Errata need no sequence and no status change: edit, append the `## Errata` row, one commit (`Errata: ...`).

The `## Amendments` and `## Errata` tables are append-only: existing rows are never edited or deleted. A rejected amendment's row stays in the table with `Outcome: Rejected by {name}` — that a change was proposed and declined is worth keeping, and it is the only place that fact survives outside `git log`.

The body edit lands in the proposal commit, not the approval commit, because `Amending` already signals unconfirmed content — deferring the edit would mean holding the proposed wording somewhere other than the place it belongs, for a safety property the status now provides directly.

Every gate checks positively for `Approved` only. `Amending` requires no new gate-checking logic anywhere — see `reference/status-vocabulary.md`.
