# seo-page: single-page analysis (15 Oct 2026)

Skill: `~/.claude/skills/seo-page/SKILL.md` (v1.9.0), with `seo/references/quality-gates.md` and `cwv-thresholds.md`.
Goal from the brief: rank Linkar for "Instagram automation" searches, especially in India.

| # | Page | Target | Target query used for judging |
|---|------|--------|-------------------------------|
| 1 | https://linkar.in/ | LIVE | "Instagram automation" (head term), plus "Instagram DM automation" and "comment auto reply" |
| 2 | http://localhost:3000/features | LOCAL (not deployed, live returns 404) | "Instagram automation features" |
| 3 | http://localhost:3000/features/instagram-comment-to-dm | LOCAL (not deployed, live returns 404) | "Instagram comment to DM automation", "Instagram auto DM comments" |

How I got the evidence:
- I fetched raw HTML with curl and parsed it with `seo/scripts/parse_html.py` plus a BeautifulSoup script of my own. That script handles headings in document order, links with anchor text, images, JSON-LD, scripts, words, prose readability and paragraph overlap between sibling pages.
- I ran PageSpeed Insights v5 twice for the live homepage on mobile. The first run used `pagespeed_check.py`. The second pulled the full Lighthouse JSON to get the LCP element and its breakdown.
- I read the relevant repo files.
- For the live homepage I also fetched the local homepage, so I could show which fixes are already in the repo and not yet deployed.

Data limits:
- No search volumes are available (DataForSEO is not installed).
- There is no CrUX field data, because traffic is too low.
- Local HTML comes from `next dev`, so I judged local performance from code and markup only.

---

## Page score cards

### 1. LIVE homepage, https://linkar.in/

```
Overall Score: 58/100

On-Page SEO:     45/100  ████▌░░░░░
Content Quality: 55/100  █████▌░░░░
Technical:       60/100  ██████░░░░
Schema:          60/100  ██████░░░░
Images:          85/100  ████████▌░
```

### 2. LOCAL /features hub

```
Overall Score: 79/100

On-Page SEO:     78/100  ███████▊░░
Content Quality: 70/100  ███████░░░
Technical:       80/100  ████████░░
Schema:          85/100  ████████▌░
Images:          90/100  █████████░
```

### 3. LOCAL /features/instagram-comment-to-dm

```
Overall Score: 74/100

On-Page SEO:     70/100  ███████░░░
Content Quality: 62/100  ██████▏░░░
Technical:       80/100  ████████░░
Schema:          80/100  ████████░░
Images:          90/100  █████████░
```

**How the category score is built: 70/100.** It is the equal-weighted average of 58, 79 and 74. Each page's overall score weights On-Page at 30%, Content at 25%, Technical at 20%, Images at 15% and Schema at 10%.

---

## Element-by-element measurements

### Title and meta description

| Page | Title (chars) | Meta description (chars) | Verdict |
|------|---------------|--------------------------|---------|
| LIVE home | `Linkar · Instagram and Facebook automation` (42) | `Build Instagram conversation flows and Facebook Page public comment replies with clear rules, useful responses, and human handoffs.` (131) | Weak. The brand comes first and the exact phrase "Instagram automation" never appears. The description is under 150 chars, with no call to action and no price. |
| LOCAL home (for comparison) | `Instagram DM automation & comment auto-reply · Linkar` (53) | 160 chars, includes "Free to start, from ₹199 a month" | Good. It is in the repo (commit f9b5d58) but not on live. |
| LOCAL /features | `Instagram & Facebook Automation Features · Linkar` (49) | 153 | Good |
| LOCAL comment-to-DM | `Instagram comment to DM automation · Linkar` (43) | 146, ends "Start free." | Good. The keyword comes first. There is room for "auto DM" wording. |

### Headings

| Page | H1 | Keyword in H1? | H2 and H3 notes |
|------|----|----------------|-----------------|
| LIVE home | "Reply to every opportunity. Even when you are away." | No | 14 H2s, all generic ("Made for creators, marketers & brands.", "Every reply, accounted for."). There are 4 duplicate H3s (persona names repeated by the marquee). |
| LOCAL home | The kicker "Instagram comment and DM automation", inside the H1, then the two display lines | Yes | The H2s carry keywords ("Instagram automation for creators…", "Questions about Instagram DM automation"). |
| LOCAL /features | "Make every next reply a useful one." | No. The eyebrow "Instagram and Facebook automation features" is a separate `<p>` (`hub.tsx:43`). | 10 H2s, one per topic. 20 H3s carry exact feature names. Good. |
| LOCAL comment-to-DM | "A comment starts it. Your reply keeps it going." | No. The label shows only as the breadcrumb pill `<span aria-current="page">` above the H1. | 10 H2s. None contains "comment to DM". The hierarchy is valid with no skipped levels. |

### Content

| Page | Visible words (whole body) | Paragraph prose (paras of 10+ words) | Flesch Reading Ease / FK grade | Gate (quality-gates.md) |
|------|---------------------|---------------------------|-------------------|--------------------------|
| LIVE home | 2,254 | 422 | 68 / 7.1 | Homepage needs 500+. It falls short: most words are mock-UI labels. |
| LOCAL /features | 2,314 | 733 | 51 / 9.1 | Category page needs 400+. Passes. Readability is "fairly difficult". |
| LOCAL comment-to-DM | 1,750 | 705 | 59 / 7.8 | Feature page needs 800+ unique. Fails: about 450 of the 1,323 paragraph words (counted with duplicates removed) are shared word for word with sibling pages. |

Keyword use on comment-to-DM (main content, aria-hidden copies removed):

| Phrase | Count |
|--------|-------|
| "instagram comment to dm" | 2 |
| "comment to dm" | 3 |
| "private reply" | 10 |
| "auto dm" | 0 |
| "auto reply" | 0 |
| "instagram automation" | 1 |

The phrase counts are natural, but searcher wording ("auto DM", "auto reply to comments") never appears.

### Technical meta

| Element | LIVE home | LOCAL /features | LOCAL comment-to-DM |
|---------|-----------|-----------------|---------------------|
| Canonical | `https://linkar.in` | `https://linkar.in/features` | `https://linkar.in/features/instagram-comment-to-dm` |
| Meta robots | none (index, follow) | none | none |
| OG tags | complete. The image is a 1200x630 PNG from `/opengraph-image` (200, 125 KB). | complete. The image is a 1536x1024 WebP, with no `og:image:type`. | same as /features |
| Twitter card | complete, with `twitter:image:alt` | `twitter:image:alt` missing | `twitter:image:alt` missing |
| Hreflang | n/a (one language). `<html lang="en">` while og:locale is `en_IN` and schema says `en-IN`. | same | same |
| Sitemap | live sitemap has 12 URLs, home included | in local sitemap (79 URLs), lastmod 2026-10-13 | in local sitemap |
| HTTP to HTTPS | **`http://linkar.in/` returns `200 OK`, with no redirect** | n/a | n/a |

### Internal links

| Page | Internal links (unique) | External | Notes |
|------|------------------------|----------|-------|
| LIVE home | 33 (22) | 0 | Links go to anchors, /pricing, /signup, /login, legal pages and /dashboard (307 to app.linkar.in, disallowed by robots). There are no deep content links, because the feature pages are not deployed. |
| LOCAL home | 101 (87) | 0 | All 64 SEO pages are linked, but only from the header "Product" link and the footer directory. The body has no contextual links to feature pages. |
| LOCAL /features | 137 (97) | 0 | Links reach all 20 feature guides with exact-name anchors. Card anchors pick up decorative mock labels ("GUIDE Comments Instagram comment to DM automation"). |
| LOCAL comment-to-DM | 128 (94) | 0 | Good: breadcrumb, 3 related pages, prev/next with `rel`, and the contextual "Learn more about Instagram automation features". |

Every CTA built with `ButtonRoll` carries the label three times ("Create your first reply Create your first reply Create your first reply"). On the comment-to-DM page that is 36 occurrences.

### Schema (JSON-LD)

| Page | Types found | Notes |
|------|-------------|-------|
| LIVE home | Organization (`#organization`), SoftwareApplication (4 INR offers) | The offers match the live /pricing page (Free 0, Creator 199, Growth 499, Agency 999). There is no WebSite node, no `@id` on SoftwareApplication, no `sameAs`, and no billing period on the offers. Without `aggregateRating` or `review` the page is not eligible for Software App rich results. |
| LOCAL home | Organization, WebSite (`#website`), SoftwareApplication, FAQPage (8 Qs) | FAQPage will not produce Google rich results, because they have been limited to government and health sites since Aug 2023. It still helps AI parsers. |
| LOCAL /features | CollectionPage + ItemList (20) + BreadcrumbList | Valid. The ItemList order (comment to DM, DM automation, keyword, Reel…) differs from the on-page order, which is grouped by topic (comment to DM, Reel, DM automation…). |
| LOCAL comment-to-DM | WebPage + BreadcrumbList | Valid. `about` is an anonymous inline SoftwareApplication, not a reference to the site entity. |

### Images

| Page | Images | Findings |
|------|--------|----------|
| LIVE home | Hero (fill, `alt=""` inside an `aria-hidden` frame) and 2 persona portraits shown twice | The hero sends 20.6 KB WebP at w=640, 44.6 KB at w=1080 and 87.5 KB at w=1920+. A preload link exists, but with no `fetchpriority`. The repo uses the `priority` prop, which Next 16 deprecates. Portraits have width and height plus `loading="lazy"`. AVIF is not served (I asked for `image/avif` and got `image/webp`). |
| LOCAL /features | 1 hero, alt "Two designers reviewing a workflow together in a creative studio" | Source is 92.7 KB WebP at 1536x1024 with a preload link. Fine. |
| LOCAL comment-to-DM | 1 hero, alt "A tutorial creator checking a requested message after filming a video" | Source is 80.9 KB WebP. Fine. Everything else is SVG UI drawn in code (106 SVGs). |

### Core Web Vitals (LIVE homepage only; lab data, no field data)

| Run (mobile) | Perf | FCP | LCP | TBT | CLS |
|--------------|------|-----|-----|-----|-----|
| Brief (earlier today) | 75 | n/a | 5.0 s | 200 ms | 0.002 |
| Run A (`pagespeed_check.py`) | 92 | 1.7 s | 2.9 s | 150 ms | 0.002 |
| Run B (full JSON) | 77 | 1.7 s | **5.1 s** | 210 ms | 0.001 |

Run B details:
- The LCP element is `span.buttonRollCopy` with the text "Create your first reply", the aria-hidden rolling label inside the hero CTA. It lives under `div.hero-section-module__yxuKna__actions > a.primaryAction`.
- LCP breakdown: TTFB 26 ms, then element render delay 1,133 ms (observed).
- Main-thread work is 2.0 s. Render-blocking CSS: 4 files, about 150 ms estimated savings.
- The DOM has 1,776 elements, above the ~1,500 the CWV reference flags as concerning.
- These are INP risk indicators only. INP needs field data, and there is none yet.

---

## Issues found

### Critical
None. No page is blocked from crawling or indexing. robots.txt allows `/`, there are no noindex tags, and canonicals are valid.

### High

**H1. LIVE: the deployed homepage is stale and does not target the query.**
- Evidence: the live title, H1, meta description and schema are listed in the tables above.
- `git status -sb` shows `main...origin/main [ahead 12]`.
- Commit `f9b5d58` ("Homepage SEO: keyword title and headings, real FAQ, structured data, llms.txt", 13 Oct) holds the improved title, H1 kicker, keyword H2s, WebSite and FAQPage, and a 160-char description. None of it is live.
- Search Console reports the homepage as "Crawled, currently not indexed" (brief), which makes how well the page matches the query matter even more.
- Fix: push and deploy `main`. Once it is live, the owner can inspect the homepage in Search Console and request a recrawl (not done in this read-only audit).
- Files: `app/page.tsx`, `src/components/marketing/hero-section.tsx`, `src/components/marketing/marketing-content.ts`.

**H2. BOTH: named persona quotes read as customer testimonials.**
- Evidence: the live homepage shows "Aanya Mehta, Beauty creator · Bengaluru" and "Arjun Nair, Growth marketer · Mumbai". Each has a portrait and a `<blockquote>` quote, such as "The right follow-up is already waiting when I open my inbox."
- The source is `src/components/marketing/proof-rail.tsx:6-25`, where the array is named `creatorExamples`. The local homepage still renders them (2 matches in `home-local.html`).
- The project rules forbid invented testimonials and customer names. If these are not real, consenting users, they are also a trust (E-E-A-T) liability on the page Google already declines to index.
- Fix: use real, attributed quotes with written consent, or remove the names, cities and quotation marks. In the second case, turn the cards into labelled use-case examples, for example "Beauty creator example: send the shade guide when someone comments SHADE".
- Files: `src/components/marketing/proof-rail.tsx`.

### Medium

**M1. LIVE: hero LCP is poor in lab runs (5.0 to 5.1 s in two of three runs).**
The PSI evidence is in the CWV table above. Two causes are in the code.

Cause 1: the root `app/loading.tsx` wraps the static homepage.
- The prerendered HTML (`x-nextjs-prerender: 1`) first paints `<main class="root-loading" aria-busy="true">` (from `src/components/skeleton.tsx:13`).
- The whole page sits in `<div hidden id="S:0">` and only shows once `$RC("B:0","S:0")` runs. That happens at byte 155,127 of 309,301.

Cause 2: staged entrance animations hold back the LCP candidates.
- `.titleLine` animates from `opacity: 0` (`hero-section.module.css:92`).
- `.actions` lifts in after a 240 ms delay (`:133`).
- The CTA's second label rolls in after a 700 ms delay (`:166-167`). That label is the measured LCP element.

Fix:
- Move `loading.tsx` from the root into the signed-in route groups that need it (`app/(app)/`, onboarding). The public static pages then render straight away; check that app navigation still shows its skeleton.
- Drop the opacity and delay entrance animations on the H1, the body copy and the CTA. Keep the transform-only image settle.
- Re-measure with PSI on mobile. Aim for LCP of 2.5 s or less at p75 once CrUX has data.

Files: `app/loading.tsx`, `src/components/skeleton.tsx`, `src/components/marketing/hero-section.module.css`, `src/components/marketing/button-roll.tsx`.

**M2. LIVE: the HTTP version of the homepage is served without a redirect.**
- Evidence: `curl -sS -I http://linkar.in/` returns `HTTP/1.1 200 OK`, and so does `/pricing`.
- The HSTS header is ignored over plain HTTP, so first-time visitors and crawlers can reach two copies. The https canonical softens this but does not fix it.
- Fix: turn on Cloudflare "Always Use HTTPS", or add a 301 rule from http to https.
- Files: none (Cloudflare setting).

**M3. LOCAL: the H1s on the hub and detail pages leave out the query.**
- Evidence: see the headings table.
- The homepage already solves this with a small kicker inside the H1 (`hero-section.tsx`, the `titleKicker` span).
- Fix: render `page.label` as a kicker `<span>` inside the H1 in `HeroTitle` (`src/components/marketing/seo/sections/hero/shared.tsx:66-80`). On hubs, move the `hubLabels` eyebrow inside the H1 (`hub.tsx:43-44`). Example: `<h1><span class="kicker">Instagram comment to DM automation</span> A comment starts it. Your reply keeps it going.</h1>`. The display lines and visual design stay the same.
- Files: `src/components/marketing/seo/sections/hero/shared.tsx`, `src/components/marketing/seo/sections/hero/hub.tsx`.

**M4. LOCAL: the comment-to-DM page is thin on unique content.**
- Evidence: 705 words of paragraph prose. About 450 words are shared word for word with the Reel and DM-automation pages: topic notes, channel cards, 3 of the 4 FAQ answers and the CTA. 41% of its 6-word shingles also appear on `/features/instagram-reel-comment-automation`.
- The platform-rules answer stays vague: "Further messages depend on the person's interaction and Meta's supported messaging window."
- Meta's own documentation is specific. A private reply must be sent within 7 days of the comment, and only one message can be sent. Follow-ups are allowed only after the person responds, within 24 hours (https://developers.facebook.com/docs/instagram-platform/private-replies/).
- Fix: add page-specific sections:
  - the rules above, in plain words (avoid the word "recipient");
  - how posts, Reels and Live differ (Live private replies only during the broadcast, per the same doc);
  - keyword-matching examples;
  - "comment to DM vs bio link";
  - 2 or 3 more FAQs unique to this page, such as "Does it work on older posts?" (the 7-day limit).
- Aim for 800+ unique words.
- Files: `src/content/seo/features.ts` (`instagram-comment-to-dm` entry), `src/content/seo/index.ts` (`topicGuides`), and the FAQ section component.

**M5. LOCAL: no page clearly owns the head term "Instagram automation".**
- Evidence: home is "Instagram DM automation & comment auto-reply", /features is "Instagram & Facebook Automation Features", and /solutions is "Instagram Automation for Creators & Businesses" (`src/content/seo/index.ts:39-63`).
- Neither the hub nor the home page has a short passage defining Instagram automation.
- Fix: choose one page for the head term. The homepage is the strongest candidate. Example title: `Instagram Automation for Comments, DMs & Stories · Linkar` (57 chars).
- Add a 40 to 60 word definition near the top of the page. Example (159 chars): "Instagram automation is a set of rules that answers comments, DMs and Story replies for you, using the words and links you choose, through Meta's official API."
- Keep /features on "features" intent.
- Check this against Search Console queries once the site is indexed. No volume data is available now.
- Files: `app/page.tsx`, `src/content/seo/index.ts`.

**M6. BOTH: the homepage body has no contextual links to the feature pages.**
- Evidence: the four surface cards ("Reply when someone comments", "Answer common messages", "Thank people for Story mentions", "Send links to followers") in `src/components/marketing/marketing-content.ts:64-89` render with no links (`surface-runway.tsx` has 0 `href`s).
- On local, the 64 pages are reachable only through the header and the footer directory.
- Fix: link each card to its feature page with descriptive anchor text:
  - /features/instagram-comment-to-dm
  - /features/instagram-dm-automation
  - /features/instagram-story-mention-replies
  - /features/instagram-follow-gate
- Add one "See all Instagram automation features" link to /features.
- Files: `src/components/marketing/surface-runway.tsx`, `src/components/marketing/marketing-content.ts`.

**M7. BOTH: the schema entities are not linked, and the offers lack billing periods.**
- Evidence: SoftwareApplication has no `@id` (`app/page.tsx:53-69`). SEO pages declare a separate anonymous `about` SoftwareApplication (`src/lib/seo-pages.ts:37`).
- Organization has no `sameAs`.
- Offers state `price` with no billing period.
- Google's Software App rich result requires `aggregateRating` or `review` (https://developers.google.com/search/docs/appearance/structured-data/software-app), and there are none.
- Fix:
  - add `@id: https://linkar.in/#software` and reference it from WebPage `about` and CollectionPage;
  - add `UnitPriceSpecification` with `billingDuration`;
  - add `sameAs` only for real official profiles;
  - add ratings only once genuine reviews exist.
- See the JSON-LD below.
- Files: `app/page.tsx`, `src/lib/seo-pages.ts`.

**M8. LOCAL: the SEO pages will not be measured in GA4.**
- Evidence: `ANALYTICS_PAGE_PATHS` (`src/lib/analytics-path.ts:48-64`) is an exact-path list without /features, /solutions, /templates or any detail page.
- The same list scopes the GA allowance in the CSP (`src/lib/security/headers.ts:121`).
- Organic landings on all 67 new pages will be invisible after deploy.
- Fix: add the three hubs and a pattern for `/<collection>/<slug>`. That means changing `isAnalyticsPage` and the CSP header sources together.
- Files: `src/lib/analytics-path.ts`, `src/lib/security/headers.ts`.

**M9. BOTH: operator identity is weak for E-E-A-T.**
- Evidence: there is no About page in `app/`. `LEGAL_ENTITY_COMPLETE = false`, and `proprietorName`, `address` and `city` are `__FILL_ME__` (`src/lib/legal-entity.ts:40-53`).
- Organization schema has no address and no founder. Neither feature page names an author, a reviewer or the team behind the product.
- Fix: fill in the legal entity and add a short About page (who runs Linkar, where in India, why it exists). Link it from the footer and add `address` and `founder` to Organization.
- Files: `src/lib/legal-entity.ts`, `app/page.tsx`.

### Low

**L1. LOCAL: the OG images on SEO pages are 3:2 WebP files with missing alt and type tags.**
- Evidence: `og:image` points to `/marketing/seo/features/*.webp` at 1536x1024, with no `og:image:type` and no `twitter:image:alt` (`src/lib/seo-pages.ts:10-16`).
- Large-image cards crop to about 1.91:1, and some platforms handle WebP unevenly. Verify in each platform's preview debugger.
- Fix: add `twitter:image:alt`. Consider per-collection 1200x630 PNG cards drawn in code with `opengraph-image.tsx`, as the homepage does.

**L2. BOTH: the CTA label appears three times in the DOM.**
- Evidence: `ButtonRoll` renders two `aria-hidden` copies plus one visually hidden copy (`src/components/marketing/button-roll.tsx`). That gives 36 "Create your first reply" strings on comment-to-DM, and anchor text like "Get started Get started Get started".
- Google indexes text inside aria-hidden elements, so this is noise.
- Fix: draw the decorative copies with CSS (`content: attr(data-label)`) so the label exists once.
- The same applies to the persona marquee duplicates (4 H3s for 2 names).

**L3. LOCAL: the hub ItemList order differs from the visible order.**
- Evidence: `src/lib/seo-pages.ts:61-63` maps `getSeoPages(collection)`, while the page groups cards by topic.
- Fix: emit the ItemList in the rendered order.

**L4. BOTH: there are no outbound citations.**
- Evidence: 0 external links on all three pages, while the copy makes compliance claims ("Official Instagram API", the Meta messaging window).
- Fix: link to the relevant Meta Instagram Platform docs from the comment-to-DM FAQ and the "Does Linkar use the official API?" answer.

**L5. LIVE: the hero image hint is deprecated and AVIF is off.**
- Evidence: `priority` at `src/components/marketing/hero-section.tsx:16`. Next 16 docs (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md:265-293`) deprecate it in favour of `preload`, and suggest `fetchPriority="high"` or `loading="eager"` in most cases.
- `/_next/image` returns WebP even when the request accepts AVIF.
- Fix: switch to `preload` or `fetchPriority="high"`. Consider `images.formats: ['image/avif','image/webp']` in `next.config.ts`.
- This is not the LCP element on mobile, so the expected impact is small.

**L6. BOTH: language and footer details.**
- `<html lang="en">` while og:locale is `en_IN` and schema says `en-IN`. Consider `lang="en-IN"` (`app/layout.tsx:41`).
- The public footer links to `/dashboard` (307 to app.linkar.in, disallowed by robots). Consider dropping it from public pages.

### Info

**I1. BOTH: wording of the trust claims.**
- Live says "Approved by Meta / App Review". Local says "Meta Verified / Business" (`src/components/marketing/trust-lockups.tsx:24`), and the local FAQ says "Linkar passed Meta App Review" (`marketing-content.ts:144`).
- "Meta Verified" is also the name of Meta's paid verification subscription. If the fact is business verification in Business Manager, "Business verified by Meta" is more literal.
- My last stored note (30 Sep) recorded App Review as "in progress". The code comment says the owner confirmed the claims are true on 13 Oct. Re-check the claim on the day you deploy.

**I2. LOCAL: FAQPage on the homepage gives no Google rich result.** Rich results have been limited to government and health sites since Aug 2023. Keep it for AI-citation value. No action needed. Do not add FAQPage elsewhere for Google.

---

## Recommendations, in order of expected impact

1. **Deploy `main`** (H1). It is the only change that improves the live page this week: title, H1, H2s, description, WebSite schema and 87 internal links.
2. **Fix the persona testimonials** (H2) before deploying. Trust signals matter most on a page Google is currently choosing not to index.
3. **Unblock LCP** (M1). Move the root loading skeleton off the public pages and remove the delayed entrance animations on the hero text and CTA. Expected result: lab LCP closer to the 1.7 s FCP.
4. **Add an http to https 301** (M2) at Cloudflare.
5. **Put the target phrase in every H1** (M3) and **choose one owner for "Instagram automation"** (M5).
6. **Deepen the comment-to-DM guide** (M4) with Meta's real rules and page-specific FAQs. Do the same for the other 19 feature pages over time.
7. **Link the homepage surface cards to their feature pages** (M6).
8. **Link the schema entities and add billing periods** (M7). Add the SEO pages to GA4 and the CSP (M8). Publish the operator identity and an About page (M9).
9. Low items as time allows.

### Proposed copy (follows the project rules: no em dashes, none of the banned words, no invented numbers)

- Homepage title, head-term option: `Instagram Automation for Comments, DMs & Stories · Linkar` (57 chars).
- Comment-to-DM meta description option: `Send an automatic DM when someone comments your keyword on an Instagram post or Reel. Deliver the promised link every time. Free plan, then ₹199 a month.` (150 chars).
- Comment-to-DM FAQ answer, rewritten with Meta's documented limits: "No. Instagram allows one private reply to each comment, sent within 7 days of the comment. You can send more messages only after the person replies, and only within 24 hours of their reply."

---

## Schema suggestions (ready to adapt)

Homepage: SoftwareApplication with a stable `@id` and monthly billing. Prices come from `src/lib/billing/catalog.ts`. GST-inclusive is stated on /pricing.

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://linkar.in/#software",
  "name": "Linkar",
  "url": "https://linkar.in",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "publisher": { "@id": "https://linkar.in/#organization" },
  "offers": [
    {
      "@type": "Offer",
      "name": "Free plan",
      "price": "0.00",
      "priceCurrency": "INR",
      "url": "https://linkar.in/pricing"
    },
    {
      "@type": "Offer",
      "name": "Creator plan",
      "price": "199.00",
      "priceCurrency": "INR",
      "url": "https://linkar.in/pricing",
      "priceSpecification": {
        "@type": "UnitPriceSpecification",
        "price": "199.00",
        "priceCurrency": "INR",
        "billingDuration": "P1M",
        "unitText": "MONTH",
        "valueAddedTaxIncluded": true
      }
    }
  ]
}
```

Repeat the same pattern for Growth (499.00) and Agency (999.00). Optionally add annual offers with `billingDuration: "P1Y"` (1990.00, 4990.00, 9990.00).

Do not add `aggregateRating` until real reviews exist. Add `sameAs` to Organization only with Linkar's real, official profile URLs. Once the legal entity is filled in, add `address` (PostalAddress, addressCountry `IN`) and `founder`.

Feature page: WebPage pointing at the site entities (replaces the inline `about` in `src/lib/seo-pages.ts:37`).

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://linkar.in/features/instagram-comment-to-dm#webpage",
  "url": "https://linkar.in/features/instagram-comment-to-dm",
  "name": "Instagram comment to DM automation",
  "description": "Turn Instagram comments into private replies with Linkar. Choose a keyword, send the promised link, and keep interested people moving. Start free.",
  "inLanguage": "en-IN",
  "dateModified": "2026-10-13",
  "isPartOf": { "@id": "https://linkar.in/#website" },
  "publisher": { "@id": "https://linkar.in/#organization" },
  "about": { "@id": "https://linkar.in/#software" },
  "primaryImageOfPage": {
    "@type": "ImageObject",
    "url": "https://linkar.in/marketing/seo/features/instagram-comment-to-dm.webp",
    "width": 1536,
    "height": 1024
  },
  "breadcrumb": { "@id": "https://linkar.in/features/instagram-comment-to-dm#breadcrumb" }
}
```

I have not recommended HowTo schema, or FAQPage for Google rich results.

---

## Repo files referenced

- `app/page.tsx`
- `app/layout.tsx`
- `app/loading.tsx`
- `src/components/skeleton.tsx`
- `src/components/marketing/hero-section.tsx`
- `src/components/marketing/hero-section.module.css`
- `src/components/marketing/button-roll.tsx`
- `src/components/marketing/proof-rail.tsx`
- `src/components/marketing/trust-lockups.tsx`
- `src/components/marketing/marketing-content.ts`
- `src/components/marketing/surface-runway.tsx`
- `src/components/marketing/seo/sections/hero/shared.tsx`
- `src/components/marketing/seo/sections/hero/hub.tsx`
- `src/lib/seo-pages.ts`
- `src/content/seo/features.ts`
- `src/content/seo/index.ts`
- `src/content/seo/types.ts`
- `src/lib/analytics-path.ts`
- `src/lib/security/headers.ts`
- `src/lib/legal-entity.ts`
- `src/lib/billing/catalog.ts`
- `next.config.ts`

Working data (HTML snapshots, PSI JSON): `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/seo-page/`.
