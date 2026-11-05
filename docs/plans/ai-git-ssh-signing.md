# Plan: SSH-sign `ai-git` commits as the bot

| Field       | Value      |
| ----------- | ---------- |
| Status      | Draft      |
| Approved by | Pending    |
| Created     | 2026-11-05 |

## Goal

Commits made through `ai-git` show as **Verified** on GitHub, attributed to `starvoxel-bot`. Today they are plain unsigned commits (`verified: false, reason: unsigned`), so only GitHub-made merge commits and Dependabot commits show the badge. `ai-git` will sign every commit it creates with an SSH key registered on the bot account as a _signing key_.

## Scope

- In: optional SSH signing in `ai-git` driven by `.aiconfig.json`; resolving the private key through the existing `secrets.run` mechanism; `ai-git doctor` reporting; docs and template config; a one-time human rollout (key generation, registration, secret storage).
- Out: GPG signing; commit creation through the GitHub API; signing for humans; local `git log` signature display (`gpg.ssh.allowedSignersFile`); rotating the existing bot token; re-signing past commits.

## Approach

- **Config.** New optional `ai_identity.git_signing_key_env`: the _name_ of an env var holding the OpenSSH private key (same pattern as `git_token_env`). Unset means no signing, so behaviour is unchanged for every existing project.
- **Resolution.** The private key is a second secret fetched through `secrets.run` (`bws run …`), never written to the repo or `.aiconfig.json`. `resolveSecrets` today runs only for `push`/`fetch`/`gh-*`; it will also run for commit-creating subcommands when signing is configured and the key env var is missing. This adds one `bws` call per signing command (cost to be measured in milestone 2).
- **Signing.** Git cannot read an SSH private key from an env var, so `ai-git` writes it to a temp file (`mkdtemp`, directory `0700`, file `0600`, trailing newline normalised), runs git with transient `-c gpg.format=ssh -c user.signingkey=<file> -c commit.gpgsign=true -c tag.gpgsign=true`, and deletes the file in a `finally`. Config is passed with `-c` only, never `git config`, so nothing is persisted in `.git/config` (same discipline as the auth header).
- **Which subcommands.** `commit`, `merge`, `tag`, `cherry-pick`, `revert`, `rebase`, `pull`, `am`. Decided by a pure `needsSigning(subcommand)`.
- **Failure policy.** New boolean `ai_identity.git_signing_required`, default `true`. When signing is configured but cannot happen (key unresolved, `ssh-keygen` missing, malformed key), `true` makes commit-creating commands **fail** with an error naming the env var or tool (never a value); `false` prints a warning and runs the command unsigned. Removing `git_signing_key_env` opts out of signing entirely. This repo sets `git_signing_required: false` while the feature is tested; flipping it to `true` (or removing it) is a follow-up once commits verify.
- **Structure.** Pure logic (config extraction, subcommand classification, `-c` arg building, key normalisation) in `lib/ai-git.js`; I/O (temp file lifecycle, spawn) in `bin/ai-git.js`, per the testability rule.
- **GitHub requirements.** A commit is Verified only if the signing key is registered on the account whose verified email matches the committer email. So `starvoxel.ltd+generalBot@gmail.com` (set in `.aiconfig.json` on this branch) must be a **verified email on `starvoxel-bot`**.
- **Docs affected.** arc42 `05.03` (`ai-git.js`, `secrets.js` rows), `AGENTS.md` `.aiconfig.json` field table, `projects/_template/.aiconfig.json`. Each re-read against the change.

## Where to generate the key (human, milestone 4)

Do this on a trusted machine, logged in to GitHub as `starvoxel-bot`:

1. Generate a dedicated, passphrase-less key (it must work non-interactively; its protection is the secrets manager):
   `ssh-keygen -t ed25519 -C "starvoxel-bot commit signing" -f ./starvoxel-bot-signing -N ""`
   This creates `starvoxel-bot-signing` (private) and `starvoxel-bot-signing.pub` (public).
2. Register the **public** key at <https://github.com/settings/ssh/new> (Settings → SSH and GPG keys → New SSH key), with **Key type = Signing Key**. A key added as _Authentication Key_ does not verify commits; add it again as a signing key if it was already added that way.
3. Confirm `starvoxel.ltd+generalBot@gmail.com` is listed and verified at <https://github.com/settings/emails> for the same account.
4. Store the **private** key (full file contents, including the `BEGIN`/`END` lines) as a secret in the Bitwarden Secrets Manager project that `secrets.run` points at, named e.g. `AI_GIT_SIGNING_KEY`.
5. Delete both local key files.

Reference: GitHub's [signing-key instructions](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key). The steps and URLs above are from memory and not yet checked against it; a researcher dispatch can confirm them if wanted.

## Milestones

### 1. Pure logic and config

- Does: `getSigningKeyEnvName(config)`, `isSigningRequired(config)`, `needsSigning(subcommand)`, `normalizePrivateKey(text)` (rejects text without a `PRIVATE KEY` block; ensures a trailing newline), `buildSigningConfigArgs(keyPath)`; `AGENTS.md` field rows (`git_signing_key_env`, `git_signing_required`) and template config entries.
- Acceptance criteria: unit tests cover signing on/off, every classified subcommand, malformed and CRLF keys, and that `-c` args never contain key material (only a path).
- Verified by: `npm run test:unit`.

### 2. Wire into `bin/ai-git.js`

- Does: resolve the key via `secrets.run` for signing subcommands; temp-file lifecycle with guaranteed cleanup (also on spawn error and non-zero exit); the `git_signing_required` policy; measure added latency.
- Acceptance criteria: with a throwaway key in the test env, `ai-git commit` produces a commit whose signature passes `git verify-commit` against an `allowedSignersFile` built in the test; no temp key file remains afterwards; with `git_signing_required` true an unresolvable key exits non-zero naming only the variable, and with it false a warning is printed and the commit is made unsigned; with signing unconfigured, behaviour and speed are unchanged.
- Verified by: `npm run test:integration` (uses `ssh-keygen`, present on the CI runners incl. Windows, to generate a throwaway key; a missing `ssh-keygen` fails the test rather than skipping it).

### 3. Doctor and docs

- Does: `ai-git doctor` reports `ok`/`FAIL` for signing (key env resolved, `ssh-keygen` on PATH, and the `git_signing_required` setting) only when signing is configured, never printing the key; update arc42 `05.03`; required version bumps.
- Acceptance criteria: doctor output is unchanged when signing is unconfigured; `aif index architecture --check` and `aif validate` pass.
- Verified by: unit tests for the report, validation suite.

### 4. Rollout (human-gated)

- Does: human completes the key steps above; a final commit sets `ai_identity.git_signing_key_env` in `.aiconfig.json` (alongside `git_signing_required: false` for testing); push a test commit.
- Acceptance criteria: the new commits on the PR show Verified and are attributed to `starvoxel-bot` via the GitHub API (`verification.verified == true`, `reason == valid`).
- Verified by: `ai-git gh-api repos/starvoxel/ai-foundation/pulls/<n>/commits`.

## Requirements

- Security: the private key is never committed, logged, echoed, put in argv or a URL, or persisted in `.git/config`; the temp file is `0600` in a `0700` directory and is removed on every exit path; error messages name the env var only; a dedicated key is used for signing only, so it is revocable without touching the API token.
- Logging: failures (key unresolved, `ssh-keygen` missing, malformed key, temp-file error) go to stderr as errors naming the variable or tool, never a value. A successful signing is silent, like the other `ai-git` operations.

## Decisions

- Failure policy is a config toggle, `ai_identity.git_signing_required` (default `true` = error, `false` = warn and continue). Human decided 2026-11-05.
- One extra `bws` call per signing command is acceptable. Human decided 2026-11-05; the per-process key cache fallback is not needed unless it proves otherwise.

## Open questions

- Is `starvoxel.ltd+generalBot@gmail.com` already a verified email on `starvoxel-bot`? Human confirms before milestone 4.
