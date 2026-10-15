# seo-sitemap: validation report (re-run), 15 October 2026

**Skill:** seo-sitemap, Mode 1 (analyse existing sitemaps).
**Targets:** LIVE https://linkar.in and LOCAL http://localhost:3000 (dev server, freshly restarted, after work groups G1 to G6).
**Rules kept:** read-only on the repo and on every account. No sitemap was submitted, no setting changed, no API key printed (Bing output piped through the `apikey=REDACTED` filter).

## 1. Score

**Sitemap health: 85 / 100** (LIVE 84, LOCAL 86).

| Check (weight) | LIVE | LOCAL | Notes |
|---|---|---|---|
| Valid XML and protocol limits (15) | 15 | 13 | LIVE validates against the sitemaps.org XSD. LOCAL is well formed but fails strict XSD order because Next.js writes `<image:image>` before `<lastmod>` (F3). |
| URL health: 200, no redirects, HTTPS only (20) | 20 | 20 | 12 / 12 and 79 / 79 return 200 with no redirect. |
| Indexable and canonical (20) | 20 | 20 | No `noindex`, no robots block, canonical equals `<loc>` on every URL. |
| Coverage against a crawl (15) | 15 | 15 | Every indexable page reached by links is listed, and every listed URL is reachable. |
| lastmod accuracy (10) | 0 | 4 | LIVE has no lastmod at all. LOCAL: the 67 catalogue URLs share one hard-coded date that is older than the content; the 12 core pages have none (F1, F2). |
| Discovery: robots lines and submissions (10) | 7 | 8 | LIVE: one `Sitemap:` line; read by Google and Bing with 0 errors; stale 2019 `www` entry in Search Console; `http://` copy serves 200. LOCAL: four `Sitemap:` lines; not yet submittable. |
| Hygiene (10) | 7 | 6 | Ignored `priority` and `changefreq` everywhere; catalogue URLs listed in two sitemaps each; app and admin hosts answer `/sitemap.xml`. |
| **Total** | **84** | **86** | |

The sitemaps are technically clean on both targets. The weak points are lastmod (missing on LIVE and stale on LOCAL) and the account-side state: Google read the live sitemap 2 seconds after it was submitted today, but none of the 12 URLs is indexed and none has been processed through the sitemap yet. That is the indexing problem in audit C1, not a sitemap defect.

## 2. What was checked, and how

| Step | Method | Evidence file (in `seo-run/sitemap/rerun/`) |
|---|---|---|
| Fetch sitemaps, robots, llms.txt on both targets | `curl` with a Googlebot user agent | `live_*.body/.hdr`, `local_*.body/.hdr` |
| Parse and count | Python `xml.etree`: URLs, images, lastmod values, duplicates, non-HTTPS, trailing slashes, `/recipe` | console output in this report |
| Strict schema check | `xmllint --schema` against the official `sitemap.xsd` (fetched from sitemaps.org), with extension elements set to lax so only ordering errors show | `xsd/sitemap.xsd`, `xsd/sitemap-lax.xsd` |
| Every URL | Smartphone Googlebot UA, redirects not followed: status, `x-robots-tag`, meta robots, canonical in `<head>`, `dateModified`, og:image | `live-check-now.json`, `local-check-now.json`, `../rerun_check.py` |
| Coverage | Breadth-first crawl from `/` on each target, same host only, redirects not followed | `live-crawl-now.json/.txt`, `local-crawl-now.json/.txt`, `../rerun_crawl.py` |
| robots against the sitemap | Longest-match evaluation of every `<loc>` and `<image:loc>` against the Allow and Disallow rules | console output |
| Image entries | Every distinct `<image:loc>` fetched from the dev server; git tracking checked | `img-locs.txt` |
| Production build parity | `.next/server/app/**/sitemap.xml.body` (build of 13:07) compared byte for byte with the dev output | console output |
| Search Console | `gsc_query.py sitemaps` and the raw `sitemaps.list` call (read-only); URL Inspection on all 12 live sitemap URLs plus `/features` | `gsc-sitemaps-now.json`, `gsc-sitemaps-raw-now.json`, `gsc-inspect-now.json`, `gsc-inspect-raw-now*.json` |
| Bing Webmaster | Read-only GET calls through the skill's own `bing_webmaster._bing_request`: `GetFeeds`, `GetFeedDetails`, `GetUrlInfo`, `GetCrawlIssues`, `GetCrawlStats` | `bing-now.json` |

## 3. Results

### 3.1 Inventory

| Sitemap | Target | Status | Type | URLs | Image entries | lastmod values |
|---|---|---|---|---|---|---|
| `/sitemap.xml` | LIVE | 200 | `application/xml` (brotli) | 12 | 0 | none |
| `/features/sitemap.xml`, `/solutions/sitemap.xml`, `/templates/sitemap.xml` | LIVE | 404 | HTML | n/a | n/a | not deployed yet (expected) |
| `/sitemap.xml` | LOCAL | 200 | `application/xml` | 79 | 67 | 12 with none, 67 with `2026-10-13` |
| `/features/sitemap.xml` | LOCAL | 200 | `application/xml` | 21 | 21 | all `2026-10-13` |
| `/solutions/sitemap.xml` | LOCAL | 200 | `application/xml` | 21 | 21 | all `2026-10-13` |
| `/templates/sitemap.xml` | LOCAL | 200 | `application/xml` | 25 | 25 | all `2026-10-13` |
| `/sitemap_index.xml` | both | 404 | | | | no index file (not needed at this size) |

- All files are far below 50,000 URLs and 50 MB.
- No duplicate `<loc>` inside any file. No HTTP, no trailing slash, no query strings, no `/recipe`, no localhost URL.
- The four LOCAL files in the production build (`.next/server/app/sitemap.xml.body` and the three nested ones, built 13:07) are byte-identical to what the dev server returns, so the dev output is what will ship.

### 3.2 URL health and canonical consistency

| Check | LIVE (12) | LOCAL (79) |
|---|---|---|
| HTTP 200, no redirect | 12 | 79 |
| One canonical in `<head>`, equal to `<loc>` | 12 | 79 |
| `noindex` (meta or header) | 0 | 0 |
| Blocked by robots.txt | 0 | 0 (and 0 of 67 image URLs) |
| `dateModified` in JSON-LD equals lastmod | n/a | 67 of 67 catalogue pages (`2026-10-13`) |
| og:image path equals the sitemap image | n/a | 67 of 67 |
| All 67 image URLs return 200 `image/*` and are tracked in git | n/a | yes |

The homepage is listed as `https://linkar.in` and declares the same canonical. Search Console reports the Google canonical as `https://linkar.in/`. For an origin URL these are the same address (an empty path means `/`), so there is no conflict. `llms.txt` uses `https://linkar.in/`, which is equally fine.

Search Console shows "no user-declared canonical" for every crawled URL. That is stale data, not a defect: canonical tags, robots.txt and the sitemap shipped in commit `24e515c` on 10 Oct 2026 (on `origin/main`), while Google's last crawls were 24 Sep (homepage) and 7 Oct (legal pages).

### 3.3 Coverage against a crawl

| | LIVE | LOCAL |
|---|---|---|
| URLs reached from `/` | 15 | 108 |
| Indexable 200 HTML pages reached | 12 | 79 |
| Indexable but missing from the sitemap | none | none |
| In the sitemap but not reachable by links (orphans) | none | none |
| Click depth of sitemap URLs | 0 or 1 | 0 or 1 (header and footer directory) |
| Sitemap URLs with fewer than 3 internal links | none | none |

Everything else the crawl reached is correctly left out:

- LOCAL: `/login`, `/signup`, `/forgot-password` (meta `noindex, nofollow`), the 24 `/templates/<slug>/recipe` downloads (`x-robots-tag: noindex`, not blocked in robots so the header can be seen), and two OAuth start routes under `/api/` (303, disallowed).
- LIVE: `/login`, `/signup` and `/dashboard` (307 to `app.linkar.in`). The footer `/dashboard` link (audit L9) is still on LIVE; it is gone LOCALLY (the local crawl never reaches `/dashboard`).

Route inventory check (`app/**/page.tsx`): every public marketing route is listed (home, pricing, support, contact, 8 legal pages, 3 hubs, 64 guides). Private routes are not listed and are protected: `/onboarding`, `/dashboard`, `/admin`, `/help` redirect (307); `/auth/confirm`, `/forgot-password`, `/reset-password`, `/data-deletion/status/<code>` and `/dev-preview/*` (local only; 404 on LIVE) send `noindex, nofollow`; `/r/<slug>` returns 404.

### 3.4 robots.txt

| | LIVE | LOCAL |
|---|---|---|
| Status, type | 200 `text/plain` | 200 `text/plain` |
| `Sitemap:` lines | 1: `/sitemap.xml` | 4: `/sitemap.xml`, `/features/sitemap.xml`, `/solutions/sitemap.xml`, `/templates/sitemap.xml` |
| `Host:` line | `Host: https://linkar.in` | same |
| app and admin hosts | `Disallow: /`, no Sitemap line | same code path (`app/robots.ts:39-41`) |

All `Sitemap:` URLs are absolute, HTTPS and on the marketing host. robots.txt is rendered per request (it reads the Host header), so the host split works in production as it does on LIVE today.

### 3.5 Search Console (`sc-domain:linkar.in`, read-only)

| Sitemap | Submitted | Last downloaded | Errors | Warnings | Submitted URLs | Indexed |
|---|---|---|---|---|---|---|
| `https://linkar.in/sitemap.xml` | 2026-10-15 05:47:30 UTC | 2026-10-15 05:47:32 UTC | 0 | 0 | 12 | 0 |
| `https://www.linkar.in/sitemap.xml` | 2019-09-25 | 2019-11-10 | 0 | 6 | 6 | 0 |

URL Inspection of all 12 live sitemap URLs (the `sitemap` field is empty on every one, so no URL has been processed through the new sitemap yet):

| URL | Coverage | Last crawl (UTC) | Referring URLs |
|---|---|---|---|
| `/` | Crawled, currently not indexed | 2026-09-24 22:41 | `/terms`, `http://linkar.in/` |
| `/support` | Crawled, currently not indexed | 2026-10-07 15:29 | none |
| `/terms` | Crawled, currently not indexed | 2026-10-07 08:55 | `/` |
| `/privacy` | Crawled, currently not indexed | 2026-10-07 09:10 | `/` |
| `/cookies` | Crawled, currently not indexed | 2026-10-07 09:29 | `/signup` |
| `/acceptable-use` | Crawled, currently not indexed | 2026-10-07 09:27 | `/cookies`, `/signup` |
| `/data-deletion` | Crawled, currently not indexed | 2026-10-07 09:13 | `/` |
| `/pricing` | URL is unknown to Google | | |
| `/contact` | URL is unknown to Google | | |
| `/refund-policy` | URL is unknown to Google | | |
| `/data-processing` | URL is unknown to Google | | |
| `/service-providers` | URL is unknown to Google | | |
| `/features` (LOCAL only) | URL is unknown to Google | | |

New detail beyond the audit: Google crawled six legal and help pages on 7 Oct and declined to index them too, so 7 of 12 sitemap URLs are "Crawled, currently not indexed" and 5 are unknown, including `/pricing`.

### 3.6 Bing Webmaster (read-only)

| Call | Result |
|---|---|
| `GetFeeds` / `GetFeedDetails` | One feed: `https://linkar.in/sitemap.xml`, type Sitemap, submitted and last crawled 2026-10-15 06:14:18 UTC, status **Success**, **12 URLs**, not compressed. Bing reports a file size of 3,143 bytes, while the file served today is 1,421 bytes; the reason is not documented, so no conclusion is drawn. |
| `GetUrlInfo https://linkar.in` | Discovered 2018-12-10 (previous owner of the domain), last crawled 2026-10-06 07:24 UTC, 1 anchor, document size 1,033 bytes, HTTP status field 0. The small size and 0 status are not explained by the API; check the page in Bing's URL Inspection after the deploy. |
| `GetUrlInfo` for `/pricing`, `/support`, `/terms`, `/privacy` | Not discovered yet (all dates 0001-01-01, size 0). The feed was read this morning; Bing has not crawled its URLs yet. |
| `GetCrawlIssues`, `GetCrawlStats` | Empty. |
| Nested sitemaps | Not in Bing (not deployed). |

## 4. Findings

Status key: **open** (repo change still needed), **already-fixed-locally** (fixed in the LOCAL build, not deployed), **owner-action** (account, deploy or decision).

### F1. Catalogue lastmod is one hard-coded date that is already older than the content (Low, LOCAL, open)

- **Evidence:** `src/content/seo/types.ts:24` sets `SEO_CONTENT_UPDATED = "2026-10-13"`. `app/seo-sitemap-entries.ts:27` and `:34` write it as lastmod on all 67 catalogue URLs, and `src/lib/seo-pages.ts:73` and `:95` write it as `dateModified`. The catalogue was committed on 14 Oct (`fadd56b`), and on 15 Oct G5 changed the rendered H1, FAQ and related intro on all 64 guides and the hub H1s (`git diff --stat HEAD`: 36 files under `src/components/marketing/seo` and `src/content/seo`). `docs/seo-pages.md:87-89` says to "Maintain modification dates when the actual content changes"; that did not happen. `src/content/seo/seo-pages.test.ts:94` hard-codes `"2026-10-13"` instead of using the constant.
- **Why it matters:** on deploy day every catalogue URL will claim a date earlier than its real content, and all 67 dates are identical. Google says it uses lastmod only when it is consistently and verifiably accurate (Google Search Central, "Build and submit a sitemap"). This extends audit M10 with new evidence; it does not block indexing.
- **Fix:** in the deploy commit, set `SEO_CONTENT_UPDATED` to the deploy date and change the test at `seo-pages.test.ts:94` to use the constant. Keep it a fixed date, never a build-time date (as the doc says). Per-record dates stay deferred (audit section 8).

### F2. The 12 core pages have no lastmod, including the homepage and pricing that this deploy changes (Low, both, open)

- **Evidence:** `app/sitemap.ts:11-32` emits only `url`, `changeFrequency` and `priority` for `PUBLIC_PAGES`. LIVE and LOCAL `/sitemap.xml` have no `<lastmod>` on these 12 URLs. Google last crawled `/` on 24 Sep and the legal pages on 7 Oct (section 3.5); the deploy rewrites the homepage title, H1, FAQ and schema and the pricing metadata (audit section 11). `src/lib/legal-entity.ts:49` already holds the legal set's effective date, "10 October 2026".
- **Fix:** add a truthful `lastModified` to the core entries: a fixed date constant for `/` and `/pricing` set to the deploy date, and `2026-10-10` for the legal pages, taken from `LEGAL_ENTITY.effectiveDate`. Update it only when the page content really changes. This is a cheap recrawl hint for the one URL Google already crawled and must re-evaluate; the stronger lever is still requesting indexing by hand (audit C1).

### F3. Strict XSD validation fails on every catalogue entry because of element order (Low, LOCAL, open)

- **Evidence:** the official `sitemap.xsd` defines `<url>` as `loc`, `lastmod`, `changefreq`, `priority`, then extension elements. Next.js 16.3.8 writes `<image:image>` right after `<loc>` (`node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js:121-157`). `xmllint --schema` reports "Element lastmod: This element is not expected" 67 times for `/sitemap.xml` and 21, 21 and 25 times for the nested files. LIVE (no images) validates.
- **Impact:** low. The XML is well formed, and the order comes from the framework's own sitemap writer. Strict third-party validators will flag it. Whether Google or Bing will warn cannot be confirmed until the files are submitted.
- **Fix:** after deploy, read the Search Console and Bing sitemap reports. If either shows parse warnings, drop the `images` field (each hero is already declared on its page as og:image and `primaryImageOfPage`) or serve these sitemaps from a route handler that writes elements in schema order. Otherwise leave it.

### F4. HTTP copies of the sitemap and robots.txt return 200 (Medium, LIVE, owner-action; audit M1)

- **Evidence:** `curl http://linkar.in/sitemap.xml` returns 200 `application/xml` (1,421 bytes) and `http://linkar.in/robots.txt` returns 200, with no redirect to HTTPS. `https://www.` 301s correctly. Search Console already lists `http://linkar.in/` as a referring URL for the homepage.
- **Fix:** Cloudflare "Always Use HTTPS" (audit M1, section 7 step 4). Then check `curl -I http://linkar.in/sitemap.xml` for a 301.

### F5. Stale 2019 `www` sitemap still listed in Search Console (Low, LIVE, owner-action; audit M15)

- **Evidence:** `sitemaps.list` shows `https://www.linkar.in/sitemap.xml`, submitted 2019-09-25, last downloaded 2019-11-10, 6 warnings, 6 URLs, 0 indexed. It belongs to a previous owner of the domain.
- **Fix:** remove it in Search Console, Sitemaps (owner).

### F6. Google read the live sitemap but has processed no URL through it, and 7 of 12 URLs are "Crawled, currently not indexed" (Info, LIVE, owner-action; extends audit C1)

- **Evidence:** section 3.5. Read 2 seconds after submission with 0 errors; 12 submitted, 0 indexed; the `sitemap` field is empty on all 12 inspected URLs; six legal pages crawled on 7 Oct and not indexed; `/pricing` unknown.
- **Fix (after deploy, by hand, no Indexing API):** resubmit `/sitemap.xml`; submit the three collection sitemaps so Search Console reports coverage per collection; request indexing for `/`, `/pricing`, the three hubs and 3 to 5 lead guides; re-inspect after 7 to 14 days. This is audit section 7 step 5.

### F7. Bing has the sitemap but has not crawled its URLs; nested sitemaps not yet known (Info, LIVE, owner-action)

- **Evidence:** section 3.6. Feed status Success with 12 URLs at 06:14 UTC today; `/pricing`, `/support`, `/terms` and `/privacy` not discovered; crawl stats and issues empty.
- **Fix:** after deploy, add the three collection sitemaps in Bing Webmaster Tools, or rely on the `Sitemap:` lines in robots.txt, which Bing also reads. Turning on Cloudflare Crawler Hints (IndexNow, audit L14) is the fastest way to tell Bing about the 67 new URLs. Check the homepage in Bing's URL Inspection, given the odd 1,033-byte record.

### F8. The nested sitemap files are untracked in git (Info, LOCAL, owner-action at deploy)

- **Evidence:** `git status`: `?? app/features/sitemap.ts`, `?? app/solutions/sitemap.ts`, `?? app/templates/sitemap.ts`, `?? app/seo-sitemap-entries.ts`. `app/sitemap.ts` and `app/robots.ts` import `./seo-sitemap-entries`, so leaving that file out breaks the build (a safe failure). Leaving out only the three route files would make robots.txt advertise three URLs that fall through to the `[slug]` page and 404. The unit tests in `src/content/seo/seo-pages.test.ts` import them and would fail first.
- **Fix:** `git add` all four with the deploy. After deploy, check that each of the four sitemap URLs returns 200 `application/xml`.

### F9. Catalogue URLs are listed in two sitemaps each (Info, LOCAL, open; by design)

- **Evidence:** all 67 catalogue URLs appear in `/sitemap.xml` and again in their collection sitemap (`app/sitemap.ts:33`). The protocol allows this, and the comment at `app/sitemap.ts:5-10` explains the choice: the root file is the one already submitted.
- **Note:** Search Console will count these URLs under both the root sitemap and the collection sitemap. Read the per-collection reports for coverage rather than adding the counts up. A sitemap index at `/sitemap.xml` would avoid the overlap, but Next 16 does not generate one from `sitemap.ts` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md:338-339`), so no change is recommended now.

### F10. `priority` and `changefreq` on every entry (Info, both, open)

- **Evidence:** every `<url>` on both targets carries them (`app/sitemap.ts:11-24`, `app/seo-sitemap-entries.ts:28-29`, `:35-36`). Google ignores both and relies on lastmod (Google Search Central, "Build and submit a sitemap").
- **Fix:** optional cleanup. Harmless, and lowest priority.

### F11. App and admin hosts answer `/sitemap.xml` with the marketing sitemap (Info, LIVE, open)

- **Evidence:** `https://app.linkar.in/sitemap.xml` and `https://admin.linkar.in/sitemap.xml` return 200 with the same 1,421-byte file listing `linkar.in` URLs. Both hosts serve `Disallow: /` with no Sitemap line, so crawlers will not fetch it. After deploy, `/features/sitemap.xml` and the other nested files redirect to the marketing host from the app host (`src/lib/site-routing.ts`, `MARKETING_ROUTE_PREFIXES`).
- **Fix:** none needed. Optionally return 404 for `/sitemap.xml` on non-marketing hosts.

### F12. robots.txt carries a `Host:` line (Info, both, open)

- **Evidence:** `Host: https://linkar.in` from `host: publicSiteOrigin()` at `app/robots.ts:46`. Google and Bing ignore `Host`; it was a Yandex extension.
- **Fix:** none needed; optional removal.

### F13. The sitemap section of `docs/seo-pages.md` is out of date (Info, LOCAL, open)

- **Evidence:** `docs/seo-pages.md:85-86` says "The sitemap includes the 67 HTML pages" and "`llms.txt` links to the three collection hubs". After G2 there are four sitemaps (79 URLs in the root file, 67 image entries) and llms.txt links all 64 guides.
- **Fix:** update the paragraph when the deploy commit is prepared.

### F14. Per-collection sitemaps, image entries and four robots lines are in place (Info, LOCAL, already-fixed-locally; audit M10 and L6 sitemap part)

- **Evidence:** sections 3.1 to 3.4. The nested sitemaps return 200 `application/xml`, are not shadowed by the `[slug]` route, list each page once with its hero image, and leave out every `/recipe` download. Production build output matches the dev output byte for byte. LOCAL coverage is complete with no orphans, and nothing private is listed.
- **Remaining:** only the lastmod work in F1 and F2, and deploying.

## 5. Deploy checklist for sitemaps

1. `git add` the four untracked sitemap files (F8).
2. Set `SEO_CONTENT_UPDATED` to the deploy date and fix the hard-coded test date (F1). Optionally add core lastmod dates (F2).
3. Deploy, then verify on LIVE:
   - `curl -s https://linkar.in/robots.txt` shows 4 `Sitemap:` lines;
   - each of the 4 sitemap URLs returns 200 `application/xml` with 79, 21, 21 and 25 URLs;
   - `curl -I http://linkar.in/sitemap.xml` returns 301 once Always Use HTTPS is on (F4).
4. Search Console: remove the 2019 `www` entry (F5), resubmit `/sitemap.xml`, submit the three nested sitemaps, request indexing by hand (F6), and check the Sitemaps report for parse warnings (F3).
5. Bing: add the three nested sitemaps or rely on robots.txt, turn on Crawler Hints, and inspect the homepage (F7).
6. If the owner holds back any catalogue pages (audit C2 and H5), check them against the content index. The sitemaps, llms.txt and analytics paths are all generated from `getSeoPages`, so removing a record removes it everywhere at once.

## 6. Data not available

- Search Console has not yet processed any URL through the sitemap, so per-sitemap indexing data does not exist yet.
- Bing's crawl and traffic stats are empty.
- Whether Google or Bing will warn on the element order in F3 cannot be known until the nested sitemaps are submitted.
