# Linkar Brand Identity — "Volt"

Linkar's identity is inspired by the energy of modern creator-tool brands
(ManyChat being the north star): near-black ink, one electric signature color,
a playful spectrum for data, chunky friendly type, and pill-shaped confidence.
The concept behind the mark: **every conversation answered instantly** — a chat
bubble carrying a lightning bolt.

## Logo — the Spark

`src/components/linkar-mark.tsx` renders the brand mark: a rounded speech
bubble (`currentColor`) with a Volt bolt inside. Because the bubble inherits
text color it works on light and dark surfaces; the bolt is always Volt.

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
| `--accent` | `#0a6cff` | Signal Blue — links, focus rings, active data |
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
2. **Signal Blue is the only interactive accent** for links/focus/info.
3. Red is reserved for errors — never decoration.
4. Legacy palettes are contractually forbidden (see `app/globals.test.ts`):
   Meta blue `#0866ff`, Tailwind greens, old amber rgba.

## Typography

Loaded in `app/layout.tsx` via `next/font/google` (self-hosted):

| Variable | Family | Use |
|---|---|---|
| `--font-display` | Bricolage Grotesque | h1–h3, sidebar + login wordmarks |
| `--font-sans` | Manrope | Everything else (body 15px, UI labels) |
| `--font-mono` | JetBrains Mono | Media IDs, handles, tokens |

Headlines are extra-bold (800) with slight negative tracking (-.02em).

## Shape & depth

- Buttons and badges are **pills** (`border-radius: 999px`); primary = ink
  background that lifts with `--shadow-lift` on hover.
- Panels/cards use `--radius-lg` (20px) with soft diffuse shadows — no hard
  neo-brutalist borders inside the app; the playfulness comes from color.
- Inputs keep 10px radii so forms stay calm.

## Motion

Rise/fade entrances, staggered lists, pop-in confirmations, springy hover
lifts (`cubic-bezier(.22,.61,.21,1)` at .22s). Reduced-motion is fully
respected.

## Voice

Confident, plain-spoken, a little playful. Short sentences. Concrete outcomes
("answered in seconds", "back in your control room"). No jargon, no hype
adjectives. Tagline: **"Instagram automation, made clear."**
(`PRODUCT_TAGLINE` in `src/lib/branding.ts`).

## Governance

- All colors/typography flow through `:root` tokens in `app/globals.css`.
- `app/globals.test.ts` asserts the palette contract (white canvas, bone
  sidebar, Signal Blue accent, Volt signature, red-for-errors). Update it
  whenever the system itself changes — never bypass it.
- `pnpm check:branding` guards legacy product names.
