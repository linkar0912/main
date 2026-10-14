# SEO image slots

The SEO pages (`/features`, `/solutions`, `/templates` and their 64 detail
pages) use two kinds of photography:

- **Hero photos**, one per page, in `public/marketing/seo/` (see
  `docs/seo-hero-images.md`). Only the hero sections (`SeoHero*` and
  `SeoHubHero`) may show them.
- **Image slots**, for every other picture: cards, the overview photo, benefit
  photos, the example post, full-bleed statement bands and the photo CTA. Each
  slot is a reserved file path with its own prompt. Until its file exists, the
  page renders a placeholder.

A hero photo must never be reused in a slot. Every slot prompt asks for a
different moment, framing and part of the setting than that page's hero, and
`--install` refuses a source file that is byte for byte a hero photo.

## Where the files go

```
public/marketing/seo/slots/{collection}/{slug}/{key}.webp
public/marketing/seo/slots/{collection}/index/{key}.webp     (collection hubs)
```

For example `public/marketing/seo/slots/features/instagram-comment-to-dm/card.webp`.

| Key | Size (px) | Shape | Shown in |
|---|---|---|---|
| `card` | 1200 × 900 | landscape 4:3 | the page's card on hubs, related cards and rows, the hub hero stack |
| `overview` | 1200 × 1200 | square | overview, zigzag layout |
| `benefit-1`, `benefit-2`, `benefit-3` | 1200 × 900 | landscape 4:3 | benefits, zigzag layout (one per benefit) |
| `benefits` | 1000 × 1250 | portrait 4:5 | benefits, icon list layout |
| `example-post` | 1080 × 1350 | portrait 4:5 | the post inside the example phone |
| `statement` | 2400 × 1200 | wide 2:1 | full-bleed photo band (white headline on top) |
| `cta` | 2400 × 1200 | wide 2:1 | photo CTA (headline and bubbles on top) |

Which slots a page needs depends on its layout. Layouts are picked per page by
`src/components/marketing/seo/seo-layout.ts`, so not every page uses every key.
`card` is needed for every detail page because hubs and related sections show it.
A page carries at most one full-width photo besides its hero, so it needs a
`statement` slot or a `cta` slot, never both.

## The list of slots to generate

```sh
pnpm exec tsx scripts/seo-image-slots.ts              # Markdown table of every slot in use
pnpm exec tsx scripts/seo-image-slots.ts --missing    # only slots without a file yet
pnpm exec tsx scripts/seo-image-slots.ts --json       # the same as JSON
pnpm exec tsx scripts/seo-image-slots.ts --out tmp/slots   # write image-slots.md and image-slots.json
```

Each row has the file path, size, whether it exists, the pages that show it,
the alt text and the full generation prompt. Alt text and prompts are built in
`src/content/seo/image-slots.ts` from the page's label, topic and collection,
a per-page subject (who, where, and the thing people ask for) and a per-key
scene template.

## Prompt style

Prompts follow `docs/seo-hero-images.md`: photorealistic and natural, Indian
creators and small businesses, natural light, a calm real work moment, and no
words, logos, watermarks, baked-in UI, chat bubbles or legible screen text. The
page's UI widgets are drawn in code on top of some slots, so the photos stay
clean. Wide `statement` and `cta` photos keep their centre third calm and fairly
dark for a white headline; `overview` keeps its lower-left corner calm for a
floating card.

## Adding an image

1. Generate the image from the slot's prompt at (or above) the listed size.
2. Install it. This resizes with a centred cover crop to the exact slot size and
   saves WebP at quality 82 using the `sharp` that ships with Next.js:

   ```sh
   pnpm exec tsx scripts/seo-image-slots.ts --install features/instagram-comment-to-dm/card ~/Downloads/comment-to-dm-card.png
   ```

   The slot id is the path without `public/marketing/seo/slots/` and `.webp`.
3. Check the page. In development the placeholder is replaced on the next
   refresh. Production pages are static, so the photo appears after the next
   build.

To export by hand instead, any tool works as long as the result is a WebP at
the exact size and path above, for example:

```sh
node --input-type=module -e "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/package.json'); const sharp = require(require.resolve('sharp', { paths: [require.resolve('next/package.json')] })); await sharp(process.argv[1]).resize(1200, 900, { fit: 'cover' }).webp({ quality: 82 }).toFile(process.argv[2]);" source.png public/marketing/seo/slots/features/instagram-comment-to-dm/card.webp
```

## How pages render a slot

`SeoImageSlot` (`src/components/marketing/seo/image-slot.tsx`) is a server
component. It checks whether `public{src}` exists. If it does, it renders
`next/image` with `fill`, lazy loading, the caller's `sizes` and the slot's alt
text. If not, it renders a placeholder tinted with the page accent, with the
grid texture and a soft image icon, marked `aria-hidden` and
`data-image-slot="{id}"`. In development the placeholder also shows
`IMAGE SLOT · {key} · {width}×{height}` and the path, and carries the same
details in a `title` tooltip; slots narrower than 220px (thumbnails) hide the
caption and keep only the tooltip. Production shows no text and no tooltip.

The placeholder follows the page theme by default (`surface="auto"`). Slots
that sit inside light mock UI or on a light colour panel pass `surface="light"`,
which keeps the placeholder a pale tint of the accent on white in both themes:
the example post frame, guide cards on their tinted panels (hubs and related
cards), the hub hero's mini cards and the benefits zigzag photos on their
yellow or lilac frames. Full-width `statement` and `cta` placeholders stay dark
in both themes for their white headlines.
