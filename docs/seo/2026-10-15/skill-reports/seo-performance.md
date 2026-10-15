# seo-performance: Linkar, 15 October 2026 (re-run after G1 to G6)

**Performance score: 60 / 100 (LIVE, lab data).** LOCAL cannot be measured fairly (dev server). It is judged from the code and the production build output in `.next/server/app` (BUILD_ID `HbEbR0nqWZYtibRdg6hgu`, built 13:07, after every G6 file changed; no source file under `app/`, `src/` or `next.config.ts` is newer than the build).

| Metric (LIVE, PSI lab, Lighthouse 13.5, Chrome 153) | Home mobile | Pricing mobile | Home desktop | Pricing desktop | Status |
|---|---|---|---|---|---|
| LCP, this run (3 distinct runs each) | 2.70, 2.70, 3.38 s | 5.65, 5.96, 5.72 s | 1.81, 1.43, 0.56 s | 1.43, 1.60, 1.58 s | Home mobile needs improvement; **pricing mobile poor** |
| LCP, every distinct run today (all skills) | 8 runs: 2.70 to 5.15 s, two modes (2.7 s and 3.4 to 5.2 s) | 7 runs: 5.61 to 5.97 s | 5 runs: 0.56 to 1.81 s | 4 runs: 1.43 to 1.60 s | |
| Performance score | 94, 94, 63 | 77, 66, 76 | 69, 85, 99 | 96, 88, 90 | |
| TBT (lab proxy for INP) | 74, 117, 1,405 ms | 134, 428, 168 ms | 479, 259, 34 ms | 13, 200, 166 ms | High variance (PSI host benchmarkIndex 377 to 1,097) |
| CLS | 0.001 to 0.003 | 0.000 | 0.002 to 0.003 | 0.000 | **Good** |
| INP (field) | No data | No data | No data | No data | CrUX 404 for the origin and both URLs |

Core Web Vitals pass/fail cannot be assessed: CrUX has no field data (`crux.json`: "No CrUX data for this origin" and "for this URL"). Google ranks on the 75th percentile of field data, so every number above is lab-only diagnosis. INP is the interactivity metric; there is no field INP yet.

## Method

- `pagespeed_check.py` (Linkar env, `run_pagespeed` and `query_crux`) on `https://linkar.in/` and `https://linkar.in/pricing`, mobile and desktop, 3 rounds, rounds 75 s apart. A wrapper (`perf2/psi_rounds.py`) also kept the raw Lighthouse JSON and refused cached results by checking `fetchTime`.
- **The earlier run's "three runs" were PSI cache duplicates.** In `perf/raw/`, desktop runs 1 to 3 and mobile runs 2 and 3 share one `fetchTime` each (for example all three `home-desktop-*.json` are `06:03:36.199Z`). This run has 12 distinct `fetchTime` values (07:47:12Z to 07:50:48Z).
- All other PSI JSON files in the run folder (seo-page, seo-images, tech2, perf) were pooled by distinct `fetchTime` to get 13 home and 11 pricing runs for the LCP-element analysis.
- LOCAL: compared `.next/server/app/index.html` and `pricing.html` with the live HTML; parsed the linked stylesheets in `.next/static/chunks` and on live; read the G6 diffs (`git diff HEAD`).
- Raw data: `scratchpad/seo-run/perf2/runs/*.raw.json`, `*.summary.json`, `crux.json`, `progress.log`; HTML copies in `perf2/html/`; scripts `analyze.py`, `css_unused.py`, `head_audit.py`, `anim_audit.py`.

## Key finding: why lab LCP swings, and what decides it

Chrome reports a text element as an LCP candidate when it is painted. Lighthouse's simulation (Lantern) then makes LCP depend on everything that ran before the **observed** LCP. When the winning element paints after the page's JavaScript has run, simulated LCP jumps to roughly TTI (about 5 to 6 s on mobile). When it paints at first paint, simulated LCP is about 2.7 s.

- **Pricing, 11 of 11 runs:** the LCP element is in the intro. Mobile (7 runs): the intro `<p>`, painted 952 to 1,033 ms after FCP; that is the `<p>`'s 180 ms delay plus 780 ms `pricingRise` animation (960 ms). Desktop (4 runs): the `<h1>`, painted 848 to 893 ms after FCP; that is the h1's 60 ms delay plus 780 ms (840 ms). Simulated LCP equals TTI in every one of these runs (for example 5,647 / 5,649 ms).
- **Home mobile, 8 runs:** in 4 runs the LCP (the CTA label copy, `span.buttonRollCopy`) painted at FCP and LCP was 2.70 s. In the other 4 it painted 609 to 1,688 ms after FCP and LCP was 3.38, 3.45, 5.10 and 5.15 s. The hero H1 lines and lede were never the LCP on live because they start at `opacity: 0`.
- **Home desktop:** 2 of 5 runs picked a chat bubble `<p>` in the hero scene, painted 694 to 1,703 ms after FCP.
- **The full-bleed hero photo was never the LCP element in 13 of 13 home runs**, although it is downloaded at High priority and painted (Chrome treats an image that covers the viewport as background).

## G6: what the local changes will do

Verified in the prerendered build (`.next/server/app/index.html`):

| G6 change | Verified in build output | Expected lab effect after deploy |
|---|---|---|
| Root `loading.tsx` moved to `app/(app)/` and `app/onboarding/` | `root-loading`, `id="S:0"` and `<template id="B:` are absent from build home and pricing (live home has all three). The dev server agrees for `/`, `/pricing` and `/features`. | Removes a fallback that can paint before the real page on a slow, chunked HTML stream. Small lab change, because PSI fetches the 31 KB document in one go. A real-user and crawler win. |
| Hero H1 lines, kicker and lede: transform only, no opacity | `hero-section.module.css:357-365` | The largest text is now visible at first paint, so the LCP should lock to FCP. **Home mobile should settle on the 2.7 s mode and lose the 3.4 to 5.2 s outcomes** (4 of 8 runs today). **Home desktop LCP should drop from 1.4 to 1.8 s to about 0.6 s**, the value of the one run today where LCP was at FCP. These are estimates; re-measure after deploy. |
| Delayed 700 ms CTA second-label roll-in removed | `data-roll-secondary="hover"` in `hero-section.tsx:42`; keyframes removed | Removes one of the late-painting candidates behind the slow home runs. |
| `priority` to `preload` on the home hero | `<link rel="preload" as="image" imageSrcSet=...>` in the build head | No change: same behaviour as `priority`. See finding 7: the photo is never the LCP. |
| `aria-hidden` removed from the image frame | `hero-section.tsx:13` | Accessibility only. |
| `public.css` 84 KB to 54 KB | `0eohfsafw97l2.css` is 47,107 B (live equivalent `1cf1gohwss33y.css` 73,162 B) | About 26 KB raw (4.5 KB gzip) less, **but cancelled by finding 2**. |
| `images.formats` AVIF then WebP, `minimumCacheTTL` 31 days | `next.config.ts:15-23` | Smaller hero and portrait bytes for AVIF browsers (Next docs: about 20% smaller, about 50% slower first encode). Not on any LCP path for home or pricing. See finding 11. |

**What G6 does not change:** pricing (its intro animation is not in the G6 file set), the render-blocking CSS weight (it grew, finding 2), fonts, the infinite layout animation in the hero scene, and the Google tag. Expected after deploying as built (estimates): home mobile about 2.7 to 3.0 s, home desktop about 0.6 s, **pricing mobile still about 5.7 s**.

## Findings

### 1. HIGH: Pricing mobile LCP is 5.6 to 6.0 s in every run because the intro fades in from opacity 0 (both; open)

**Evidence**
- 7 of 7 distinct mobile runs today: LCP element `header.pricing-page-module__fI3PeG__intro > p`; LCP 5,614 to 5,965 ms, equal to TTI each time.
- Observed LCP minus FCP is 952 to 1,033 ms, matching `.intro > p` (180 ms delay plus 780 ms animation).
- Desktop: 4 of 4 runs pick `h1#pricing-title` at 848 to 893 ms after FCP (60 ms plus 780 ms).
- Code: [pricing-page.module.css:34-42](src/components/marketing/pricing-page.module.css) animates `.intro h1`, `.intro > p` and `.intro .periodRow` with `pricingRise`. Its keyframes at `:760-763` go `from { opacity: 0; transform: translateY(26px); }`, and the fill mode is `backwards`.
- This is the same pattern G6 removed from the home hero. `pricing-page.module.css` was not in G6.

**Fix** (transform-only intro, keeping `pricingRise` for the below-the-fold finder stats at `:1229`):

```css
/* pricing-page.module.css */
.intro h1,
.intro > p,
.intro .periodRow {
  animation: pricingIntroRise 780ms cubic-bezier(.22, .61, .21, 1) backwards;
}

/* The intro holds the page's largest text. It settles with transform only and is
   at full opacity from the first frame, so it paints with the page. */
@keyframes pricingIntroRise {
  from { transform: translateY(26px); }
  to { transform: translateY(0); }
}
```

The reduced-motion rule at `:2001-2015` already sets `animation: none` on these selectors.

Secondary, same page: `Reveal` ([reveal.tsx:33-58](src/components/marketing/reveal.tsx)) sets `data-enhanced` on hydration, and [primitives.module.css:17-21](src/components/marketing/primitives.module.css) then hides every element that has not intersected yet (opacity 0, translateY 56px). On desktop that briefly re-hides plan cards that were already painted. Mark elements already in the viewport visible in the same effect:

```tsx
// reveal.tsx, inside useEffect, before observing
const rect = element.getBoundingClientRect();
if (rect.top < window.innerHeight && rect.bottom > 0) {
  element.dataset.visible = "true"; // already on screen: never hide it
}
element.dataset.enhanced = "true";
```

**Expected impact:** pricing mobile LCP should fall to the FCP-tied mode, about 2 to 2.7 s simulated. This is an estimate to be confirmed by PSI after deploy.

### 2. HIGH: The local build ships 43 to 66% more render-blocking CSS on home and pricing, because the catalogue's section CSS is merged into shared chunks (local; open)

**Evidence** (`perf2/css_unused.py`, which compares the linked stylesheets with the CSS modules actually used in each page's HTML):

| Page | LIVE blocking CSS | LOCAL build blocking CSS | Rules for modules the page never renders |
|---|---|---|---|
| Home | 263,291 B raw / 42.7 KB gzip (4 files) | 381,414 B / 61.0 KB gzip (4 files) | live 47 KB raw; build **188 KB raw, about 28.6 KB gzip** |
| Pricing | 189,977 B / 31.8 KB gzip (3 files) | 322,886 B / 52.8 KB gzip (4 files) | live 38 KB; build **194 KB raw, about 29.6 KB gzip** |

- Chunk `07j3zer7rxmou.css` (116,547 B) is linked from both home and pricing. Home uses only `primitives` (2,778 B) from it. The rest is catalogue section CSS: `photo` 32.6 KB, `phone` 15.1 KB, `post-art` 11.8 KB, `thread` 8.3 KB, `zigzag` 6.7 KB, `flow`, `columns`, `compare`, `centered`, `dark`, `plans`, `checklist`, `channels`, `banner`.
- Chunk `35s0awjkvzu4i.css` (112,817 B) carries `outcomes` 17.0 KB, `panel-outcome` 16.6 KB, `mock-ui` 14.8 KB, `iconlist` 9.8 KB, `seo-section` 7.7 KB, `sticky` 4.3 KB and `cards` 2.6 KB. Neither page renders any of these.
- On live today, Lighthouse's render-blocking insight already estimates 320 to 470 ms of savings on mobile for the CSS (`render-blocking-insight`, every mobile run). More blocking bytes push FCP and LCP later.
- Cause: `next.config.ts` has no `experimental.cssChunking`, so Turbopack uses the default (`true`), which "will try to merge CSS files whenever possible" (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cssChunking.md`). Home and pricing import nothing from `src/components/marketing/seo/`; the imports were checked.
- This cancels G6's `public.css` saving: about 26 KB removed against about 144 KB of catalogue CSS added to home.

**Fix** (Turbopack's graph mode, documented in the same file):

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // ...
  experimental: {
    // Default chunking merged the catalogue's section CSS into chunks that the
    // home and pricing pages also load. Graph mode with a lower request cost
    // keeps each route closer to the CSS it imports.
    cssChunking: { type: "graph", requestCost: 8000 },
  },
};
```

Verify with `pnpm build`, then run `python3 perf2/css_unused.py .next/static/chunks .next/server/app/index.html` (and the same for `pricing.html`). Target: no `photo`, `phone`, `outcomes`, `mock-ui` or other `seo/sections` module rules on either page, and blocking CSS back near live (about 43 KB gzip on home, about 32 KB on pricing) or lower. If graph mode is not enough, lower `requestCost` further, or raise `weightDistribution` toward 0.5 so small-CSS routes count for more.

### 3. INFO: G6 hero and loading changes are verified in the build, with the effects described above (local; already-fixed-locally)

See the G6 table. Evidence: build HTML has no `root-loading`, `S:0` or `B:` template. The keyframes `title-rise` and `text-rise` are transform-only (`hero-section.module.css:357-365`). `data-roll-secondary="hover"` is set (`hero-section.tsx:42`). This holds on LIVE only after deploy. Re-run PSI 3 times per URL after deploy, spacing runs at least 60 s apart so PSI does not return a cached result.

### 4. MEDIUM: The hero chat animation changes layout on every frame, forever, in the first screen. This is the main INP risk on home (both; open)

**Evidence**
- `anim_audit.py`: `message-slot-one`, `-typing`, `-two` and `-three` animate `grid-template-rows` with `infinite` ([hero-section.module.css:309-323](src/components/marketing/hero-section.module.css), keyframes `:400-470`).
- Lighthouse `non-composited-animations` flags these 4 elements ("Unsupported CSS Property: grid-template-rows") in every home run. Desktop also flags an `automation-story` `box-shadow` animation.
- "Style & Layout" main-thread time on home mobile: 410 ms (run 2), 1,633 ms (run 3, the largest bucket); desktop 712 ms (run 1). Pricing mobile, which has no such animation: 216 ms.
- `will-change: grid-template-rows, opacity, transform` (`:209`) keeps 4 layers promoted and does nothing for `grid-template-rows`.
- Every tap on the CTA or the header menu has to share frames with this layout work, on a page with 1,723 elements (live) and 1,916 (build).

**Fix:** contain the layout to the feed and stop the loop after about two cycles. CSS only; the final frame shows the full thread.

```css
/* hero-section.module.css */
.messageStack {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  block-size: 244px;          /* was min-block-size; a fixed size allows strict containment */
  contain: strict;            /* per-frame layout stays inside the ~20 feed nodes */
  animation: conversation-cycle var(--conversation-duration) linear 1.85 both;
}
.scene [data-message-stage="1"] { animation: message-slot-one var(--conversation-duration) cubic-bezier(.43, .195, .02, 1) 1.85 both; }
.scene [data-message-typing]    { animation: message-slot-typing var(--conversation-duration) cubic-bezier(.43, .195, .02, 1) 1.85 both; }
.scene [data-message-stage="2"] { animation: message-slot-two var(--conversation-duration) cubic-bezier(.43, .195, .02, 1) 1.85 both; }
.scene [data-message-stage="3"] { animation: message-slot-three var(--conversation-duration) cubic-bezier(.43, .195, .02, 1) 1.85 both; }
.messageSlot { will-change: auto; }
/* tablet: block-size: 228px; phone: block-size: 248px (replace the two min-block-size rules at :514 and :575) */
```

Why 1.85: it stops at 85% of the second cycle. At that point the stack is fully opaque (`conversation-cycle` holds opacity 1 up to 87%), messages 1 to 3 are shown (46.9% to 94.9%), and the typing row is collapsed (27.3% to 100%). With `both`, that frame is held.

Check visually that three messages fit in 244 / 228 / 248 px at every breakpoint, because strict containment clips overflow. A later option is a transform-only rewrite, with fixed slot heights and a translated stack, which removes the layout work entirely.

Also, below the fold: `unreadPulse` (box-shadow) and `pendingBreathe` (border-color) run infinitely in `automation-story.module.css:1198,1205` and `surface-runway.module.css:500`. They repaint every frame. Finding 6 removes their cost while off screen.

### 5. MEDIUM: Fonts. "₹" pulls in two extra latin-ext font files, and a 42 KB mono font loads for two small labels (both; open)

**Evidence**
- `app/layout.tsx:13-18` loads Bricolage Grotesque and Manrope with `subsets: ["latin"]`. The ₹ sign (U+20B9) is only in the latin-ext files (unicode-range `U+20AD-20C4`, from `35s0awjkvzu4i.css`).
- Pricing (live, every run) therefore fetches `26daee0352f50a5f` (Bricolage latin-ext, 20,441 B) and `6ab0db14f70d8ed6` (Manrope latin-ext, 16,943 B). They are found late, after CSS and layout, and fetched at **VeryHigh** priority (observed 1,018 to 1,106 ms), then the price text re-lays out.
- The LOCAL home now shows ₹ 7 times, including the first-screen line "Free to start. Paid plans from ₹199 a month." (`hero-section.tsx:48`); live home shows none. After deploy, home will also fetch Manrope latin-ext.
- Home (live, every run) fetches JetBrains Mono latin `70bc3e132a0a741e` (42,183 B, VeryHigh, observed 872 to 895 ms, inside the LCP window). The only mono text on home is two `.linkSlug` labels at 0.64rem in the insights section, below the fold ([insights-showcase.module.css:183-189](src/components/marketing/insights-showcase.module.css)). The layout comment says mono is never above the fold, which is why it is not preloaded, but it still downloads during the first render.

**Fix A** (recommended): self-host one "latin plus ₹" file per family with `next/font/local`. One preloaded file, no late request. Both fonts are SIL OFL, which allows subsetting.

```sh
pyftsubset Manrope-VariableFont_wght.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+20B9,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --output-file=app/fonts/manrope-latin-inr.woff2
# same for BricolageGrotesque[opsz,wdth,wght].ttf -> app/fonts/bricolage-latin-inr.woff2
```

```ts
// app/layout.tsx
import localFont from "next/font/local";
const display = localFont({ src: "./fonts/bricolage-latin-inr.woff2", weight: "200 800", display: "swap", variable: "--font-display" });
const sans = localFont({ src: "./fonts/manrope-latin-inr.woff2", weight: "200 800", display: "swap", variable: "--font-sans" });
```

**Fix B** (one line, costs bytes everywhere): `subsets: ["latin", "latin-ext"]` on Manrope. This preloads about 17 KB more on every page, including legal pages that never show ₹.

**Mono on home:**

```css
/* insights-showcase.module.css */
.linkSlug { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
```

This removes the 42 KB download from home. The catalogue sections that use `--font-mono` (`banner`, `channels`, `compare` and others) can keep JetBrains Mono.

### 6. MEDIUM: The build adds about 200 DOM nodes, and nothing skips rendering below the fold (local; open)

**Evidence**
- `dom-size-insight` on live: 1,723 elements on home and 721 on pricing.
- Build HTML: 1,916 elements on home (+199) and 862 on pricing (+145). The footer goes from 75 to 233 elements because of the 64-guide directory (`perf2/html`, parsed).
- Style recalculation and layout cost grow with DOM size times CSS rules, and the CSS also grew (finding 2).

**Fix:** let the browser skip rendering off-screen blocks until they approach the viewport. Accessibility and find-in-page still see the content.

```css
/* marketing-footer.module.css */
.footer { content-visibility: auto; contain-intrinsic-size: auto 1100px; }

/* faq-section.module.css, setup-steps.module.css, workflow-gallery.module.css,
   insights-showcase.module.css: on each section root */
.section { content-visibility: auto; contain-intrinsic-size: auto 900px; }
```

Use each block's real rendered height for `contain-intrinsic-size`. Check hash jumps (`marketing-hash-scroll.tsx`), because offsets are estimated until a block has rendered once. Leave `automation-story` (it uses `position: sticky`, `:42` and `:168`) for a second pass with visual checks.

### 7. LOW: The home hero photo is preloaded but is never the LCP element; it competes with the render-blocking CSS (both; open)

**Evidence**
- 13 of 13 home runs chose a text node.
- The photo is requested at the same moment as the CSS, at **High** priority (`network-requests`: 738 to 1,373 ms, 26,947 B at w=750 on mobile; 88,667 B at w=1920 on desktop).
- Next 16 docs (`02-components/image.md`, `preload`): "In most cases, you should use `loading="eager"` or `fetchPriority="high"` instead of `preload`."
- This refines audit item M17 ("Home: preload") with measured evidence.

**Fix** (`hero-section.tsx:14-21`):

```tsx
<Image className={styles.image} src="/marketing/linkar-hero-indian-relaxed.webp"
  alt="A creator relaxing at his desk while Linkar answers his Instagram comments and DMs"
  fill loading="eager" sizes="100vw" />
```

The `<img>` is early in the HTML, so the preload scanner still finds it at once. CSS and the H1 font get the bandwidth first. The catalogue fullbleed heroes are different: they may be shorter than the viewport and so can be LCP candidates. Measure them on live after deploy before changing G5's `fetchPriority="high"`.

### 8. LOW: The Google tag loads right after hydration and adds 87 to 411 ms long tasks (both; open)

**Evidence**
- `gtag/js` is 180,125 B, 41% unused (`unused-javascript`).
- `long-tasks` from gtag in every mobile run: 87 to 99 ms (runs 1 and 2) and 308 to 411 ms (run 3), at about 4.7 to 6.0 s simulated.
- `bootup-time`: 192 to 735 ms.
- Loader: [site-analytics.tsx:144-148](src/components/site-analytics.tsx), `strategy="afterInteractive"`.

**Fix:** `strategy="lazyOnload"`. The Next docs say it loads "during browser idle time ... after all resources on the page have been fetched". The trade-off is that a visitor who leaves within the first second or two may send no page_view. Weigh that against measurement completeness at launch. The bootstrap and consent defaults in `GoogleTagBootstrap` are unaffected.

### 9. LOW: The pricing period toggle animates `filter: blur()` on every price (both; open)

**Evidence**
- `priceSwap` (`pricing-page.module.css:765-768`) animates `filter: blur(5px)`. It is applied at `:235`, `:466` and `:1542`, and remounts on each toggle (`<strong key={interval}>`, `pricing-interval.tsx`).
- Lighthouse flags 4 elements on pricing ("Filter-related property may move pixels") in every mobile run. It adds paint work to the toggle interaction (INP).

**Fix:** drop the blur and keep opacity and transform.

```css
@keyframes priceSwap {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 10. MEDIUM (owner): No field data. Collect real INP, LCP and CLS now, before CrUX eligibility (both; owner-action plus a small code change)

**Evidence**
- CrUX returns 404 for `https://linkar.in`, `https://linkar.in/` and `/pricing` (`perf2/runs/crux.json`).
- No `useReportWebVitals` exists in `app/` or `src/`.
- The Cloudflare Web Analytics beacon (`static.cloudflareinsights.com/beacon.min.js`, 10,575 B) already loads on every public page and is allowed by the CSP.

**Owner:** open Cloudflare Web Analytics for linkar.in and read its Core Web Vitals view (LCP, INP, CLS, with country breakdown) for Indian visitors. It is the only field source today, so keep the beacon for that reason.

**Code (optional):** send Web Vitals to GA4 from inside the consented analytics branch.

```tsx
// src/components/web-vitals-to-ga.tsx
"use client";
import { useReportWebVitals } from "next/web-vitals";

const report = (metric: { name: string; value: number; id: string; rating?: string }) => {
  if (!["LCP", "INP", "CLS"].includes(metric.name) || typeof window.gtag !== "function") return;
  window.gtag("event", metric.name, {
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    metric_id: metric.id,
    metric_rating: metric.rating,
    non_interaction: true,
  });
};

export function WebVitalsToGa() {
  useReportWebVitals(report);
  return null;
}
// site-analytics.tsx: render <WebVitalsToGa /> next to <SiteAnalyticsRoutes /> inside the `load` branch
```

### 11. INFO (owner): AVIF is on locally, but /_next/image is not cached at the edge (both; already-fixed-locally for the config, owner-action for the cache)

**Evidence**
- Live `/_next/image?...&w=750` returns `cache-control: public, max-age=14400, must-revalidate`, `vary: Accept`, `x-nextjs-cache: HIT` and `cf-cache-status: DYNAMIC` (2 of 2 requests). It serves WebP even when AVIF is accepted, as expected before deploy.
- The source file is 1536 x 1024 (138,046 B).

**Effect of G6:** AVIF browsers get smaller files, and the browser cache lifetime becomes 31 days. The first request for each width and format after a deploy pays the slower AVIF encode in the origin container.

**Owner:**
- After each deploy, warm the hero widths: request each `srcset` URL with `Accept: image/avif,image/webp`.
- Before adding any Cloudflare cache rule for `/_next/image` (audit L5), confirm that your plan can put the Accept header in the cache key. Cloudflare does not honour `Vary: Accept` by default, so a plain rule could serve AVIF to a browser that cannot show it.

### 12. INFO (owner): From an India-located machine, requests land at a Marseille colo with about 0.4 s TTFB; PSI's 4 to 37 ms does not reflect that (live; owner-action)

**Evidence** (one vantage point only, so treat it as a lead, not a measurement of all Indian users):
- `https://linkar.in/cdn-cgi/trace` reports `loc=IN`, `colo=MRS`, `http=http/2`.
- 5 samples each: TCP connect 0.115 to 0.129 s. TTFB is 0.37 to 0.41 s even for edge-only `/cdn-cgi/trace`, 0.44 to 0.48 s for `/` and 0.42 to 0.46 s for `/pricing`.
- HTML is prerendered (`x-nextjs-prerender: 1`, `cache-control: s-maxage=31536000`) but `cf-cache-status: DYNAMIC`.
- PSI's `server-response-time` was 4 to 37 ms, from Google's lab location.

**Owner:** check Cloudflare analytics for which colos serve Indian traffic. Edge-caching the marketing HTML would remove only the origin hop (about 60 to 80 ms here), not the client-to-colo distance. If attempted, the cache key must keep the `_rsc` query and bypass requests that carry the `RSC` header, so router data is never served as HTML.

### Already good (LIVE)

- CLS 0.000 to 0.003 on every run. Images are sized (`unsized-images` passes) and there is no layout-shift culprit (`cls-culprits-insight` score 1).
- Static assets are immutable for a year (`cache-control: public, max-age=31536000, immutable`), and the HTML is prerendered.
- Fonts use `font-display: swap` with metric-adjusted fallbacks.
- Accessibility 96 to 100, Best Practices 100, SEO 100 on all 12 runs. Home has `color-contrast` and, on desktop, `label-content-name-mismatch` flags; these belong to other skills.

## Prioritised plan

| # | Fix | Target | Effort | Expected effect (estimate until re-measured) |
|---|---|---|---|---|
| 1 | Transform-only pricing intro (finding 1) | Both | 10 min | Pricing mobile LCP from about 5.7 s to about 2 to 2.7 s |
| 2 | `cssChunking` graph mode, verify with build (finding 2) | Local | 30 min | Blocking CSS back from 61 to about 43 KB gzip (home) and from 53 to about 32 KB gzip (pricing) or lower; FCP and LCP earlier |
| 3 | Fonts: local "latin plus ₹" files, system mono for `.linkSlug` (finding 5) | Both | 1 h | 37 to 79 KB fewer bytes in the LCP window; no late font swap on prices |
| 4 | Contain and stop the hero chat loop (finding 4) | Both | 30 min plus visual check | Less per-frame layout; lower TBT and INP risk on home |
| 5 | `content-visibility` below the fold (finding 6) | Both | 1 h plus visual check | Less initial style and layout work; off-screen infinite animations skipped |
| 6 | Home hero `loading="eager"` instead of `preload` (finding 7) | Both | 5 min | 27 to 89 KB less contention with the CSS |
| 7 | Field data: Cloudflare CWV view and optional GA4 Web Vitals (finding 10) | Both | Owner, plus 30 min | Real INP for Indian users |
| 8 | GA `lazyOnload`, priceSwap without blur (findings 8 and 9) | Both | 15 min | Fewer long tasks; cheaper toggle |
| 9 | After deploy: PSI 3 runs per URL at least 60 s apart, on `/`, `/pricing`, `/features` and one fullbleed guide | Live | Owner | Confirms or corrects every estimate above |
