# Linkar Brand Identity - "Volt"

Linkar's identity is a direct study of ManyChat's real, live brand (not a
vague "creator tool" vibe): near-black ink, one hot-magenta signature
interaction color, a bright yellow highlighter used only on the plan sticker,
and chunky Bricolage page titles.

Inside the product the direction is **"Calm control"** (owner feedback,
2026-10-11): a quiet, legible operator tool where chrome recedes so content
and status read first. The owner's words override older rules below; in
particular the old "uppercase mono buttons and section labels" rule is
**revoked**.

## Logo - wordmark and app mark

The app mark is the interlocking "L" link; the wordmark is `Linkar` in
Bricolage Grotesque 800 with tight negative tracking. Both are monochrome -
black on light surfaces, white on dark ones - with no volt/yellow accent.

- `public/brand/linkar-app-mark.svg` / `.png` - mark, black.
- `public/brand/linkar-app-mark-white.svg` / `.png` - mark, white (dark surfaces).
- `public/brand/linkar-logo.svg` / `.png` - mark + wordmark lockup, black.
- `public/brand/linkar-logo-white.svg` / `.png` - lockup, white.
- `public/brand/linkar-wordmark.svg` - wordmark only.

In the UI the mark is rendered by `LinkarMark` (`src/components/linkar-mark.tsx`),
an inline SVG that paints with `currentColor`, so it follows the theme on its
own. It sits beside the live-text wordmark in the app topbar and sidebar, the
operator console, the loading splash, and the marketing header/footer (which
also covers the auth screens).

Browser and home-screen icons are generated from the same mark:
`app/icon.svg` (switches to white in dark browser chrome), `app/favicon.ico`
(16/32/48), `app/icon.png` (512) and `app/apple-icon.png` (180).

## Color

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#17181d` | Body text, primary CTAs (black pills), dark panels |
| `--ink-strong` | `#0b0c10` | Hover state of ink surfaces |
| `--volt` | `#fff100` | The plan sticker (FREE/AGENCY) only. Not nav, not badges, not slabs |
| `--volt-deep` | `#f7cd21` | Volt borders/hover on dark |
| `--accent` | `#fa0cf7` | Magenta - ManyChat's real CTA/interaction color. Links, focus rings, active data, primary chart series |
| `--accent-hover` | `#c807c4` | Hover/pressed state of accent surfaces |
| `--accent-soft` / `--accent-line` | `#fce7fb` / `#f3aef0` | Tinted chip backgrounds and borders on light surfaces |
| `--accent-tint-dark` / `--accent-pale-dark` / `--accent-vivid-dark` | `#f7b3f0` / `#fbdcf7` / `#ff5ff0` | Accent-family text/icon tones for use **on dark ink/gradient panels** (auth hero, help hero, profile hero, dark builder preview) |
| `--grape` | `#7b34ce` | Spectrum: secondary chart series, condition markers |
| `--flame` | `#ff4b00` | Spectrum: emphasis metrics (`--saffron`) |
| `--leaf` / `--status-ok` | `#12b76a` (dark `#32d583`) | Success **dots** and small check icons only - never a fill, border or text colour |
| `--honey` | `#b45309` | Warning fills/text (`--amber`). Warning *dots* use `--status-warning` (`#d98c00`), because honey reads brown at dot size |
| `--danger` | `#b42318` | Errors and failed statuses only |
| `--surface-soft` | `#f5f5f4` | Neutral soft fill. Lines are neutral too (`--line` `#e6e6ea`) - no warm/brown greys |
| `--canvas` | `#ffffff` | App canvas stays white |

Rules:

1. **Volt is the plan sticker and nothing else.** Always paired with ink.
   No volt nav slabs, admin badges, or highlight blocks.
2. **Magenta is the only interactive accent** for links/focus/info - this
   replaced Signal Blue once we confirmed ManyChat's real palette has no
   blue in it at all.
3. Red is reserved for errors - never decoration.
4. **No brown or orange anywhere.** Status is always a dot plus a word -
   see "Status: quiet when fine, loud when not" below.
5. Legacy palettes are contractually forbidden (see `app/globals.test.ts`):
   Meta blue `#0866ff`, Tailwind greens, old amber rgba, the retired
   Signal Blue (`#0a6cff`) and the old forest/teal success greens
   (`#0f7b3f`, `#008a68`).

## Typography

Loaded in `app/layout.tsx` via `next/font/google` (self-hosted):

| Variable | Family | Use |
|---|---|---|
| `--font-display` | Bricolage Grotesque | Page `h1` (800) and the wordmark only |
| `--font-sans` | Manrope | Everything else: body, buttons, tabs, labels, table headers, counters, badges, `h2`/`h3` |
| `--font-mono` | JetBrains Mono | Only inside an ID chip and code-like values an operator copies |

Rules:

- **Sentence case everywhere.** No letter-spaced uppercase except the tiny
  plan sticker. Buttons are Manrope 600, 14px, sentence case, no "→" suffix.
- Numbers are Manrope with `font-variant-numeric: tabular-nums`, never mono.
- Type scale (`:root`): page title (Bricolage, existing clamp), section title
  `--type-section-title` 1.125rem Manrope 700, body `--type-body` 15px,
  secondary `--type-label` 14px / `--type-meta` 13px. **13px is the floor**
  for any UI text.
- Page header: `h1` + one plain sentence (90 characters max) + a
  right-aligned primary action. No eyebrows.

## Status, IDs and time

- **Status badge** (`src/components/ui/status-badge.tsx`,
  `<StatusBadge tone="success|warning|danger|neutral" label="Healthy" />`):
  a dot plus a plain word ("Healthy", "Needs attention", "Down",
  "Connected", "Expired", "Active", "Paused", "Failed"). The same component
  everywhere; the word carries the meaning. Tones follow the status rule
  below.
- **ID chip** (`src/components/ui/id-chip.tsx`, `<IdChip id prefix? />`):
  `9f30c8c8…633c` (type prefix stripped, first 8 + last 4; commit SHAs become
  7 characters), mono 12px, muted, with a copy button and the full ID in the
  tooltip. Never the primary label of a row - put it on a secondary line or a
  detail page. A release is shown as an ID chip labelled "Version".
- **Time** (`src/components/ui/relative-time.tsx`, `<RelativeTime value />`):
  relative and local ("2 hours ago", "Yesterday 21:19", "3 Oct, 21:19") with
  the full local date-time in the tooltip. Pass `inline` mid-sentence
  ("created just now"). Never print "UTC" in primary UI.
- **Tables** (`.data-table`, add `.is-stackable` to turn rows into cards on
  phones): five columns at most, the first is a human name, IDs move to a
  muted second line, the row action is a ghost "Open" button, rows are 56px.

## Status: quiet when fine, loud when not

Most of what an operator or creator sees is working normally, so normal
states must not compete with the one thing that is wrong. (A screen full of
mint "Healthy" pills with green text on white carried no information and
drowned the real problem.)

| Tone | Looks like | Use for |
|---|---|---|
| `success` | 8px `--status-ok` dot + word in the normal text colour. No fill, no border, no green text | Healthy, Ready, Active, Connected, Running, Live, Sent, All caught up |
| `neutral` | 8px grey dot (`--status-neutral`) + word | Draft, Paused (a deliberate choice), Queued, Not checked, Turned off |
| `warning` | Filled chip: `--status-warning-fill` with `--status-warning-text`, amber dot | Needs attention, Missing, Pending, a paused job queue |
| `danger` | Filled chip: `--status-danger-fill` with `--status-danger-text`, red dot | Down, Failed, Expired, Suspended, Disconnected |

Warning and danger are the only filled status chips in the product; their
text clears WCAG AA on the fill in both themes (6.4-8.5:1).

- **Confirmations** ("Saved.", "Plan and limits saved.", "Everything sent")
  are normal text with a small green check (`.form-success` draws one when
  the message has no icon). Never green text, never a mint panel.
- **No green-tinted cards, panels or backgrounds** for success. Success
  notices sit on the neutral `--surface-soft`.
- **Trends are not statuses**: a rising number stays in the text colour and
  only its arrow is green; a falling one has a muted arrow.
- **Collapse all-normal lists.** When a list is mostly fine (a setup
  checklist, readiness checks), list the exceptions individually first, then
  one summary line - "All 7 other settings ready" - that expands to the full
  list (`<StatusSummary>` + `splitByStatus` in
  `src/components/ui/status-summary.tsx`).
- Enforced by `app/globals.test.ts` ("status colour: quiet when fine, loud
  when not").

## Navigation

The active sidebar item - in the app and the owner console alike - is a
soft neutral fill (`--nav-active-fill`: ink at 6% on light, white at 8% on
dark), the label in ink at weight 700 and the icon in `--accent-text`.
Hover changes colour only. Sidebar group labels are quiet sentence-case
Manrope (`.sidebar-label`). The owner console shows "Owner console" as a
quiet line under the logo instead of a badge.

## Shape & depth

- One radius family: 12px cards and panels (`--radius-card`), 10px inputs and
  buttons (`--radius-control`), full pill only for status badges and the plan
  sticker.
- 1px subtle borders, no heavy shadows. Primary buttons are ink (inverted in
  dark mode) and do not lift on hover.
- 8px grid. Page padding 32px top / 40px sides on desktop, 16px on phones;
  32px between sections; 20-24px card padding; 16px between sibling cards and
  rows. Two bordered blocks never touch.
- Product mockups (`.template-illustration` in the template gallery) use a
  near-black card with a faint magenta-tinted grid and a solid-magenta
  caption bar pinned to the bottom edge - ManyChat's actual IG-post-mockup
  pattern, reused for our own automation previews.

## Motion

Rise/fade entrances, staggered lists, pop-in confirmations use
`--ease-out` (`cubic-bezier(.22,.61,.21,1)`) at `.22s`. Interactive hover/
press transforms (buttons, links) use `--ease-snap`
(`cubic-bezier(.43,.195,.02,1)`) - ManyChat's actual button curve: a fast
start that eases hard into the stop, snappier than a generic ease. Reduced-
motion is fully respected.

The `.grid-texture` utility overlays a faint white grid
(`rgba(255,255,255,.06)`, 32px cells) via `::before` - reserved for the
help hero and product mockups where a diagram-like surface adds context.
Auth screens use a quieter editorial panel with a soft contour instead of a
grid, keeping the entry flow focused and professional.

## Voice

Confident, plain-spoken, a little playful. Short sentences. Concrete outcomes
("answered in seconds", "back in your control room"). No jargon, no hype
adjectives. Tagline: **"Instagram and Facebook automation, made clear."**
(`PRODUCT_TAGLINE` in `src/lib/branding.ts`).

## Governance

- All colors/typography flow through `:root` tokens in `app/globals.css`.
- `app/globals.test.ts` asserts the palette and type contract (white canvas,
  panel sidebar, magenta accent, Volt, red-for-errors, the type scale). Update it
  whenever the system itself changes - never bypass it.
- `pnpm check:branding` guards legacy product names.
