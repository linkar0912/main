# Linkar public feature and workflow pages

Implemented on 13 October 2026. The catalogue contains 67 new public HTML pages:
20 feature guides, 20 audience solution guides, 24 workflow recipes, and three hubs.
It also supplies 24 downloadable Markdown recipe plans.

## Design

Redesigned on 14 October 2026 after a section-by-section study of manychat.com
(home, creators, product, solution, use-case, landing, brands and hub pages).
The pages borrow Manychat's patterns, not its assets: saturated colour blocks with
a faint grid, short bold headlines, Instagram-like mock UI built in HTML and CSS
(comment cards, DM bubbles, keyword stickers, toggles, builder nodes), dark FAQ
blocks and loud closing calls to action. There are no testimonials, ratings or
invented metrics; plan numbers come from `src/lib/billing/catalog.ts`.

Each detail page is assembled from a library of section variants in
`src/components/marketing/seo/sections/<role>/<variant>.tsx`:

| Role | Variants |
|---|---|
| hero | split, fullbleed, centered (hubs use `hero/hub`) |
| overview | pile, zigzag, statement |
| How it works | canvas (automation builder board), timeline (sticky header, vertical steps) |
| benefits | cards, sticky, zigzag, iconlist |
| example | phone, flow, thread |
| campaign notes | split, statement |
| extras (1 or 2) | compare, channels, photo, checklist |
| FAQ | dark, columns |
| related | cards, rows |
| closing CTA | plans, photo, banner |

`seo-layout.ts` picks one variant per role from a seed of the page path (FNV-1a
plus mulberry32), so each page keeps the same layout between builds while the 64
detail pages all differ. It also orders the sections, keeps adjacent sections on
different surfaces, allows at most one full-width "photo" band (the photo extra
or the photo CTA) besides the hero, and uses every variant on at least two pages
in each collection. Section titles and statement lines come from per-topic
variants in `seo-theme.ts`, dealt with the same seed. Example copy is interpreted once in `seo-example.ts` (event-style
requests, described replies, next-step buttons, Facebook public replies) so every
section shows it the same way.

Navigation: breadcrumbs in every hero, a sticky "On this page" bar with a
scrollspy, a sticky collection switcher and topic filter with a scrollspy on hubs,
related links and a previous/next pager. In-page links go through
`seo/hash-link.tsx` so the browser Back button restores the right page.

The hero photo is the only picture on a page. Every other visual, including the
"photo" extra and the "photo" CTA, is Linkar product UI drawn in code: mock
comments, DMs, Stories, builder nodes and activity cards on flat colour panels,
built from the shared primitives in `seo/mock-ui.tsx` and filled with the page's
own keyword, trigger, reply and destination. They use no `<img>`, `next/image`
or CSS background picture, and the page tests fail if any picture other than
the hero photo renders. Editorial content stays server-rendered and FAQ
accordions use native `details`.

## Content and routes

- `/features`: capabilities and practical configuration guidance.
- `/solutions`: business-specific workflows and destinations.
- `/templates`: example messages and three-step recipes to adapt and test.

Editorial records are in `src/content/seo/features.ts`, `solutions.ts`, and
`templates.ts`. Each record includes its own heading, description, introduction,
benefits, setup steps, example, campaign advice, FAQ, and three contextual links.
The catalogue is curated; adding a record requires actual scenario-specific copy.
These are not automatically generated keyword or location combinations.

The templates describe editable workflow plans. They do not claim one-click
import, supply the creator’s own guide, or establish external checkout, booking,
newsletter, inventory, or ticketing integrations. Facebook Page recipes describe
public comment replies; Instagram recipes use the supported interaction described.

Next.js generates all known slug pages at build time. Unknown slugs return 404.
Host routing sends these public paths on app/admin hosts to the marketing host.
The site navigation, footer, hubs, and related pages provide discovery links.

## Search metadata

Every page has a unique title and description, a canonical URL, Open Graph and
Twitter metadata, and breadcrumb structured data. Detail pages use WebPage
schema; hubs use CollectionPage with a counted ItemList, named after the hub
title without " · Linkar". Every page node names its site (`isPartOf`, a typed
WebSite) and publisher (`#organization`) in full and points `about` at the one
SoftwareApplication (`#software`) declared on the homepage. That node lists the
feature labels, a monthly INR offer for every plan and a yearly one for each
paid plan, all GST-inclusive. `/contact` (ContactPage) and `/support` (WebPage) carry
the same pattern. All of it is built in `src/lib/seo-pages.ts`. No page
fabricates ratings, reviews, `sameAs` profiles, FAQ rich results or HowTo
markup; the homepage FAQPage is the only one.

Sitemaps: robots.txt lists four. `/sitemap.xml` is the complete one, already
submitted to search engines: the 12 core marketing, help and legal pages plus
every hub and guide. `/features/sitemap.xml`, `/solutions/sitemap.xml` and
`/templates/sitemap.xml` (`app/<collection>/sitemap.ts`) each repeat one hub
and its guides, so catalogue URLs appear twice by design. Every hub and guide
entry carries its hero photograph as an image entry
(`app/seo-sitemap-entries.ts`). The recipe downloads are in no sitemap and
return `X-Robots-Tag: noindex`.

Dates are fixed in code and never taken from the build or request time:
`SEO_CONTENT_UPDATED` for the catalogue, `MARKETING_PAGES_UPDATED` for `/` and
`/pricing`, `HELP_PAGES_UPDATED` for `/contact` and `/support`, and the legal
pages' effective date (`LEGAL_ENTITY.effectiveDate`), except privacy, cookies
and service providers, which changed on 13 October 2026. Move a date forward in
the same change as the content it describes.

`/llms.txt` (`app/llms.txt/route.ts`) is the full summary for AI search tools:
what Linkar is and how its name is spelled, a Facts section (GST, Razorpay and
payment methods, yearly prices, the Free plan, how messages are counted and
what happens at the limit, cancelling, supported accounts, non-affiliation with
Meta, the support address and a last-updated date), the main pages, every
guide with a factual one-line description, the plans, the homepage FAQ, and an
Optional section with the 24 recipe Markdown downloads. Prices and limits come
from the billing catalog, so it never drifts from `/pricing`.

## Hero asset

Each of the 67 SEO pages has its own photograph in `public/marketing/seo/`.
The creator-studio photo is used only for the creators solution. Another 66
original page-specific photographs were generated using the built-in image
generation tool. All are optimised to 1536 × 1024 WebP. The homepage retains
its original photograph. Page heroes and social previews use the same specific
asset, with scene-specific social image descriptions. No generation credentials
or remote image runtime is required.

See [the complete shot list and generation prompt set](seo-hero-images.md).

Original creator-studio generation prompt:

> Use case: photorealistic-natural. Asset type: wide full-bleed website hero photograph for Linkar, an Instagram automation SaaS for Indian creators and small brands. Create an original editorial lifestyle photograph, landscape 3:2. A relaxed Indian woman content creator in her late 20s wearing an understated off-white linen shirt, seated comfortably on a modern charcoal sofa in a small contemporary creative studio, smiling quietly while looking at a phone. Natural authentic face, realistic hands. A laptop and a small camera on a low side table imply she has finished working. Composition: place the woman and the interesting scene on the right half, with her head in the upper right quadrant and full torso visible. Left 50 percent is spacious dark charcoal wall and subtle studio background, intentionally calm and uncluttered to carry white headline text added later in code. Soft daylight from the right, realistic soft shadows, cinematic editorial photograph, subtle neutral materials and plants, muted colour palette, restrained small magenta studio accent detail. No text, no logos, no graphics, no UI, no baked-in chat bubbles, no watermark. Avoid orange or brown walls and exaggerated smiling or glossy stock-photo poses. The image must work as a website background at desktop and cropped mobile widths.

## Verification

- TypeScript and production build passed; all 67 HTML pages and 24 downloads prerendered.
- 83 targeted tests passed, covering content, related links, sitemap, metadata,
  host routing, navigation, authentication-page reuse, and recipe downloads.
- Catalogue tests require at least 300 words of page-specific editorial content,
  unique headings and descriptions, titles within 60 characters, and prevent
  substantial repeated eight-word passages between page pairs.
- ESLint, branding, and customer-copy checks passed.
- Production HTML checked for one H1, canonical, description, and breadcrumb
  schema across all 67 pages.
- Photo hero coverage checked across all 67 generated HTML pages, including
  all recipe pages and hubs: each has its photo, heading, floating conversation,
  and working section anchor.
- The per-page hero regression test requires 67 distinct asset URLs and 67
  distinct file hashes, and verifies that social previews use each page’s image.
- Four unknown detail/download URLs returned real HTTP 404 responses.
- A recipe download returned HTTP 200 with the correct content and noindex header.
- Browser review covered desktop and 390px mobile layouts, the creator page,
  feature page, recipe page, and the 24-item recipe hub. No horizontal overflow
  or browser console errors were observed in the reviewed layouts.

This work is local and has not been deployed. Ranking positions and indexing
cannot be guaranteed by page creation. After deployment, submit the sitemap to
Search Console and use real indexing, query, and conversion evidence to decide
which content to improve. No search-volume estimates or ranking results were
invented for this catalogue.
