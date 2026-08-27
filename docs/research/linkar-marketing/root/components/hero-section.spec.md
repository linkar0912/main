# HeroSection implementation contract

## Target paths

- TSX: `src/components/marketing/hero-section.tsx`
- CSS: `src/components/marketing/hero-section.module.css`
- Test: `src/components/marketing/hero-section.test.tsx`

The section is server-rendered. A small local client wrapper may add the staged entrance after hydration; the useful initial DOM cannot depend on it.

## Original Linkar copy

- H1: “Turn attention into conversations that keep moving.”
- Body: “Set the trigger once. Linkar replies with context, follows up on time, and brings you back when a real person matters.”
- Primary action: “Start building” → `/signup`
- Secondary proof: “Clear rules. Useful replies. Your voice.”
- Automation scene:
  - Incoming: “Can you send the guide?”
  - Rule: “Keyword found: GUIDE”
  - Reply: “Absolutely — I’ve sent the quick version. What are you hoping to improve first?”
  - Status: “Conversation moving”

## Semantic DOM hierarchy

```text
section#top[aria-labelledby="hero-title"]
├─ local responsive image (decorative; empty alt)
├─ div (contrast scrim)
└─ div (content grid)
   ├─ div (copy)
   │  ├─ h1#hero-title
   │  ├─ p
   │  ├─ a (Start building)
   │  └─ p (secondary proof)
   └─ figure[aria-label="A Linkar reply flow in motion"]
      ├─ ol (incoming, rule, reply states)
      └─ figcaption (status)
```

## Exact layout

- Desktop `>= 1024px`: minimum height `100svh` and `760px`; 12-column frame with gutters `clamp(32px, 4.45vw, 72px)`; copy spans columns `1–6`, aligns to the lower-middle with top padding `168px` and bottom padding `96px`; scene spans columns `8–12`, aligns end, max width `430px`; H1 max width `780px` and size `clamp(4.5rem, 7vw, 7.5rem)`, line-height `0.88`.
- Tablet `768px–1023px`: minimum height `900px`; 8-column grid, padding `132px 32px 64px`; copy spans all 8 columns, max width `720px`; scene spans columns `4–8`, width `400px`, margin-top `56px`; H1 size `clamp(4rem, 8vw, 5.5rem)`.
- Mobile `<= 767px`: minimum height `100svh` and `720px`; one column, padding `116px 20px 32px`; copy and scene stack; H1 size `clamp(2.75rem, 13vw, 4rem)`, line-height `0.94`; body max width `34ch`; scene width `min(100%, 350px)`, margin-top `36px`; action is at least `52px` high and fits its content rather than forcing full width.

The background image uses cover positioning. Its focal point is `68% 50%` on desktop, `62% 50%` on tablet, and `58% 50%` on mobile. A left-to-right and bottom scrim preserves at least `4.5:1` text contrast if the image fails or varies.

## Visual values

- Foreground Canvas `#ffffff`; deepest scrim Ink `#050505` at `84%`.
- Primary action Signal magenta `#fa0cf7`, Ink label, `54px` height, `999px` radius, `24px` horizontal padding.
- Figure: Ink at `82%`, `1px` Canvas at `18%`, `24px` radius; active rule uses Volt `#fff100`; status uses `--font-mono`.
- Display uses weight `800–900`, tight tracking; body uses weight `500` and `clamp(1rem, 1.35vw, 1.25rem)`.

## State transitions

On enhanced load, image settles from scale `1.035` to `1`; headline lines rise `56px`; body fades; action label rolls into place; figure states reveal in incoming → rule → reply order. Use entrance easing `cubic-bezier(.22,.61,.21,1)` for `700ms`, then snap easing `cubic-bezier(.43,.195,.02,1)` for the `420ms` action/scene changes. The complete scene is visible in server output.

## Assets

- `public/marketing/linkar-hero.webp`, original to Linkar, with intrinsic dimensions at least `2400 × 1600`.
- Optional responsive derivative `public/marketing/linkar-hero-mobile.webp`, original crop from the same Linkar source.
- Product flow is React/CSS, not image media. No external URL or embedded mark is allowed.

If the image fails, the Ink fallback and scrim preserve the complete copy and flow scene without layout movement.

## Focus behavior

The primary action has a visible Ink `2px` ring with `3px` Canvas outer offset. Its hover/focus lift is no more than `2px`; the label never disappears during transition.

## Reduced motion

Render image, copy, action, and complete flow scene at final scale/position/opacity immediately. Remove image settling, line rises, label roll, and state sequencing. Retain a brief focus color change.

## Test contract

Assert the unique H1 and exact copy, `/signup` destination, figure accessible name and all three flow states, local asset path, useful fallback DOM, and final-state presentation when motion is reduced.

