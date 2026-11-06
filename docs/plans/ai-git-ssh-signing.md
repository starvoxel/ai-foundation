# Plan: SSH-sign `ai-git` commits

| Field       | Value                             |
| ----------- | --------------------------------- |
| Status      | Approved                          |
| Approved by | jeremysmellie@gmail.com (in chat) |
| Created     | 2026-11-05                        |

## Goal

`ai-git` creates unsigned commits, which GitHub reports as `verified: false, reason: unsigned`. Sign every commit it creates with an SSH key so GitHub reports `verified: true, reason: valid`.

## Scope

- In: optional SSH signing in `ai-git` driven by `.aiconfig.json`; resolving the private key through the existing `secrets.run` mechanism; `ai-git doctor` reporting; docs and template config.
- Out: GPG signing; signing tags; an ssh-agent key cache; commit creation through the GitHub API; local `git log` signature display (`gpg.ssh.allowedSignersFile`); re-signing past commits.

## Approach

- **Config.** New optional `ai_identity.git_signing_key_env`: the name of an env var holding the OpenSSH private key (same pattern as `git_token_env`). Unset means no signing, so behaviour is unchanged.
- **Resolution.** The key comes from the env var named by `git_signing_key_env`, normally already present in the session environment, so signing needs no fetch and each `ai-git` run costs nothing extra. If the variable is missing, `ai-git` falls back to fetching it through `secrets.run` (`bws run …`) for that one command, as it does for the API token; this repeats on every signing command until the variable is exported for the session. The key is never written to the repo or `.aiconfig.json`. `resolveSecrets` today runs only for `push`/`fetch`/`gh-*`; it will also run for commit-creating subcommands when signing is configured and the key env var is missing. Caching the key in an ssh-agent instead is out of scope.
- **Signing.** Git cannot read an SSH private key from an env var, so `ai-git` writes it to a temp file (`mkdtemp`, directory `0700`, file `0600`, trailing newline normalised), runs git with transient `-c gpg.format=ssh -c gpg.ssh.program=ssh-keygen -c user.signingkey=<file> -c commit.gpgsign=true` (`gpg.ssh.program` is pinned because a host-level git config may set a different signer), and deletes the file in a `finally`. Config is passed with `-c` only, never `git config`, so nothing is persisted in `.git/config` (same as the auth header).
- **Which subcommands.** `commit`, `merge`, `cherry-pick`, `revert`, `rebase`, `pull`, `am`, decided by a pure `needsSigning(subcommand)`. `tag` is excluded: `tag.gpgsign` forces annotated tags, which would change `ai-git tag <name>`.
- **Failure policy.** New boolean `ai_identity.git_signing_required`, default `true`. When signing is configured but cannot happen (key unresolved, `ssh-keygen` missing, malformed key), `true` makes commit-creating commands fail with an error naming the env var or tool (never a value); `false` prints a warning and runs the command unsigned. Removing `git_signing_key_env` disables signing.
- **Structure.** Pure logic (config extraction, subcommand classification, `-c` arg building, key normalisation) in `lib/ai-git.js`; I/O (temp file lifecycle, spawn) in `bin/ai-git.js`.
- **GitHub requirement.** A commit verifies only if the signing key is registered on GitHub as a _signing key_ for an account whose verified email matches the committer email.
- **Docs affected.** arc42 `05.03` (`ai-git.js`, `secrets.js` rows), the `AGENTS.md` `.aiconfig.json` field table, `projects/_template/.aiconfig.json`.

## Key setup

1. Generate a dedicated, passphrase-less key (it must work non-interactively): `ssh-keygen -t ed25519 -C "ai-git commit signing" -f ./ai-git-signing -N ""`.
2. Register the public key (`ai-git-signing.pub`) at <https://github.com/settings/ssh/new> with **Key type = Signing Key**. An _Authentication Key_ does not verify commits.
3. Store the private key (full file contents, including the `BEGIN`/`END` lines) in the secrets manager that `secrets.run` points at, under the env var name set in `git_signing_key_env`, and export it into the session environment so `ai-git` does not fetch it per command.
4. Delete both local key files.

Reference: GitHub's [signing-key instructions](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key). The steps and URLs above are from memory and not checked against it.

## Milestones

### 1. Pure logic and config

- Does: `getSigningKeyEnvName(config)`, `isSigningRequired(config)`, `needsSigning(subcommand)`, `normalizePrivateKey(text)` (rejects text without a `PRIVATE KEY` block; ensures a trailing newline), `buildSigningConfigArgs(keyPath)`; `AGENTS.md` field rows (`git_signing_key_env`, `git_signing_required`) and template config entries.
- Acceptance criteria: unit tests cover signing on/off, every classified subcommand, malformed and CRLF keys, and that `-c` args never contain key material (only a path).
- Verified by: `npm run test:unit`.

### 2. Wire into `bin/ai-git.js`

- Does: read the key from the session env, falling back to `secrets.run` when missing; temp-file lifecycle with guaranteed cleanup (also on spawn error and non-zero exit); the `git_signing_required` policy.
- Acceptance criteria: with a throwaway key, `ai-git commit` produces a commit whose signature passes `git verify-commit` against an `allowedSignersFile` built in the test; no temp key file remains afterwards; with `git_signing_required` true an unresolvable key exits non-zero naming only the variable, and with it false a warning is printed and the commit is made unsigned; with the key already in the environment no `secrets.run` command is spawned; with signing unconfigured, behaviour is unchanged.
- Verified by: `npm run test:integration` (uses `ssh-keygen` to generate a throwaway key; a missing `ssh-keygen` fails the test rather than skipping it).

### 3. Doctor and docs

- Does: `ai-git doctor` reports `ok`/`FAIL` for signing (key env resolved, `ssh-keygen` on PATH, the `git_signing_required` setting) only when signing is configured, never printing the key; update arc42 `05.03`; required version bumps.
- Acceptance criteria: doctor output is unchanged when signing is unconfigured; `aif index architecture --check` and `aif validate` pass.
- Verified by: unit tests for the report, validation suite.

### 4. Enable signing

- Does: complete the key setup above; set `ai_identity.git_signing_key_env` in `.aiconfig.json` (with `git_signing_required: false` while testing); push a test commit.
- Acceptance criteria: the new commits report `verification.verified == true` and `reason == valid` via the GitHub commits API.
- Verified by: `ai-git gh-api repos/{owner}/{repo}/pulls/<n>/commits`.

## Requirements

- Security: the private key is never committed, logged, echoed, put in argv or a URL, or persisted in `.git/config`; the temp file is `0600` in a `0700` directory and is removed on every exit path; error messages name the env var only; the key is used for signing only, so it can be revoked independently of the API token.
- Logging: failures (key unresolved, `ssh-keygen` missing, malformed key, temp-file error) go to stderr naming the variable or tool, never a value. Successful signing is silent, like the other `ai-git` operations.

## Open questions

- None.
