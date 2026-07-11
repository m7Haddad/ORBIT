<!-- docs/specs/theme-tokens.md -->
# ORBIT Theme Token Spec

Four themes — **Light, Dark, Midnight, Glass** — implemented as one token
vocabulary with four value sets. Components reference **semantic tokens only**;
no component ever names a raw color, shadow, or blur value. Tokens are CSS
custom properties on `:root`, switched via `data-theme` on `<html>`
(`data-theme="light" | "dark" | "midnight" | "glass"`), integrated into
Tailwind via `theme.extend` color aliases so utilities like `bg-surface-1`
resolve through the variables.

## 1. Naming convention

`--{category}-{role}[-{state}]`, lowercase kebab-case. Numbered scales run from
**page background outward toward the user** (higher number = closer/more
elevated).

## 2. Token vocabulary

### Surfaces & structure
| Token | Role |
|---|---|
| `--surface-0` | Page background |
| `--surface-1` | Widget/card body (the default tile background) |
| `--surface-2` | Nested/raised elements inside a tile (inputs, segmented controls) |
| `--surface-3` | Overlays: popovers, command palette, modals |
| `--border-subtle` | Hairline separation (tile edges, dividers) |
| `--border-strong` | Emphasized borders (focused inputs, active tile) |

### Text
| Token | Role |
|---|---|
| `--text-primary` | Headings, values (the "23.4°" number) |
| `--text-secondary` | Labels, units, timestamps |
| `--text-tertiary` | Placeholder, disabled, skeleton hint text |
| `--text-inverse` | Text on accent-filled elements |

### Accent & status
| Token | Role |
|---|---|
| `--accent-primary` | Brand action color (active toggles, primary buttons, focus rings via alpha) |
| `--accent-primary-hover` / `--accent-primary-active` | Interaction states |
| `--accent-muted` | Accent-tinted fills (selected nav item background) |
| `--status-success` / `--status-warning` / `--status-danger` / `--status-info` | Online/threshold/offline/neutral-notice; each with a `-muted` fill variant (e.g. `--status-danger-muted`) |

### Effects & materials
| Token | Role |
|---|---|
| `--shadow-1` / `--shadow-2` / `--shadow-3` | Elevation shadows (tile rest / hover / overlay) |
| `--material-blur` | Backdrop blur radius (`0px` in non-Glass themes) |
| `--material-opacity` | Surface alpha used by translucent surfaces (`1` in non-Glass) |
| `--scrim` | Modal backdrop color |

### Motion & shape (theme-invariant, defined once)
| Token | Role |
|---|---|
| `--radius-sm` / `--radius-md` / `--radius-lg` | 8 / 12 / 20px — tiles use `lg` |
| `--duration-fast` / `--duration-base` | 120ms / 200ms |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |

Spacing and typography ride Tailwind's default scales (4px grid; text sizes
`xs`–`4xl`) — no custom tokens needed there; widget internals stick to
`p-4`/`gap-3`-tier values for a consistent density.

## 3. The four themes — relationship, not independent palettes

- **Light** — base theme, warm neutral surfaces, dark text.
- **Dark** — inverted neutrals; `--surface-0` is a soft dark gray (not pure
  black), elevation communicated by *lighter* surfaces (`surface-2` lighter
  than `surface-1`) plus shadows.
- **Midnight** — Dark's structure with a near-black, blue-shifted `--surface-0`
  and slightly higher-contrast accent; only surface/border/accent values
  change from Dark. OLED-friendly.
- **Glass** — **modeled as Dark + a materials layer, not a fourth palette.**
  It inherits Dark's text/accent/status values and overrides only:
  `--material-blur` (e.g. `20px`), `--material-opacity` (e.g. `0.65`),
  surface values re-expressed with alpha, and `--border-subtle` as a light
  alpha stroke. Components opt into the material by composing
  `background: color-mix(in oklch, var(--surface-1), transparent calc((1 - var(--material-opacity)) * 100%));
  backdrop-filter: blur(var(--material-blur));` — which degrades gracefully to
  plain Dark surfaces when `--material-blur: 0px`.

This structure means a component written once looks correct in all four themes;
Glass costs a token override file, not a parallel implementation.

## 4. Rules for Claude Code

1. Never hardcode a color/shadow/blur in a component — semantic tokens only.
2. Never branch on theme name in component code (`if theme === "glass"` is a
   contract violation); differences live entirely in token values.
3. New tokens require adding a value to **all four** theme files in the same
   change.
4. Focus visibility: `--accent-primary` at full opacity for focus rings in
   every theme; verify WCAG AA contrast for `--text-secondary` on
   `--surface-1` per theme (Glass over arbitrary backdrops must assume
   worst-case).
5. Skeletons use `--surface-2` shimmer on `--surface-1` — same tokens in all
   themes, no bespoke skeleton colors.
