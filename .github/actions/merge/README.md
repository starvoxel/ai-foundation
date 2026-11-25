# `merge` action

Runs the `/merge` bot in the calling repository. A person with write access comments `/merge` on a pull request; the bot checks it (open, not a draft, same repository, targets the default branch, mergeable, every required check green on the head), merges the default branch into it when it is behind, and merges it. If a required check is still running it waits, and merges when CI finishes. Anything else after `/merge` gets a "not supported" reply. The decisions are in `.github/scripts/merge-logic.mjs`; this action runs them from its own checkout, never from the pull request. Plans: `docs/plans/merge-bot.md` and `docs/plans/merge-bot-integration.md`.

Normally you do not write the workflow by hand: `aif install -I merge` writes it, pinned, and Dependabot keeps the pin current.

## Inputs

| Input             | Default | Meaning                                                                                                                                                                               |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `live`            | `false` | `true` merges for real with a GitHub App token. Anything else is a dry run: the bot only comments what it would do, with the job token.                                               |
| `app-client-id`   | empty   | Client ID of the GitHub App. Needed only when live.                                                                                                                                   |
| `app-private-key` | empty   | The App's private key, from a secret. Needed only when live.                                                                                                                          |
| `version-paths`   | empty   | Comma-separated directories whose changes need a `bump:patch\|minor\|major` label and a version commit. Empty for a project with no versioned releases (no label, no version commit). |

## Caller prerequisites

The action needs no checkout and no Node setup beyond the runner's own Node 22 or newer (`ubuntu-latest` has it). The calling workflow must:

1. Trigger on `issue_comment` (created) and `workflow_run` (the CI workflow, completed) on the default branch, with `contents: read`, `checks: read` and `pull-requests: write`.
2. Serialise runs in one concurrency group, cancelling none, so two merges never race.
3. Run only for a `/merge` comment on a pull request, or a finished pull-request CI run.
4. For live mode: install the GitHub App on the repository, set the repository variable `MERGE_APP_CLIENT_ID` and the secret `MERGE_APP_PRIVATE_KEY`, and make the App the only bypass actor of the rulesets that require the status checks. Set the variable `MERGE_BOT_LIVE` to `true` to go live.

`aif-merge.yml`, installed by `aif install -I merge`, does all of that. The action holds no secrets of its own and calls only the GitHub API of the repository it runs in. See `docs/architecture/05_07_ci_actions_and_release.md`.
