---
name: typescript_react
version: 1.0.0
description: React renderer conventions for TypeScript projects, covering components, state, accessibility, Vite, virtualized tables and charts
tags: [typescript, react]
depends_on: [typescript_base]
---

# Standards: TypeScript React

Conventions for browser-side React code (the web app, or an Electron renderer), layered on `typescript_base`. Runs in a browser engine, so it never imports from Node. Shell-specific rules (Electron) live in `typescript_electron`; rules for one design system live in that system's layer (for example `typescript_react_fluentui`).

This file assumes `typescript_base` is loaded (per `depends_on`). Where this file disagrees with it, this file wins.

---

## Stack Baseline

| Layer         | Convention                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------- |
| UI library    | React, function components and hooks                                                          |
| Bundler       | Vite                                                                                          |
| Module system | ES Modules, `moduleResolution` `Bundler`: relative imports have **no file extension**         |
| JSX           | `"jsx": "react-jsx"`; `.tsx` files; no `import React` for JSX                                 |
| Large tables  | TanStack Virtual (`@tanstack/react-virtual`)                                                  |
| Charts        | ECharts, behind chart models                                                                  |
| Design system | One design-system package, hidden behind app-owned components (see Design System Containment) |

Renderer code imports only from the browser platform, React, its own packages, and platform-neutral code. It never imports `node:*` or Electron. Anything it needs from the operating system comes through a host interface (see Host Access). Overrides `typescript_base` Import Specifiers: extension-free relative imports here, `.js` extensions on Node-side code.

---

## Components

- **Function components and hooks only.** The one exception is an error boundary, because React offers no hook for it: write one small class, once, and reuse it.
- **Thin components.** A component reads state, calls handlers, and returns JSX. Parsing, formatting, sorting, filtering, validation and decisions live in pure functions in separate modules (see `javascript_node` Project Structure and `steering/engineering/core.md`: "Design for Testability"), where they are unit-tested without rendering. If a component needs more than a trivial test, move logic out of it.
- One exported component per file, as a named export; the file is kebab-case (`transaction-row.tsx`) and the component PascalCase. No default exports, except where a tool requires one (a lazy-loaded route, a config file).
- Props are an explicitly named `type` with `readonly` members. Never spread unknown props onto a DOM element. Children typed as `ReactNode`.
- Pass `ref` as an ordinary prop; do not wrap new components in `forwardRef`.
- Keys are stable ids from the data, never the array index of a list that can reorder, insert or delete.
- **Effects synchronise with external systems only** (subscriptions, timers, imperative widgets). Never use an effect to derive state from props or state: compute it during render, or in a pure function.
- Memoise (`useMemo`, `useCallback`, `memo`) only after measuring a problem, and say what was measured in a comment.
- Lint with `eslint-plugin-react-hooks` at error level, including `exhaustive-deps`. Suppressing it needs a reason in the comment.

---

## State

- Application state lives outside React in a store, and components read it through **`useSyncExternalStore`**. The store exposes `subscribe` and `getSnapshot`.
- A snapshot is an immutable value, and `getSnapshot` returns the same reference until the state changes. A selector that builds a new object or array on every call causes an endless re-render loop, so derive with a memoised selector or in a pure function over the snapshot.
- Components subscribe through small typed hooks (`useAccounts()`), not by importing the store everywhere.
- Local component state (`useState`) is for transient UI only: an open popover, a text input before commit, a hover. Anything the domain cares about goes through the store.
- Mutations go through the project's command path, never by writing to the snapshot.

---

## Host Access

A component never calls a platform global (`window.electron…`, `showOpenFilePicker`, `localStorage` as a data store) directly. It uses a host interface provided through React context and implemented by the shell: an Electron preload bridge, a browser adapter, or a test double. This keeps the same renderer usable in the browser and, later, other shells. The adapter is the only file that knows which shell it runs in.

---

## Accessibility

Accessibility is a default, not a polish step.

- Use the semantic element first (`button`, `a`, `table`, `label`, `dialog`-based component, headings in order). Add ARIA roles only when no element fits, and never contradict an element's native role.
- Every interactive control has an **accessible name** (visible label, `aria-label`, or `aria-labelledby`) and a **role** a driver can locate by. A control with only an icon gets an `aria-label`.
- Everything works from the keyboard: logical tab order, visible focus, `Enter` or `Space` to activate, `Escape` to dismiss, arrow keys inside composite widgets. Never remove the focus outline without replacing it.
- A dialog traps focus while open and returns focus to the trigger when closed.
- Never convey state by colour alone; pair it with text or an icon with a name. Respect `prefers-reduced-motion`.
- Announce asynchronous results (errors, saved, imported) in a live region.
- Enable an accessibility lint rule set. Adding a lint plugin is a dependency decision for the project.

### Stable Test Identifiers

- Interactive elements and the main landmarks of each screen carry a `data-testid`. Tests prefer role and accessible name, and use the test id where those are ambiguous.
- Values are kebab-case, describe the element's purpose (`import-confirm-button`), and are never derived from copy, styling, or a list index. Use an id from the data for repeated rows (`row-${id}`).
- A test id is part of the app's test contract: renaming or removing one is a deliberate change and updates its tests in the same change.

---

## Design Tokens and Design System Containment

- **Tokens, not literals.** No hard-coded colours, spacing, font sizes, radii, shadows or z-indexes in components. Use the design system's tokens, or an app token defined in the one theme module. Light and dark themes come from that module.
- **Containment.** Imports of the design-system package appear in exactly one designated folder of the renderer. Screens import app-owned components (shell, dialogs, banners, icons, tables, form controls) from that folder and never the design system itself. Replacing the design system then touches that folder only.
- Enforce containment with dependency-cruiser (see `typescript_base` Tooling) and a failing CI check. The folder's path is set in the project's standards.
- Charts and any other non-design-system rendering read their colours from the same tokens and redraw on theme change.

---

## Vite

- The renderer is self-contained: bundle fonts, icons and scripts. No CDN links, remote fonts, remote scripts or remote images, in markup or CSS.
- The dev server binds to loopback only. Never expose it on all interfaces or tunnel it.
- Only variables prefixed `VITE_` reach client code, and they are public. Never put a secret in one.
- Pin Vite exactly. Under npm 12, any dependency with an install script (esbuild, where it is in the tree, has one) needs an `allowScripts` entry; check with `npm install-scripts ls` and see `typescript_node` Install scripts.
- The production build fails on type errors and lint errors; type-check runs separately (`tsc --noEmit`) because Vite does not type-check.
- Set `build.target` to the oldest engine the shell ships, not a generic "modern" default.

---

## Large Tables

Use TanStack Virtual for any list or table that can exceed a few hundred rows. Rows that are not in the DOM are not in the accessibility tree, so the table states its size itself.

- The scroll container is the single tab stop; arrow keys move the selection, `Home` and `End` jump, and the selected row scrolls into view.
- Set `aria-rowcount` on the table and `aria-rowindex` on each rendered row, `aria-selected` on rows, and `aria-sort` on sorted column headers. Use the `table` or `grid` roles consistently with the keyboard model you implement; a full ARIA grid is not required, but never claim a role you do not support.
- Give virtualized rows a stable key (the row id) and either a fixed row height or a measured one, never a guess that differs from what renders.
- Sorting, filtering and selection happen on the data (pure functions), not on the rendered DOM.

---

## Charts

Charts use ECharts behind **chart models**:

- A chart model is a pure function from domain data and tokens to a plain, typed chart description (series data, labels, colours). It has no React and no ECharts import, so it is unit-tested directly.
- One thin component takes a chart model and renders it with ECharts (SVG renderer). Replacing ECharts then changes that component only.
- Import ECharts through its modular entry point and register only the components used, so the bundle is tree-shaken.
- Money and other branded values reach the chart as integers and are formatted from integers by a formatter, never through a float.
- ECharts' generated accessibility description reads raw values, so keep it off and supply an app-written label. Every chart has a keyboard-reachable equivalent: its legend entries are real buttons, and the same numbers appear in a table beside it.
- Colours come from design tokens; the chart redraws on theme change. Click events become typed callbacks (drill-down), not raw ECharts events.

---

## Security Requirements

Combine with `typescript_base`.

- [ ] No `dangerouslySetInnerHTML`; untrusted text is rendered as text. If HTML must be shown, it is sanitised first and a reviewer approves the exception
- [ ] No `eval`, `new Function`, or inline `<script>`; the page works under a strict content security policy
- [ ] No remote fonts, scripts, styles, images or analytics in markup, CSS or JavaScript
- [ ] URLs taken from data are validated (scheme allowlist) before use in `href`, `src` or navigation
- [ ] External links are never opened implicitly; follow-through is an explicit user action
- [ ] No secrets in `VITE_` variables or client code
- [ ] Renderer code imports nothing from Node or Electron, and reaches the platform only through the host interface
