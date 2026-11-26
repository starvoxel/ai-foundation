# `cleanup-branches` action

Sorts the calling repository's branches into Active, Stale and Archive, closes Stale pull requests (label `stale`) and deletes Archive branches. Cloud sessions cannot delete remote branches, so GitHub does it on a schedule. The rules are in `.github/scripts/cleanup-branches.mjs` and summarised in `docs/architecture/02_constraints.md`; the action runs the script from its own checkout, never from the repository being cleaned.

Normally you do not write the workflow by hand: `aif install -I cleanup` writes `aif-cleanup.yml`, pinned, and Dependabot keeps the pin current.

## Variables

Each input is optional; empty means the default. The installed workflow passes each from a repository or organisation Actions variable, so tuning needs no code change. A repository variable overrides an organisation one of the same name.

| Variable                          | Input                     | Default                                                                                      | Controls                                                                |
| --------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `CLEANUP_ENFORCE`                 | `enforce`                 | `true`                                                                                       | `false` makes scheduled runs report only                                |
| `CLEANUP_PROTECTED_BRANCHES`      | `protected-branches`      | empty (the default branch is always protected)                                               | Never touched, never deleted by an explicit list                        |
| `CLEANUP_AI_BRANCH_PREFIXES`      | `ai-branch-prefixes`      | `copilot/ kiro/ claude/ ccr- ai/`                                                            | Prefixes of AI session branches                                         |
| `CLEANUP_THROWAWAY_WORDS`         | `throwaway-words`         | `test(s\|ing\|ed)? valid(ate[sd]?\|ating\|ation)? verif(y\|ies\|ied\|ying\|ication) spikes?` | Whole-segment regexes marking a throwaway branch; replaces the defaults |
| `CLEANUP_KEEP_EMPTY_BRANCHES`     | `keep-empty-branches`     | `true`                                                                                       | Whether other empty branches are kept for ever                          |
| `CLEANUP_KEEP_UNRELATED_BRANCHES` | `keep-unrelated-branches` | `true`                                                                                       | Whether unrelated-history branches (orphans) are kept for ever          |
| `CLEANUP_ACTIVE_DAYS`             | `active-days`             | `14`                                                                                         | Under this many days is Active                                          |
| `CLEANUP_ARCHIVE_DAYS`            | `archive-days`            | `30`                                                                                         | Stale until this many days, then Archive                                |
| `CLEANUP_ACTIVE_BRANCHES`         | `active-branches`         | `5`                                                                                          | The most recent N branches count as Active                              |
| `CLEANUP_ARCHIVE_BRANCHES`        | `archive-branches`        | `15`                                                                                         | The most recent N branches count as at least Stale                      |

Also an input: `dry-run`, `delete-stale` and `branches`. A manual dispatch can report only (`dry-run`), delete Stale branches that have no open PR as well as Archive ones (`delete-stale`; a Stale branch with an open PR still only has the PR closed, and its branch goes on a later run), or name branches to delete instead of the sweep (`branches`). `delete-stale` is not a variable: it is a per-run choice and `token` (default `github.token`).

## Caller prerequisites

1. `contents: write` and `pull-requests: write`.
2. A checkout of `.aiconfig.json`, which gives the project short code for names such as `<code>-test`. The installed workflow does a sparse one.
3. The schedule. A `cron:` must be a literal in the caller, so it is not a variable: Mondays and Thursdays, 06:17 UTC.

Run the first time as a manual dispatch with `dry_run` ticked.
