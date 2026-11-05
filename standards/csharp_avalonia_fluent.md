---
name: csharp_avalonia_fluent
version: 1.0.0
description: FluentAvalonia conventions layered on csharp_avalonia
tags: [csharp, avalonia, fluentavalonia]
depends_on: [csharp_avalonia]
---

# Standards: C# Avalonia FluentAvalonia

Loaded only by projects tagged `fluentavalonia`. Where it conflicts with `csharp_avalonia`, this standard wins.

---

## Stack

- FluentAvaloniaUI 3.x (requires Avalonia >= 12.1 and net10.0)
- Pin FluentAvalonia and every Avalonia package to exact versions with Central Package Management; FluentAvalonia declares Avalonia ranges with no upper bound
- Do not cross an Avalonia minor version (for example 12.1 -> 12.2) until a FluentAvalonia release supports it

---

## Theme

- The base theme is `FluentAvaloniaTheme` (`xmlns:sty="using:FluentAvalonia.Styling"`); never also load `Avalonia.Themes.Fluent` or `Avalonia.Themes.Fluent2`
- Set accent, system-theme and font behaviour on `FluentAvaloniaTheme` (`CustomAccentColor`, `PreferUserAccentColor`, `PreferSystemTheme`, `UseSystemFontOnWindows`). FluentAvalonia #777: `Init()` reads these before XAML setters apply, so verify a font override takes effect
- Views use only WinUI token keys, never FluentAvalonia-specific or `SystemControl*` keys

---

## Controls

- FluentAvalonia 3.x prefixes its controls with `FA` (`FANavigationView`, `FAContentDialog`, `FAInfoBar`, `FAComboBox`, `FAFrame`); 2.x samples do not compile as written
- Isolate FluentAvalonia: its types and namespaces appear only in one folder of the desktop project (for example `UI/Fluent/`), behind app-owned wrappers (shell, dialog service, banner, icon). Enforce with a test that scans sources outside that folder
- Show `FAContentDialog` through a dialog-service interface; keep multi-step dialog logic in view-models
- Known issues to check on adoption: #766 (`FAContentDialog` does not take keyboard focus on Windows and Linux), NavigationView alignment and selection indicator (#679, #602, #579), vertical text centring on macOS and Linux (#616)

---

## Tables

- `Avalonia.Controls.DataGrid` is deprecated upstream (bug fixes only) and is a FluentAvalonia dependency. Use it where sorting or editing is needed; prefer side-panel editing over in-cell editors (in-cell popups lose focus, DataGrid #248)
- Avalonia's built-in `TableView` (12.1+) suits small read-only tables; it has no column sorting
