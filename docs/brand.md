# Linkar Brand Identity — "Volt"

Linkar's identity is a direct study of ManyChat's real, live brand (not a
vague "creator tool" vibe): near-black ink, one hot-magenta signature
interaction color, a bright yellow secondary block color, chunky friendly
type, uppercase mono buttons, pill-shaped confidence, and a faint graph-paper
texture behind hero panels. The concept behind the mark: **every conversation
answered instantly** — a chat bubble carrying a lightning bolt.

## Logo — the Spark

`src/components/linkar-mark.tsx` renders the brand mark: a rounded speech
bubble (`currentColor`) with a Volt bolt inside. Because the bubble inherits
text color it works on light and dark surfaces; the bolt is always Volt.
This mark is Linkar's own — it does not borrow ManyChat's "m" glyph.

- Use `LinkarMark` in **brand spots**: sidebar wordmark, mobile topbar, auth
  hero + cards, loading skeleton.
- Use `InstagramGlyph` only where the icon literally means Instagram
  (connections, public page, help content).
- Clear space: keep at least the height of the bolt around the mark.
- Never recolor the bolt; never place the mark on clashing hues.

## Color

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#17181d` | Body text, primary CTAs (black pills), dark panels |
| `--ink-strong` | `#0b0c10` | Hover state of ink surfaces |
| `--volt` | `#fff100` | The signature. Logo bolt, plan sticker, active nav pill, energy moments |
| `--volt-deep` | `#f7cd21` | Volt borders/hover on dark |
| `--accent` | `#fa0cf7` | Magenta — ManyChat's real CTA/interaction color. Links, focus rings, active data, primary chart series |
| `--accent-hover` | `#c807c4` | Hover/pressed state of accent surfaces |
| `--accent-soft` / `--accent-line` | `#fce7fb` / `#f3aef0` | Tinted chip backgrounds and borders on light surfaces |
| `--accent-tint-dark` / `--accent-pale-dark` / `--accent-vivid-dark` | `#f7b3f0` / `#fbdcf7` / `#ff5ff0` | Accent-family text/icon tones for use **on dark ink/gradient panels** (auth hero, help hero, profile hero, dark builder preview) |
| `--grape` | `#7b34ce` | Spectrum: secondary chart series, condition markers |
| `--flame` | `#ff4b00` | Spectrum: emphasis metrics (`--saffron`) |
| `--leaf` | `#0f7b3f` | Success states (`--green`) |
| `--honey` | `#b45309` | Warning states (`--amber`) |
| `--danger` | `#b42318` | Errors and failed statuses only |
| `--surface-soft` | `#f7f6ef` | Warm bone — sidebar, soft chips |
| `--canvas` | `#ffffff` | App canvas stays white |

Rules:

1. **Volt is a highlighter, not a paint bucket.** Small doses: stickers,
   active states, key words. Always pair with ink; never body text on white.
2. **Magenta is the only interactive accent** for links/focus/info — this
   replaced Signal Blue once we confirmed ManyChat's real palette has no
   blue in it at all.
3. Red is reserved for errors — never decoration.
4. Legacy palettes are contractually forbidden (see `app/globals.test.ts`):
   Meta blue `#0866ff`, Tailwind greens, old amber rgba, and the retired
   Signal Blue (`#0a6cff`).

## Typography

Loaded in `app/layout.tsx` via `next/font/google` (self-hosted):

| Variable | Family | Use |
|---|---|---|
| `--font-display` | Bricolage Grotesque | h1–h3, sidebar + login wordmarks |
| `--font-sans` | Manrope | Everything else (body 15px, UI labels) |
| `--font-mono` | JetBrains Mono | Media IDs, handles, tokens — **and now all buttons, section labels, and the plan tag** |

Headlines are extra-bold (800) with slight negative tracking (-.02em).

ManyChat sets every button and nav label in an uppercase monospace font
(`CoFo Sans Mono`). We can't license that font, so `.button` and its
variants (`.chooser-cta`, `.button-setup`), plus `.plan-tag` and
`.sidebar-label`, reuse the JetBrains Mono already loaded for data —
uppercase, `.04–.05em` letter-spacing. Everything else (nav copy, body
text, table cells) stays Manrope for density and legibility; we didn't
uppercase the in-app sidebar nav, since that's read constantly rather than
skimmed once like a marketing site.

## Shape & depth

- Buttons and badges are **pills** (`border-radius: 999px`); primary = ink
  background that lifts with `--shadow-lift` on hover.
- Panels/cards use `--radius-lg` (20px) with soft diffuse shadows — no hard
  neo-brutalist borders inside the app; the playfulness comes from color.
- Inputs keep 10px radii so forms stay calm.
- Product mockups (`.template-illustration` in the template gallery) use a
  near-black card with a faint magenta-tinted grid and a solid-magenta
  caption bar pinned to the bottom edge — ManyChat's actual IG-post-mockup
  pattern, reused for our own automation previews.

## Motion

Rise/fade entrances, staggered lists, pop-in confirmations use
`--ease-out` (`cubic-bezier(.22,.61,.21,1)`) at `.22s`. Interactive hover/
press transforms (buttons, links) use `--ease-snap`
(`cubic-bezier(.43,.195,.02,1)`) — ManyChat's actual button curve: a fast
start that eases hard into the stop, snappier than a generic ease. Reduced-
motion is fully respected.

The `.grid-texture` utility overlays a faint white grid
(`rgba(255,255,255,.06)`, 32px cells) via `::before` — reserved for the
help hero and product mockups where a diagram-like surface adds context.
Auth screens use a quieter editorial panel with a soft contour instead of a
grid, keeping the entry flow focused and professional.

## Voice

Confident, plain-spoken, a little playful. Short sentences. Concrete outcomes
("answered in seconds", "back in your control room"). No jargon, no hype
adjectives. Tagline: **"Instagram automation, made clear."**
(`PRODUCT_TAGLINE` in `src/lib/branding.ts`).

## Governance

- All colors/typography flow through `:root` tokens in `app/globals.css`.
- `app/globals.test.ts` asserts the palette contract (white canvas, bone
  sidebar, magenta accent, Volt signature, red-for-errors). Update it
  whenever the system itself changes — never bypass it.
- `pnpm check:branding` guards legacy product names.
