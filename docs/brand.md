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

## Selection: never a grey fill

Owner feedback (round 5): "I don't want that grey bg selected tile - I don't
have grey bg anywhere." Nothing that is selected, current, active or hovered
gets a grey or tinted background, in either theme. Round 6 replaced the
magenta bar on vertical navigation with the owner's "Mondays" reference: a
**white tile**. Everything else shows selection with ink text, an ink
underline or an ink outline. The old `--nav-active-fill` token is gone.

| Pattern | Class (container > item) | Selected | Hover |
|---|---|---|---|
| Vertical navigation - sidebars, owner console, Settings/Help section navs, template categories, any side list of sections | `.nav-list > .nav-item` (also `.sidebar-nav > .sidebar-link`, `.settings-nav`, `.section-nav`, `.template-picker-categories`) | The white tile behind the item: panel colour (`--select-tile-bg`), 1px `--select-tile-line` hairline, 10px radius, a very soft shadow. Text `--ink` 700, icon ink (not magenta). The tile glides between items on `transform` (`ref={slidingThumbRef}` on the container) | Text and icon go to ink; no fill |
| Horizontal tabs - page view tabs, records tabs, workspace detail tabs, contacts stages | `.tab-underline > a, button` (owner console: `.admin-tabs`); optional `.tab-count` | Ink 700 text and a 2px ink underline (`--select-line`) that slides along the row | Ink text |
| Segmented control | `.segmented > .segmented-option` | Solid ink thumb (it is not grey) | Ink text; the track has no fill, just a 1px line |
| Selectable cards and tiles - template cards, choice cards, post picker tiles | `.select-outline` | Background stays the panel colour; 1.5px ink outline, ink title | The hairline darkens to `--line-strong` |
| Dense list rows - inbox conversations, contact rows | `.select-rail` (title in `strong` or `.select-title`) | A 3px magenta rail on the left edge, ink 700 title | Title goes to ink |
| Menu items - account menu, Actions menus, the + menu, dropdowns | `.menu-item` (also `.account-menu-item`, `.admin-menu-list > button`) | - | Ink text and icon. Keyboard focus gets the white tile with a darker focus hairline (`--select-tile-focus-line`, 3:1 on the panel) |
| ⌘K palette rows | `.palette-option` | The highlighted row is the white tile with the focus hairline | - |
| Table rows | `.data-table` | - | No fill; the row's primary link underlines |

**The white tile.** Light mode: `--panel` (white) + `--line-strong` hairline
+ `0 1px 2px rgba(23,24,29,.06), 0 1px 1px rgba(23,24,29,.04)`. Dark mode: a
slightly raised surface, `color-mix(in srgb, var(--panel) 92%, white)`, with
the same strong hairline - never a grey slab. On a white sidebar the tile is
told apart by its hairline and shadow, not by a fill. The tile is drawn by the
container's `::before`, sized to the selected item (`--thumb-w/-h`) and moved
with `translate(--thumb-x, --thumb-y)` over `--dur-3` `--ease-emph`; reduced
motion makes it jump. Before the hook has measured (first paint) or in a list
without the hook, the selected item draws the same tile itself. In a row of
chips (`.nav-list.is-row`, and the Settings/Help navs under 1020px) chips
differ in width, so the chosen chip draws its own tile instead of a sliding
one.

The selected state is read from `aria-current`, `aria-selected`,
`aria-pressed`, `aria-checked`, a checked input, or `.is-active` /
`.is-selected` / `.is-on`, so markup only has to say what is selected.
Adopting them takes a class and the sliding-indicator ref:

```tsx
// Side list of sections: the white tile glides behind the current item.
// Labels truncate (.nav-item-label); counts sit in a muted right column.
<nav ref={slidingThumbRef} className="nav-list" aria-label="Report sections">
  <a className="nav-item" href="/x" aria-current="page">
    <Icon size={16} aria-hidden /> <span className="nav-item-label">Overview</span>
    <span className="nav-item-count">12</span>
  </a>
</nav>

// Grouped side list (e.g. Settings "Workspace" / "Account"). The hook finds
// the selected grandchild, so one ref on the outer list moves one tile.
<nav ref={slidingThumbRef} className="nav-list" aria-label="Settings sections">
  <div className="nav-group" role="group" aria-labelledby="g-workspace">
    <p className="nav-group-label" id="g-workspace">Workspace</p>
    <a className="nav-item" href="?section=connections" aria-current="page">…</a>
  </div>
  <div className="nav-group" role="group" aria-labelledby="g-account">…</div>
</nav>

// Buttons work too (template categories): aria-pressed or aria-current="true".
<div ref={slidingThumbRef} className="nav-list" role="group" aria-label="Template categories">
  <button className="nav-item" type="button" aria-pressed="true">
    <span className="nav-item-label">Comments</span><span className="nav-item-count">8</span>
  </button>
</div>

// Phones: the same list as a scrollable row of chips.
<div ref={slidingThumbRef} className="nav-list is-row" role="group" aria-label="Template categories">…</div>

// View tabs: ink underline glides along the row; .tab-count is a quiet count.
<div ref={slidingThumbRef} className="tab-underline" role="tablist" aria-label="Views">
  <button role="tab" aria-selected="true">All <span className="tab-count">12</span></button>
</div>

<button className="template-card select-outline" aria-pressed={picked}>…</button>
<li className="contact-row select-rail is-selected"><strong>@handle</strong>…</li>
<div className="topbar-menu"><a className="menu-item" href="/x"><Icon size={16} aria-hidden /><span className="menu-item-label">Label</span></a></div>
```

The container needs `position: relative` (or sticky) so it is the items'
offsetParent; `.nav-list` already is, and it isolates its stacking context so
the tile (`z-index: -1`) sits behind the items but above the page. The
tokens behind all of this are `--select-tile-bg`, `--select-tile-line`,
`--select-tile-shadow`, `--select-tile-radius`, `--select-tile-focus-line`
(the tile), `--select-line` (ink underline/outline) and `--select-bar` /
`--select-bar-w` / `--select-bar-h` (the magenta rail on dense rows only).
Screens with their own tab classes (the Inbox's `.page-tabs`) draw the same
2px ink underline from these tokens.

Allowed non-transparent backgrounds: the page canvas, panels and cards,
buttons (primary ink, secondary outline is transparent), warning/danger
status chips, the plan sticker, skeleton loaders, avatars, the solid ink
thumbs/knobs of segmented switches and toggles, and the white tile (vertical
navigation, plus keyboard focus in menus and the palette). Code and ID chips
are transparent with a 1px line. `app/globals.test.ts` ("selection style:
never a grey fill") fails if a selected/active/current/hover rule sets any
other background, or if the tile shows up anywhere else.

## Shell: top bar, search and accounts

- **Top bar** (`.app-topbar`, `src/components/top-bar.tsx`), above the page
  content and never over the sidebar, in the workspace and the owner console:
  a search field ("Search automations, contacts, messages…" with a ⌘K / Ctrl K
  hint) on the left, lined up with the page content; on the right the ink
  "New automation" split button (click = template picker, caret = New
  automation, Quick automation, From a template, New tracked link, New
  broadcast) and the account avatar with the plan sticker. Under 900px it also
  carries the menu button and wordmark; under 768px the search field is a
  44px icon. Sticky page panels sit `--topbar-h` (64px) + 20px from the top.
- **Command palette** (`src/components/command-palette.tsx`): ⌘K / Ctrl K
  anywhere or "/" outside a text field. Recent picks, Pages (every nav
  destination and Settings section), Actions, then live Automations, Contacts
  and Conversations (owner console: Workspaces and Users). Arrow keys, Enter,
  Escape; the highlighted row is the white tile, never a grey fill. Full-screen
  sheet on phones.
- **Accounts** in the sidebar: each connected Instagram account and Facebook
  Page with its avatar or initial and a status dot (quiet green; amber or red
  with a soft halo when it needs a reconnect, problems listed first). Five
  show, the rest fold behind "Show all". "Connect account" appears while the
  plan has room. A row opens Settings → Connections with that account
  outlined (`/settings?account=<id>`).

Sidebar group labels are quiet sentence-case Manrope (`.sidebar-label`). The
owner console shows "Owner console" as a quiet line under the logo instead
of a badge.

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

Motion answers what the person just did: something opened, moved, was
added, changed state. One system for the whole product (tokens in
`app/globals.css`, the "Round 4: motion" block):

| Token | Value | Use |
| --- | --- | --- |
| `--dur-1` | 140ms | hover, press, toggles, colour changes |
| `--dur-2` | 220ms | things appearing: menus, toasts, list rows, errors, chips |
| `--dur-3` | 340ms | panels moving: dialogs, drawers, sheets, page and tab content, thumbs |
| `--dur-4` | 520ms | bars filling, charts drawing |
| `--stagger` | 45ms | between siblings; first five only, 180ms at most |
| `--ease-emph` | `cubic-bezier(.2,.9,.1,1)` | entrances: a quick start and a soft settle |
| `--ease-out` | `cubic-bezier(.22,.61,.21,1)` | fades, small state changes |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | exits |
| `--ease-snap` | `cubic-bezier(.43,.195,.02,1)` | press and switch knobs |

Rules:

- Animate only `opacity` and `transform` (and `clip-path` for the sliding
  selection thumbs and charts). The two exceptions are disclosure height
  (grid rows `0fr` to `1fr`, `::details-content`) and the keyword chip
  collapsing on remove: short, user-triggered, never on a timer.
- Entrances settle: fade plus a 6-8px rise, or a .97 scale. Exits are faster
  (about 70% of the entrance) and use `--ease-in`. Things that leave animate
  out too: wrap conditional overlays in `<Presence>`
  (`src/components/ui/use-presence.tsx`) and put `presenceProps(state)` on the
  overlay root; CSS keys the exit off `data-state="closing"`. React-driven
  disclosures use `<Collapse>` (`src/components/ui/collapse.tsx`).
- Selection moves, it does not jump: every segmented switch, tab row and
  side nav gets `ref={slidingThumbRef}`
  (`src/components/ui/use-sliding-thumb.ts`), which measures the selected
  option and glides one indicator between options (the segmented ink thumb,
  the side-nav white tile, the tab underline - see "Selection").
- Route changes cross-fade the page content only (React `<ViewTransition>`
  from each area's `template.tsx`); the sidebar never moves.
- Lists animate rows on first mount or when a row is genuinely new, never on
  refresh or polling. Keys must be stable (an optimistic message keeps its
  client key when the server confirms it).
- Hover is a colour or border change; press is `scale(.98)`. Nothing bounces
  and nothing loops except loading indicators (one slow skeleton sweep, which
  waits 120ms so fast loads never flash).
- `prefers-reduced-motion: reduce` turns all of it off: CSS durations go to
  zero, `<Presence>` unmounts immediately, smooth scrolling becomes instant
  (`prefersReducedMotion()` from `use-presence.tsx` for JS), and view
  transitions do not animate.
- The marketing site keeps its own scroll reveal (700ms, 56px rise) for
  long-form storytelling; product screens never use it.

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
