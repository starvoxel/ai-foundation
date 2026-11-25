# Pin actions/create-github-app-token (as of 2026-11-25)

Path resolved by reading `/home/user/ai-foundation/.aiconfig.json` (`paths.research` = `docs/research`); no shell, `aif` not run.

## 1. Release

- Latest: [v3.4.0](https://github.com/actions/create-github-app-token/releases), 18 Nov 2026 (7 days old, too new). Year inferred from the [tags page](https://github.com/actions/create-github-app-token/tags).
- Newest stable at least 14 days old: [v3.3.0](https://github.com/actions/create-github-app-token/releases/tag/v3.3.0), 12 Oct 2026 23:42 (time zone not stated), not a pre-release. (v3.4.0-beta, 17 Nov, is a pre-release.)

## 2. Commit SHA

`64ab729a6294000f5aa4a4bc0b73d1f32bc45510` ("chore(main): release 3.3.0 (#402)"; [commit page](https://github.com/actions/create-github-app-token/commit/64ab729a6294000f5aa4a4bc0b73d1f32bc45510)).
Verification: the [tags page](https://github.com/actions/create-github-app-token/tags) lists this commit for v3.3.0, and the commit page and release page show the same short SHA 64ab729. UNVERIFIED: whether the tag is annotated. The API returned 403 and the pages do not say. The tags page appears to list the commit, not a tag object (inference). Confirm with a local tag dereference before merging.

Pin line: `actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510 # v3.3.0`

## 3. README at [v3.3.0](https://github.com/actions/create-github-app-token/blob/v3.3.0/README.md)

- App ID: `client-id` (recommended); legacy `app-id` still accepted.
- Private key: `private-key`
- Output: `token`
- Current repo only: leave `owner` and `repositories` unset; the README says access is then scoped to the current repository only.

## 4. Do events from this token trigger workflows?

Yes, per GitHub docs (read via search snippets; docs.github.com was not fetchable from this session, so wording is unverified on the page itself). The no-new-run rule covers only the built-in `GITHUB_TOKEN` ([GITHUB_TOKEN](https://docs.github.com/en/actions/concepts/security/github_token)). The docs say to use a GitHub App installation token or PAT to trigger events ([Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)). Installation tokens expire after 1 hour ([app-in-workflow doc](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)).
