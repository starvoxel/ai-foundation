---
name: typescript_base
version: 1.0.0
description: Core TypeScript language, type-safety, boundary and tooling conventions for all TypeScript projects
tags: [typescript]
depends_on: [javascript_base]
---

# Standards: TypeScript Base

Runtime-agnostic TypeScript conventions, layered on `javascript_base`. Applies to any TypeScript code regardless of where it runs (Node, browser, Electron main or renderer). Runtime and framework rules live in the layers that depend on this file: `typescript_node`, `typescript_react`, `typescript_electron`, `typescript_react_fluentui`, `typescript_testing`.

This file assumes `javascript_base` is loaded (per `depends_on`). Where the two disagree, this file wins; the Override Points section lists every case. All other `javascript_base` rules (naming, variables, functions, equality, async, formatting) apply unchanged.

---

## Language Baseline

| Aspect           | Convention                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Language version | TypeScript 7.x, strict mode, pinned to an exact version                                                        |
| Module system    | ES Modules; resolution mode per runtime layer (see Import Specifiers)                                          |
| Emit             | Type-check only (`noEmit`) unless a project standard says otherwise; the bundler or runtime emits              |
| Syntax           | No `enum`, no `namespace`, no constructor parameter properties, no decorators unless a framework requires them |
| Target and `lib` | ES2022 or newer (`Error` `cause` needs it), matching the oldest runtime that runs the code                     |

Before upgrading the TypeScript major version, confirm the pinned `typescript-eslint` release supports it.

---

## Compiler Options

Every project's root `tsconfig` enables all of these. A package may only tighten them.

| Option                       | Value  | Why                                                                       |
| ---------------------------- | ------ | ------------------------------------------------------------------------- |
| `strict`                     | `true` | Baseline: includes `useUnknownInCatchVariables` and `strictNullChecks`    |
| `noUncheckedIndexedAccess`   | `true` | `array[i]` and record lookups are `T \| undefined`, so absence is handled |
| `exactOptionalPropertyTypes` | `true` | `{ a?: string }` cannot be assigned `undefined` explicitly                |
| `noImplicitOverride`         | `true` | Overrides must say `override`                                             |
| `verbatimModuleSyntax`       | `true` | Type-only imports are explicit (`import type`), so emit is predictable    |
| `isolatedModules`            | `true` | Every file is compilable alone, which bundlers and test runners require   |

- Never weaken an option, or add `// @ts-ignore`. `// @ts-expect-error` is allowed only with a reason on the same line, and only in tests of the type system itself.
- A suppression of a lint rule needs a reason in the comment.

---

## Types

### No `any`, `unknown` at Boundaries

- Never write `any`, and never rely on an implicit one. Use `unknown` for values whose shape is not known and narrow them with a schema (see Trust Boundaries) or a type guard before use.
- Never use a non-null assertion (`!`) or a type assertion (`as T`) to silence the compiler. A cast is allowed only inside the one validating constructor or schema that proves the claim, and `as const` is always allowed.
- Catch variables are `unknown`; narrow with `instanceof Error` before reading `.message`.

### Explicit Return Types on Exports

Every exported function, method and exported `const` function states its return type. Locals and non-exported helpers may infer. Explicit exports keep the public API stable and make compile errors point at the implementation, not at every caller.

```typescript
// Correct
export function parseTag(raw: string): Result<Tag, TagError> {
  /* ... */
}

// Wrong — return type inferred on an export
export function parseTag(raw: string) {
  /* ... */
}
```

### Immutability

- Mark data that is not reassigned `readonly`: properties, tuples (`readonly [A, B]`), and arrays in signatures (`readonly T[]` or `ReadonlyArray<T>`).
- Update immutably: return new objects and arrays with spread (as `javascript_base` requires). Never mutate a parameter.
- Prefer `as const` objects and `satisfies` for constant tables, so literal types are kept and the shape is still checked.

### Unions, Not Enums

- Never use `enum`. Use a string-literal union, or an `as const` object with a derived type when the values are also needed at runtime.
- Model variants as discriminated unions with one literal `kind` (or `type`) field, and handle them with an exhaustive `switch` whose `default` assigns to `never`:

```typescript
export type Shape =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'square'; readonly side: number };

function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

export function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.side ** 2;
    default:
      return assertNever(shape);
  }
}
```

### Naming

| Construct                       | Convention                                 | Example                  |
| ------------------------------- | ------------------------------------------ | ------------------------ |
| Types, interfaces, type aliases | PascalCase, no `I` prefix                  | `Transaction`, `HostApi` |
| Generic parameters              | `T` or a short descriptive PascalCase name | `T`, `TKey`              |
| Files                           | kebab-case with `.ts` (`.tsx` for JSX)     | `date-range.ts`          |

Use `type` for unions, aliases and brands; use `interface` for object contracts that are implemented or extended.

### Branded Types for Quantities With Rules

A plain `string` or `number` carries no meaning, so values with rules get a compile-time brand and are created only through a validating constructor. Candidates: money, calendar dates without a time zone, identifiers, percentages, and any quantity whose units or range matter.

```typescript
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type Cents = Brand<number, 'Cents'>;

export function cents(value: number): Result<Cents, 'not-a-safe-integer'> {
  return Number.isSafeInteger(value) ? ok(value as Cents) : err('not-a-safe-integer');
}
```

- The constructor is the only place that casts to the brand; everything else receives an already-valid value.
- Brands cost nothing at runtime. Never use one for a value that has no rule to enforce.
- **Money** is a branded whole number of the currency's minor unit (for example cents). All arithmetic goes through checked helpers that reject a result that is not a safe integer. Never use floating-point arithmetic on money, and parse decimal strings into minor units without going through a float. Format from integers.
- **Dates and times.** Never use `Date` in domain code: its time-zone and daylight-saving behaviour makes domain results machine-dependent. Represent a calendar date as a branded `YYYY-MM-DD` string (and a month as `YYYY-MM`), and keep `Date` and `Intl` at the edges where text is displayed.
- **Time** comes from an injected `Clock` interface (`now(): Instant`), never from `Date.now()` or `new Date()` inside domain code, so "today" and "current month" logic is testable.
- **Identifiers** are branded strings generated with `crypto.randomUUID()`, never sequential numbers, unless a rule says otherwise.

---

## Error Handling

Overrides `javascript_base`: Error Handling adds the Result convention below. Its other rules (throw only `Error`, include context, preserve `cause`) still apply.

- **Expected failures are values.** A failure the caller should handle (invalid user input, a file that does not parse, a rule that refuses an action) is returned as a `Result`, not thrown. **Bugs and unrecoverable states are exceptions**: a violated invariant, an exhausted `switch`, a programming error.
- Define one small project-local `Result` type in the shared base package; do not add a library for it. Error values are string-literal codes or discriminated unions, not `Error` instances, so callers can `switch` on them exhaustively.

```typescript
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- Custom error classes extend `Error`, set `name`, take the original failure as `{ cause }`, and expose any machine-readable detail as a `readonly` field. Add `override` where a base member is replaced.

```typescript
export class StoreReadError extends Error {
  override readonly name = 'StoreReadError';

  readonly path: string;

  constructor(path: string, options: { cause: unknown }) {
    super(`Failed to read store at ${path}`, options);
    this.path = path;
  }
}
```

- At a process or UI boundary, convert a thrown error to a user-safe message; never show stack traces or internal detail (see `javascript_base` Security Requirements).

---

## Trust Boundaries and Validation

Every value that crosses a trust boundary is `unknown` until a runtime schema has validated it. Trust boundaries: parsed JSON or other file contents, anything read from disk, IPC and message-passing payloads, environment variables, network responses, URL and form input, imported files (CSV and similar), and archive entries.

- Use one schema library across the project: **zod** (or an equivalent that infers static types from the schema). Derive the TypeScript type from the schema (`z.infer`) so the two cannot drift, and never hand-write a parallel type.
- Validate at the edge and pass the typed result inward. Core logic never re-validates and never receives `unknown`.
- A failed validation is an expected failure: return a `Result` carrying the schema issues (not the raw input) rather than throwing.
- `JSON.parse` returns `any` in the TypeScript library. Treat its result as `unknown`: pass it straight into a schema and never assign it to a typed variable. The `no-unsafe-*` rules in the lint config (see Tooling) catch a slip.
- Schemas for persisted data are versioned with the data, and every format change has a migration step.

### Archives

Zip and other compressed containers use **fflate**. Treat the archive as untrusted input:

- [ ] Reject entry names that are absolute, contain `..`, or would resolve outside the target before touching any path
- [ ] Cap the number of entries and the total and per-entry decompressed size before inflating, to stop decompression bombs
- [ ] Validate each entry's contents with its schema (see above) after inflating

### User-Written Regular Expressions

JavaScript's built-in `RegExp` has no timeout and can backtrack catastrophically, so a user-written pattern can freeze the process. Patterns written or imported by a user never run on `RegExp` in the main thread. Use a linear-time engine (RE2 compiled to WebAssembly), or run `RegExp` in a worker with a hard time limit and terminate the worker on overrun. Patterns written by the developer as literals are exempt.

---

## Platform-Neutral Code

Code that holds the domain (rules, models, parsing, persistence format) imports nothing from Node (`node:*`), the DOM, React or Electron. It reaches the platform (files, clock, randomness, dialogs) only through interfaces it defines and the host injects, with a test double for each. This keeps the logic runnable in Node, a browser, Electron, or a future mobile wrapper, and testable without any of them. Enforce it with dependency-cruiser (see Tooling).

---

## Override Points of `javascript_base`

| `javascript_base` rule                                 | This standard                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Language Baseline: Type system row                     | TypeScript strict, per Compiler Options above                          |
| Comments and Documentation: JSDoc                      | TSDoc, with no types repeated (see below)                              |
| File Header Block (`.js`)                              | The same block on every `.ts` and `.tsx` file, with the real file name |
| `javascript_node` File Extensions in Import Specifiers | Per Import Specifiers below                                            |
| Error Handling                                         | Adds expected failures as `Result` values                              |
| Linting and Formatting Tooling                         | typescript-eslint strict type-checked config; Prettier unchanged       |

### TSDoc

Use TSDoc (`/** ... */`) on every exported function, class, type and constant. The signature already carries the types, so never repeat them in the comment.

```typescript
/**
 * Resolve a bundle by name.
 * @param bundleName - Name of the bundle (matches the filename without extension)
 * @param repoRoot - Absolute path to the repository root
 * @returns The resolved bundle, or a failure naming why it could not be resolved
 * @throws If the repository root is not absolute (a caller bug)
 */
export function resolveBundle(
  bundleName: string,
  repoRoot: string,
): Result<ResolvedBundle, ResolveError> {
  /* ... */
}
```

- `@param name - description` for every parameter, `@returns` for non-`void`, `@throws` when it intentionally throws, `@typeParam` for generics when the name alone is unclear. No `{type}` braces.
- The summary line explains _what_ and, where not obvious, _why_. A comment that restates the signature is removed.

### File Header Block

```typescript
// ------------------------------
// {file-name}.ts
//
// Author: {AuthorName} - {YYYY-MM-DD}
//
// Copyright (c) {Company}. All rights reserved.
// ------------------------------
```

Use `.tsx` for JSX files. Declaration files (`.d.ts`) and generated files are exempt. The other header rules in `javascript_base` apply.

### Import Specifiers

| Code                                               | Rule                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node-side (`module`/`moduleResolution` `NodeNext`) | Relative imports use the `.js` extension, even though the source file is `.ts`. See `typescript_node`                    |
| Renderer or bundled (`moduleResolution` `Bundler`) | Relative imports have no extension. See `typescript_react`                                                               |
| Shared packages                                    | Resolve the way their consumers do; a package imported by both worlds publishes extension-free source or builds for both |

Use `import type` for imports used only as types (required by `verbatimModuleSyntax`). Import order follows `javascript_node`, with type imports grouped with their value imports.

---

## Tooling

### Prettier and ESLint

- **Prettier** matches the `javascript_base` Formatting table (2 spaces, single quotes, semicolons, trailing commas on multi-line literals, 100-column print width). It formats `.ts`, `.tsx`, `.md`, `.json`, `.yaml`.
- **ESLint** uses flat config with `typescript-eslint`'s **strict, type-checked** configuration (`strictTypeChecked`, plus `stylisticTypeChecked`), with type information from the project's `tsconfig`. `eslint-config-prettier` comes last so it turns off formatting rules.
- Beyond the `javascript_base` ESLint expectations (no `var`, `===`, no unused variables, no `eval`), the config must keep these on: no floating (unawaited) promises, no `any` in any form, no non-null assertions, consistent `import type`, exhaustive `switch` over unions.
- Lint, type-check (`tsc --noEmit`) and format-check all run in CI and fail the build; a developer can run each locally with one script.

### dependency-cruiser

Package boundaries are rules, not conventions. A dependency-cruiser config at the repository root expresses them and runs in CI:

- Platform-neutral code imports nothing from Node, the DOM, React or Electron (see Platform-Neutral Code).
- Packages import each other only in the allowed direction; cycles are forbidden.
- Test files are not imported by production code.

The project defines the package names and the exact rules in its own project standards.

---

## Security Requirements

Combine with `javascript_base`'s general items and the runtime layer's checklist.

- [ ] No `any`, non-null assertion, or `as` cast outside a validating constructor
- [ ] Every trust boundary validates with a schema; no `JSON.parse` output used unvalidated
- [ ] User-written regular expressions run on a linear-time engine or in a time-limited worker
- [ ] Archive entries are checked for path traversal and decompressed size before use
- [ ] No floating-point arithmetic on money; no `Date` in domain code
- [ ] Error messages shown to users carry no stack trace or internal detail
