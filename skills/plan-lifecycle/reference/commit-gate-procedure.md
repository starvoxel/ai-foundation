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

- Every transition in the sequence above is its own commit. Never combine a Draft
  commit with a revision, or a revision with the Approved commit.
- Never amend or force-push a plan commit. The revision history is the record of
  what changed between drafts and why.
- The Approved commit must exist and be reachable on the branch/repo before any
  implementation commit that depends on it. If working in a framework repo (direct
  commits to main), this simply means the Approved commit lands on `main` first, in
  its own commit, before implementation commits follow.
- Verbal or chat-only "yes, go ahead" is never sufficient — only the committed
  `Approved` status satisfies a plan-approval gate elsewhere in steering.
- Commit messages should be unambiguous about which stage of the lifecycle they
  represent (`Add draft plan`, `Revise plan`, `Approve plan`, `Defer plan`,
  `Complete plan`) so the history is scannable without opening every commit.
