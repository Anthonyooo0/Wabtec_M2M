# Wabtec Dashboard — Design System

This file is the single source of truth for visual decisions in this app.
It exists for two reasons:

1. **Humans** — to keep new screens consistent with the existing ones.
2. **AI agents** (Claude Code, Cursor, v0) — to follow the same rules
   without re-deriving them from defaults that scream "AI-generated".

## Brand & references

Engineering-grade, opinionated, dense. Reference: **Vercel**, **Linear**,
**Palantir Foundry**, **Stripe Dashboard**.

Anti-references:
- shadcn dashboard defaults (the default Inter + slate + blue look)
- Material Design 3 (too rounded, too colorful)
- Generic SaaS marketing-page-as-dashboard

## Tokens

### Colors

Use the **Radix-style 12-step `mauve`** scale defined in `index.html`. Each step
has a fixed semantic role — never use steps interchangeably.

| Step | Role | Examples |
|------|------|----------|
| 1 | App background | (white-ish) `bg-white` is fine for cards |
| 2 | Subtle/raised bg | App body, ghost-state inputs (`bg-mauve-2`) |
| 3 | UI element bg | Hover states, count chips, code blocks (`bg-mauve-3`) |
| 4 | Hovered UI element | Hover-on-active, dividers between table rows (`border-mauve-4`) |
| 5 | Active/selected UI element | Selected list item bg |
| 6 | Subtle borders | Default card/input border (`border-mauve-6`) |
| 7 | Stronger borders | Inactive nav item ring, very low-contrast text |
| 8 | Hovered borders / focus rings | `focus:border-mauve-8` |
| 9 | Solid muted backgrounds | Neutral status dots (`bg-mauve-9`), placeholder text |
| 10 | Hovered solid backgrounds | (rarely used in this app) |
| 11 | Low-contrast text | Secondary text, captions, helper text (`text-mauve-11`) |
| 12 | High-contrast text | Body, headings, primary text (`text-mauve-12`) |

**Accent — MAC navy.** Used sparingly for primary CTAs and active nav.
Never as a dashboard background or a status badge. Defined as the `accent` and
`mac.*` Tailwind palettes in `index.html`. Most code uses `bg-mac-navy`,
`hover:bg-mac-blue`.

**Status colors — used only in 1.5px dots, never as filled bg pills.**
- `bg-red-500` — Critical (status conflict, ship-to mismatch)
- `bg-amber-500` — Medium / warning / late
- `bg-blue-500` — Informational, "new"
- `bg-green-500` — Success, ready, accepted
- `bg-mauve-9` — Neutral, closed, inactive

Anti-patterns: filled `bg-red-50 text-red-600 border-red-200` pills.
Tailwind default `gray-*` / `slate-*` / `zinc-*` (replaced by `mauve-*`).
Any blue-to-purple gradient. ANY gradient.

### Radii

- `rounded-md` (6px) — inputs, buttons, small chips
- `rounded-lg` (8px) — cards, modals, drawers
- `rounded-full` — only for avatars and dot indicators
- `rounded-xl` (12px) and above — **banned**. Reads as "AI dashboard."
- Sharp `rounded-none` (0px) — acceptable in dense table cells if intentional

### Spacing — strict 4/8 rhythm

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Never `6 / 10 / 14 / 18 / 20`.
Tailwind `gap-3 / p-4 / py-2.5` are fine; `gap-3.5 / p-5.5` are not.

### Shadows

Default = no shadow. 1px `border-mauve-6` is the canonical surface separator.

Allowed shadows:
- `shadow-sm` on toasts and floating drawers only
- Drop shadows above `shadow-md` are banned

### Type

- **Sans:** `Geist` (loaded from Google Fonts in `index.html`)
- **Mono:** `Geist Mono`
- **Body default:** 13–14px, line-height 1.5
- **Heading scale:** 11 / 12 / 13 / 14 / 15 / 16 / 18 / 22 / 28
- **Weights used:** 400, 500, 600 only. No 700+ except in custom display

**Tracking:** `tracking-tight` on all headings (`text-mauve-12`). Body default tracking.

**Mono usage** — aggressive. Use `font-mono` for:
- All numbers in tables
- IDs (PO numbers, SO numbers, SKUs, request IDs, UUIDs)
- Timestamps and durations
- File paths, code, log lines
- Currency and percentages in cells

`tabular-nums` on every numeric cell so columns align.

### Icons

Currently inline SVG paths consistent with heroicons-style 1.5–2px stroke.
Future migration target: **Phosphor** (`@phosphor-icons/react`) at regular
weight, 16px default. Don't mix icon libraries within a single screen.
Never use emojis as icons.

## Components

### Buttons

| Kind | Classes |
|------|---------|
| Primary CTA | `bg-mac-navy hover:bg-mac-blue text-white text-[13px] font-medium px-3 py-1.5 rounded-md` |
| Secondary | `text-mauve-12 hover:bg-mauve-3 text-[12-13px] font-medium px-2.5 py-1 rounded-md` |
| Ghost text-only | `text-mauve-11 hover:text-mauve-12 underline` (filter clear, etc.) |
| Active toggle | `bg-mac-navy text-white` (the "discrepancies only" pattern) |

Heights: 32px for primary actions, 28px for inline filters.

### Inputs

`px-3 py-1.5 text-[13px] border border-mauve-6 rounded-md bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none placeholder:text-mauve-9 transition-colors`

The "ghost state" (`bg-mauve-2` → `bg-white` on focus) is a Vercel hallmark.
No focus ring color — `focus:ring-0`. The bg shift IS the focus indicator.

### Cards

`bg-white border border-mauve-6 rounded-lg overflow-hidden`

Padding inside: `p-3` (toolbars) → `p-4` (compact) → `p-5` (default) → `p-12` (empty states).

### Tables

- Row height: 32–36px (`px-3 py-2` cells, `px-4 py-2.5` for primary tables)
- Header row: `bg-mauve-3/50 border-b border-mauve-6`
- Header text: `text-[11px] font-medium text-mauve-11 tracking-tight`
- Row separator: `border-t border-mauve-4` (no zebra)
- Hover: `hover:bg-mauve-3/60`
- Numeric columns: `text-right tabular-nums`
- ID/code columns: `font-mono text-[12px] text-mauve-12`

### Status indicators

Always **dot + label**, never **filled pill**.

```jsx
<span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full
                  border border-mauve-6 bg-white text-[10px] font-medium text-mauve-12">
  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
  Critical
</span>
```

For section headers, just the dot (no pill). E.g., `<span class="w-1.5 h-1.5 rounded-full bg-red-500" />` next to a `<h3>`.

### Stat cards

```jsx
<div className="bg-white border border-mauve-6 rounded-lg p-5">
  <div className="flex items-center gap-2 mb-2">
    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
    <span className="text-[11px] font-medium text-mauve-11 tracking-tight">{label}</span>
  </div>
  <div className="text-[28px] font-semibold text-mauve-12 tabular-nums tracking-tight leading-none">
    {value.toLocaleString()}
  </div>
  <div className="text-[11px] text-mauve-11 mt-1">{sublabel}</div>
</div>
```

No `border-l-4` colored stripes. No shadows. Tone signaled by the dot.

### Loading & empty states

- **Loading:** small zinc spinner (5x5) + 12px helper text. Don't use full-page skeletons.
- **Empty:** title + 1-line description + (optional) primary action. No hero illustrations.

### Toasts

Solid `bg-mac-navy text-mauve-1`, hairline `border-mauve-12`, 1.5px colored dot prefix, dismiss button.

## Layout patterns

- **Shell:** Fixed left sidebar (collapsible) → top header (compact) → main content → optional right rail/drawer.
- **Header:** Title + inline last-sync indicator + version tag (mono). 56px tall max.
- **Sidebar:** 240px expanded, 64px collapsed. Solid `#0a0a0a` (defined in `index.html`).
- **Page content:** `p-6` outer padding, `space-y-4` to `space-y-8` between sections.
- **Tables → master-detail:** Click row → drawer or expand-in-place. Avoid full route changes for record drilling.

## Anti-patterns (reject these in PRs)

- ❌ Inter font / DM Sans (replaced by Geist)
- ❌ Tailwind `gray-*` / `slate-*` / `zinc-*` (replaced by `mauve-*`)
- ❌ `bg-blue-500` / `bg-blue-600` as primary (use `bg-mac-navy`)
- ❌ Gradient backgrounds anywhere
- ❌ `rounded-2xl` and above
- ❌ `shadow-lg` / `shadow-xl` / `shadow-2xl` on cards
- ❌ Filled status badges (`bg-red-50 text-red-600 border-red-200`)
- ❌ Emoji as icons
- ❌ 4-up symmetric KPI rows where every card looks the same
- ❌ `font-bold uppercase tracking-wider` on every label
- ❌ Hero illustrations on empty states
- ❌ Pie charts, donut charts, gauges, 3D anything

## Open follow-ups (post-foundation)

- [ ] **`Cmd-K` command palette** via `cmdk` for nav + actions
- [ ] **Phosphor or Tabler icon set** replacing inline SVGs
- [ ] **Master-detail drawer** (Vaul) for row clicks instead of route changes
- [ ] **Sparklines next to stat cards** (Tremor or visx) once historical data exists
- [ ] **Dark mode** — Radix mauve has a paired `mauveDark` scale; rewire CSS vars under `.dark`
