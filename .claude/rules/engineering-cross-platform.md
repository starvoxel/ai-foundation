---
paths:
  - bin/**
  - lib/**
  - scripts/**
  - .githooks/**
  - .github/scripts/**
  - tests/**
  - "**/*.sh"
  - "**/*.mjs"
---

## Scope

All agents with `domain = "engineering"`, when writing or changing command-line, script, hook, or test code. Complements the path rules in `standards/javascript_node.md`.

---

## Rules

### Rule: CLI Code Must Work on Windows and POSIX

- Build and compare paths with `node:path`; never hard-code `/` or `\`, and resolve a path before comparing it to another
- Spawn child processes without a shell and by explicit executable. A bare command name fails on Windows when it is an npm `.cmd` shim, so run the shim's script via `process.execPath`. Use a shell only when it is required, and then never interpolate untrusted input
- Never rely on the POSIX exec bit, shebang execution, POSIX signals (`SIGTERM` is a hard kill on Windows), or `/tmp`; use `node:os` for temp and home directories
- Never assume line endings; compare content with `\r\n` normalised unless bytes matter
- Where behaviour must differ by platform, branch on `process.platform` in one place and say why in a comment

**Rationale:** Windows users run the CLI, and Linux-only CI let platform assumptions ship.

**Exceptions:** Code that is explicitly POSIX-only (a `.sh` hook that git runs through its own `sh`), stated in its header.

### Rule: Platform-Specific Tests Skip Explicitly, Never Silently

- A test that cannot run on a platform uses the runner's skip with a stated reason, or guards only the platform-specific assertions. It must never pass vacuously or be deleted
- Keep the other platform's assertion intact; do not weaken a POSIX check to make Windows pass
- Tests build paths with `node:path` and `resolve()` the fixtures that must be absolute (`/proj` is not absolute on Windows)

**Rationale:** A silent skip hides a real regression on the skipped platform.

**Exceptions:** None.

---

## Enforcement

A new `spawn`, `exec`, signal, exec-bit, or hard-coded path use that fails on one platform is MEDIUM at review; a weakened or silently dropped platform assertion is MEDIUM.
