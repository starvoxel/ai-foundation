---
name: typescript_react_fluentui
version: 1.0.0
description: Fluent UI React v9 conventions layered on typescript_react
tags: [typescript, react, fluentui]
depends_on: [typescript_react]
---

# Standards: TypeScript React Fluent UI

Loaded only by projects tagged `fluentui`. Holds only the rules that apply when Fluent UI React v9 (`@fluentui/react-components`) is the design system; everything about components, accessibility, tokens and containment in general is in `typescript_react`. Where this file conflicts with `typescript_react`, this file wins.

---

## Stack

- `@fluentui/react-components` v9 only. Never mix in v8 (`@fluentui/react`), and never import preview packages (`*-preview`) without a decision from the human: their API can change in a minor release.
- Icons come from `@fluentui/react-icons`.
- Pin Fluent and its companion packages to exact versions (see `typescript_node` Package Management and Supply Chain). Verify every component and token name used against the pinned version before relying on it; names in examples and older documentation drift between releases.
- Import from the package entry (`@fluentui/react-components`), not from deep or internal paths.
- Griffel injects styles at runtime. Under a strict CSP (see `typescript_electron` Custom Protocol and Content Security Policy for an Electron shell), create the renderer with `createDOMRenderer({ styleElementAttributes: { nonce } })` and provide it through `RendererProvider`; `FluentProvider` has no nonce option.

---

## Containment

`typescript_react` Design System Containment applies, with `@fluentui/*` (including `@fluentui/react-icons`) as the design-system package.

- App-owned components expose their own prop types, not Fluent's, so a Fluent upgrade does not change screen code.

---

## Theme and Tokens

- One theme module owns the theme. It builds the light and dark themes from a brand ramp (`createLightTheme`, `createDarkTheme`), follows the system theme unless the user chose one, and supplies the app tokens that Fluent does not have.
- Wrap the app in a single `FluentProvider` at the root, with the theme from that module. Never nest providers to restyle a subtree.
- Use `tokens.*` for every value that `typescript_react` Design Tokens and Design System Containment lists. Never copy a token's resolved value.
- Style with `makeStyles` and `mergeClasses` using tokens. No inline style literals and no `!important`.
- Charts and other non-Fluent rendering read colours through one helper that resolves the active theme's tokens, and redraw when the theme changes.
- Keep Fluent's font tokens (the system font stack); do not import a web font (see `typescript_react` Vite).

---

## Components

- Form controls get their label through `Field` or `Label` (see `typescript_react` Accessibility for the naming rules).
- Use `MessageBar` for status banners, `Dialog` for modal flows, `Switch` for on/off settings, `TabList` for real tabs and `Button` with `appearance="primary"` for the one primary action of a view.
- Check on adoption that `Dialog` takes focus on open and returns it to its trigger on close, and that menus and popovers close on `Escape`; fix gaps in the app-owned wrapper, not at each call site.
- Fluent's table components supply markup and styles only. Row virtualization comes from TanStack Virtual (see `typescript_react` Large Tables). Before choosing `Table` or `DataGrid`, confirm that the roles and keyboard behaviour Fluent renders match the keyboard model the app implements, and do not claim a grid role the app does not support.
- Test ids and accessible names are set on the app-owned component, so tests never depend on Fluent's generated markup or class names.
