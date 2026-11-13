---
name: typescript_electron
version: 1.0.0
description: Electron desktop-shell conventions for TypeScript projects, covering process model, hardening, IPC, privacy checks, fuses, packaging and end-to-end testing
tags: [typescript, electron]
depends_on: [typescript_node, typescript_react]
---

# Standards: TypeScript Electron

Conventions for an Electron desktop shell around a React renderer, layered on `typescript_node` (main process, preload, build tooling) and `typescript_react` (renderer). Written for apps that handle private data on the user's own machine, where nothing may leave the computer unless the user opts in. A project that needs a looser setting records an exception in its own project standards.

Where this file disagrees with a standard it depends on, this file wins. Rules marked measured come from running the packaged app on CI runners; re-verify them on each Electron update (see Updates).

---

## Stack Baseline

| Layer            | Convention                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell            | Electron, pinned to an exact version                                                                                                                                                                            |
| Platforms        | Windows and macOS first; Linux later (see Linux)                                                                                                                                                                |
| Main and preload | TypeScript under `typescript_node` (NodeNext, `.js` specifiers), one `tsconfig` per process                                                                                                                     |
| Renderer         | `typescript_react` (Bundler resolution, no Node, no Electron imports)                                                                                                                                           |
| Packaging        | `@electron/packager` with `@electron/fuses`, and `electron-builder` for installers; another tool must meet every rule below                                                                                     |
| Install          | Check whether the pinned Electron has an install script (`npm install-scripts ls`). Where it has none, it needs no `allowScripts` entry; the binary downloads on first run, or with `npx install-electron --no` |

Electron ships frequent majors tracking Chromium, and only the most recent few get security fixes (check the current support policy). Chromium security fixes become the project's job once it bundles Chromium. Plan monthly updates (see Updates).

---

## Process Model

| Process  | Runs                        | May import                                                             | Must not import                        |
| -------- | --------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| Main     | Node, full OS access        | `electron` main APIs, `node:*`, platform-neutral code                  | React, the DOM, renderer code          |
| Preload  | Isolated world, before page | `electron` (`contextBridge`, `ipcRenderer`), the shared channel schema | Node file or process APIs, React       |
| Renderer | Chromium page, sandboxed    | React, platform-neutral code                                           | `electron`, `node:*`, the preload code |

- The renderer is **untrusted**: it handles files and text from outside, so the main process validates everything it receives from it.
- The main process does the file-system, dialog, menu and OS work, and exposes it through a host interface (see `typescript_react` Host Access). The renderer never gets a path it did not receive from a dialog or from the app's own data folder.
- Enforce the table with dependency-cruiser (see `typescript_base` Tooling).

---

## Window Hardening

Every `BrowserWindow` is created from one factory that sets these, so no window can be created without them:

| Setting                                      | Value                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `webPreferences.contextIsolation`            | `true`                                                                                |
| `webPreferences.nodeIntegration`             | `false`; also keep `nodeIntegrationInWorker` and `nodeIntegrationInSubFrames` `false` |
| `webPreferences.sandbox`                     | `true`                                                                                |
| `webPreferences.webSecurity`                 | left at its default (`true`)                                                          |
| `webPreferences.allowRunningInsecureContent` | `false`                                                                               |
| `webPreferences.webviewTag`                  | `false`                                                                               |
| `webPreferences.spellcheck`                  | `false` (and see Privacy Switches)                                                    |

- **No remote content.** The window loads only the app's own custom protocol. Never call `loadURL` with an `http(s)` or `file:` address, never call `loadFile`, and never embed a remote page, script, style, font or image.
- **Navigation is blocked.** Deny `will-navigate` and `will-redirect` to anything but the app origin, deny every new window with `setWindowOpenHandler`, and prevent `<webview>` attachment (`will-attach-webview`).
- **External links** open only on an explicit user action, through the host interface, which allows an `https:` scheme only and opens the system browser.
- **Permissions are denied.** Set `setPermissionRequestHandler`, `setPermissionCheckHandler` and the device-permission handler on the session to deny everything, including device, notification, media, clipboard-read and USB or serial requests. A feature that needs one is an explicit, reviewed exception.
- **A deny-all request filter** on the session allows only the app protocol, DevTools, `data:` and `blob:`, and cancels every other request. It is a backstop, not a substitute for the other rules: some Chromium-initiated requests bypass it.

---

## Custom Protocol and Content Security Policy

- The UI is served from a **custom protocol** registered as privileged before the app is ready, never from `file:`. The handler resolves each request to a file inside the app bundle only (reject `..`, absolute paths, and anything outside the bundle), serves no directory listing, and returns 404 for the rest.
- Every response carries a **strict Content Security Policy**, set by the protocol handler (not a `<meta>` tag that can be edited away). The baseline is:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

- If the design system or chart library injects `<style>` elements at runtime, give them a per-load nonce rather than adding `'unsafe-inline'` to `style-src`. Fluent UI's Griffel supports this through `createDOMRenderer` with `styleElementAttributes` and `RendererProvider` (`FluentProvider` has no nonce prop). ECharts' SVG renderer sets inline `style` attributes on text, which a strict `style-src` may block (`style-src-attr`); this is an inference, not a measurement, so test it on the pinned versions. A per-load nonce also replaces
- A feature that must make a request (a server-backed store, an online lookup) adds exactly that origin to `connect-src`, is opt-in by the user, and is added to the capture allowlist (see Privacy Capture).

---

## IPC and the Preload Bridge

- The preload exposes **one small, named API object** through `contextBridge.exposeInMainWorld`. It exposes functions, never `ipcRenderer`, `ipcRenderer.on` with a raw callback, `require`, or any Node object.
- Define the channels once, in a shared schema module: channel name, request schema, and response schema (see `typescript_base` Trust Boundaries). Both the preload and the main process derive their types from it, so they cannot drift.
- Use `ipcRenderer.invoke` and `ipcMain.handle`. In every handler: (1) check that the sender is the app's own frame (the sender's URL has the app protocol origin), (2) validate the request with its schema, (3) return a `Result`, not a thrown error. Reject and log anything else.
- Replies and events carry only structured-clone data: plain objects and arrays, no class instances, functions or `Error` objects. Convert errors to the project's error codes before they cross.
- File and path arguments from the renderer are opaque handles or dialog results, never raw paths the renderer composed. The main process re-checks any path against the allowed base directories (see `javascript_node` Security Requirements).
- Never `eval`, `executeJavaScript`, or interpolate renderer data into a shell command, a path, or a URL in the main process.

---

## Privacy Switches

Apply these from the first scaffold, in the main process, before `app` is ready where they are command-line switches or environment:

- **No crash reporter.** Never call `crashReporter.start`.
- **No updater, no update check** by default (see Packaging). The only mechanism that fits a no-leak rule is an opt-in, user-triggered check that fetches a static version file, and adding it is a decision for the human.
- **No proxy discovery:** `app.commandLine.appendSwitch('no-proxy-server')` before the app is ready.
- **Spellcheck off and its language list emptied:** disable spellcheck in `webPreferences` and call `session.setSpellCheckerLanguages([])`. Chromium downloads dictionaries from a Google CDN, and that request also bypasses the deny-all request filter. Electron's docs say an empty list falls back to `en-US`, and name `session.setSpellCheckerDictionaryDownloadURL` as the documented control. In one project's measurement the empty list was the only change that stopped the request, so the capture (see Privacy Capture) is the arbiter: re-check on every Electron update, and decide with the human whether to also set the download URL.
- **Remove the Google API environment variables** (`GOOGLE_API_KEY`, `GOOGLE_DEFAULT_CLIENT_ID`, `GOOGLE_DEFAULT_CLIENT_SECRET`, and any `GOOGLE_CLIENT_ID_*` or `GOOGLE_CLIENT_SECRET_*`) from the process environment before use, so Chromium never receives Google service credentials.
- No telemetry, analytics or error-reporting SDK in any process.

### Known Chromium Notice

Before host-name resolution (even for an IP literal), Chromium makes an IPv6 reachability check: a UDP `connect()` to a public Google DNS address (`2001:4860:4860::8888`) on port 443. It sends no packet. No switch to disable it was found, though Chromium's source has override features, so treat it as unavoidable until tested. It is absent while the app makes no request. The capture allowlist names this one notice and nothing else; when a feature starts making requests, expect it to appear and allowlist it explicitly.

---

## Fuses

Flip fuses at packaging time with `@electron/fuses`. A release build sets:

| Fuse                                    | Release value |
| --------------------------------------- | ------------- |
| `RunAsNode`                             | off           |
| `EnableNodeOptionsEnvironmentVariable`  | off           |
| `EnableNodeCliInspectArguments`         | off           |
| `OnlyLoadAppFromAsar`                   | on            |
| `EnableEmbeddedAsarIntegrityValidation` | on            |
| `EnableCookieEncryption`                | on            |
| `GrantFileProtocolExtraPrivileges`      | off           |

- CI reads the fuses back from the **packaged binary** (`@electron/fuses read`) and fails on any mismatch with this table.
- ASAR integrity is supported on **Windows and macOS only**, and is marked experimental. It also needs the app packed with `@electron/asar` and `OnlyLoadAppFromAsar` on, or it can be bypassed. On Linux the fuse gives no protection; do not claim it does.
- A development build may relax a fuse only through a separate build target, never a runtime switch in the release binary.

---

## Automation Guard

The shipped binary contains no automation server and no network listener.

- A main-process guard refuses `--remote-debugging-port`, `--remote-debugging-pipe`, `--remote-allow-origins` and every `--inspect*` flag unless a project-named guard environment variable (for example `APP_AUTOMATION=1`) is set. The Node inspect fuse stays off in release builds.
- The same variable enables the renderer's test hook (a `window` object returning structured page state as JSON). Without the variable the hook does not exist.
- The guard acts after Chromium starts parsing flags, so a very early attach is not covered; do not claim the guard blocks it.

---

## End-to-End Testing

If `typescript_testing` is loaded, its rules apply. Specific to Electron:

- Drive the **packaged release binary**, not a development build, with the guard variable set. Playwright's `electron.launch` passes `--inspect=0` and `--remote-debugging-port=0`, so it does not work with the inspect fuses off, and no built-in `--remote-debugging-pipe` support was found. The project therefore supplies its own launch: the test process starts the binary with `--remote-debugging-pipe` and relays Chromium's debugging pipe, so no network port exists. This harness was measured in one project but is unverified against Playwright's documentation; check it against the pinned versions.
- Behaviour that depends on real focus (tab order, dialog focus) is checked with real key events where the platform allows; synthetic events from a driver do not move focus the way a user does.
- Run the suite on every supported operating system, with screenshot baselines per operating system (see `typescript_testing`).

---

## Privacy Capture

Nothing leaves the machine unless the user opts in, and an Electron update can add request types. A CI job proves it and runs **on every Electron update**, and on any dependency change that can alter network behaviour.

- **Setup (Linux runner, the most rigorous):** run the built app in an isolated network namespace with `strace` on every network syscall and `tcpdump`, a sink route so any attempt is seen, a **positive control** that proves the capture detects a connection, and a DNS-name analyser.
- **Scenario:** launch, visit every screen, then five minutes idle.
- **Fail** on any non-loopback `connect()` and any external DNS query, other than the one Known Chromium Notice above.
- **Windows and macOS:** per-process socket sampling. Until a capture exists for an operating system, the privacy claim for it is unproven; say so rather than imply otherwise.
- A person reads the job's output on every Electron bump. A green job that nobody reads is not a gate.
- The Linux job runs even though Linux is a later platform, because it is the strongest evidence available. It does not replace Windows and macOS checks.

---

## Packaging

- Build installers for Windows (NSIS) and macOS (disk image). Every release binary has the fuses set and the guard in place, and passes the fuse read-back.
- **No auto-update** by default (see Privacy Switches). Updates are installed by hand.
- Code signing and notarisation need a paid certificate and developer account, which the no-paid-components rule excludes by default. Whether builds are signed is a project decision recorded in its standards; unsigned builds ship with first-run instructions (the Windows SmartScreen publisher warning, macOS Gatekeeper's right-click Open).
- Every Electron update means a new build and a full test pass for each operating system.

### Linux

When Linux is added:

- Ship a **`.deb`** first, built with electron-builder's default install script, which chooses the sandbox mode and installs an AppArmor profile on Ubuntu 24.04 and later.
- A CI job installs the package on Ubuntu 24.04 and launches it **without `--no-sandbox`**. Never ship or document `--no-sandbox` as a fix.
- An AppImage is secondary only: it cannot carry the profile and silently runs without the Chromium sandbox on those systems.
- Test X11 and Wayland, and real GPUs; CI runners have neither.

---

## Updates

- Pin Electron exactly, and move it monthly behind the full regression suite: unit and integration tests, per-OS end-to-end and screenshot baselines, fuse read-back, and the privacy capture.
- Re-test the GPU and display-server paths on each major.
- Read the Electron release notes for changed defaults in security, protocol, session and permission APIs, and re-verify each rule in this file that depends on them.

---

## Security Requirements

Combine with `typescript_node`, `typescript_react` and `typescript_base`.

- [ ] Context isolation on, Node integration off, sandbox on, `webviewTag` off, `webSecurity` default, for every window
- [ ] The UI loads only from the custom protocol; no `file:` or remote URL loaded or embedded
- [ ] Strict CSP on every response; no `'unsafe-inline'` scripts or `'unsafe-eval'`
- [ ] Deny-all permission handlers, deny-all request filter, navigation, redirects, new windows and `<webview>` blocked
- [ ] Preload exposes a small named API; no `ipcRenderer`, `require` or Node object reaches the renderer
- [ ] Every IPC handler checks the sender, validates with a schema, and returns a `Result`
- [ ] Renderer-supplied paths are handles or dialog results, re-checked against allowed base directories
- [ ] No crash reporter, updater, proxy discovery, telemetry; spellcheck off with its languages emptied; `GOOGLE_*` variables removed
- [ ] Fuses set per the table and read back from the packaged binary in CI
- [ ] Debugging and inspect flags refused without the guard variable; no automation server in the release binary
- [ ] Privacy capture runs on every Electron update and its output is read
- [ ] Linux `.deb` launches in CI without `--no-sandbox`
