# Claude Design Brief — FluentAvalonia Design System

**Purpose:** Reference brief to accompany the FluentAvalonia GitHub repo when importing
a design system into Claude Design (claude.ai/design), so generated mockups/prototypes
visually resemble the actual Avalonia desktop app rather than inventing their own
buttons, spacing, or type scale.

**Status:** Reference document, not a governed plan artifact. No Plan ID — this supports
UI/UX exploration ahead of any implementation plan, not implementation itself.

---

## How to use this

1. In Claude Design's design-system import, provide the FluentAvalonia repo URL as the
   primary source: `https://github.com/amwx/FluentAvalonia`
2. Upload or paste this brief alongside it as supplementary context. The repo is XAML/C#
   resource dictionaries, not a web-native token format (Figma/CSS/JSON), so an importer
   built for web design systems may parse it imperfectly — this brief exists to carry
   over the values and decisions a repo scan is likely to miss or get wrong.
3. Accent color and font are fixed below (Fluent normally leaves both
   dynamic/platform-specific, but Claude Design needs concrete values to target
   consistently).

---

## Verified structural tokens

Source: [FluentAvalonia Fluent v2 Resources docs](https://amwx.github.io/FluentAvaloniaDocs/pages/Resources)

| Token                          | Value          | Notes                                           |
| ------------------------------ | -------------- | ----------------------------------------------- |
| `ControlCornerRadius`          | 4px            | Standard controls (buttons, text fields, cards) |
| `OverlayCornerRadius`          | 8px            | Flyouts, dialogs, menus                         |
| `ControlContentThemeFontSize`  | 14px           | Base control text size                          |
| `TextControlThemeMinHeight`    | 32px           | Minimum height for text inputs                  |
| `TextControlThemeMinWidth`     | 64px           | Minimum width for text inputs                   |
| `TabItemMinHeight`             | 48px           | Tab strip item height                           |
| `ButtonPadding`                | 11, 5, 11, 6   | Left, top, right, bottom                        |
| `FlyoutContentPadding`         | 16, 15, 16, 17 | Left, top, right, bottom                        |
| `MenuFlyoutItemThemePadding`   | 11, 8, 11, 9   | Left, top, right, bottom                        |
| `TabItemHeaderFontSize`        | 24px           | Larger tab header text                          |
| `TabItemHeaderThemeFontWeight` | SemiLight      | Tab header weight                               |

**General shape language:** small radius (4px) on interactive controls, larger radius
(8px) on floating/overlay surfaces. Flat surfaces, minimal drop shadow, generous
internal padding relative to control height — this is the visual signature that most
distinguishes Fluent from Material (sharper, less padding) or iOS-style systems
(larger radius throughout).

---

## Resolved decisions

### Accent color — RESOLVED

Fluent's accent color is dynamic by default (follows the host OS theme), but this app
fixes it to the standard "Windows blue" reference value rather than tracking system
accent, so Claude Design has something concrete and consistent to target. Full state
ramp, built from the `#0078D4` base using standard Fluent accent-ramp conventions
(rest/hover/pressed/subtle-fill):

| Role                                   | Light theme | Dark theme |
| -------------------------------------- | ----------- | ---------- |
| Accent (rest)                          | `#0078D4`   | `#0078D4`  |
| Accent (hover)                         | `#106EBE`   | `#2B88D8`  |
| Accent (pressed)                       | `#005A9E`   | `#005A9E`  |
| Accent light fill (subtle backgrounds) | `#DEECF9`   | `#004275`  |

Note: `#0078D4` is a well-established Fluent/WinUI reference value; the hover/pressed/
subtle-fill shades follow standard Fluent ramp construction but were not pulled from a
live FluentAvalonia resource file — verify against the repo's actual `AccentColor`
resources if pixel-exact parity matters.

### Font — RESOLVED

FluentAvalonia's default type resources reference Segoe UI Variable, which is
Windows-only and cannot be redistributed off Windows (Microsoft ClearType font
licensing). This app bundles **Inter** (OFL-licensed, free) as a single embedded font
across Windows, Linux, and macOS instead of relying on per-OS system fonts — chosen for
proportions close to Segoe UI Variable (similar x-height, similarly neutral/functional
character) and for giving exact visual consistency across platforms rather than
subtly different rendering per OS.

- Font family: `Inter` (embedded/bundled, not a system-font fallback stack)

---

## Known gaps

- **Neutral/gray palette and elevation shadow values** were not verified from public
  docs during research for this brief. If Claude Design's repo import doesn't surface
  these adequately from the XAML source itself, pull them directly from
  `FluentAvalonia`'s resource dictionaries in the repo rather than approximating from
  the general (web-targeted) Fluent 2 design token site — that site's token _names_ are
  shared with FluentAvalonia's conceptual model, but its documented pixel/hex values
  are not confirmed to match FluentAvalonia's Avalonia-specific implementation.
- Claude Design's code-export target is React/Tailwind, not XAML — mockups produced
  from this brief are for **flow and layout reference only**. Implementation is a
  separate hand-off to Claude Code using FluentAvalonia controls directly, not a port
  of exported React code.
