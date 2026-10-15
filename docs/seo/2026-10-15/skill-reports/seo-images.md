# Linkar image SEO audit (seo-images)

Date: 15 Oct 2026. Skill: `~/.claude/skills/seo-images/SKILL.md` (v1.9.0).
Targets: LIVE https://linkar.in (12 public URLs in the live sitemap) and LOCAL http://localhost:3000 (the same 12 plus the 67 SEO catalogue URLs: 3 hubs and 64 detail pages).
Mode: read-only. No repo files edited, no settings changed.

**Category score: 82 / 100**

Images are in good shape overall:
- Every image is WebP or SVG.
- `next/image` builds responsive srcsets, and the `sizes` values were worked out with `object-fit: cover` in mind.
- No image has missing dimensions, and CLS is 0.001 on live.
- Below-the-fold images are lazy-loaded.
- Each of the 67 SEO pages has its own `og:image`, with alt text and dimensions.
- The favicon set is complete.

Points come off for:
- the missing social image on `/pricing`;
- the empty hero alt on the live homepage;
- named portrait "testimonials" on the homepage that may be invented;
- a preload strategy that does not match where each hero sits on screen;
- no AVIF;
- no edge caching of optimized images;
- 3:2 SEO social images with no branding;
- no image sitemap and no `primaryImageOfPage`.

---

## 1. Image audit summary

| Metric | LIVE (12 pages) | LOCAL (12 + 67 pages) | Status |
|---|---|---|---|
| Total `<img>` elements | 8 (6 unique files) | 75 (73 unique files) | n/a |
| Missing or empty alt on a content image | 1 (home hero `alt=""`) | 0 | LIVE: Warn, LOCAL: Pass |
| Oversized (over 200 KB source) | 0 | 0 | Pass |
| Wrong format (JPEG or PNG where WebP or AVIF would do) | 0 | 0 | Pass |
| No dimensions (no width/height and no sized container) | 0 | 0 | Pass |
| Below the fold but not lazy-loaded | 0 | 0 | Pass |
| Preloaded but not the LCP image | n/a | 20 "centered" heroes start at or below the fold | Warn |
| `fetchpriority="high"` on an LCP-candidate image | 0 | 0 of 67 | Warn |
| Pages without og:image | 1 (`/pricing`) | 1 (`/pricing`) | Fail |
| SEO pages with a unique og:image | not deployed | 67 / 67 (0 duplicate URLs, 0 duplicate file hashes) | Pass |

How the counts were gathered:
- Pages were fetched with curl (Googlebot user agent on live) and parsed with `seo-run/img_audit.py` and `seo-run/seo_img_table.py`.
- Rendered sizes were measured in the Browser pane at 1440x900, 1024x768 and 375x812 (DPR 2).
- Live performance comes from PageSpeed Insights v5 (Lighthouse 13.5.0, run 15 Oct 2026 06:11 UTC).

### Where the images are
- **LIVE:**
  - home: the hero photo, plus 2 proof-rail portraits, each rendered twice for the marquee;
  - `/pricing`: 3 payment-logo SVGs (Razorpay, Visa, Mastercard);
  - the 10 legal and help pages: no `<img>`.
- **LOCAL:** the same as live, plus exactly 1 `<img>` (the hero photo) on each of the 67 SEO pages. Every other visual on those pages is inline SVG or CSS UI drawn in code (183 inline SVGs on `/features`, all `aria-hidden="true"`). This matches the project rule: only the hero is a photo.

### File sizes (source files in `public/`)
- 71 WebP files in `public/marketing`, 6.3 MB in total:
  - 67 SEO heroes, 1536x1024, from 54 KB to 141 KB (median 85 KB);
  - 2 home heroes, 1536x1024, 86 KB and 138 KB;
  - 2 portraits, 800x800, 85 KB and 145 KB.
- None is above the skill's 200 KB hero target.
- Visitors never download the source files: `next/image` serves resized WebP. Live examples:
  - home hero on mobile: 25.8 KB at 750w;
  - home hero on desktop: 87.5 KB at 1920w;
  - portraits: 3.7 to 5.4 KB each.
- Brand files: favicon.ico 2 KB, icon.png 8.6 KB, apple-icon.png 2.6 KB, payment SVGs 0.9 to 8 KB.

---

## 2. Prioritized optimization list (largest byte savings first)

These are the estimated savings from serving AVIF instead of WebP at the quality Next.js uses. Next maps `quality=75` to AVIF quality 47 (`node_modules/next/dist/server/image-optimizer.js:910-916`).

I measured this by re-encoding each source with ImageMagick:
- WebP at q75, which reproduces live byte-for-byte: 87,488 B for the home hero at 1536w, the same as live `/_next/image?...&w=1920`;
- AVIF at q47.

| Image | Source | Served WebP at 1536w | AVIF at 1536w | Est. saving |
|---|---|---|---|---|
| marketing/linkar-creator-arjun.webp (portrait, served at 96 to 128w, so the real saving is tiny) | 141 KB | 108 KB | 47 KB | 61 KB at full size |
| marketing/seo/solutions/index.webp | 132 KB | 96 KB | 54 KB | 42 KB |
| marketing/seo/solutions/small-businesses.webp | 137 KB | 94 KB | 54 KB | 40 KB |
| marketing/seo/features/instagram-story-mention-replies.webp | 131 KB | 91 KB | 51 KB | 40 KB |
| marketing/seo/solutions/travel-creators.webp | 128 KB | 89 KB | 50 KB | 39 KB |
| marketing/seo/templates/facebook-opening-hours.webp | 124 KB | 89 KB | 50 KB | 39 KB |
| marketing/linkar-hero-indian-relaxed.webp (live home hero) | 134 KB | 85 KB | 47 KB | 38 KB |
| marketing/seo/templates/facebook-product-faq.webp | 119 KB | 82 KB | 47 KB | 35 KB |
| marketing/seo/solutions/newsletter-creators.webp | 112 KB | 80 KB | 45 KB | 35 KB |
| marketing/seo/features/instagram-dm-automation.webp | 110 KB | 78 KB | 46 KB | 32 KB |

Across all 67 SEO heroes, AVIF is 39% smaller at 1080w (2,448 KB down to 1,490 KB) and 40% smaller at 1536w (4,033 KB down to 2,438 KB). That is about 14 to 24 KB less per page view. The raw numbers are in `seo-run/images-work/avif-all.csv`.

---

## 3. Findings

### F1. `/pricing` has no og:image and no twitter:image (Medium, both)

**Evidence:**
- Live and local `/pricing` output `og:title`, `og:description`, `og:url` and `twitter:card=summary_large_image`, but no `og:image` and no `twitter:image`.
- Every other public page does output `og:image=https://linkar.in/opengraph-image?c9789a0b7a757f8a`. I checked all 12 live sitemap URLs.
- Cause: `app/pricing/page.tsx:16-17` sets its own `openGraph` and `twitter` objects. Next merges metadata shallowly: "metadata with nested fields such as openGraph ... are overwritten by the last segment to define them" (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1346-1350`).
- The homepage keeps the image only because `app/opengraph-image.tsx` sits in the same segment as `app/page.tsx`.

**Impact:** a shared pricing link on WhatsApp, LinkedIn, X or Facebook shows no image, or a small fallback. Pricing is the second most important commercial page.

**Recommendation:** add `app/pricing/opengraph-image.tsx`. It can be a code-drawn plan card built with `ImageResponse` at 1200x630 PNG, reading the real plan names and prices from `BILLING_PLANS`, with no invented numbers. The one-line fallback is to reuse the root image:

```ts
openGraph: { ...OPEN_GRAPH_DEFAULTS, url: "/pricing", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/opengraph-image"] },
```

`https://linkar.in/opengraph-image` returns 200 image/png, 124,646 B. Add a test, as `app/seo.test.ts` does for other pages, so that any page setting `openGraph` must also set `images`.

### F2. Homepage portraits name people next to quotes, which reads as testimonials (Medium, both)

**Evidence:**
- `src/components/marketing/proof-rail.tsx:6-25` renders:
  - "Aanya Mehta, Beauty creator, Bengaluru" with the quote "One thoughtful reply turns a passing comment into a real conversation.";
  - "Arjun Nair, Growth marketer, Mumbai", also with a quote.
- Each has a portrait (`/marketing/linkar-creator-aanya.webp`, `/marketing/linkar-creator-arjun.webp`) and alt text that names the person ("Aanya Mehta at a Bengaluru cafe").
- Both are live (in the live home HTML).
- The same first names are reused as fixtures in `app/dev-preview/admin/fixtures.ts:62` and `app/dev-preview/workspace/_preview/fixtures.ts:656`. That suggests these are personas, not customers. I could not verify either way, and nothing on the page links to a real profile.

**Impact:** if these are not real, consenting users, this breaks the project rule against invented testimonials and customer names. It is also a trust and E-E-A-T risk, because named alt text and quotes present them as real people.

**Recommendation:**
- If they are real users, confirm in writing that they consent to their name and photo being used.
- If not:
  - remove the names and quotes, or label the cards clearly as illustrative examples;
  - change the alt text to describe the scene without a name, for example "A beauty creator at a cafe in Bengaluru".

### F3. Hero loading priority does not match where the hero sits (Medium, local; homepage part on both)

**Evidence:**
- None of the 67 SEO heroes, and not the home hero, has `fetchpriority`. Each uses `preload`, which emits `<link rel="preload" as="image" imageSrcSet=... imageSizes=...>` with no fetchpriority. Seen in the local HTML for all 67 pages (`seo-img-rows.json`) and in the live home HTML.
- Next 16 docs: preload is for the LCP image only, it should not be combined with `fetchPriority`, and "In most cases, you should use `loading="eager"` or `fetchPriority="high"` instead of `preload`" (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md:265-293`).
- Measured positions by hero variant:
  - **fullbleed (22 pages):** the photo fills the viewport (1484x937 at 1440x900), so it is the likely LCP element. It is only preloaded (`src/components/marketing/seo/sections/hero/fullbleed.tsx:19`).
  - **centered (20 pages):** the photo's top edge is at y=736 on 1440x900 and y=801 on 375x812. It is mostly or entirely below the fold, yet preloaded (`centered.tsx:30`), so it competes with CSS and fonts.
  - **split (22) and hub (3):** above the fold on desktop (top at y=132 to 145) and at y=778 on mobile.
- On live mobile, PSI recorded the home hero request at priority "Low" (network-requests audit). It still finished at 634 ms, because the live home LCP is a text node (see F15).
- `src/components/marketing/hero-section.tsx:16` still uses `priority`, which is deprecated in Next 16 ("the priority property has been deprecated in favor of the preload property", image.md:291-293).

**Recommendation:**
- fullbleed: `fetchPriority="high"`, without `preload`.
- centered: drop `preload` and keep `loading="eager"`.
- split and hub: keep `preload` or switch to `fetchPriority="high"`.
- home: change `priority` to `preload` or `fetchPriority="high"`.
- After deploying, check LCP and the LCP element on live with PSI for one page of each variant. The brief says to measure performance on live only, so I took no local performance numbers.

### F4. The live homepage hero has an empty alt (Low, live)

**Evidence:**
- Live HTML: `<img alt="" ... src="/_next/image?url=%2Fmarketing%2Flinkar-hero-indian-relaxed.webp...">`.
- The repo already has a descriptive alt, "A creator relaxing at his desk while Linkar answers his Instagram comments and DMs" (`src/components/marketing/hero-section.tsx:14`, added in commit f9b5d58, not deployed).
- The image's wrapper is still `aria-hidden="true"` (`hero-section.tsx:10`). Google reads the alt, but screen readers skip it, so the image is marked decorative and meaningful at the same time.

**Recommendation:**
- Deploy f9b5d58.
- Then choose one: if the photo is meant to carry meaning, which is better for Google Images, remove `aria-hidden` from `.imageFrame`. Otherwise go back to `alt=""`.

### F5. SEO-page social images are 3:2 WebP photos with no branding or page title, and lack `og:image:type` and `twitter:image:alt` (Low, local)

**Evidence:**
- `src/lib/seo-pages.ts:10-16` uses the hero WebP (1536x1024, 54 to 141 KB) as `og:image` and `twitter:image`.
- In the local HTML of all 67 pages:
  - `og:image:width=1536`, `og:image:height=1024`, and `og:image:alt` are present;
  - `og:image:type` is missing on 67 / 67;
  - `twitter:image:alt` is missing on 67 / 67, because `twitter.images` is passed as a bare URL string.
- Facebook recommends staying close to 1.91:1, at least 1200x630 ([Facebook: Images in Link Shares](https://developers.facebook.com/docs/sharing/webmasters/images)). A 3:2 image is cropped by about 11% at the top and bottom. I checked the contact sheet: the subjects stay in frame.
- WebP format support:
  - Google Search supports WebP for the preferred image ([Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)).
  - Meta and LinkedIn do not document which formats they accept.
  - A third-party test from December 2024 found that Facebook, LinkedIn, X, WhatsApp, Slack and iMessage all render WebP share images ([joost.blog](https://joost.blog/use-avif-webp-share-images/)).
- The previews look like stock photos: there is no Linkar mark and no page name in the image.

**Recommendation:**
- Add a per-route `opengraph-image.tsx` under `app/features/[slug]`, `app/solutions/[slug]` and `app/templates/[slug]`, and one for each hub. Each should render a 1200x630 PNG with `ImageResponse` that combines:
  - the existing hero photo (allowed), cropped on the right;
  - the page label;
  - the real Linkar mark (the path from `app/icon.svg`).
- Everything except the hero photo is drawn in code, with no AI generation.
- Smaller fix: pass `twitter.images` as `[{ url, alt }]` and add `type: "image/webp"` to the OG image object.

### F6. AVIF is not enabled (Low, both)

**Evidence:**
- `next.config.ts` has no `images` block, so Next uses its default `formats: ['image/webp']` (image.md:730-745).
- On live, every `/_next/image` response is `content-type: image/webp`, even with `Accept: image/avif`.
- Section 2 measured 39 to 40% savings with AVIF across the SEO heroes.

**Recommendation:** set `images: { formats: ['image/avif', 'image/webp'] }`. AVIF is slower to encode on a cache miss, so pair it with F7. The live home LCP is not image-bound (F15), but the 22 fullbleed SEO pages will be.

### F7. Optimized images are not cached at the Cloudflare edge, and the cache lifetime is the 4-hour default (Low, live)

**Evidence:**
- `curl` of `https://linkar.in/_next/image?url=%2Fmarketing%2Flinkar-hero-indian-relaxed.webp&w=750&q=75` returns:
  - `cache-control: public, max-age=14400, must-revalidate`;
  - `cf-cache-status: DYNAMIC`;
  - `x-nextjs-cache: HIT`.
- `/marketing/linkar-hero-indian-relaxed.webp` returns `cache-control: public, max-age=14400` and `cf-cache-status: MISS`.
- `/opengraph-image` returns `max-age=0, must-revalidate` and `cf-cache-status: DYNAMIC`. It responds in about 0.6 s, so that is acceptable.
- 14400 s is Next's default `minimumCacheTTL` (image.md:774-786).

**Recommendation:**
- Raise `images.minimumCacheTTL`, for example to 2678400 (31 days).
- Add a Cloudflare Cache Rule for `/_next/image*`. That is safe while the output is WebP only. If you enable AVIF, make sure the edge cache varies by `Accept`, or leave the edge out and rely on the origin cache.

### F8. No image sitemap entries and no `primaryImageOfPage` on SEO pages (Low, local)

**Evidence:**
- `app/sitemap.ts:24-42` outputs no `images`.
- The `WebPage` and `CollectionPage` JSON-LD in `src/lib/seo-pages.ts:33-39` and `:57-59` has no `image` or `primaryImageOfPage`.
- The `<img src>` that Google sees is a query-string URL (`/_next/image?url=...&w=3840&q=75`), while `og:image` points to the stable `/marketing/seo/<collection>/<slug>.webp`.
- Google: image sitemaps help discovery, and a preferred image can be set with `primaryImageOfPage` or `og:image` ([Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)).
- Search Console image search shows 0 impressions in the last 90 days (`gsc_query.py --type image --days 90`).

**Recommendation:**
- Add `images: [`${origin}${seoHeroAsset(page).src}`]` to the 67 SEO sitemap entries.
- Add `primaryImageOfPage: { "@type": "ImageObject", url, width: 1536, height: 1024, caption: alt }` to `seoStructuredData` and `seoCollectionStructuredData`.

### F9. Hero alt text is accurate but rarely names the topic; hub file names are generic (Low, local)

**Evidence:**
- All 67 alts are present, unique and 44 to 71 characters long, and they describe the photo.
- Only 10 / 67 mention the page's channel or feature (Facebook, Reel, Story). Example: `/features/instagram-comment-to-dm` has "A tutorial creator checking a requested message after filming a video". The full list is in `seo-run/seo-img-rows.json`.
- The three hub files are named `index.webp` (`marketing/seo/features/index.webp` and the others), from `src/lib/seo-hero-assets.ts:14`.

**Recommendation:**
- Where the photo shows someone on a phone, name the channel naturally and accurately, for example "A tutorial creator checking an Instagram message after filming a video". No stuffing.
- Rename the hub files descriptively, for example `instagram-automation-features.webp`, `instagram-automation-solutions.webp` and `instagram-automation-templates.webp`.

### F10. The default OG card is text-heavy, uses a placeholder "L" tile instead of the real mark, and has an outdated tagline (Low, both)

**Evidence:**
- `app/opengraph-image.tsx:26-41` draws a magenta square with the letter "L". The real mark is the glyph in `app/icon.svg` and `app/icon.png`.
- The headline is "Instagram and Facebook automation, made clear.", but the home title now leads with "Instagram DM automation & comment auto-reply" (`app/page.tsx:10`).
- The same card is used by the homepage and the 10 legal and help pages.
- Google advises against preferred images that are "dominated by text" or generic logos ([Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)).

**Recommendation:** redraw the card in code with:
- the real mark path;
- the keyword headline;
- a small code-drawn comment-to-DM UI.

Keep it 1200x630 PNG.

### F11. Hero source resolution limits sharpness on high-density screens, and three srcset widths return the same file (Info, both)

**Evidence:**
- Every hero master is 1536px wide. Next never enlarges an image (`withoutEnlargement: true`, `image-optimizer.js:905-908`).
- On live, w=1920, 2048 and 3840 all return the same 1536px file of 87,488 B.
- At DPR 2:
  - the centered hero (1180 CSS px, `centered.tsx:30`) and the fullbleed hero (about 1484 CSS px, sizes `100vw`) display at roughly 52 to 65% of device resolution;
  - on phones, the split and hub cards (4:4.2, object-fit cover) request 750w for a slot that needs about 1090w, because below 900px `PORTRAIT_CARD_SIZES` says `100vw` (`shared.tsx:27`).
- The desktop `sizes` values are correct. The comment at `shared.tsx:21-26` explains the 1.9x cover factor.

**Recommendation:** this is optional and a trade-off between sharpness and weight:
- export 2048px masters only for fullbleed and centered heroes;
- consider `(max-width: 899px) 160vw` for the portrait cards;
- or leave it as is for page weight.

### F12. No IPTC or XMP metadata in any image file (Low, local)

**Evidence:**
- `webpinfo -summary` on the WebPs shows only a VP8 chunk: no EXIF, XMP or ICCP. A `strings` scan found no C2PA or XMP in any of the 71 files.
- `src/content/seo/hero-scenes.json` stores a "scene" brief for each hero. One entry (`solutions/content-creators`, line 25) says "Use the existing original Linkar photograph", which implies the other 66 are not original photographs. I could not confirm how they were made.
- Google reads IPTC Creator, Credit Line, Copyright Notice and Digital Source Type, including `trainedAlgorithmicMedia` ([Google image metadata](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata)).
- The skill rates this low impact: it affects display only, not ranking.

**Recommendation:**
- Run `brew install exiftool` (it is not installed now).
- Write XMP Creator "Linkar", Credit "Linkar" and Rights "Copyright 2026 Linkar" into the WebPs. WebP has no native IPTC, so use XMP.
- Add the accurate Digital Source Type to any image that came from a generative model.

### F13. Favicon and app icons are complete (Info, both)

**Evidence:**
- Live returns 200 for:
  - `/favicon.ico`: 16, 32 and 48 px PNG frames, 2,059 B;
  - `/icon.svg`: switches black to white under `prefers-color-scheme: dark`;
  - `/icon.png`: 512x512 with an opaque white background;
  - `/apple-icon.png`: 180x180.
- All four are linked in `<head>` on every page.
- The 48 px frame meets Google's rule that a favicon be a multiple of 48 px. The opaque background stays visible on dark results pages.
- The Organization `logo` is `https://linkar.in/icon.png` (512 px, above Google's 112 px minimum).
- robots.txt allows all of these.
- There is no web app manifest: `app/manifest.ts` is absent and `/manifest.webmanifest` returns 404. Search does not need one.

**Recommendation:** none needed for SEO. Add a `manifest.ts` with 192 and 512 maskable icons only if you want Android home-screen installs.

### F14. Unused image asset and dead constant (Info, local)

**Evidence:**
- `public/marketing/linkar-hero-creator-studio.webp` (86 KB) is referenced only as metadata (`"existingSource"` in `hero-scenes.json:25`). Its content was re-exported as `marketing/seo/solutions/content-creators.webp`, a different hash.
- `SEO_HERO_IMAGE` (`src/content/seo/types.ts:25`) is exported but never imported.

**Recommendation:** delete both, or keep the WebP outside `public/` if it is a source master.

### F15. Images are not the cause of the live LCP (Info, live)

**Evidence (PSI, 15 Oct 2026):**
- Mobile:
  - LCP is 5.2 s, CLS 0.001, performance 77.
  - The LCP element is the text span "Create your first reply" (`.hero-section-module__..__buttonRollCopy`), with TTFB 36 ms and an element render delay of 1,058 ms.
  - The hero image (25.8 KB at 750w) loaded between 379 and 634 ms.
  - `image-delivery-insight` reports only 8 KiB of possible savings. `unsized-images`, `image-aspect-ratio`, `image-size-responsive` and `image-alt` all pass.
- Desktop: LCP 1.4 s.
- `/pricing` mobile: LCP 5.7 s on a text paragraph.

**Recommendation:** for live LCP, look at the staged hero entrance animation (`data-motion="staged"`), which belongs to the technical and performance audit. Image work will not move it.

### F16. Each SEO page has its own og:image (Info, local; positive)

**Evidence:**
- 67 / 67 pages output a distinct `og:image`, for example `https://linkar.in/marketing/seo/features/instagram-comment-to-dm.webp`.
- Each has `og:image:alt`, width and height, with 0 duplicate URLs and 0 duplicate file hashes (`md5` over all 71 WebPs).
- The contact sheet (`seo-run/images-work/contact-sheet.jpg`) confirms 67 visually distinct photos.
- They return 404 on live today because they are not deployed (`https://linkar.in/marketing/seo/features/index.webp` returns 404).

**Recommendation:** none. Keep `seoHeroAsset()` throwing when a scene is missing (`src/lib/seo-hero-assets.ts:12`), because it enforces uniqueness.

---

## 4. Image SERP analysis

- DataForSEO MCP is not installed, so the Google Images SERP analysis (`/seo images serp <keyword>`) was skipped.
- Search Console image search for `sc-domain:linkar.in` shows 0 clicks and 0 impressions over the last 90 days (17 Jul to 12 Oct 2026).

---

## 5. Recommendations, in order

1. Give `/pricing` an og:image and twitter:image (F1). Add a test that any page setting `openGraph` also sets `images`.
2. Resolve the named portrait cards (F2): verify consent, or remove the names and quotes.
3. Match loading priority to where each hero sits (F3): `fetchPriority="high"` on fullbleed heroes, no preload on centered heroes, and replace the deprecated `priority` on the home hero.
4. Deploy the home hero alt fix and make the `aria-hidden` choice consistent (F4).
5. Enable AVIF and raise `minimumCacheTTL`, then add an edge cache rule (F6, F7). Estimated 14 to 24 KB less per SEO page view.
6. Add hero images to the sitemap entries and `primaryImageOfPage` to the SEO JSON-LD (F8).
7. Generate branded 1200x630 social cards per SEO page and a refreshed default card, built in code from the hero photo, the page label and the real mark (F5, F10).
8. Polish: add the topic to the alt text where accurate, rename the hub files, add XMP credits, and remove the unused asset (F9, F12, F14).

---

## Method and sources

- Live HTML: `curl` with a Googlebot user agent for the 12 live sitemap URLs.
- Local HTML: `curl http://localhost:3000` for the same 12 URLs plus the 67 SEO URLs from the local sitemap.
- Parsing scripts:
  - `seo-run/img_audit.py`
  - `seo-run/seo_img_table.py`
  - `seo-run/psi_full.py`
  - `seo-run/psi_images.py`
- Rendered sizes: Browser pane, with JS `getBoundingClientRect` and `currentSrc` at 1440x900, 1024x768 and 375x812.
- File analysis: `sips`, `webpinfo`, `md5`, and ImageMagick 7 (WebP and AVIF re-encodes in the scratchpad only).
- Next.js 16.3.8 docs, read from the installed copy:
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
  - `.../04-functions/generate-metadata.md`
- External sources:
  - [Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)
  - [Google image metadata (IPTC)](https://developers.google.com/search/docs/appearance/structured-data/image-license-metadata)
  - [Facebook: Images in Link Shares](https://developers.facebook.com/docs/sharing/webmasters/images)
  - [joost.blog WebP and AVIF share image test, Dec 2024](https://joost.blog/use-avif-webp-share-images/)
