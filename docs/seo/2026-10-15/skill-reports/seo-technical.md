# Technical SEO audit: Linkar (seo-technical), 15 October 2026

**Targets.** Every finding names its target.

- **LIVE**: https://linkar.in, as deployed on 15 Oct 2026. Checked with curl as mobile Googlebot, Search Console URL Inspection (read-only), and two fresh PageSpeed Insights mobile runs.
- **LOCAL**: http://localhost:3000, the freshly restarted dev server, *after* work groups G1 to G6 (audit section 11). Also checked the production build already on disk in `.next/` (BUILD_ID dated 15 Oct 13:07), which is the HTML that `pnpm build` produced for 69 prerendered public pages.

**Method.** The 9 categories in `~/.claude/skills/seo-technical/SKILL.md`. I re-ran every check against the build as it is now, rather than reusing the earlier run's numbers. Known findings from `docs/seo/audit-2026-10-15.md` (sections 1 to 8 and 11) are only repeated where I add new evidence or a status change. Performance was measured on LIVE only, as the brief asks. For LOCAL, I analysed the production build's files statically, comparing bytes and markup, without timing anything.

**Read-only.** No repo edits, no submissions, no setting changes. No API key is printed.

---

## Technical Score

| Target | Score |
|---|---|
| LIVE (today) | **60 / 100** |
| LOCAL (as it would deploy, with Cloudflare unchanged) | **73 / 100** |

The audit's LIVE Technical score was 66. I score it lower because of one new piece of evidence. Google crawled `http://linkar.in/` today and picked the **HTTP** URL as its own canonical, ignoring the declared HTTPS canonical.

**Weights** (my choice; the skill gives none): Crawlability 15, Indexability 20, Security 10, URL Structure 10, Mobile 10, Core Web Vitals 15, Structured Data 5, JS Rendering 10, IndexNow 5.

### Category Breakdown

| Category | LIVE status | LIVE score | LOCAL status | LOCAL score |
|---|---|---|---|---|
| Crawlability | pass | 80 | pass | 90 |
| Indexability | fail | 35 | warn | 65 |
| Security | warn | 70 | warn | 70 |
| URL Structure | warn | 80 | pass | 85 |
| Mobile | pass | 90 | pass | 90 |
| Core Web Vitals | fail | 50 | warn | 55 |
| Structured Data | warn | 60 | pass | 85 |
| JS Rendering | warn | 60 | pass | 90 |
| IndexNow | fail | 10 | fail | 10 |

**Why each LOCAL score differs from LIVE:**

- **Crawlability:** 4 sitemaps with image entries, and every one of the 79 URLs sits 1 click from the homepage.
- **Indexability:** 79/79 self-canonicals and no stray noindex, but the HTTP duplicate is fixed at the edge, not in the build.
- **URL Structure:** the `/dashboard` footer link is gone.
- **Core Web Vitals:** the skeleton and hero opacity fixes help, but render-blocking CSS grew 43 to 66%, and the pricing LCP pattern is unchanged.
- **Structured Data:** the linked `#software` entity graph, plus pricing WebPage and BreadcrumbList.
- **JS Rendering:** the root Suspense skeleton is gone everywhere.

---

## Critical Issues (fix immediately)

### T1. The homepage is not indexed, and Google's HTTPS verdict is based on the page as it was before the SEO work (LIVE, owner-action)

This is the audit's C1. Here is the new evidence:

- **HTTPS homepage:** URL Inspection on `https://linkar.in/` reads "Crawled - currently not indexed". Last crawl was **2026-09-24 22:41 UTC**, and `user_canonical` is null. Source: `google-data/rerun/inspect-home.json`.
- **Why the canonical is null:**
  - The canonical tag, `robots.txt`, the sitemap and the page metadata were all added in commit `24e515c` on **2026-10-10** ("Gate Google Analytics behind consent and add SEO metadata, robots, and sitemap"). Check with `git log -S'canonical' -- app/layout.tsx app/page.tsx`.
  - So Google has never crawled the HTTPS homepage with its canonical or with the current metadata.
  - This also explains why the GSC batch shows `user_canonical: null` on every legal page crawled on 7 Oct (`tech/gsc-batch.json`).
- **`/pricing`:** both `https://linkar.in/pricing` and `http://linkar.in/pricing` are "URL is unknown to Google" (`tech2/live/inspect-*pricing.json`).
- **Sitemap:** Search Console shows `https://linkar.in/sitemap.xml` submitted 15 Oct 05:47 UTC, with 12 submitted and 0 indexed. The stale 2019 `https://www.linkar.in/sitemap.xml` entry is still listed with 6 warnings (`google-data/rerun/gsc-sitemaps.json`).

**Fix (owner):**

1. Fix T2 (the HTTPS redirect) first.
2. Deploy.
3. In URL Inspection, request indexing for `https://linkar.in/` and `https://linkar.in/pricing`.
4. Remove the 2019 `www` sitemap entry.
5. After the deploy, submit the four sitemap URLs.
6. Re-inspect after 7 to 14 days.

---

## High Priority (fix within 1 week)

### T2. HTTP is not redirected on any host, and Google now uses `http://linkar.in/` as the canonical (LIVE; LOCAL inherits it; owner-action)

This is the audit's M1, raised to High on new evidence.

- **Google picked the HTTP URL:**
  - URL Inspection on `http://linkar.in/` (run by me, `tech2/live/inspect-http___linkar.in_.json`) reads "Crawled - currently not indexed". Last crawl was **2026-10-15 07:37 UTC**.
  - **Google canonical: `http://linkar.in/`**. User canonical: `https://linkar.in/`. Match: **false**.
  - The referring URLs are legacy external links to the HTTP root: `http://www.rodrigoborges.info/blog/projetos`, `http://rodrigoborges.info/` and `http://rbmsoft.com.br/wstagf/protecaodafamilia/relatorio3.htm`.
  - So the only fresh Google crawl of the homepage went to the HTTP copy, and Google overrode the declared canonical.
- **What each URL returns (curl, 15 Oct):**
  - `http://linkar.in/`, `/pricing`, `/terms`, `/robots.txt`, `/sitemap.xml` and `/opengraph-image` all return **200**.
  - `http://app.linkar.in/login` and `http://admin.linkar.in/login` also return **200**, so the sign-in pages are served over plain HTTP on a first visit.
  - Only `http://www.linkar.in/` 301s, to `https://linkar.in/`.
  - The HTTP and HTTPS homepage bodies are byte-identical (`cmp` on `tech2/live/home.html` and `http-home.html`).
- **hstspreload.org** (`/api/v2/preloadable?domain=linkar.in`):
  - error `redirects.http.no_redirect`;
  - warning `redirects.http.useless_header`, because the HSTS header is sent over HTTP, where it has no effect;
  - status `unknown`, so the domain is not preloaded.
- **Fix (owner, Cloudflare):** turn on **SSL/TLS > Edge Certificates > Always Use HTTPS** for the zone, or add one Redirect Rule: `http://*` to `https://${host}${path}`, 301, keeping the query string.
  - Verify with `curl -I` on `http://linkar.in/`, `http://linkar.in/pricing`, `http://linkar.in/robots.txt`, `http://app.linkar.in/login` and `http://admin.linkar.in/login`. Each should return 301 to its `https://` twin in one hop.
  - Then request indexing for `https://linkar.in/` (T1).
- **A code fallback in `proxy.ts` is not enough on its own.** The matcher (`proxy.ts:109-146`) does not cover `/robots.txt`, `/sitemap.xml`, the nested sitemaps, `/llms.txt` or `/opengraph-image`. The edge setting covers every path on every host.
- **After the redirect works:** HSTS (`max-age=63072000; includeSubDomains; preload`) is already in place, so the domain becomes eligible for hstspreload.org. Submit only after confirming that every subdomain serves HTTPS.

---

## Medium Priority (fix within 1 month)

### T3. LOCAL production build regression: catalogue CSS now blocks rendering on the homepage and pricing (LOCAL, open)

The G6 change did shrink `app/public.css` from 84,178 to 54,217 bytes. But Turbopack's default CSS chunking now merges the SEO catalogue's section CSS modules into chunks that `/` and `/pricing` load as render-blocking stylesheets.

| Page | LIVE render-blocking CSS | LOCAL build render-blocking CSS | Change (gzip) |
|---|---|---|---|
| `/` | 263,292 B raw / 43,313 B gzip (4 files) | 381,415 B raw / 61,827 B gzip (4 files) | **+43%** |
| `/pricing` | 189,977 B raw / 32,154 B gzip | 322,886 B raw / 53,494 B gzip | **+66%** |
| `/features`, detail pages | n/a (404 on LIVE) | 416,135 B raw / 69,085 B gzip | n/a |

**Evidence:**

- `.next/server/app/index.html` and `pricing.html` both link `/_next/static/chunks/07j3zer7rxmou.css` (116,547 B). On LIVE, the equivalent chunk (`1qr4kz8g9vx05.css`) is 2,780 B.
- Grouped by CSS module, `07j3zer7rxmou.css` holds:

  | Module | Bytes |
  |---|---|
  | `photo` | 32,567 |
  | `phone` | 15,146 |
  | `post-art` | 11,776 |
  | `thread` | 8,347 |
  | `zigzag` | 6,655 |
  | `flow` | 6,274 |
  | `columns`, `compare`, `centered`, `dark`, `plans`, `checklist`, `channels` | the rest |

- Chunk `35s0awjkvzu4i.css` adds `outcomes` (17,001), `panel-outcome` (16,565), `mock-ui` (14,834), `iconlist` (9,765), `seo-section` (7,709) and others.
- `index.html` and `pricing.html` contain **no** class from `photo-`, `phone-`, `post-art-`, `thread-`, `zigzag-`, `flow-`, `outcomes-`, `panel-outcome-`, `mock-ui-`, `iconlist-`, `seo-section-`, `sticky-` or `cards-module`.
- LIVE PSI already flags "Reduce unused CSS": 25 KiB, about 300 ms on the homepage. Render-blocking CSS costs about 150 ms on home and 400 ms on pricing (`tech2/live/psi-*-mobile.json`).
- Cause, from the bundled Next 16 docs (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/cssChunking.md`): the default `true` mode "will try to merge CSS files whenever possible".

**Fix:**

1. In `next.config.ts`, try `experimental: { cssChunking: 'graph' }`. It is Turbopack only and splits CSS by a cost model. If needed, tune `requestCost` down from the default 20000.
2. Rebuild and compare each route's stylesheet bytes with the script used here: sum the `<link rel="stylesheet">` targets in `.next/server/app/<route>.html`.
3. Target: `/` and `/pricing` at or below the LIVE figures.
4. Add a CI budget, for example: fail if render-blocking CSS gzip for `/` is over 45 KB.

### T4. The `/pricing` LCP element fades in from opacity 0 (both, open)

**Evidence:**

- PSI mobile, 15 Oct, LIVE `/pricing`: performance 77, **LCP 5.7 s**, TBT 120 ms, CLS 0.
- The LCP element is `section.pricing-page-module__…__pricing header.intro > p` ("Start free, then add capacity…"), with an **element render delay of 1,873 ms** (`tech2/live/psi-pricing-mobile.json`, `lcp-breakdown-insight`).
- A sibling seo-google rerun at 13:21 also measured 5.7 s.
- **Code:**
  - `src/components/marketing/pricing-page.module.css:34-42`: `.intro h1`, `.intro > p` and `.intro .periodRow` animate with `pricingRise 780ms … backwards` and 60 to 300 ms delays.
  - `:760-763`: `@keyframes pricingRise { from { opacity: 0; transform: translateY(26px); } }`.
  - This is the pattern G6 removed from the homepage hero. The file is unchanged locally (`git diff --stat HEAD` is empty), so LOCAL ships the same LCP behaviour.

**Fix:** keep a transform-only settle for `.intro h1`, `.intro > p` and `.intro .periodRow`, the way `hero-section.module.css:352-366` now does. Re-run PSI on mobile for `/pricing` after deploy. The target is LCP of 2.5 s or less.

### T5. INP cannot be measured yet, and the lab signals show main-thread risk (both, open)

**No field data:** CrUX has none for the origin or the URLs (`google-data/rerun/crux-home.json`: "No CrUX data for this origin"). INP is therefore unknown. TBT stands in as a lab proxy only.

**Lab signals, LIVE:**

- **TBT swings widely between runs today:**
  - home: 1,400 ms (13:21 rerun) and 180 ms (my run);
  - pricing: 170 ms and 120 ms (earlier today, 670 ms).
- **Main-thread work on home:** 2.1 s, including Style & Layout 461 ms and Script Evaluation 597 ms.
- **5 long tasks.**
- **Page weight:**
  - first-party JS is 11 scripts, 649,815 B raw / 201,105 B gzip;
  - `gtag/js` is 179 KB, 73 KB of it unused, with 222 ms of bootup and two long tasks of about 100 ms at around 5 s.
- **DOM:** 1,727 elements on home.

**Code that adds continuous main-thread work:**

- **Hero animation:** `src/components/marketing/hero-section.module.css:196-210`. `.messageStack` runs `conversation-cycle … infinite`, and `.messageSlot` animates `grid-template-rows` (`will-change: grid-template-rows, opacity, transform`). A grid-track animation forces layout on every frame, so it competes with input handling for the whole visit. That is a likely contributor to the 461 ms of style and layout.
- **Analytics tag:** `src/components/site-analytics.tsx:144-147` loads gtag with `strategy="afterInteractive"`.

**Fix:**

1. Collect field INP now. Add `useReportWebVitals` from `next/web-vitals` (documented in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-report-web-vitals.md`) and send INP, LCP and CLS to GA4 as events. Do this only on analytics pages and only after consent, matching the existing gating.
2. Replace the `grid-template-rows` animation with `transform` or `opacity` on fixed-height slots.
3. Consider `strategy="lazyOnload"` for gtag. The trade-off is that very short visits may not be counted.
4. Pricing TBT profiling is still deferred (audit section 8).

### T6. The root Suspense skeleton still hides content on LIVE (LIVE open; LOCAL already-fixed-locally)

This is the audit's M2 rendering part. Here is the new verification.

**LIVE:**

| Page | `root-loading` | hidden `id="S:0"` | first `<h1>` |
|---|---|---|---|
| `https://linkar.in/` | byte 4,957 | byte 7,548 | byte 15,825 |
| `/pricing` | byte 3,337 | byte 5,928 | byte 12,725 |

- On both pages, one `$RC(` reveal script swaps the content in.
- Without JavaScript, crawlers that do not render see the H1 and body inside a `hidden` div. Googlebot renders, but the delay shows up as LCP render delay: 1,542 ms on home (LCP element: the aria-hidden ButtonRoll label copy) and 1,873 ms on pricing.

**LOCAL:**

- `app/loading.tsx` is gone; `app/(app)/loading.tsx` and `app/onboarding/loading.tsx` exist.
- `root-loading` appears on **0 of 79** dev pages, and `id="S:0"` on **0 of 79**.
- In the production build, **0 of 69** prerendered public HTML files contain `template id="B:` or `hidden id="S:`.
- The home hero text is transform-only (`hero-section.module.css:352-376`), and the CTA label copies have no opacity animation (`primitives.module.css:35-45`).

**Fix:** deploy. Then re-run PSI on home to confirm that the LCP render delay drops.

---

## Low Priority (backlog)

### T7. Cross-host redirects are 307, not permanent (both, open)

**Observed:**

- `https://app.linkar.in/pricing` 307 to `https://linkar.in/pricing`;
- `https://app.linkar.in/terms` 307;
- `https://admin.linkar.in/pricing` 307;
- the same in LOCAL with `Host: app.linkar.in`.

**Code:** `proxy.ts:57-62` calls `NextResponse.redirect(destination)`, whose default status is 307.

**Impact:** small, because the app and admin hosts send `Disallow: /`, so Googlebot does not follow these. But any external link to an app-host marketing URL passes through a temporary redirect.

**Fix:** pass `308` for marketing paths hit on the app or admin host. Keep the auth redirects, such as `/login` to `app.`, temporary.

### T8. No IndexNow (LIVE, owner-action)

This is the audit's L14, re-checked:

- no IndexNow key file;
- `git grep -i indexnow` finds nothing;
- `/.well-known/security.txt` returns 404 (unrelated, noted only).

Bing has already fetched `/sitemap.xml` (brief).

**Fix:** turn on **Cloudflare Crawler Hints**, which sends IndexNow notifications for the zone. Alternatively, host a key file and ping `api.indexnow.org` after each deploy with the changed URLs. This matters on deploy day, when 67 new URLs appear.

### T9. One sitemap `lastmod` for all 67 catalogue URLs, and it predates the latest content edits (LOCAL, open)

**Evidence:**

- `src/content/seo/types.ts:24` sets `SEO_CONTENT_UPDATED = "2026-10-13"`.
- All 67 catalogue entries in all four sitemaps carry `<lastmod>2026-10-13</lastmod>`, and the WebPage `dateModified` uses the same value.
- G5 changed the catalogue H1s, FAQ text and related intros on 15 Oct, and `fadd56b` is dated 14 Oct.
- The 12 core pages in `/sitemap.xml` have no `lastmod` at all (`app/sitemap.ts:28-32`).

**Fix:** set `SEO_CONTENT_UPDATED` to the deploy date when deploying, and add a `lastModified` to the core pages. Per-record dates stay deferred (audit M10).

### T10. Centered catalogue heroes still get a head image preload in production HTML (LOCAL, open)

**What G5 intended:** "Centered: no preload; use `loading="eager"`".

**What the production HTML shows:**

- All **20 centered pages**, for example `.next/server/app/features/instagram-automation-analytics.html`, still emit `<link rel="preload" as="image" imageSrcSet=… imageSizes="(min-width: 1260px) 1180px, 100vw"/>`.
- The **22 fullbleed pages** emit a preload with `fetchPriority="high"`, matching their `<img fetchPriority="high">`. That is the desired outcome.
- The **22 split pages** keep their explicit preload.

**Cause:** React's server renderer preloads any `<img>` that is not `loading="lazy"` and not `fetchPriority="low"` (`node_modules/next/dist/compiled/react-dom/cjs/react-dom-server.edge.production.js:2209-2250`).

**Fix:** measure first. If the centered hero sits below the fold on mobile and competes with CSS and fonts, use the default lazy loading or `fetchPriority="low"`. Otherwise accept the preload and correct the comment at `centered.tsx:13`.

### T11. robots.txt housekeeping (both, open)

- **`Host:` directive.** `Host: https://linkar.in` is emitted from `app/robots.ts:46`. Google and Bing ignore `Host`. It is harmless; remove it to keep the file standard.
- **App and admin hosts.** Both serve `User-Agent: * / Disallow: /`, which is correct. App pages also carry `<meta name="robots" content="noindex, nofollow">`, but Google cannot read that behind the Disallow.
  - That is acceptable here, because no public page links to app-host URLs directly: marketing links go to `linkar.in/login` and `/signup`, which are disallowed on the marketing host.
  - `https://app.linkar.in/sitemap.xml` returns the marketing sitemap. It is never fetched, because of the Disallow, so this is informational.

---

## Info and verified (no action, or already fixed locally)

**LOCAL crawlability and indexability, verified on the dev server just now (already-fixed-locally).** Crawl of all 79 sitemap URLs as mobile Googlebot, redirects not followed. Output: `tech2/local-crawl-now.json`.

**Status and head tags:**
- 79/79 return 200.
- 79/79 have exactly one `<title>`.
- 79/79 have a self-referencing canonical.
- 79/79 have one H1.
- 79/79 have `lang="en-IN"`.
- 79/79 have `viewport width=device-width, initial-scale=1`.

**Robots and noindex:**
- No `meta robots` and no `x-robots-tag` on any of the 79.
- The recipe download sends `x-robots-tag: noindex`, and robots does not block it.
- No sitemap URL is blocked by robots.txt (checked rule by rule).

**Sitemaps:**
- `/sitemap.xml`: 79 URLs and 67 `image:loc` entries.
- `/features/sitemap.xml`: 21 URLs.
- `/solutions/sitemap.xml`: 21 URLs.
- `/templates/sitemap.xml`: 25 URLs.
- All four return 200 `application/xml`, with no duplicates inside any sitemap and no `/recipe` URL.
- `robots.txt` lists all four sitemaps.
- The app and admin hosts (via the `Host:` header) return `Disallow: /`.

**Links:**
- Click depth: all 78 non-home URLs are 1 click from `/`, through the footer directory. No URL is unreachable.
- The `/dashboard` footer link is gone.
- The remaining links to disallowed paths are `/login` and `/signup` (the CTAs).

**JSON-LD:**
- 0 parse errors.
- Home: Organization, WebSite, SoftwareApplication (`#software`, with `UnitPriceSpecification` P1M) and FAQPage. FAQPage is Info only: it gives no Google rich result, but it has AI-citation value.
- Pricing: WebPage and BreadcrumbList.
- Hubs: CollectionPage with an ItemList, plus BreadcrumbList.
- Details: WebPage with `about` `#software` and `primaryImageOfPage`, plus BreadcrumbList.
- No HowTo and no `aggregateRating`.

**Analytics:** the CSP allows `googletagmanager.com` on 79/79 sitemap pages, and not on the recipe download or on an unknown slug.

**URL structure, both targets (pass):**
- Lowercase, hyphenated, at most 60 characters in the sitemaps. No content query parameters.
- A trailing slash 308s to the clean URL (LIVE `/pricing/`; LOCAL `/features/`, `/pricing/`, `/sitemap.xml/`).
- Uppercase variants and cross-collection slugs 404, and `?utm_source=` keeps the clean canonical.
- `www` 301s to the apex in one hop.
- Legacy Blogger paths, such as `/2018/12/chrome-browser-kaise-use-kare-janiye.html`, return 404.

**Security, both targets:**
- TLS certificate: Google Trust Services WE1, valid until 27 Nov 2026, covering `linkar.in` and `*.linkar.in`. HTTP/2 and h3 are offered.
- Headers on every page: CSP, HSTS (2 years, includeSubDomains, preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy, COOP.
- The production CSP has no `'unsafe-eval'` (checked in `.next/routes-manifest.json`).
- `script-src` keeps `'unsafe-inline'` by design (`src/lib/security/headers.ts:7`).
- No mixed content on LIVE or LOCAL pages. The dev-only `http://localhost:3000/opengraph-image` becomes `https://linkar.in/opengraph-image?…` in the build.

**Mobile, LOCAL (pass):** Browser pane at 375x812 on `/`, `/pricing`, `/features`, `/features/instagram-comment-to-dm` and `/templates/reel-shopping-link`.
- `scrollWidth` is 375 on every page, so there is no horizontal scroll.
- No interactive target under 24 px, apart from 1x1 visually hidden radio inputs on pricing and one inline prose link.
- The body font is 15 px. Text under 12 px appears only inside the code-drawn phone mockups.
- LIVE Lighthouse mobile scores: accessibility 96, SEO 100.

**AI crawlers (LIVE):**
- These user agents all get 200 with identical bytes: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, CCBot, Bytespider, YandexBot, DuckDuckBot and bingbot.
- robots.txt does not single any of them out.
- The `Python-urllib` user agent gets a Cloudflare 403, which is normal bot filtering and does not affect real crawlers.

**Caching and TTFB, LIVE:**
- Prerendered HTML is `x-nextjs-cache: HIT` with `cf-cache-status: DYNAMIC`. TTFB from this machine was 0.44 to 0.49 s, and PSI measured the root document at 10 ms or less.
- The legal pages are `force-dynamic` with `private, no-store` (`app/terms/page.tsx:9`, `app/contact/page.tsx:9`, `app/support/page.tsx:7`). That is fine at today's traffic.

**HTML weight in the LOCAL build:**
- `features.html` is 488,792 B raw but 44,980 B gzip; `templates.html` is 565,774 B raw but 48,380 B gzip.
- About 58% of the raw bytes is the inline React Server Components flight data.
- Compressed size is acceptable; no action.

---

## What changed since the earlier run of this skill

| Check | Earlier (11:3x) | Now |
|---|---|---|
| `http://linkar.in/` in Google | listed as a referring URL only | **crawled 07:37 UTC; Google canonical is the HTTP URL; declared canonical ignored** |
| Root skeleton, LOCAL | present on every route | 0/79 dev, 0/69 build |
| LOCAL sitemaps | 1 sitemap, no images | 4 sitemaps, 67 image entries |
| Render-blocking CSS, LOCAL build home | not measured | 61.8 KB gzip (+43% versus LIVE), new T3 |
| `/pricing` LCP cause | "pricing TBT" (deferred) | LCP element is an opacity-0 animated intro paragraph, new T4 |
| GTM CSP on catalogue | blocked | allowed on 79/79 |
| Footer `/dashboard` link, LOCAL | present | removed |

---

## Data not available

- **CrUX field data:** none for the origin or any URL, so INP, LCP and CLS have no 75th-percentile field values (T5).
- **Performance of LOCAL:** not timed, per the brief. T3 and T10 are static comparisons of build files.
- **Cloudflare dashboard settings:** I cannot see Always Use HTTPS, Crawler Hints or cache rules. Only their effects are observed.
- **Indexing API:** not used (not authorised, and limited to job postings).

## Evidence files

Everything is under `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/`.

**LIVE (`tech2/live/`):**
- `home.html`, `http-home.html`, `home.hdr`, `http-home.hdr`, `pricing.html`, `pricing.hdr`, `sitemap.xml`;
- `psi-home-mobile.json`, `psi-pricing-mobile.json`;
- `inspect-http___linkar.in_.json`, `inspect-https___linkar.in_pricing.json`, `inspect-http___linkar.in_pricing.json`, `inspect-https___app.linkar.in_signup.json`.

**LOCAL (`tech2/`):**
- `local-crawl-now.json` (79-URL crawl);
- `local/pages/*.html`;
- `local/_sitemap.xml.body`, `_features_sitemap.xml.body`, `_solutions_sitemap.xml.body`, `_templates_sitemap.xml.body`;
- `local/_templates_comment-guide-delivery_recipe.hdr`.

**Sibling rerun (`google-data/rerun/`):** `inspect-home.json`, `inspect-http-home.json`, `gsc-sitemaps.json`, `crux-home.json`, `psi-home.json`, `psi-pricing.json`.

**Scripts:** `tech2-scripts/crawl.py`, `tech2-scripts/psi_raw.py`. The API key is read from the config and never printed.
