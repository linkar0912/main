# seo-google: Search Console, GA4, PageSpeed, CrUX and Bing

**Run:** 15 Oct 2026, 07:30 to 07:56 UTC (13:00 to 13:26 IST). This re-run replaces the earlier seo-google pass that collected data at about 06:00 UTC but never returned results. Everything was re-pulled. The older files were used only for comparison.
**Credential tier:** Tier 2 (API key, service account `claude-seo@linkar-507103.iam.gserviceaccount.com`, GA4 property 552805358). Search Console permission is `siteFullUser` on `sc-domain:linkar.in`.
**Not used:** the Indexing API. It is for JobPosting and BroadcastEvent pages only, and the account is not authorised for it anyway.
**Mode:** read-only throughout. No sitemap was submitted, no indexing was requested and no setting was changed in Search Console, GA4 or Bing. URL Inspection API calls only read data; they do not request a crawl.
**Raw data:** `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/google-data/rerun/` (listed at the end of this report).

**Data freshness**
- Search Console search analytics lags 2 to 3 days. Final data ends on 12 Oct. I also pulled the fresh (not yet final) data up to 15 Oct.
- URL Inspection shows Google's current stored record.
- GA4 reports run to today, with up to 1 day of processing lag. Realtime covers the last 30 minutes.
- CrUX is a 28-day rolling window. PageSpeed lab runs are point-in-time measurements.
- Bing figures are as returned by its API at 07:52 UTC.

---

## 1. Summary

**Google data health for LIVE: 27 / 100.**

Google has still indexed nothing. Since the audit this morning, the only new Google activity is one crawl, of the wrong URL:

- Googlebot fetched `http://linkar.in/` at 07:37 UTC today.
- It picked that **http** address as the canonical, even though the page declares `https://linkar.in/`.

So the HTTP duplicate is no longer a theoretical risk. It is splitting the one page Google is looking at. The fix is a one-switch Cloudflare redirect, and it should go live before or together with the deploy.

| Area | What the data says now | Change since the earlier run |
|---|---|---|
| Search Console performance | 0 clicks and 0 impressions over 28, 90 and 480 days. The fresh data to 15 Oct is also empty. | None |
| Indexing | `https://linkar.in/` is "Crawled - currently not indexed" (last crawl 24 Sep). `/pricing` is "URL is unknown to Google". | **New:** `http://linkar.in/` was crawled at 07:37 UTC today. Google canonical: `http://linkar.in/`. User canonical: `https://linkar.in/`. Match: false. |
| Sitemaps (Google) | `https://linkar.in/sitemap.xml` was submitted 05:47:30 UTC and downloaded 05:47:32 UTC: 12 submitted, 0 indexed. The 2019 `www` sitemap is still listed (last downloaded 10 Nov 2019, 6 warnings). | Download time confirmed |
| GA4 | 0 organic sessions over 28 and 90 days. Direct traffic only: 9 sessions over 28 days, 22 over 90, plus 2 unassigned. India has 8 of 9 sessions over 28 days. Realtime showed 4 mobile users in India on the live home and pricing pages. No key events are set up. | **New:** 15 sessions and 73 page views in the property come from `localhost` (4 and 5 Sep). The code does not send any conversion event. |
| PageSpeed (LIVE, lab) | Home mobile at 07:50 UTC: performance 63, LCP 3.4 s, TBT 1,400 ms, CLS 0.003. Pricing mobile: 76, LCP 5.7 s, TBT 170 ms. Desktop: home 99 (LCP 0.6 s), pricing 90 (LCP 1.6 s). | **New:** the Google Analytics tag (gtag.js) causes most of the blocking time in 10 of the 11 runs today that have raw traces. |
| CrUX | No field data for the origin, `/` or `/pricing`, and no history (CrUX returns 404 because traffic is too low). INP cannot be measured. | None |
| Bing | 0 inbound links. The sitemap was fetched at 06:14:18 UTC with status Success and 12 URLs. Crawl, traffic, query and page stats are empty. Bing has never discovered `/pricing`. | **New:** Bing first saw the homepage on 10 Dec 2018, under a previous owner. Its stored copy is 1,033 bytes, against 309,587 bytes today. URL submission quota is 100 a day and 1,700 a month. No geo-targeting is set. |
| LOCAL build (what Google will see after deploy) | 4 sitemaps (79, 21, 21 and 25 URLs, with image entries) and robots lists all four. The Google Analytics CSP now covers the hubs and guides. New titles and H1s are in place, `lang="en-IN"`, and the public pages no longer stream the root loading screen. | The G1, G2, G3, G5 and G6 changes are confirmed on the restarted dev server |

### How the 27 is made (LIVE only)

The skill defines no formula, so this one is weighted for a site whose first job is to get indexed.

| Part | Weight | Score | Why |
|---|---|---|---|
| Indexation | 35% | 5 | 0 of 12 sitemap URLs indexed. The homepage was crawled and not indexed. The HTTP duplicate is now canonicalised on its own. |
| Search performance | 20% | 0 | 0 impressions in 480 days |
| Measurement setup | 20% | 65 | Search Console domain property verified, sitemap submitted, GA4 collecting with consent mode, Bing verified with the sitemap fetched. **Missing:** GA4 key events, the GA4 to Search Console link (not checkable by API), and a hostname filter on GA4 data. |
| Lab performance | 15% | 65 | Desktop is good. Mobile LCP ranges from 2.7 to 5.7 s across runs, and `/pricing` is poor in every run. No field data. |
| Bing presence | 10% | 25 | Sitemap fetched. No links, no crawl stats, `/pricing` undiscovered. |
| **Total** | | **27** | |

The LOCAL build cannot be scored on Google data until it is deployed. It removes the on-page and analytics blockers. What still blocks indexing is the owner actions: deploy, the HTTPS redirect, the Search Console and Bing submissions, and links.

---

## 2. Search Console (`sc-domain:linkar.in`)

### Performance

| Window | Dates (final data) | Clicks | Impressions | CTR | Position | Rows |
|---|---|---|---|---|---|---|
| 28 days (query, page) | 2026-09-17 to 2026-10-12 | 0 | 0 | 0 | n/a | 0 |
| 90 days (query, page) | 2026-07-17 to 2026-10-12 | 0 | 0 | 0 | n/a | 0 |
| 90 days by date, page, country, device | same | 0 | 0 | 0 | n/a | 0 each |
| 480 days by date | 2025-06-22 to 2026-10-12 | 0 | 0 | 0 | n/a | 0 |
| Fresh data (`dataState: all`) by date, query, page | 2026-10-01 to 2026-10-15 | 0 | 0 | 0 | n/a | 0 each |
| 90 days for Discover, Google News, image, video and news | 2026-07-17 to 2026-10-15 | 0 | 0 | 0 | n/a | 0 each |

There are no quick wins and no query data. **Why:** you cannot get an impression without an indexed URL (section 2.3).

### Sitemaps

| Sitemap | Submitted | Last downloaded | Errors | Warnings | Submitted URLs | Indexed |
|---|---|---|---|---|---|---|
| `https://linkar.in/sitemap.xml` | 2026-10-15 05:47:30 UTC | 2026-10-15 05:47:32 UTC | 0 | 0 | 12 | 0 |
| `https://www.linkar.in/sitemap.xml` (previous owner) | 2019-09-25 | 2019-11-10 | 0 | 6 | 6 | 0 |

The live sitemap has the same 12 URLs as Bing's copy: home, pricing, support, contact and eight legal pages. The three collection sitemaps return 404 on LIVE, as expected, because they are not deployed.

### URL Inspection

| URL | Coverage | Last crawl | Fetch | Robots | Google canonical | User canonical | Referring URLs |
|---|---|---|---|---|---|---|---|
| `https://linkar.in/` | Crawled - currently not indexed | 2026-09-24 22:41 UTC (mobile) | Successful | Allowed | `https://linkar.in/` | none recorded (from the 24 Sep crawl) | `https://linkar.in/terms`, `http://linkar.in/` |
| `https://linkar.in/pricing` | URL is unknown to Google | never | n/a | n/a | n/a | n/a | none |
| `http://linkar.in/` | Crawled - currently not indexed | **2026-10-15 07:37:42 UTC** (mobile) | Successful | Allowed | **`http://linkar.in/`** | `https://linkar.in/` (**match: false**) | `http://www.rodrigoborges.info/blog/projetos`, `http://rodrigoborges.info/`, `http://rbmsoft.com.br/wstagf/protecaodafamilia/relatorio3.htm` |
| `https://www.linkar.in/` (extra) | Crawled - currently not indexed | 2026-09-24 22:41 UTC | Successful | Allowed | `https://www.linkar.in/` | none | `https://linkar.in/`, `http://www.linkar.in/` |
| `http://linkar.in/pricing` (extra) | URL is unknown to Google | never | n/a | n/a | n/a | n/a | none |

**What this means**

1. **The homepage record has not changed since 24 Sep.** The sitemap submitted at 05:47 has not yet led to a fresh crawl of `https://linkar.in/` or a first crawl of `/pricing`. That is normal for a few hours. Google gives no guarantee on recrawl timing.
2. **Google is consolidating on `http://`.** The page served at `http://linkar.in/` declares a canonical of `https://linkar.in/`. Google overrode it and chose the http URL as its own canonical.
   - Live check: `curl -sI http://linkar.in/` returns `HTTP/1.1 200 OK` with `cf-cache-status: DYNAMIC`. The same goes for `http://linkar.in/pricing`. `http://www.linkar.in/` 301s to `https://linkar.in/`.
   - A 200 answer with identical content is a weaker signal than a redirect, so Google now has two candidate clusters for one page.
   - Audit item M1 rated this Medium. With this record I rate it **High**.
3. **The only external referrers Google knows about are dead legacy pages.** All three referring URLs for `http://linkar.in/` failed to connect from here on 15 Oct (curl status 000). They are Brazilian sites from the domain's earlier life. They pass nothing useful and confirm the domain history noted in audit section 3.4.
4. **The `www` record is a leftover of the same 24 Sep crawl.** `www` now 301s to the apex. After deploy, a live test on `https://www.linkar.in/` should report a redirect. No action is needed beyond keeping the 301.

---

## 3. GA4 (property 552805358, stream G-CLMXQ4YFD1)

### Organic (the `ga4_report.py` organic, top-pages and country reports)

| Report | 28 days (2026-09-17 to 10-14) | 90 days (2026-07-17 to 10-14) |
|---|---|---|
| Organic Search sessions | 0 | 0 |
| Top organic landing pages | none | none |
| Organic sessions by country | none | none |

### All channels (raw Data API, same windows)

| | 28 days | 90 days |
|---|---|---|
| Channels | Direct: 9 sessions, 5 users, 13 views, 1 engaged | Direct 22 sessions; Unassigned 2 |
| Source / medium | (direct) / (none) | (direct) / (none) 22; (not set) 2 |
| Landing pages | `/` 6, `/pricing` 1, `/signup` 1, (not set) 1 | `/` 9, `/insights` 4, `/login` 3, `/pricing` 2, `/profile` 2 and others |
| Country | India 8, United States 1 | India 23, United States 1 |
| City | Pune 7, Bengaluru 1, US (not set) 1 | Pune 22, Bengaluru 1, US 1 |
| Device | desktop 6, mobile 3 | desktop 21, mobile 3 |
| Sessions by date and host | 13 Oct: linkar.in 4, app.linkar.in 1. 15 Oct: linkar.in 4 | 4 and 5 Sep: **localhost 15**. 13 Oct and 15 Oct as at left. |
| Events | page_view 13, session_start 9, first_visit 5, user_engagement 3 | page_view 86, session_start 22, user_engagement 20, first_visit 11, scroll 5 |
| Key events | none | **none** |

**Hostnames in 2026:** localhost 15 sessions and 73 views; linkar.in 8 and 12; app.linkar.in 1 and 1.

**What this means**

- **No organic search traffic at all, which matches Search Console.** Nearly all real traffic is direct visits from Pune, most likely the owner and team.
- **Test data pollutes the property.** The localhost rows outnumber linkar.in in the 90-day page report. They include signed-in app paths (`/insights`, `/settings`) and one unredacted row, `/data-deletion/status/SECRETCODE123`, an obvious test code.
  - These hits date from 4 and 5 Sep, right after GA4 was first added in commit `1648bb4` (4 Sep).
  - The current code already prevents this, and it is deployed (`e57d47b`, 13 Oct, is on `origin/main`):
    - the tag renders only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set at build time, which only production images do (`src/components/site-analytics.tsx:27-34`);
    - deletion status pages are outside `ANALYTICS_PAGE_PATHS` (`src/lib/analytics-path.ts:96-113`).
  - What is left is cleaning up the reports, not the code.
- **There is nothing to mark as a sign-up key event.** Audit section 7 step 7 says "mark sign-up as a key event". But the only event the site sends itself is `page_view` (`src/components/site-analytics-routes.tsx:57`). A grep for `sign_up` and `generate_lead` in `src/` and `app/` finds nothing outside tests. GA4 can only mark an event that exists.
- **Realtime (07:4x UTC):** 4 active users, all mobile and in India, on "Linkar · Instagram and Facebook automation" and "Pricing · Linkar". Those are the live page titles, so the tag is collecting on LIVE.
  - Each user fired `first_visit`. Several SEO tools were running PageSpeed on the live site in parallel at that time, and Lighthouse runs the GA tag.
  - So treat today's direct sessions as possibly including lab visits. This is plausible, not proven.

---

## 4. PageSpeed Insights and CrUX (LIVE only)

### CrUX field data

| Query | Result |
|---|---|
| CrUX API, origin `https://linkar.in` (all form factors) | 404: insufficient Chrome traffic |
| CrUX History, origin | 404: no history |
| CrUX History, `https://linkar.in/` | 404: no history |

Field LCP, INP and CLS are unavailable, so INP cannot be assessed at all yet. Lab TBT is the only responsiveness proxy. This will stay the case until the site reaches CrUX eligibility, which needs a sustained volume of real Chrome visits.

### Lab runs today (distinct runs only; PSI caches identical requests for a short time)

| URL | Strategy | Time (UTC) | Perf | LCP | TBT | CLS | Source |
|---|---|---|---|---|---|---|---|
| `/` | mobile | 06:03:36 | 92 | 2.7 s (Needs improvement) | 170 ms | 0.00x | earlier run, raw |
| `/` | mobile | 06:04:06 | 93 | 2.7 s (Needs improvement) | 130 ms | 0.00x | earlier run, raw |
| `/` | mobile | 06:11:44 | 77 | 5.2 s (Poor) | 180 ms | 0.00x | earlier run, raw |
| `/` | mobile | **07:50:48** | **63** | **3.4 s (Needs improvement)** | **1,400 ms** | 0.003 (Good) | this run |
| `/pricing` | mobile | 06:03:36 | 78 | 5.6 s (Poor) | 70 ms | 0 | earlier run, raw |
| `/pricing` | mobile | 06:04:05 | 78 | 5.6 s (Poor) | 90 ms | 0 | earlier run, raw |
| `/pricing` | mobile | 06:11:44 | 76 | 5.7 s (Poor) | 160 ms | 0 | earlier run, raw |
| `/pricing` | mobile | **07:50:46** | **76** | **5.7 s (Poor)** | 170 ms | 0 (Good) | this run |
| `/` | desktop | 06:03:36 | 87 | 1.6 s (Good) | 190 ms | 0.00x | earlier run, raw |
| `/` | desktop | 06:11:44 | 90 | 1.4 s (Good) | 180 ms | 0.00x | earlier run, raw |
| `/` | desktop | ~07:50 | **99** | 0.6 s (Good) | 30 ms | 0.001 | this run |
| `/pricing` | desktop | 06:03:36 | 93 | 1.5 s (Good) | 120 ms | 0 | earlier run, raw |
| `/pricing` | desktop | ~07:50 | 90 | 1.6 s (Good) | 170 ms | 0 | this run |

The other Lighthouse categories in this run:
- Home: accessibility 96 on mobile and 97 on desktop; best practices 100; SEO 100.
- Pricing: accessibility 100, best practices 100, SEO 100.

**What the 07:50 runs show**

- **Home mobile LCP element:** the `aria-hidden` ButtonRoll copy of the CTA, "Create your first reply" (`span.buttonRollCopy`).
  - TTFB 37 ms, then 2,294 ms of element render delay.
  - The server is fast. The delay comes from the page rendering late: the root loading boundary plus the CTA roll animation.
  - G6 changed both locally. It moved the loading boundary off public pages and removed the delayed roll-in. Re-measure after deploy.
  - The decorative copy being the LCP element also ties into the deferred ButtonRoll item (audit L12).
- **Pricing mobile LCP element:** the intro paragraph "Start free, then add capacity when the conversations arrive...". TTFB 11 ms, 1,963 ms of render delay.
  - It was 5.6 to 5.7 s in all four mobile runs today, so this is consistent, not noise.
  - The root loading skeleton is still on LIVE (the `root-loading` marker is present in the live HTML) and gone from the local production build (0 of 69 prerendered pages, audit section 11).
- **Home mobile blocking.** Main-thread work was 5.2 s and JavaScript execution 1.9 s. The largest long tasks:
  - the main chunk `1szz8o1olf8hb.js` (510 ms);
  - the document (415 ms);
  - **`gtag.js` twice (411 ms and 308 ms, at 5.6 s and 6.0 s, inside the time-to-interactive window).**
- **The GA tag dominates blocking time.** I summed each gtag.js long task's time over 50 ms and compared it with TBT in every run that has a raw trace (11 runs). This is an estimate, because the long-task list covers the whole trace.

  | Run | TBT | Of which gtag.js (approx.) |
  |---|---|---|
  | Home mobile 06:03 | 170 ms | ~156 ms |
  | Home mobile 06:11 | 180 ms | ~151 ms |
  | Home desktop 06:03 | 190 ms | ~172 ms |
  | Pricing mobile 06:03 | 70 ms | ~62 ms |
  | Pricing mobile 07:50 | 170 ms | ~132 ms |
  | Home mobile 07:50 | 1,400 ms | ~620 ms |

  In 10 of 11 runs gtag.js is the majority, and in the last one it is about 44%. The tag loads with `strategy="afterInteractive"` (`src/components/site-analytics.tsx:144-148`). TBT is not a Core Web Vital, but it is the lab stand-in for INP.

**The local production build is a little heavier.** The prerendered home page in `.next/server/app/index.html` is 339,103 bytes raw and 43,981 gzipped. Live is 309,587 and 37,455. That is about 17% more compressed, from the added FAQ answer, links and structured data. This is not a problem in itself, but keep it in mind when re-measuring.

---

## 5. Bing Webmaster Tools (`https://linkar.in/`)

| Call | Result |
|---|---|
| GetUserSites | `https://linkar.in/` verified (the verification codes are redacted in the saved file) |
| GetLinkCounts / GetLinks (`bing_webmaster.py counts` and `links`) | 0 pages with inbound links, 0 links |
| GetFeeds / GetFeedDetails | `https://linkar.in/sitemap.xml`, type Sitemap, **Status Success**, 12 URLs, 3,143 bytes, submitted and last crawled 2026-10-15 06:14:18 UTC |
| GetCrawlStats, GetRankAndTrafficStats, GetQueryStats, GetPageStats, GetCrawlIssues | all empty |
| GetUrlInfo `https://linkar.in/` | discovered 2018-12-10; last crawled 2026-10-06 07:24 UTC; DocumentSize 1,033; 1 anchor |
| GetUrlInfo `http://linkar.in/` | discovered 2013-07-27; last crawled 2026-08-12 13:05 UTC; DocumentSize 1,033 |
| GetUrlInfo `https://linkar.in/pricing` | never discovered (null dates) |
| GetCountryRegionSettings | none set |
| GetUrlSubmissionQuota | **100 URLs a day, 1,700 a month** |

**What this means**

- Bing has the live sitemap and fetched it cleanly, but it has not crawled anything new from it yet.
- Bing's homepage record goes back to the previous owner (2018). Its stored document size of 1,033 bytes does not match today's 309,587-byte page. So the stored copy is probably not the current Linkar homepage; it could be an older page or a redirect stub. That is plausible, not proven, because the API does not expose the stored content.
- No inbound links in Bing's index, which matches audit H7.
- The daily URL submission quota (100) covers all 79 URLs of the local sitemap in one day, but see the release-wave decision (audit H5) before using it.

---

## 6. LOCAL build re-check (dev server, freshly restarted)

These are the things Search Console and Bing will see after deploy, checked again now.

| Check | Result |
|---|---|
| Status codes | `/`, `/pricing`, `/features`, `/solutions`, `/templates` and `/features/instagram-comment-to-dm` all return 200 `text/html`. `/llms.txt` returns 200 `text/markdown`. All four sitemaps return 200 `application/xml`. The recipe returns 200 `text/markdown` with `x-robots-tag: noindex`. An unknown slug returns 404. |
| `/sitemap.xml` | 79 URLs, all on `https://linkar.in`, 67 `image:loc` entries, no `/recipe`, no duplicates. Lastmod `2026-10-13` on the 67 catalogue URLs only. **The 12 core URLs, including `/` and `/pricing`, have no lastmod**, only changefreq and priority. |
| Collection sitemaps | features 21, solutions 21, templates 25 (each hub plus its guides), each with images and lastmod `2026-10-13`. Together they are exactly the 67 catalogue URLs in `/sitemap.xml`. |
| `robots.txt` | 4 `Sitemap:` lines (main plus the 3 collections). Disallows unchanged. |
| CSP `script-src` | `https://www.googletagmanager.com` is present on `/`, `/pricing`, `/features` and `/features/instagram-comment-to-dm`, and absent on the recipe download and the 404. `connect-src` allows `*.google-analytics.com` and `*.analytics.google.com`. G3 is confirmed in the live dev headers, not just in unit tests. |
| Head metadata | Home: `Instagram Automation for Comments, DMs & Stories · Linkar`, canonical `https://linkar.in`, `lang="en-IN"`. JSON-LD has Organization `#organization`, WebSite `#website`, SoftwareApplication `#software` and FAQPage. Pricing: `Instagram automation pricing in India · Linkar`, with WebPage and BreadcrumbList. Hub and guide H1s now contain their labels. No robots meta anywhere. |
| Root loading screen | `root-loading` is absent from `/`, `/pricing`, `/features` and the guide on the dev server, and from the prerendered `index.html`. |

---

## 7. Findings

Severity follows the `seo` skill (Critical, High, Medium, Low, Info). **Target** is LIVE or LOCAL. **Status:**
- **open:** still needs a change in the repo or a decision;
- **already-fixed-locally:** fixed in the local build, waiting for deploy;
- **owner-action:** done in an account or by the owner.

| # | Severity | Target | Status | Finding | Evidence | What to do |
|---|---|---|---|---|---|---|
| F1 | Critical | LIVE | owner-action | **Nothing is indexed and there are 0 impressions** over 28, 90 and 480 days, including fresh data to 15 Oct. The homepage is still "Crawled - currently not indexed" from 24 Sep. `/pricing` is unknown. 0 of 12 sitemap URLs are indexed. This re-confirms audit C1 with data from 07:3x UTC. | `rerun/gsc-28-qp.json`, `gsc-90-qp.json`, `gsc-480-date.json`, `gsc-raw.json` (`sa_fresh_*`, `inspect_raw`, `sitemaps_raw`) | Deploy, add the HTTPS redirect (F2), then follow the Search Console runbook (section 8.2). Re-inspect after 7 to 14 days. |
| F2 | High | LIVE | owner-action | **Google picked `http://linkar.in/` as a canonical in its own right**, overriding the declared `https://linkar.in/`. Crawled 15 Oct 07:37 UTC, `googleCanonical: http://linkar.in/`, `userCanonical: https://linkar.in/`. `http://` still returns 200. This raises audit M1 from Medium with new evidence. | `rerun/inspect-http-home.json`, `gsc-raw.json`; `curl -sI http://linkar.in/` and `/pricing` return `HTTP/1.1 200 OK` | Cloudflare, SSL/TLS, Edge Certificates: turn on **Always Use HTTPS** (or a 301 rule that keeps path and query). Check with `curl -sI http://linkar.in/pricing`, which should give a 301 to https. Then run a live test on `http://linkar.in/` in URL Inspection and expect a redirect. Never request indexing for the http URL. |
| F3 | Medium | LIVE | owner-action | **A previous owner's 2019 `www` sitemap is still listed** in Search Console: last downloaded 10 Nov 2019, 6 warnings, 0 indexed. Re-confirms audit M15. | `rerun/gsc-raw.json` (`sitemaps_raw`) | Search Console, Sitemaps, open `https://www.linkar.in/sitemap.xml`, menu, Remove sitemap. |
| F4 | Medium | Both | owner-action | **Search Console knows only the 12-URL live sitemap.** The local build serves 4 sitemaps (79, 21, 21 and 25 URLs with image entries) and robots lists all four. They do nothing until they are deployed and submitted. The code side is done (G2). | `rerun/gsc-sitemaps.json`; `rerun/local-*sitemap.xml`; `curl localhost:3000/robots.txt` | After deploy: resubmit `/sitemap.xml` and add the three collection sitemaps (section 8.2). Follow the owner's release-wave decision (audit H5). |
| F5 | Medium | LIVE | owner-action | **Bing has fetched the sitemap but nothing else.** 0 links; crawl, traffic, query, page and issue stats are empty. `/pricing` was never discovered. The homepage record dates from 2018 with a 1,033-byte stored copy. No geo-target is set. The quota is 100 URLs a day. | `rerun/bing-raw.json`, `bing-extra.json`, `bing-counts.json`, `bing-links.json` | After deploy, follow the Bing runbook (section 8.3): submit the 3 collection sitemaps, resubmit the main one, run URL Inspection on `/`, submit the priority URLs, and turn on IndexNow through Cloudflare Crawler Hints. |
| F6 | Medium | Both | open | **No conversion is measured.** GA4 has 0 key events over 90 days, and the site sends no event except `page_view`, so the audit's owner step "mark sign-up as a key event" cannot be done as written. | `rerun/ga4-raw.json` (`keyevents_90: []`); `src/components/site-analytics-routes.tsx:57`; grep for `sign_up` and `generate_lead` in `src/` and `app/` finds none outside tests | **Now (owner, no code):** in GA4 Admin, Events, Create event, add `signup_page_view` when `event_name = page_view` and `page_location` contains `/signup`, then mark it as a key event. **Later (repo):** send a `sign_up` event when an account is actually created, keeping the existing consent and path rules. |
| F7 | Medium | LIVE | already-fixed-locally | **Mobile LCP is late because rendering starts late, not because the server is slow.** On home, the LCP element is the `aria-hidden` ButtonRoll CTA copy, with 2.29 s render delay after a 37 ms TTFB. Pricing LCP was 5.6 to 5.7 s in 4 of 4 mobile runs (intro paragraph, 1.96 s render delay). LIVE still streams `root-loading`. Same root cause as audit M2. | `rerun/psi-raw-home-mobile-a.json`, `psi-raw-pricing-mobile-a.json`, `psi-home.json`, `psi-pricing.json`; `rerun/live-home.html` contains `root-loading` | G6 already moved the loading boundary and made the hero entrance transform-only. After deploy, run PSI mobile on `/`, `/pricing`, `/features` and one fullbleed guide at least 3 times each and take the median. The target is LCP of 2.5 s or less. |
| F8 | Low | Both | open | **The Google Analytics tag causes most lab blocking time.** gtag.js long tasks make up most of TBT in 10 of the 11 runs with raw traces (for example, pricing mobile 70 ms TBT with about 62 ms from gtag), and about 620 of 1,400 ms in the latest home mobile run. It loads `afterInteractive`. | `rerun/psi-raw-*.json`; earlier `perf/raw/*.json` and `images-work/psi-*.json`; `src/components/site-analytics.tsx:144-148` | Consider `strategy="lazyOnload"` for the gtag loader, or loading it after the first interaction or idle period. **Trade-off:** a few very short visits may go uncounted. Measure TBT before and after on the deployed build. Do not remove consent mode. |
| F9 | Low | LIVE | owner-action | **GA4 holds test traffic from `localhost`:** 15 sessions and 73 views (4 and 5 Sep), including app paths and one unredacted `/data-deletion/status/SECRETCODE123` row. The code that caused it was fixed on 13 Oct and is deployed, so new localhost hits should not appear. | `rerun/ga4-raw.json` (`host_all_2026`, `page_90`, `date_host_90`); commits `1648bb4` (4 Sep) and `e57d47b` (13 Oct, on `origin/main`) | In reports and explorations, add a filter `Hostname exactly matches linkar.in`, or save a comparison for it. Optionally set up a developer-traffic data filter. No repo change needed. |
| F10 | Low | LOCAL | open | **The core pages carry no `lastmod` in the sitemap,** `/` and `/pricing` included. They have only `changefreq` and `priority`, which Google ignores. When the redesigned homepage ships, nothing in the sitemap tells Google it changed since the 24 Sep crawl. | `rerun/local-sitemap.xml` (12 of 79 entries lack lastmod); `app/sitemap.ts:11-32`. Google: "Google uses the `<lastmod>` value if it's consistently and verifiably accurate" and ignores `<priority>` and `<changefreq>` ([sitemaps docs](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)). | Give the core entries a real, maintained date, for example one constant per page bumped when its copy changes. Do not stamp the build time on every URL. Low priority, because requesting indexing after deploy does the same job once. |
| F11 | Info | LIVE | open | **No CrUX field data** (the API and History both return 404 for the origin, `/` and `/pricing`), so INP cannot be measured. | `rerun/crux-home.json`, `crux-history-origin.json`, `crux-history-home.json` | Rely on lab data for now. Re-check CrUX monthly. Optionally send `web-vitals` (LCP, INP, CLS) to GA4 as events once traffic exists. |
| F12 | Info | LIVE | open | **Google's only external referrers are dead legacy pages** (rodrigoborges.info and rbmsoft.com.br; all failed to connect on 15 Oct). Bing first saw `http://linkar.in/` on 27 Jul 2013. This supports the domain-history factor (audit C1 point 4 and M15). | `rerun/gsc-raw.json`, `bing-extra.json`; curl of the three URLs returned 000 | Nothing to disavow and nothing to fix. Real links and listings (audit H7) are the only remedy. |
| F13 | Info | LOCAL | already-fixed-locally | **Analytics coverage is confirmed on the restarted dev server.** The CSP allows googletagmanager.com on the hubs and guides, and not on the recipe downloads or 404s. That closes the audit's caveat that it was "proven by unit tests only". | `curl -sD- localhost:3000/features/instagram-comment-to-dm` (and the other paths in section 6) | After deploy, confirm `page_view` hits from `/features/...` in GA4 Realtime (section 8.4). |

---

## 8. What to do after deploying

### 8.1 Before or together with the deploy (owner, about 5 minutes)

1. **Cloudflare: Always Use HTTPS (F2).**
   - Check: `curl -sI http://linkar.in/` and `curl -sI http://linkar.in/pricing` must both return `301` with `location: https://linkar.in/...`.
2. **Deploy checks.** Confirm on live:
   - `curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://linkar.in/features/sitemap.xml` returns `200 application/xml`, and the same for `solutions` and `templates`;
   - `https://linkar.in/robots.txt` shows four `Sitemap:` lines;
   - the home `<title>` starts with "Instagram Automation".

### 8.2 Google Search Console (`sc-domain:linkar.in`), deploy day

1. **Sitemaps** (Indexing, Sitemaps):
   - remove `https://www.linkar.in/sitemap.xml` (F3);
   - resubmit `https://linkar.in/sitemap.xml`; it should re-read as 79 URLs, or fewer if the owner holds back a wave;
   - submit `https://linkar.in/features/sitemap.xml`, `/solutions/sitemap.xml` and `/templates/sitemap.xml`.

   The catalogue URLs appear in both the main sitemap and the collection ones. Google allows that. The benefit is that the Pages report can then be filtered per collection, which shows which collection Google accepts.
2. **URL Inspection, then Test live URL, then Request indexing**, in this order:
   1. `https://linkar.in/` (check the rendered HTML shows the new title and H1, canonical `https://linkar.in`, no noindex);
   2. `https://linkar.in/pricing`;
   3. `/features`, `/solutions`, `/templates`;
   4. 3 to 5 lead guides, for example `/features/instagram-comment-to-dm`, `/features/instagram-dm-automation` and `/features/instagram-keyword-replies`.

   Search Console limits manual indexing requests per day, so stop when it says the quota is reached and continue the next day. Do this by hand. The Indexing API is not for these pages.
3. **`http://linkar.in/`:** run a live test only, which should report a redirect. Do not request indexing. Repeat for `https://www.linkar.in/`.
4. **Link GA4 to Search Console** (GA4 Admin, Product links, Search Console links). It needs a verified owner of the property; the service account is only `siteFullUser`.
5. **Crawl stats** (Settings, Crawl stats): over the next week, confirm crawl requests rise and host status stays green (robots.txt fetch, DNS, server connectivity).

**Days 3 to 14:**
- Check the Pages report per sitemap. Expect states to move from "Discovered - currently not indexed" to "Crawled", then to "Indexed".
- Watch Performance with country set to India. Brand queries ("linkar") usually appear first, and "instagram automation" variants come later.
- Re-run:
  ```sh
  source ~/.config/claude-seo/linkar/env.sh; export PYTHONWARNINGS=ignore
  cd ~/.claude/skills/seo/scripts
  python3 gsc_inspect.py https://linkar.in/ -s sc-domain:linkar.in --json
  python3 gsc_inspect.py https://linkar.in/pricing -s sc-domain:linkar.in --json
  python3 gsc_inspect.py http://linkar.in/ -s sc-domain:linkar.in --json
  python3 gsc_query.py sitemaps -p sc-domain:linkar.in --json
  python3 gsc_query.py -p sc-domain:linkar.in --days 28 --json
  ```
- **If the homepage is still "Crawled - currently not indexed" after a fresh crawl of the new version:** the remaining levers are links and listings (H7) and the catalogue quality work (C2, H3). Technical settings are not the cause; the fetch and robots are fine.

### 8.3 Bing Webmaster Tools, deploy day

1. **Sitemaps:**
   - resubmit `https://linkar.in/sitemap.xml`; the count should rise from 12;
   - submit the three collection sitemaps. Bing also reads the `Sitemap:` lines in robots.txt, but submitting gives per-sitemap status.
2. **URL Inspection** on `https://linkar.in/` and `/pricing`. Use "Request indexing" or URL Submission for the same priority list as Google. The quota of 100 a day covers every URL, but follow the release-wave decision (H5).
3. **IndexNow:** turn on Cloudflare Crawler Hints (audit L14). Bing then hears about every change without manual submissions.
4. **Geo-targeting** (Configuration): optional. The `.in` ccTLD already signals India. If you set it, use domain-level India.
5. Run **Site Scan** once after deploy, as a free second crawler opinion. Then check Backlinks weekly. It is 0 today, and every listing from H7 should show up there.

### 8.4 GA4, deploy day

1. **Realtime:** open a hub and a guide (for example `/features/instagram-comment-to-dm`) on a phone. Accept the notice if shown, and confirm `page_view` with that page title. This is the first live proof of G3.
2. **Key event (F6):** create the `signup_page_view` event and mark it as a key event.
3. **Filter (F9):** save a report or exploration comparison with `Hostname = linkar.in`.
4. **Read direct sessions with care** on days when PageSpeed or other lab tools run against the site.

### 8.5 Re-measure performance (LIVE, after deploy)

```sh
source ~/.config/claude-seo/linkar/env.sh; export PYTHONWARNINGS=ignore
cd ~/.claude/skills/seo/scripts
for u in https://linkar.in/ https://linkar.in/pricing https://linkar.in/features https://linkar.in/features/instagram-comment-to-dm; do
  python3 pagespeed_check.py "$u" --strategy mobile --psi-only --json | sed -E 's/key=[^& "]*/key=REDACTED/g'
done
```

Wait at least a minute between repeats of the same URL, because PSI caches results. Take the median of 3 runs. Compare the LCP element and TBT with section 4.

---

## 9. Evidence files

All files are under `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/google-data/rerun/`:

- **Search Console:**
  - `gsc-sites.json`
  - `gsc-sitemaps.json`
  - `gsc-28-qp.json`, `gsc-90-qp.json`, `gsc-28-date.json`, `gsc-90-date.json`, `gsc-90-country.json`, `gsc-90-page.json`, `gsc-90-device.json`, `gsc-480-date.json`
  - `gsc-raw.json` (raw sitemaps with `lastDownloaded`, raw URL Inspection for 5 URLs, fresh data, other search types)
  - `inspect-home.json`, `inspect-pricing.json`, `inspect-http-home.json`
- **GA4:**
  - `ga4-28-organic.json`, `ga4-90-organic.json`
  - `ga4-28-top-pages.json`, `ga4-90-top-pages.json`
  - `ga4-28-country.json`, `ga4-90-country.json`
  - `ga4-raw.json` (channels, source, landing, host and path, country, city, device, events, key events, realtime)
- **PageSpeed and CrUX:**
  - `psi-home.json`, `psi-pricing.json` (mobile and desktop summaries)
  - `psi-raw-home-mobile-a.json` and `-b.json` (the same cached run), `psi-raw-pricing-mobile-a.json`
  - `crux-home.json`, `crux-history-origin.json`, `crux-history-home.json`
  - Earlier raw runs used for the variance table: `../../perf/raw/*.json` and `../../images-work/psi-*.json`
- **Bing:** `bing-counts.json`, `bing-links.json`, `bing-raw.json` (verification codes redacted), `bing-extra.json`
- **LIVE and LOCAL snapshots:** `live-home.html`, `local-sitemap.xml`, `local-features_sitemap.xml`, `local-solutions_sitemap.xml`, `local-templates_sitemap.xml`
- **Helper scripts (read-only API calls):** `.../scratchpad/seo-google-scripts/gsc_raw.py`, `ga4_raw.py`, `bing_raw.py`. They use the skill's own auth helpers and never print keys.
