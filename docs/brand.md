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

## Selection: the brand tint, never a grey fill

Owner feedback (round 5): "I don't want that grey bg selected tile - I don't
have grey bg anywhere." Round 6 first moved vertical navigation to a white
tile (the owner's "Mondays" reference); the owner then found the white and
black "too much b&w" and asked for switching to match the brand. So every
switch now uses one set of **brand selection tokens** - a soft magenta tint,
a magenta hairline, a magenta icon or mark - and never a grey or neutral
fill, in either theme. Text on the tint stays ink (AA); the colour lives in
the tint, the hairline and the icon.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--select-tile-bg` | `--accent-soft` | `--accent-soft` (dark tint) | The tile behind a selected nav item; chips that are on; menu/palette keyboard focus |
| `--select-tile-line` | `--accent-line` | `--accent-line` | The tile's 1px hairline |
| `--select-icon` | `--accent-hover` | `--accent-text` | The selected (and hovered) nav item's icon |
| `--select-thumb-bg` / `--select-thumb-text` | `--accent-soft` / `--accent-text` | same tokens | The segmented thumb and its label |
| `--select-hover-bg` | `--accent-soft` at 55% | at 60% | Hover on any switch option that is not selected (segmented options use a lighter 40%) |
| `--select-line` | `--accent-hover` | `--accent-text` | Tab underlines, selected-card outlines, the contact-row rail |
| `--select-mark` / `--select-mark-text` | `--accent-hover` / white | `--accent-text` / `#101116` | Solid "on"/"chosen" marks: switch tracks, radio dots, post-picker ticks, the current builder step |

| Pattern | Class (container > item) | Selected | Hover |
|---|---|---|---|
| Vertical navigation - sidebars, owner console, Settings/Help section navs, template categories | `.nav-list > .nav-item` (also `.sidebar-nav > .sidebar-link`, `.settings-nav`, `.section-nav`, `.template-picker-categories`, Settings' `.prefs-nav`) | The brand tile behind the item (tint + hairline, 10px radius), gliding on `transform` (`ref={slidingThumbRef}`). Text ink 700, icon `--select-icon` | Faint tint wash, icon to `--select-icon` |
| Horizontal tabs | `.tab-underline`, `.auto-view-tabs`, `.page-tabs`, `.ibx-tabs`, `.admin-tabs` | Ink 700 text and a sliding 2px `--select-line` underline | Ink text |
| Segmented control | `.segmented > .segmented-option` | The soft magenta thumb, label in `--select-thumb-text` 700 | A lighter tint wash; the track itself has no fill, just a 1px line |
| Selectable cards and tiles - choice cards, post picker, current plan | `.select-outline`, `.builder-choice`, `.media-card`, `.quick-reel-card`, `.billing-plan.is-current` | Panel background; `--select-line` outline; radio dot / tick in `--select-mark` | The hairline darkens to `--line-strong` |
| Switches - on/off toggles | `.settings-switch`, `.status-switch`, `.builder-toggle`, `.menu-switch` | Track in `--select-mark` | - |
| Chips that are on | `.filter-chip.is-on`, `.ibx-chip[aria-pressed]`, `.workspace-chip.is-active` | The brand tile (tint, hairline, magenta label) | - |
| Dense list rows - inbox conversations, contact rows | `.select-rail` | A 3px magenta rail on the left edge, ink 700 title | Title goes to ink |
| Menu items | `.menu-item` (also `.account-menu-item`, `.admin-menu-list > button`) | - | Ink text and icon; keyboard focus gets the tile with a darker focus hairline (`--select-tile-focus-line`) |
| ⌘K palette rows | `.palette-option` | The highlighted row is the tile with the focus hairline | - |

Primary action buttons stay ink (they are actions, not selection).

**The tile.** Drawn by the container's `::before`, sized to the selected item
(`--thumb-w/-h`) and moved with `translate(--thumb-x, --thumb-y)` over
`--dur-3` `--ease-emph`; reduced motion makes it jump. Before the hook has
measured (first paint) or in a list without the hook, the selected item draws
the same tile itself. In a row of chips (`.nav-list.is-row`, and the
Settings/Help navs under 1020px) the chosen chip draws its own tile.

The selected state is read from `aria-current`, `aria-selected`,
`aria-pressed`, `aria-checked`, a checked input, or `.is-active` /
`.is-selected` / `.is-on`, so markup only has to say what is selected.
Adopting them takes a class and the sliding-indicator ref:

```tsx
// Side list of sections: the brand tile glides behind the current item.
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
thumbs/knobs of segmented switches and toggles, and the brand tile (vertical
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
  broadcast) and the account button. Under 900px it also carries the menu
  button and wordmark; under 768px the search field is a 44px icon. Sticky
  page panels sit `--topbar-h` (64px) + 20px from the top.
- **Account button and menus** (`AccountMenuButton`, `AccountMenuHead`,
  `MenuDivider` in `top-bar.tsx`): the button is the profile picture alone
  (36px, initials fallback) - no name, plan sticker or caret. Hover shows a
  faint ring; open shows a 2px gap plus a 2px ink ring. The menu is 280px,
  14px radius, 8px inside, hairline + soft shadow: avatar (40px), name and
  email on one row, one quiet line ("Owner · Agency plan" - plain words; the
  plan sticker stays where the plan is the subject, like Billing), a divider,
  then 40px `.menu-item` rows with a 16px icon column: My profile, Settings,
  Billing, Dark mode (`ThemeMenuSwitch`, a switch showing the current mode),
  Help, a divider, Sign out in the danger colour. The owner console menu
  (Back to workspace, Dark mode, Sign out) and the create menu use the same
  rows. Menus scale in from the top-right corner and scale out on close.
- **Command palette** (`src/components/command-palette.tsx`): ⌘K / Ctrl K
  anywhere or "/" outside a text field. Recent picks, Pages (every nav
  destination and Settings section), Actions, then live Automations, Contacts
  and Conversations (owner console: Workspaces and Users). Arrow keys, Enter,
  Escape; the highlighted row is the brand tile, never a grey fill. Full-screen
  sheet on phones. Contacts are searched on the server on every (debounced,
  cancelled) keystroke - `GET /api/contacts?scope=all&q=` matches handle,
  email, tags or the owner's email across the whole workspace - and a pick
  opens that person's drawer (`/contacts?contact=<id>`). Automations match by
  name and trigger keyword. Each live section shows "Searching…" while it
  waits and "No matches" when it has nothing; one "No results" message
  covers a query nothing answers.
- **Accounts** in the sidebar: each connected Instagram account and Facebook
  Page with its avatar or initial and a status dot (quiet green; amber or red
  with a soft halo when it needs a reconnect, problems listed first). Five
  show, the rest fold behind "Show all". "Connect account" appears while the
  plan has room. A row opens Settings → Connections with that account
  outlined (`/settings?account=<id>`).

Sidebar group labels are quiet sentence-case Manrope (`.sidebar-label`). The
owner console shows "Owner console" as a quiet line under the logo instead
of a badge.

## Settings: the preferences list

Settings (`src/components/settings-screen.tsx`, primitives in
`src/components/settings/prefs.tsx`) reads as a calm preferences pane, not
a stack of cards:

- A 220px section nav ("Workspace" / "Account") beside content capped at
  760px. The selected section sits on the brand tile from "Selection".
- Each section is an `h2` plus one line, then groups. A group is a quiet
  title (with an optional action on the right) over **one** card whose rows
  are split by hairlines: label and helper on the left, the control or value
  on the right (`PrefsGroupHead`, `PrefsRow`). Never one card per row.
- Destructive actions that affect the whole section live in a last "Danger
  zone" group; row-level ones (Disconnect, Revoke) stay quiet slate text
  until hovered and always confirm in place.
- A sticky save bar ("Unsaved changes" · Discard · Save changes) appears only
  while a section has unsaved edits, then says "Saved." and leaves.
- Usage meters (`UsageMeter`): an allowance turns amber at 80% and red when
  used up; a count (accounts, seats) is amber only when every slot is taken.
- Phones drill in: `/settings` is the list of sections, a section is its own
  page with a "Settings" back link, and rows stack the control under the copy.

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

## First-time onboarding

`/onboarding` (`src/components/onboarding/`, styles in
`onboarding.module.css`) is the one product screen that speaks the
marketing site's language, because it is the bridge from the site: big
Bricolage questions (800, tight tracking) on white, a **volt stage** beside
each question with a live illustration that reacts to the answer, and the
deep magenta (`#c200bf`, AA with white) for the Continue pill, progress and
chosen marks. The volt stage, the volt "time back" block on the plan step and
on Home's "Your plan" card are the only volt surfaces outside the plan
sticker. Choices use the brand selection tint; no grey fills, no uppercase or
mono labels, nothing under 13px. Every number on the plan states its
assumption ("about 30 a day, about 5 in 10 about what you picked, 30 to 45
seconds per reply"); nothing is shown that is not computed from the answers
or read from the connected account.

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
