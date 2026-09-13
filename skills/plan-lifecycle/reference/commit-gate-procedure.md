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

_(AIF-002-004)_ Same sequence numbers as above (1-5); source of the Tier definitions themselves is AIF-META-001's Design section Tier table, referenced here, not re-derived.

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
