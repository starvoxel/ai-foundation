# Feature Plan: PR-range arc42 staleness gate with commit-trailer waivers

## 1. Metadata

| Field               | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Feature ID          | AIF-013                                                            |
| Project             | ai-foundation                                                      |
| Status              | Approved                                                           |
| Author (Agent)      | Engineering Manager                                                |
| Reviewed By         | Human (2026-10-06)                                                 |
| Created             | 2026-10-06                                                         |
| Last Updated        | 2026-10-06                                                         |
| Standards           | `javascript`, `node` (per `.aiconfig.json`)                        |
| Total Tasks         | 7                                                                  |
| Product Requirement | None. Human request 2026-10-06                                     |
| Depends On          | None                                                               |
| ADRs                | 0006 (plain JS + JSDoc) applies. No new ADR (see Section 8, row 8) |

---

## 2. Goal

Stop parallel features from conflicting on two things: the committed `index.json` files (`docs/architecture/`, `docs/decisions/`) and the per-doc `last_verified: <sha>` frontmatter. Replace both with (1) on-demand, deterministic index generation (nothing generated is committed) and (2) a CI gate over the PR's own commit range: a changed `key_files` entry must be accompanied by a change to a doc listing it, or by an `Arch-Unaffected:` commit-trailer waiver. No stored state, so nothing on `main` to conflict on.

> Requirement traceability: N/A. Evidence: 79 commits touched the architecture index in ~5 weeks; history is full of "re-pin last_verified" commits.

---

## 3. Quick Summary

**Open Items:** 0 open — see Section 8

---

## 4. Scope

### In Scope

- Gitignore and stop committing `docs/architecture/index.json` and `docs/decisions/index.json`; `aif index <target>` still writes them (to the gitignored path), deterministically (no `generated_at`, no stored `stale`).
- `aif index <target> --check` keeps frontmatter validation, broken-relative-link detection, and decisions-index consistency; drops the diff against a stored file.
- Remove `last_verified` everywhere: all arc42 docs, `_template.md`, `REQUIRED_FIELDS`, parser, tests, and the `architecture-authoring.md` schema plus its "`--check` is a final validation" rule.
- PR-range gate in `lib/architecture.js` (pure/io split preserved), run in CI over `base..head`. Base = PR base; for `push-check/**`, base = `main`.
- `Arch-Unaffected: <section> — <reason>` commit-trailer waivers: parsing, validation, `aif index architecture --waivers [--section X] [--since <ref>]` report, CI job-summary listing.
- Principal-Engineer update (`skills/code-review/SKILL.md` checklist and severity, plus `agents/principal-engineer.yaml` only if its tools/prompt need it): validate waiver reasons on every review.
- `key_files` hygiene: prune per the "key_files Scope" rule, and write a short audit note documenting over-broad docs and overly broad or large scripts as follow-up candidates (no splitting here).
- Doc updates: steering (`architecture-authoring.md`, `knowledge-consumption.md`), `commit-gate-procedure.md`, `adr-authoring` skill index mentions, `AGENTS.md`/README, arc42 sections 02, 05_03, 05_04, 05_05, 05, 11 as they describe indexing/staleness. The mechanism's rationale is recorded in Section 8 row 8's decision and in arc42 05_04; `docs/process-model.md` gets a supersession pointer to this Feature.
- Migration note for in-flight features (Section 5).

### Out of Scope

- A separate ADR for the mechanism (Section 8, row 8).
- PR-body waiver support (only added if trailers demonstrably drop in squash merges — see Section 8, row 1).
- Splitting over-broad arc42 docs or large scripts (documented as follow-ups only).
- `aif init` gitignoring the index files in downstream projects (Section 8, row 5).
- Re-installing `~/.claude/rules` (human action after merge; Section 8, row 9).
- Notifying in-flight Features individually (Section 8, row 6).

---

## 5. Feature Description

### User-Facing Behaviour

- **Authors:** touching a file listed in any doc's `key_files` means updating that doc in the same PR, or adding a commit trailer `Arch-Unaffected: 05.04 — <why the doc is still accurate>`. No frontmatter bump, no index regeneration, nothing to rebase over.
- **Reviewers (Principal-Engineer):** the review process validates every waiver in the PR's range: the reason must genuinely explain why the named doc is unaffected by the change (not merely pass the mechanical check), and the named section must plausibly cover the changed file. A vacuous or misleading reason is a MEDIUM, blocking finding. Principal-Engineer lists the range's waivers via `aif index architecture --waivers --since <base>`.
- **Anyone:** `aif index architecture --waivers [--section X] [--since <ref>]` lists historical waivers (date, commit, section, file, reason).
- **CI:** the job summary prints the range's waivers.

### Data Flow

1. CI resolves `base` (PR base SHA; `merge-base origin/main HEAD` for `push-check/**`) and `head`. Pushes to `main` skip the gate (already gated pre-merge).
2. io layer: `git diff --name-only base...head` → changed files; `git log base..head` → full messages.
3. Pure layer: parse each doc's `key_files`; parse waivers from messages; for every changed file listed in some doc, require (a) that doc in the changed set, or (b) a valid waiver naming a doc that lists the file. Output: violations, accepted waivers, rejected waivers (with reasons).
4. Existing check kept: a `key_files` entry missing from disk is stale unconditionally.

### Business Rules

- Waiver form: `Arch-Unaffected: <section> — <reason>`. Section is a doc's frontmatter `section` value and must be a doc that lists a changed file; otherwise the waiver is rejected.
- Mechanical reason check: at least 10 non-space characters and not a placeholder (`n/a`, `none`, `ok`, `unaffected`, `-`). Quality beyond that is Principal-Engineer's judgement.
- A waiver is section-level: one waiver in any commit of the range covers every changed file in the range that the named section lists (source of truth is commits).
- Generated indexes are deterministic: same inputs → byte-identical output. `--check` never reads a stored index.
- Parser does not require strict trailer-block placement (see Section 8, row 1).

### Error States

| Scenario                                          | Expected Behaviour                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| Changed key_file, doc unchanged, no waiver        | `--check` fails, naming file and the doc(s) listing it                    |
| Waiver names a section that doesn't list the file | Rejected, reported; gate still fails for that file                        |
| Waiver with empty/placeholder reason              | Rejected, reported                                                        |
| key_file deleted from disk but still listed       | Stale unconditionally (unchanged behaviour)                               |
| Base ref unresolvable in CI (shallow, bad SHA)    | Fail closed with a clear message (checkout already uses `fetch-depth: 0`) |
| Malformed frontmatter / broken relative link      | `--check` fails (unchanged)                                               |

### Migration note for in-flight features (delivered with Task 005's PR)

After Task 005 lands on `main`, an in-flight branch rebases/merges `main` and then:

1. Resolve any `last_verified:` conflict by deleting the line (it no longer exists). Drop any commits whose only purpose was re-pinning it.
2. Resolve any `index.json` conflict by taking `main`'s state (file deleted; `git rm`). Never regenerate and commit it.
3. Run `aif index architecture --check` locally; if the gate reports a changed key_file, update the doc or add an `Arch-Unaffected:` trailer to a commit in the branch (new commit with trailer is fine; no history rewrite needed).

Ordering to minimize disruption: Task 005 (the only task that deletes `last_verified` from docs) is dispatched only after the gate (Task 003) is merged and green, and its PR is flagged to the human for a merge window.

---

## 6. Architecture Overview

### New Components

| Component                            | Type           | Responsibility                                                                                   |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| `lib/arch-waivers.js`                | Pure + thin io | Parse/validate `Arch-Unaffected` waivers from commit messages; `git log` wrapper for history     |
| PR-range gate (in `architecture.js`) | Pure + io      | Compute violations from changed files, key_files map, waivers; io wrapper resolves range via git |
| `--waivers` / `--base` CLI flags     | Command layer  | Report and gate entry points on `aif index architecture`                                         |
| CI step + job summary                | Workflow       | Run gate on PRs and `push-check/**`; print waivers                                               |

### Component Relationships

`lib/commands/index.js` → `architecture.js` (parse, reverse index, gate) → `arch-waivers.js` (waiver parse/validate). Git access only in io wrappers. `index-diff.js` is removed once no stored index is diffed (Task 001).

### Integration Points

- `lib/decisions.js` — loses stored-index diff; keeps parse/consistency checks.
- `.github/workflows/ci.yml` — Validate job: replace two index steps, add gate + summary. Docs-only detection untouched.
- `.github/scripts/check-version-bumps.mjs` — editing skills/steering/agents in Tasks 006–007 triggers its version-bump requirement.

---

## 7. Security Considerations

- Commit messages are untrusted input in CI: waiver parsing uses `execFile` with argument arrays (no shell), refs passed via env vars (existing CI pattern), and job-summary output escapes markdown/HTML. Addressed in Tasks 002, 004.
- A waiver is an explicit bypass of one check's condition, not of the required-status-check gate itself; it is visible in history and the job summary. This does not weaken `git-workflow-core.md`: "Required CI Checks Gate Main — Never Bypass Them" (the check still runs and is required). Principal-Engineer reviews every waiver reason (Task 007).

---

## 8. Risks & Open Questions

| #   | Risk / Question                                                                                                                                      | Type     | Impact | Source  | Raised By | Resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Squash merges may drop trailers from the final `main` commit (affects `--waivers` history only, not the gate).                                       | Risk     | M      | Request | Human     | Yes. Decision: repo setting is `squash_merge_commit_message: COMMIT_MESSAGES` (title `PR_TITLE`), so PR commit messages are carried into the squash body, but as mid-body bullet text, not a final trailer block. **Why:** strict `interpret-trailers` parsing would miss them, so the parser matches `^Arch-Unaffected:` lines anywhere in the message. No PR-body support. Task 002 tests a squash-shaped fixture; Task 004 confirms against the first real squash-merged history. |
| 2   | Waiver granularity: section-level or per-file?                                                                                                       | Question | M      | Design  | EM        | Yes. Decision: section-level. **Why:** simpler trailer; breadth of a bad waiver is covered by Principal-Engineer review (human decision 2026-10-06).                                                                                                                                                                                                                                                                                                                                 |
| 3   | Mechanical "meaningful reason" rule.                                                                                                                 | Question | L      | Design  | EM        | Yes. Decision: ≥ 10 non-space chars and not a placeholder (`n/a`, `none`, `ok`, `unaffected`, `-`). **Why:** cheap guard; real quality is Principal-Engineer's call (human decision 2026-10-06).                                                                                                                                                                                                                                                                                     |
| 4   | Generated index delivery without a committed file.                                                                                                   | Question | M      | Design  | EM        | Yes. Decision: `aif index <target>` still writes the gitignored `index.json` at its current path; deterministic, no `generated_at`; `--check` never reads it. **Why:** existing readers keep working (human decision 2026-10-06).                                                                                                                                                                                                                                                    |
| 5   | Downstream projects' committed `index.json` files become obsolete; should `aif init` gitignore them?                                                 | Question | L      | Scope   | EM        | Yes. Decision: out of scope. **Why:** keeps this Feature focused (human decision 2026-10-06).                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | In-flight branches conflict when Task 005 lands (`last_verified` lines, `index.json`).                                                               | Risk     | H      | Request | Human     | Yes (accepted mitigation). Task 005 starts only after the gate (003) is merged and green; migration note (Section 5) in 005's PR description; human picks the merge window (human decision 2026-10-06). Residual conflict is expected until 005 merges.                                                                                                                                                                                                                              |
| 7   | Window between Tasks 001–004 and 005: `last_verified` still exists, so those Tasks' own PRs still bump it.                                           | Risk     | L      | EM      | EM        | Yes. Decision: expected and accepted; old staleness check stays until 005 removes it atomically with the docs. **Why:** removing the check before docs/parser change together would break CI.                                                                                                                                                                                                                                                                                        |
| 8   | Is a separate ADR needed for the mechanism?                                                                                                          | Question | L      | Process | EM        | Yes. Decision: no ADR; Task 001 (Architect) dropped. **Why:** not a contested or costly-to-reverse fork (tooling/docs, design decided); the rationale lives in this plan, arc42 05_04, and a supersession pointer in `docs/process-model.md`. If it later proves contested, escalate to Architect then (human decision 2026-10-06).                                                                                                                                                  |
| 9   | `~/.claude/rules` (`engineering-architecture-authoring.md`, `global-knowledge-consumption.md`) mirrors the old schema until `aif install` is re-run. | Risk     | L      | Request | Human     | Yes. Decision: human re-runs `aif install` after Task 006 merges; flagged in the completion summary; no agent touches `~/.claude` (human decision 2026-10-06).                                                                                                                                                                                                                                                                                                                       |
| 10  | Gate false positives: broadly-listed key_files force a doc edit or waiver on most PRs touching them.                                                 | Risk     | M      | EM      | EM        | Yes. Decision: Task 005 prunes `key_files` per the "key_files Scope" rule and documents (audit note in the Feature folder) docs that are over-broad and scripts that are overly broad or large, as follow-ups; no splitting here. Waivers are the release valve. (Human decision 2026-10-06; interpretation of "document" to be confirmed at approval.)                                                                                                                              |
| 11  | Severity of a vacuous/misleading waiver reason in review.                                                                                            | Question | L      | Design  | EM        | Yes. Decision: MEDIUM, blocking per `skill/review-severity`. **Why:** a bad waiver silently defeats the doc-currency gate (human decision 2026-10-06).                                                                                                                                                                                                                                                                                                                               |

---

## 9. Task Decomposition

Dependency graph: [`tasks.json`](./tasks.json). 7 Tasks across 4 waves:

| ID  | Task                                                                                                                                                   | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 001 | On-demand deterministic index generation; gitignore + untrack both `index.json`; drop stored-diff; remove `index-diff.js`; CI step updates             | —          |
| 002 | `lib/arch-waivers.js`: parse/validate waivers, `git log` wrapper, unit tests incl. squash-shaped fixture                                               | —          |
| 003 | PR-range gate (pure + io), `--check` integration, CI base resolution; unit (synthetic diffs) + integration (temp git repo) tests                       | 001, 002   |
| 004 | `--waivers [--section] [--since]` report + CI job summary                                                                                              | 003        |
| 005 | Remove `last_verified` (docs, `_template.md`, `REQUIRED_FIELDS`, parser, old staleness check, tests); `key_files` pruning + audit note; migration note | 003        |
| 006 | Steering/skills/README/AGENTS/arc42 prose updates, mechanism rationale in arc42 05_04, `process-model.md` supersession pointer                         | 004, 005   |
| 007 | Principal-Engineer: validate waiver reasons in every review (`skills/code-review/SKILL.md` checklist + MEDIUM severity; agent yaml only if needed)     | 004        |

Waves (dag-compute-waves): W1 {001, 002} · W2 {003} · W3 {004, 005} · W4 {006, 007}.

Parallelization notes:

- 001 and 003–005 all touch `lib/commands/index.js` and `lib/architecture.js`; the dependency chain serializes them. 004 and 005 overlap on those files in W3 (file-overlap warning only; expected small hunks).
- 005 and 006 both edit `docs/architecture/05_04`/`05_05` (frontmatter vs. prose); 006 depends on 005 so no overlap in practice.
- The Doc-Update Acceptance Gate applies to every Task (arc42 `key_files` additions for new `arch-waivers.js`, removals for deleted `index-diff.js`).

---

## 10. Acceptance Criteria

- [ ] All Tasks complete and signed off
- [ ] Feature works end-to-end as described in Section 5
- [ ] No CRITICAL, HIGH, or MEDIUM findings open in any Task review
- [ ] Neither `index.json` is tracked; two runs of `aif index <target>` produce identical output
- [ ] No `last_verified` remains in any doc, template, parser, test, or steering file
- [ ] A PR changing a listed key_file with no doc change and no waiver fails CI; the same PR with a valid trailer passes; a waiver naming a non-listing section is rejected
- [ ] Principal-Engineer review process checks waiver reasons (real explanation, section plausibly covers the file) and classifies a bad one as MEDIUM, blocking
- [ ] `--waivers` lists waivers with date, commit, section, file, reason; CI job summary prints the range's waivers
- [ ] Squash-merge trailer outcome recorded (Section 8, row 1) and confirmed against a real squash
- [ ] `key_files` audit note exists; migration note present in Task 005's PR; `~/.claude/rules` re-install flagged to the human
