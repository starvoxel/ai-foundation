---
name: csharp_avalonia
version: 2.0.0
description: Avalonia UI conventions for C# desktop applications
tags: [csharp, avalonia]
depends_on: [csharp_base]
---

# Standards: C# Avalonia

---

## Stack

| Layer        | Library / Version                                    |
| ------------ | ---------------------------------------------------- |
| UI Framework | Avalonia                                             |
| Theme        | Named by the project's design standard (see Theming) |
| Bindings     | Compiled bindings (default in Avalonia 12)           |
| Testing (UI) | Avalonia.Headless.XUnit                              |

---

## Project Structure

Standard layout for an Avalonia application project:

```
{ProjectName}/
├── Assets/                    ← Icons, images, fonts
├── Converters/                ← IValueConverter implementations
├── Helpers/                   ← Enums, static helpers, extension methods
├── Models/                    ← UI-specific models (if not in Core)
├── Services/                  ← I/O implementations, platform adapters
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

---

## View Conventions

### File Naming

| File type        | Convention               | Example                   |
| ---------------- | ------------------------ | ------------------------- |
| View AXAML       | `{Feature}View.axaml`    | `FilePickerView.axaml`    |
| View code-behind | `{Feature}View.axaml.cs` | `FilePickerView.axaml.cs` |
| Window AXAML     | `{Feature}Window.axaml`  | `MainWindow.axaml`        |
| UserControl      | `{Feature}View.axaml`    | `DataPreviewView.axaml`   |

### AXAML Rules

- **Compiled bindings by default.** Set `<AvaloniaUseCompiledBindingsByDefault>true</AvaloniaUseCompiledBindingsByDefault>` in the `.csproj`.
- **Always declare `x:DataType`** on the root element of views that bind to a ViewModel.
- **Design-time DataContext** for IDE previewer support:
  ```xml
  <Design.DataContext>
      <vm:MyViewModel/>
  </Design.DataContext>
  ```
- **No code in code-behind** except `InitializeComponent()` and platform-specific wiring (e.g., drag-drop handlers that cannot be expressed in XAML). All logic goes in the ViewModel.
- **AXAML files do not require file headers**, but complex resource dictionaries or styles should have a comment block at the top.

### Layout Patterns

- Prefer `DockPanel` for top-level page layout (menu bar, status bar, content)
- Prefer `StackPanel` for simple vertical/horizontal flows
- Prefer `Grid` for complex multi-region layouts
- Avoid nesting more than 3 layout panels deep — refactor into UserControls

---

## ViewModel / View Pairing

- Every View has exactly one ViewModel (1:1 mapping)
- ViewModel name matches View name: `{Feature}View` ↔ `{Feature}ViewModel`
- ViewModels are resolved via `ViewLocator` — Views never instantiate ViewModels directly
- Views reference ViewModels only through data binding — no direct method calls

---

## MVVM Boundary Rules

- **Views:** Presentation only. No business logic, no I/O, no service calls.
- **ViewModels:** Orchestrate UI state. Delegate business logic to Core services.
- **Services (in Desktop):** Thin I/O adapters (file dialogs, filesystem access). Implement interfaces defined in Core.
- **Core:** All domain logic. Never references the Desktop project.

---

## Converters

```csharp
/// <summary>
/// Converts {source type} to {target type} for {purpose}.
/// </summary>
public class {Name}Converter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture) { }
    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) { }
}
```

Rules:

- One converter per file
- File name matches class name: `{Name}Converter.cs`
- Place in `Converters/` directory
- Prefer computed ViewModel properties over converters when the logic is non-trivial

---

## Headless UI Testing

For testing controls, data binding, layout, and command execution without a window:

```csharp
[AvaloniaFact]
public void MyControl_WhenLoaded_DisplaysExpectedText()
{
    var vm = new MyViewModel();
    var view = new MyView { DataContext = vm };

    // Use headless helpers to simulate input and verify visual tree
}
```

Package: `Avalonia.Headless.XUnit`

Rules:

- Headless tests go in a separate test project: `{ProjectName}.Desktop.Tests`
- Use `[AvaloniaFact]` and `[AvaloniaTheory]` attributes
- Headless tests verify binding correctness and control behavior — not pixel-perfect rendering
- Prefer ViewModel unit tests over headless tests for logic. Reserve headless for binding/interaction verification.

---

## Theming

- The base theme is named by the project's design standard; without one, use `Avalonia.Themes.Fluent`
- Load exactly one base theme. Never combine two Fluent-family themes (`Avalonia.Themes.Fluent`, `FluentAvaloniaTheme`, Avalonia 12.2's `Avalonia.Themes.Fluent2`); they override each other's resources
- Custom styles go in `Assets/Styles/` as separate AXAML resource dictionaries
- Never set colours inline; reference theme resource keys through `DynamicResource` so light and dark variants follow
- Prefer the WinUI token keys shared by Avalonia's Fluent themes and FluentAvalonia (`TextFillColor*`, `*FillColor*`, `*StrokeColor*`, `ControlCornerRadius`, `OverlayCornerRadius`) over theme-specific keys, so a theme change does not touch views
- Support dark and light via `RequestedThemeVariant` if the app needs it

---

## Platform Considerations

- **Top-level commands:** follow the product design. If the app has a menu bar, use `<Menu>` on Windows and Linux and `NativeMenu` on macOS
- **macOS:** always provide a `NativeMenu` with at least About, Settings, Quit and the standard Edit items, whatever the in-window design, so Cmd+Q, Cmd+Z and Cmd+S work
- **Cross-platform paths:** Always use `Path.Combine`, never hardcoded separators
- **File dialogs:** Use Avalonia `StorageProvider` API (Avalonia 11+), not legacy `OpenFileDialog`
- **ViewLocator:** use an explicit type-to-factory registration, not the template's reflection-based locator, which is not trim-safe
- **Diagnostics:** `Avalonia.Diagnostics` is gone in Avalonia 12. Reference any replacement (paid Dev Tools or a community fork) in Debug builds only
