# Standards: C# / Avalonia / ReactiveUI

> Created: 2026-07-28
> Applies to: All C# projects using .NET, Avalonia UI, and ReactiveUI

This file defines the language and stack-specific rules that populate the
universal Plan sections. Reference this in Plan Metadata as `csharp-avalonia`.

---

## Stack

| Layer        | Library / Version             |
|--------------|-------------------------------|
| Language     | C# (.NET 8+)                  |
| UI Framework | Avalonia 11.x                 |
| UI Pattern   | MVVM via ReactiveUI 20.x      |
| IL Weaving   | Fody + ReactiveUI.Fody        |
| Theme        | Semi.Avalonia (default)       |
| Serialization| System.Text.Json (preferred) / Newtonsoft.Json (legacy) |
| Testing      | xUnit + Moq                   |
| Logging      | Microsoft.Extensions.Logging (structured) |

---

## Section 5 — Architecture & Design

### Project Structure

Standard layout for a C# Avalonia project:

```
{ProjectName}/
├── Assets/                    ← Icons, images, fonts
├── Converters/                ← IValueConverter implementations
├── Helpers/                   ← Enums, static helpers, extension methods
├── Models/                    ← Plain data models (structs or records preferred)
├── Services/
│   └── {ServiceName}/
│       ├── I{ServiceName}.cs  ← Interface
│       ├── {ServiceName}.cs   ← Implementation
│       └── {ServiceName}Factory.cs ← Factory (if environment-dependent)
├── ViewModels/
│   ├── ViewModelBase.cs
│   └── {Feature}ViewModel.cs
├── Views/
│   ├── {Feature}View.axaml
│   └── {Feature}View.axaml.cs
├── App.axaml
├── App.axaml.cs
├── Program.cs
└── ViewLocator.cs
```

### Naming Conventions

| Construct           | Convention                         | Example                        |
|---------------------|------------------------------------|--------------------------------|
| Classes             | PascalCase                         | `RecipeService`                |
| Interfaces          | PascalCase with `I` prefix         | `IRecipeService`               |
| Methods             | PascalCase                         | `LoadRecipes()`                |
| Async methods       | PascalCase + `Async` suffix        | `LoadRecipesAsync()`           |
| Properties          | PascalCase                         | `ActiveRecipe`                 |
| Private fields      | `_camelCase`                       | `_recipeService`               |
| Local variables     | camelCase                          | `loadedRecipe`                 |
| Constants           | PascalCase                         | `DefaultServings`              |
| Enums               | PascalCase (type and values)       | `SavingState.Loaded`           |
| Namespaces          | `{Company}.{Project}.{Layer}`      | `Starvoxel.EomInsight.Services`|
| AXAML files         | PascalCase matching ViewModel name | `RecipeSelectorView.axaml`     |

### Patterns

- Strict MVVM: UI logic in ViewModels, business logic in Services, data in Models
- ViewModels inherit from `ReactiveObject`
- Bindable ViewModel properties use `[Reactive]` attribute (ReactiveUI.Fody)
- All ViewModel commands use `ReactiveCommand`
- Services are accessed via interface — never instantiate concrete service classes directly in ViewModels
- Use `ServiceLocator` or constructor injection for service resolution
- Factory pattern for services that differ between environments (local file vs mock)

### `using` Statement Order

1. `System.*`
2. External packages (alphabetical)
3. Internal project namespaces (alphabetical)

---

## Section 6 — Components

### File Header Block

Every `.cs` file must begin with:

```csharp
// ------------------------------
// {FileName}.cs
//
// Author: {AuthorName} - {YYYY-MM-DD}
// Plan: {Plan ID}
//
// Copyright (c) {Company}. All rights reserved.
// ------------------------------
```

### Public Interface Documentation

All public classes, interfaces, methods, and properties require XML doc comments:

```csharp
/// <summary>
/// {One sentence summary.}
/// </summary>
/// <param name="{name}">{Description}</param>
/// <returns>{What is returned and under what conditions}</returns>
public async Task<LoadingResult> LoadAsync(string path, bool createDefault = true)
```

### Component Interface Pattern

```csharp
/// <summary>
/// Defines the contract for {service purpose}.
/// </summary>
public interface I{ServiceName}
{
    /// <summary>{Description}</summary>
    Task<{Result}> {MethodName}Async({Parameters});
}
```

### Region Organisation (for files over ~100 lines)

```csharp
#region Constants
#region Fields
#region Constructor
#region Public Methods
#region Protected Methods
#region Private Methods
```

---

## Section 7 — Data Models

### Model Preferences

- Prefer `struct` for small, immutable value types (settings, data records)
- Prefer `record` for data-transfer objects and immutable reference types (.NET 8+)
- Prefer `class` only when mutability or inheritance is genuinely required

### Model Template

```csharp
// File header block here

namespace {Company}.{Project}.Models;

/// <summary>
/// {Description of what this model represents.}
/// </summary>
public struct {ModelName}
{
    // Properties — public get, private/no set for immutability
    public {Type} {PropertyName} { get; }

    /// <summary>
    /// Creates a new instance of <see cref="{ModelName}"/>.
    /// </summary>
    public {ModelName}({Type} {param})
    {
        {PropertyName} = {param};
    }
}
```

### Equality

For structs used in reactive bindings or comparison, implement:
- `Equals(T other)` typed overload
- `override bool Equals(object? obj)`
- `override int GetHashCode()`
- `==` and `!=` operators

---

## Section 8 — Security Requirements (C# Additions)

Add these to every C# plan's security checklist on top of the universal minimums:

- [ ] File paths are constructed using `Path.Combine` or `Path.Join` — never string concatenation
- [ ] `FileStream` opened with explicit `FileAccess` and `FileShare` modes
- [ ] JSON deserialization uses typed targets — no dynamic or `JObject` without explicit validation
- [ ] `async`/`await` I/O operations accept `CancellationToken` where the operation may be long-running
- [ ] Exception messages displayed in the UI are user-friendly and contain no stack traces or internal paths
- [ ] No `Debug.WriteLine` calls that output sensitive data remain in release builds
- [ ] No hardcoded file paths — use `PathHelper` or equivalent abstraction

---

## Section 9 — Logging Requirements (C# Additions)

Logging framework: `Microsoft.Extensions.Logging` with structured logging.

For smaller projects where MEL is not set up, `Debug.WriteLine` is acceptable during development
but must follow the same data-safety rules.

### Log Format

```
{ClassName} - {MethodName} - {Event} | {Key}:{Value} | {Key}:{Value}
```

Example:
```
DraftableDataService - LoadAsync - Start | Path:{sanitizedPath} | CreateDefault:{bool}
DraftableDataService - LoadAsync - End   | Result:{LoadingResult}
```

### Log Level Guide

| Level   | When to use                                                    |
|---------|----------------------------------------------------------------|
| Debug   | Entry/exit of significant methods, state transitions           |
| Info    | User-visible milestones (file saved, data loaded successfully) |
| Warning | Handled exceptions, unexpected but recoverable states          |
| Error   | Operation failed, action could not complete                    |
| Fatal   | Application cannot continue                                    |

---

## Section 10 — Testing Requirements (C# Additions)

Framework: `xUnit` for tests, `Moq` for interface mocking.

### Test File Structure

```
{ProjectName}.Tests/
└── {Layer}/
    └── {ComponentName}Tests.cs
```

### Test Naming Convention

```
{MethodName}_{Scenario}_{ExpectedResult}
```

Example:
```csharp
[Fact]
public async Task LoadAsync_FileNotFound_ReturnsFailedResult() { }

[Fact]
public async Task LoadAsync_ValidFile_ReturnsSuccessfulResult() { }
```

### Minimum Coverage Rule

Every public method must have:
- At least one happy-path test
- At least one test for each documented failure condition
- At least one null/empty input test if the method accepts reference types or strings

---

## Section 11 — Documentation Requirements (C# Additions)

- XML doc `///` comments on all `public` and `protected` members
- File header block on every `.cs` file (see Section 6 template above)
- AXAML files do not require headers, but complex resource dictionaries should have a comment block at the top
- CHANGELOG format: `{YYYY-MM-DD} | {Plan ID} | {Short description}`
