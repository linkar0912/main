# seo-schema: Linkar structured data re-check, 15 October 2026

**Skill:** seo-schema (detection, validation, generation).
**Targets:** LIVE https://linkar.in and LOCAL http://localhost:3000 (dev server, re-checked after work groups G1 to G6).
**Mode:** read-only. No repo edits, no account changes.

## Score

| Target | Schema score | Why |
|---|---|---|
| LOCAL build, once deployed | **88 / 100** | Every block parses on 69 of 69 pages. The Schema.org validator reports 0 errors and 0 warnings on all 8 page templates. The entities are linked with `@id`, offers carry a monthly billing period with GST included, `/pricing` has data, and the hub ItemLists match the rendered order. Points are lost for: no Google Software App rich result (no genuine rating), untyped cross-page references, a stale `dateModified`, hub names carrying the title suffix, and missing optional properties. |
| LIVE production | **55 / 100** (unchanged) | Only Organization and SoftwareApplication on the homepage, both valid. There is no WebSite node (needed for Google site names), no `@id` on the software, no billing period, and no data on `/pricing` or anywhere else. The block sits inside the hidden streamed segment. Every one of these is fixed locally and waits for the deploy. |

The single `score` returned to the orchestrator is the LOCAL number (88).

## Method and evidence

All raw files are in `scratchpad/seo-run/schema/`:

- `fetch.py` fetched every URL in both sitemaps using a Googlebot user agent:
  - live: 12 URLs, plus `/features` and `/solutions`, which return 404;
  - local: 79 URLs.

  The saved HTML is in `html/live/` and `html/local/`.
- `validate.py` reads every page. It:
  - extracts every JSON-LD block and checks that it parses;
  - checks `@context` and `@type`;
  - checks Google-required and Google-recommended properties per type;
  - checks absolute URLs, ISO 8601 dates and durations, placeholder text, and `@id` resolution;
  - looks for Microdata and RDFa.

  Output: `validate-summary.txt`, `results-live.json` and `results-local.json`.
- `crosscheck.py` compares the structured data with what each page shows:
  - FAQPage against the visible FAQ;
  - offer prices against the visible prices;
  - hub ItemList order against the rendered order;
  - WebPage `name` against the H1.

  Output: `crosscheck.txt`.
- **Schema.org validator (validator.schema.org):**
  - live homepage, checked by URL: `sv-live-home.txt`;
  - local JSON-LD for home, pricing, the 3 hubs and 1 detail page from each collection: `schema-validator-local.json`.
- **Images:** all 67 `primaryImageOfPage` URLs were fetched locally and their WebP headers decoded. The `/icon.png` logo was fetched on both targets.
- **Production prerender:** the JSON-LD in `.next/server/app/{index,pricing,features,features/instagram-comment-to-dm,templates/dm-price-list}.html`, from the 13:07 build, is byte-identical to the dev output after parsing. Both use the absolute origin `https://linkar.in`. `.env.local` does not set `PUBLIC_SITE_URL`, so `publicSiteOrigin()` falls back to the marketing host.
- **Google sources:**
  - [Software app structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app) (updated 2026-09-08): `name`, `offers.price` and one of `aggregateRating` or `review` are required.
  - [Site names](https://developers.google.com/search/docs/appearance/site-names) (updated 2025-12-10): WebSite with `name` and `url` is required on the home page.
- **Data not available:**
  - There is no public API for Google's Rich Results Test, so Google-specific eligibility is judged against the documentation above.
  - Search Console has no enhancement data, because no URL is indexed (audit C1). The saved homepage URL Inspection has no `richResultsResult`.

## Detection

### LIVE (https://linkar.in)

| Page | Format | Types |
|---|---|---|
| `/` | JSON-LD, 1 block (an array) | Organization (+ ContactPoint) and SoftwareApplication (+ 4 Offer) |
| `/pricing` and the 10 legal and help pages | none | none |
| `/features`, `/solutions` | 404 | not deployed |

Microdata: 0 nodes. RDFa: 0 nodes.

The homepage block sits inside `<div hidden id="S:0">`, which is the streamed segment behind the root loading skeleton:
- `ld+json` is at byte 7578;
- the hidden div opens at byte 7543;
- `root-loading` is at byte 4957.

### LOCAL (http://localhost:3000)

| Page set | Pages | Types |
|---|---|---|
| `/` | 1 | Organization (+ PostalAddress, ContactPoint), WebSite, SoftwareApplication (+ 4 Offer, each with UnitPriceSpecification), FAQPage (9 Question and Answer pairs) |
| `/pricing` | 1 | WebPage, BreadcrumbList |
| `/features`, `/solutions`, `/templates` | 3 | CollectionPage (+ ImageObject, ItemList of 20, 20 and 24 ListItems), BreadcrumbList |
| Detail pages | 64 | WebPage (+ ImageObject), BreadcrumbList |
| Legal and help pages | 10 | none |

Totals across 79 pages:
- 69 pages carry JSON-LD;
- WebPage 65, CollectionPage 3, BreadcrumbList 68, ImageObject 67, ItemList 3, ListItem 264, Organization 1, WebSite 1, SoftwareApplication 1, Offer 4, UnitPriceSpecification 4, FAQPage 1;
- Microdata 0, RDFa 0;
- 0 blocks inside hidden segments;
- no HowTo, no `aggregateRating`, no `review`, no `sameAs`, and no deprecated types.

## Validation results

| Schema | Target | Status | Issues |
|---|---|---|---|
| Organization | LIVE | Pass | `@id`, name, url, logo (512x512 PNG, 200), email and ContactPoint are all valid. Missing: `address`, `sameAs`, `legalName`. |
| SoftwareApplication | LIVE | Warn | Valid schema.org. Missing: `@id`, billing period on the offers, and Google's required `aggregateRating` or `review`. Old description. |
| Offer (x4) | LIVE | Pass | Price and currency are correct (0, 199, 499, 999 INR). There is no `priceSpecification`, so nothing says the price is monthly. |
| Organization | LOCAL | Pass | `address` has `addressCountry` IN only. Missing: `sameAs`, `legalName`, `founder` (owner inputs). |
| WebSite | LOCAL | Pass | `name` "Linkar" matches `og:site_name` and the title brand. `url` matches the canonical `https://linkar.in`. `publisher` links to `#organization`. |
| SoftwareApplication | LOCAL | Warn | Has `@id` `#software`, `applicationCategory`, `operatingSystem` and `offers.price`. **Missing Google's required `aggregateRating` or `review`** (finding F1). Optional `image` and `featureList` are absent. |
| Offer (x4) + UnitPriceSpecification | LOCAL | Pass | `billingDuration` P1M is a valid ISO 8601 duration. `unitText` MONTH, `valueAddedTaxIncluded` true. Prices match the visible homepage and `/pricing` text: Free, ₹199, ₹499 and ₹999 are all visible on both. Annual prices are not marked up (F7). |
| FAQPage | LOCAL | Pass (Info) | 9 of 9 questions and answers match the visible homepage FAQ word for word. No Google rich result on a commercial site (F12). |
| WebPage (`/pricing`) | LOCAL | Pass | `about` points to `#software` and `breadcrumb` to `#breadcrumb`. `isPartOf` is an untyped reference (F3). |
| WebPage (64 detail pages) | LOCAL | Pass | `name` appears in the H1 on 64 of 64 pages. `dateModified` is a valid ISO date but stale (F5). `primaryImageOfPage` resolves: 67 of 67 URLs return 200, and the declared 1536x1024 matches the file. |
| CollectionPage + ItemList (3 hubs) | LOCAL | Pass | ItemList order equals the rendered topic-group order on all 3 hubs. The 3 hero "fan" links come first on the page, outside the groups, and are correctly not counted. `name` carries " · Linkar" (F4). |
| BreadcrumbList (68) | LOCAL | Pass | Positions run 1 to n, every item has a name and an absolute URL, and the last item names the page. Position 1 says "Linkar" while the visible trail says "Home" (F11). |
| ImageObject (67) | LOCAL | Pass | `url`, `contentUrl`, width, height and caption are present. Licence and credit fields are absent (F13). |
| Schema.org validator | LIVE home | **0 errors, 0 warnings** | `sv-live-home.txt` |
| Schema.org validator | LOCAL, 8 templates | **0 errors, 0 warnings** | `schema-validator-local.json` |

## What G1 fixed (verified on LOCAL now)

Each item from the audit's G1 and M4 schema list was checked against the live dev server and the production prerender:

| Audit item | Status now |
|---|---|
| SoftwareApplication `@id` `https://linkar.in/#software` | Present (`src/lib/seo-pages.ts:153`) |
| `UnitPriceSpecification` on each offer: P1M, MONTH, GST included | Present on 4 of 4 (`seo-pages.ts:168-175`) |
| Organization `PostalAddress` IN | Present (`seo-pages.ts:132`) |
| Catalogue `about` points to `#software` | 67 of 67 pages, plus `/pricing` (`seo-pages.ts:29-31`) |
| `primaryImageOfPage` ImageObject | 67 of 67, URLs return 200 and the dimensions match (`seo-pages.ts:33-36`) |
| Hub ItemList in on-page order | 3 of 3 match (`seo-pages.ts:60-63`) |
| `/pricing` WebPage + BreadcrumbList | Present (`app/pricing/page.tsx:33`, `seo-pages.ts:192-210`) |
| `<` escaped in JSON-LD | Yes (`seo-pages.ts:20-22`, `seo-page.tsx:39`) |
| No HowTo, `aggregateRating` or `sameAs` | None anywhere. Enforced by `src/lib/seo-pages.test.ts:147` |
| JSON-LD outside hidden segments (G6 side effect) | 0 of 69 blocks are hidden locally (1 of 1 on live) |

## Findings

Status key:
- **open:** a repo change is still needed;
- **already-fixed-locally:** fixed in the local build, waiting for the deploy;
- **owner-action:** needs the owner's facts or decision.

### F1. SoftwareApplication cannot get Google's Software App rich result: no `aggregateRating` or `review` (Medium, BOTH, owner-action)

- **Evidence:**
  - Google's doc lists "aggregateRating or review" as required.
  - Neither is present on live or local: `src/lib/seo-pages.ts:150-178`.
  - `src/lib/seo-pages.test.ts:147` deliberately forbids rating and review nodes.
- **Effect:**
  - Once the homepage is indexed, the Rich Results Test and the Search Console "Software apps" report will list 1 invalid item, reading "Either aggregateRating or review should be specified".
  - This does not affect indexing or ranking. It only means no star or price rich result.
- **Fix:**
  - Do not invent a rating. Expect and ignore the invalid item until real reviews exist.
  - Once genuine reviews from real users are shown on the homepage or `/pricing` (with consent, collected first-party), add `aggregateRating` with `ratingValue` and `ratingCount` computed from that data, and relax the test at `seo-pages.test.ts:147` for that node only.
  - Reviews on G2 or Capterra cannot be marked up on linkar.in as if they were Linkar's own.

### F2. LIVE structured data is the old set (Medium, LIVE, already-fixed-locally)

- **Evidence:** `results-live.json` and `sv-live-home.txt`. Only 1 page carries JSON-LD (Organization and SoftwareApplication). There is:
  - no WebSite node (Google reads site names only from a WebSite node on the home page);
  - no `@id` on the software;
  - no billing period on the 4 offers;
  - no data on `/pricing`;
  - no BreadcrumbList anywhere.

  The block also sits inside `<div hidden id="S:0">`. Parsers still read it, but it depends on the streamed segment.
- **Fix:** deploy the local build (audit section 7, step 3). After deploy, check with:
  - `curl -s https://linkar.in/ | grep -c 'application/ld+json'` (expect 1 block with WebSite and `#software`);
  - `curl -s https://linkar.in/pricing | grep -c 'application/ld+json'` (expect 1);
  - the Rich Results Test on `/`, `/pricing`, `/features` and one guide.

### F3. Cross-page references are untyped on 68 pages (Low, LOCAL, open)

- **Evidence:**
  - `validate.py` reports dangling `@id` references on 68 pages: `https://linkar.in/#website` (from `isPartOf`) and `https://linkar.in/#software` (from `about`).
  - Both nodes are defined only on `/`. Google and Bing parse each URL on its own, so on a guide page `isPartOf` is a bare `{"@id": ...}` with no type or name.
  - Code: `src/lib/seo-pages.ts:73`, `:96`, `:199`.
  - The Schema.org validator does not flag this as an error.
- **Fix:**
  - Make the `isPartOf` reference self-describing. WebSite has no rich-result checks off the home page, so this has no side effects. In `src/lib/seo-pages.ts`:
    ```ts
    function websiteRef(origin: string) {
      return { "@type": "WebSite", "@id": `${origin}/#website`, name: PRODUCT_NAME, url: origin };
    }
    // lines 73, 96, 199
    isPartOf: websiteRef(origin),
    ```
  - **Keep `about` untyped.** Adding `"@type": "SoftwareApplication"` there would make 67 more pages show an invalid Software App item: no offers, no rating (see F1). The current stub, `@id` plus name plus url, is the right choice.

### F4. Hub CollectionPage `name` carries the title suffix " · Linkar" (Low, LOCAL, open)

- **Evidence:** `crosscheck.txt`:
  - `CollectionPage.name` is "Instagram & Facebook Automation Features · Linkar";
  - the H1 kicker is "Instagram and Facebook automation features".

  The name comes from `hub.title`: `src/lib/seo-pages.ts:95` and `src/content/seo/index.ts:39`, `:50`, `:61`. Detail pages and `/pricing` already use the plain heading.
- **Fix:**
  1. Move `hubLabels` from `src/components/marketing/seo/sections/hero/hub.tsx:16-20` into `seoCollections` as a `heading` field in `src/content/seo/index.ts`.
  2. Read that field in `hub.tsx`.
  3. Set `name: hub.heading` at `seo-pages.ts:95`.

  The minimal alternative is `name: hub.title.replace(/ · Linkar$/, "")`.

### F5. `dateModified` (and sitemap lastmod) predates today's catalogue changes (Low, LOCAL, open)

- **Evidence:**
  - `SEO_CONTENT_UPDATED = "2026-10-13"` at `src/content/seo/types.ts:24`. The file was last changed in commit `fadd56b` on 14 Oct.
  - On 15 Oct, G5 changed the rendered H1, FAQ and related-intro copy on all 67 pages: `git diff --stat HEAD` shows changes to `sections/faq/copy.tsx`, `sections/hero/*` and `sections/related/copy.ts`.
  - All 67 WebPage and CollectionPage nodes therefore declare a modification date older than their content.
- **Fix:** in the deploy commit, set `SEO_CONTENT_UPDATED` to the deploy date (ISO `YYYY-MM-DD`). Per-record dates stay in the deferred content pass (audit section 8). Optionally add `datePublished` with the same value on first release.

### F6. Optional SoftwareApplication, Offer and ItemList properties (Low, LOCAL, open)

- **Evidence:** `validate-summary.txt`. SoftwareApplication has no `image`, `screenshot` or `featureList`. UnitPriceSpecification uses only free-text `unitText`. ItemList has no `numberOfItems`.
- **Fix:** in `src/lib/seo-pages.ts` `homeStructuredData` (lines 150-178), make these changes, all generated from existing truthful sources:
  ```ts
  image: `${origin}/opengraph-image`,                                  // 200 image/png, code-drawn card
  featureList: getSeoPages("features").map((page) => page.label),      // 20 real feature names
  // inside priceSpecification:
  unitCode: "MON",                                                    // UN/CEFACT code for month; keep unitText
  ```
  And in `seoCollectionStructuredData` (line 98):
  ```ts
  mainEntity: { "@type": "ItemList", numberOfItems: seoHubPages(collection).length, itemListElement: ... }
  ```

  Do not add `alternateName` to WebSite unless Linkar really uses a second name. Do not add `SearchAction`: the sitelinks search box is retired and the site has no search.

### F7. Annual plans are shown but not marked up (Low, LOCAL, open)

- **Evidence:**
  - The visible homepage FAQ says "₹1,990, ₹4,990 and ₹9,990 a year" (`src/components/marketing/marketing-content.ts:170`, generated from `annualPaise`).
  - `/pricing` has an Annual toggle.
  - The Offers list only the monthly prices (`seo-pages.ts:160-177`).
- **Fix (optional):** add one Offer per paid plan from `plan.annualPaise`, so the annual prices come from the same catalog as the monthly ones:
  - `name: "<Plan> plan, yearly"`;
  - `priceSpecification` with `billingDuration: "P1Y"`, `unitCode: "ANN"`, `unitText: "YEAR"`, `valueAddedTaxIncluded: true`.

  See `generated-schema.json`.

### F8. No WebPage node for the homepage, and no data on `/contact` or `/support` (Low, LOCAL, open)

- **Evidence:**
  - The homepage graph has Organization, WebSite, SoftwareApplication and FAQPage, but no WebPage `/#webpage`. Every other marketing page has a page node.
  - The 10 legal and help pages carry no JSON-LD (`results-local.json`).
- **Fix:**
  - Add a homepage WebPage node with `isPartOf` `#website`, `about` `#software`, and a `primaryImageOfPage` for `/marketing/linkar-hero-indian-relaxed.webp` (1536x1024, using the hero alt as caption).
  - Add a ContactPage plus BreadcrumbList to `app/contact/page.tsx`, and a WebPage plus BreadcrumbList to `app/support/page.tsx`. Build them with a helper next to `pricingStructuredData` and escape them with `jsonLdHtml`.
  - Legal pages can stay without markup.

  Snippets are in `generated-schema.json`.

### F9. Organization identity properties need real facts (Low, BOTH, owner-action)

- **Evidence:**
  - The Organization at `seo-pages.ts:124-140` has no `sameAs`, `legalName`, `founder`, street address or `taxID`.
  - `LEGAL_ENTITY_COMPLETE = false`, with the proprietor, address and city still `__FILL_ME__` (`src/lib/legal-entity.ts:38-53`).

  This is the schema side of audit M13 and H7.
- **Fix:**
  - When the owner fills `legal-entity.ts`, read `legalName`, `founder` and the full `PostalAddress` from it.
  - When official profiles exist (LinkedIn, Instagram, Product Hunt, G2), add them as `sameAs`, and update `seo-pages.test.ts:147`, which currently fails on any `sameAs`.
  - Add the GSTIN as `taxID` only if the owner wants it public.

### F10. FAQPage repeats a trust claim that must be true on deploy day (Low, BOTH, owner-action)

- **Evidence:** the FAQPage answer "Linkar passed Meta App Review, uses only that API..." comes from `src/components/marketing/marketing-content.ts:164` and is emitted by `seo-pages.ts:179-187`. It is also in llms.txt.
- **Why it matters:** structured data that misstates facts can lead to a manual action. This is audit M18 with one more surface to check.
- **Fix:** the owner confirms the App Review status before deploying. If it is still in review, reword the visible answer, and with it the FAQPage, which reads the same `faqItems`.

### F11. Breadcrumb wording differs from the visible trail; `/pricing` has a trail only in data (Info, LOCAL, open)

- **Evidence:**
  - BreadcrumbList position 1 is "Linkar". The visible trail on the hubs and detail pages reads "Home / Features" (`src/components/marketing/seo/sections/hero/shared.tsx:33-47`).
  - `/pricing` has a BreadcrumbList but no visible breadcrumb.
- **Fix:** none needed for validity. Optionally rename position 1 to "Home", or the visible crumb to "Linkar", so the two agree.

### F12. Homepage FAQPage: keep it, add no more (Info, LOCAL, open)

- **Evidence:** it is valid, and 9 of 9 questions and answers match the visible FAQ (`crosscheck.txt`).
- Google limits FAQ rich results to government and health sites, so it gives no rich result here. Keep it for AI parsers and citations.
- Do not add FAQPage to the 64 guides or to `/pricing` for Google.

### F13. ImageObject has no licence or credit metadata (Info, LOCAL, owner-action)

- **Evidence:** 67 of 67 `primaryImageOfPage` nodes lack `creditText`, `creator`, `copyrightNotice`, `license` and `acquireLicensePage`. `src/lib/seo-hero-assets.ts` stores no source or credit.
- **Fix:** these fields only add Google Images' "Licensable" badge. Add them only if the owner knows the real source and licence of each hero photo. Never guess.

### F14. G1 schema fixes verified (Info, LOCAL, already-fixed-locally)

- **Evidence:** see "What G1 fixed" above. Audit items M4 and L6 (the `primaryImageOfPage` part) are done in the LOCAL build:
  - Schema.org validator: 0 errors on 8 templates;
  - production prerender identical to dev;
  - 0 hidden blocks.
- **Fix:** deploy. No further repo change is needed for these items.

## Not recommended

- **HowTo:** retired from rich results in September 2023. Do not add it to the recipe templates or the step sections.
- **New FAQPage for Google:** see F12.
- **`aggregateRating` or `review` without genuine, displayed reviews:** see F1.
- **`SearchAction` (sitelinks search box):** retired by Google, and the site has no search.
- **Microdata or RDFa:** none exists, and JSON-LD is correct. Keep it JSON-LD only, rendered on the server. It already is: the JSON-LD is in the prerendered HTML.

## Generated code

Ready-to-adapt JSON-LD is in `scratchpad/seo-run/schema/generated-schema.json`:
- the typed WebSite stub;
- the SoftwareApplication additions, including the annual Offer;
- the homepage WebPage node;
- ContactPage plus BreadcrumbList;
- the Organization owner inputs, marked `<LIKE THIS>`.

## Summary for the synthesiser

- **LOCAL:** schema is now strong. It parses everywhere, validates with 0 errors, the entities are linked, the offers are complete, and it matches what each page shows. The one Google-required property missing is a genuine rating (F1, owner). The remaining repo work is small and Low priority:
  - typed `isPartOf` (F3);
  - hub names (F4);
  - bump `dateModified` at deploy (F5);
  - optional properties and annual offers (F6, F7);
  - homepage WebPage, contact and support pages (F8).
- **LIVE:** stays at 55 until the deploy. Every LIVE schema gap is already fixed locally (F2).
