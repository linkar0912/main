# Programmatic SEO audit: Linkar SEO catalogue (64 detail pages + 3 hubs)

Skill: `seo-programmatic` (v1.9.0). Audit date: 15 Oct 2026. Read-only: no repo edits, no Search Console changes.

**Targets**
- **LOCAL** (http://localhost:3000, not deployed): `/features` (20), `/solutions` (20), `/templates` (24), the 3 hubs, `/llms.txt`, `/templates/<slug>/recipe`.
- **LIVE** (https://linkar.in): none of the catalogue is deployed. `/features`, `/solutions`, `/templates`, `/features/instagram-comment-to-dm` and `/llms.txt` all return 404. The live sitemap lists 12 URLs and the live homepage has 0 links to the catalogue paths, so no broken links have leaked.

---

## Programmatic SEO Score: 65/100

### Assessment summary

| Category | Status | Score |
|---|---|---|
| Data Quality | Pass with warnings | 75/100 |
| Template Uniqueness | Fail (below the 40% gate) | 50/100 |
| URL Structure | Pass | 85/100 |
| Internal Linking | Pass with warnings | 72/100 |
| Thin Content Risk | Fail (quality gate triggered) | 45/100 |
| Index Management | Warning | 65/100 |

**Quality gate status (skill rules)**
- Pages without content review: 64, under the 100-page WARNING gate. The pages are hand-written records, not generated from a feed.
- Word count: every page passes. Rendered pages run 1,260 to 1,655 words; the editorial fields per record run 311 to 414 words.
- **Unique content below 40%: triggered on 56 of 64 pages** (5-word shingle measure).
- **Unique content below 30% (HARD STOP the skill recommends): triggered on 3 pages**, all templates.

The skill requires the owner to acknowledge both triggered gates before these pages are published. This report does not give that approval; the user has to.

---

## Method

1. Fetched all 67 catalogue URLs from the local sitemap (`/sitemap.xml` returns 79 URLs: 12 core pages, 3 hubs and 64 detail pages) and saved the rendered dev HTML.
2. Took the text of `main#main-content` and removed `<nav>` landmarks (breadcrumb, the on-page section nav and the pager), `<script>` and `<style>`. The site header and footer sit outside `<main>`, so they were excluded too. Per the skill, template boilerplate inside `<main>` was **included**: shared FAQs, CTA blocks, code-drawn UI labels and related cards.
3. **Uniqueness** = the share of a page's 5-word shingles that appear on no other page in the 64-page set. The report also gives two word-level bounds:
   - strict: a word counts as unique only when no shingle covering it appears elsewhere;
   - lenient: a word counts as unique when any shingle covering it is unique.
4. Pairwise near-duplicate check: Jaccard similarity of shingle sets for all 2,016 pairs.
5. Source data: dumped `seoPages` and `topicGuides` with `tsx` to count each record's editorial words and to analyse the `related` link graph.
6. HTTP checks with `curl` against local and live, plus Search Console URL Inspection (read-only) on 3 catalogue URLs.

Working files are in `scratchpad/seo-run/prog/`: `analyze.py`, `buckets.py`, `simulate.py`, `uniqueness.csv` (one row per page) and `analysis.json`.

---

## Key measurements

### Uniqueness across the set (64 detail pages)

| Measure | Min | Median | Mean | Max | Pages < 40% | Pages < 30% |
|---|---|---|---|---|---|---|
| Unique 5-word shingles (primary) | 26.9% | 35.0% | 35.9% | 49.1% | **56** | **3** |
| Unique words, strict bound | 19.9% | 25.9% | 26.9% | 41.1% | 62 | 52 |
| Unique words, lenient bound | 33.6% | 43.4% | 43.9% | 56.1% | 10 | 0 |
| Unique prose blocks (p, li, headings) | 26.6% | 36.4% | 36.4% | 47.4% | 55 | 3 |

**By collection (primary measure):**
- features: 38.5% mean, 1,474 words;
- solutions: 36.8% mean, 1,414 words;
- templates: 32.9% mean, 1,415 words.

**Lowest 10:**

| Page | Unique |
|---|---|
| /templates/reel-shopping-link | 26.9 |
| /templates/dm-shipping-faq | 27.9 |
| /templates/webinar-registration | 29.1 |
| /templates/follow-gated-freebie | 30.1 |
| /templates/facebook-opening-hours | 30.5 |
| /templates/first-message-welcome | 31.5 |
| /templates/comment-guide-delivery | 31.5 |
| /templates/facebook-product-faq | 31.6 |
| /solutions/photographers | 31.8 |
| /templates/email-resource-delivery | 31.8 |

**Highest:**

| Page | Unique |
|---|---|
| /features/instagram-reply-ab-testing | 49.1 |
| /features/no-code-instagram-flow-builder | 48.2 |
| /solutions/social-media-agencies | 45.4 |
| /features/instagram-automation-analytics | 45.4 |

**Near duplicates:** none. The highest pairwise Jaccard is 34.0% (`/features/instagram-human-handoff` and `/templates/support-handoff`), and the mean across all pairs is 12.5%. No pair reaches the skill's 80% near-duplicate line. The problem is not that pages copy each other; it is **how much shared template text each page carries**.

### Where the shared text comes from

Share of all words in the set, grouped by how many pages carry the passage:

| Shared by | Share of words |
|---|---|
| This page only | 43.9% |
| 2 to 3 pages (mostly related-card blurbs, which repeat other pages' meta descriptions) | 11.5% |
| 4 to 12 pages (topic-level copy) | 16.6% |
| 13 to 40 pages | 13.4% |
| 41 to 64 pages (sitewide) | 14.7% |

**Editorial fields** are the per-record content: intro, benefits, steps, example, tip and the page's own FAQ. They average **363 words per page out of about 1,433 rendered words, roughly 25%**. Everything else is drawn from topic pools, sitewide copy and UI labels.

The biggest repeated prose blocks (pages x words):
- 64 x 39: the "Do I need to write code?" answer;
- 64 x 34: the "Can I try Linkar for free?" answer;
- 57 x 32: the "Which account do I need?" answer;
- 64 x 22: the CTA sub line;
- 16 x about 100: the "Campaign notes" topic guide for the `messages` and `leads` topics;
- 26 x about 75: the "Where this works" channels block;
- 34 x 19: the FAQ sub line;
- 40 x 14: the steps intro.

**Headings:** only 105 of 608 detail-page H2s (17%) are unique to their page. Three H2s appear on all 64 pages:
- "Questions, answered."
- "Keep exploring."
- "Write it once. Keep the conversation moving."

### Simulation: what removing shared blocks would do

`simulate.py` drops repeated prose blocks and measures again. Replacing them with page-specific text instead of deleting them would score even higher.

| Change | Mean unique | Median | Pages < 40% | Pages < 30% |
|---|---|---|---|---|
| Today | 35.9% | 35.0% | 56 | 3 |
| Remove or personalise blocks found on 40+ pages | 44.6% | 43.5% | 9 | 0 |
| Also blocks found on 16+ pages | 52.1% | 52.0% | 1 | 0 |
| Also blocks found on 8+ pages | 56.2% | 55.3% | 0 | 0 |

### Internal link graph
- **Hubs:** each hub links all of its spokes, grouped by topic (20/20/24). Every detail page links back through the breadcrumb, the "Browse all ..." link and BreadcrumbList schema.
- **Related links:** 3 hand-curated per page, 192 in total. All targets resolve; 132 of 192 share a topic and 118 of 192 are reciprocal.
- **Related in-degree** (how many pages link to a page as a related guide):

| Related in-links | Pages |
|---|---|
| 0 | 6 |
| 1 | 8 |
| 2 | 14 |
| 3 | 16 |
| 4 | 5 |
| 5 | 7 |
| 6 | 4 |
| 7 | 3 |
| 8 | 1 |

- **Pages with zero related in-links:**
  - `/features/no-code-instagram-flow-builder`
  - `/solutions/podcasters`
  - `/solutions/fitness-coaches`
  - `/solutions/fashion-brands`
  - `/solutions/real-estate-teams`
  - `/solutions/travel-creators`
- **Related links received by each collection:**
  - features: 82;
  - templates: 75;
  - solutions: 35, of which only 5 come from other solution pages.
- **Pager:** previous and next within each collection, wrapping at both ends.
- **Sitewide footer directory:** 90 links, including all 64 detail pages, on every page (home, pricing, legal and the catalogue). Every detail page is one click from the homepage.

### URL and indexing hygiene (local)

**URLs:**

| Check | Result |
|---|---|
| Trailing slash (`/features/instagram-comment-to-dm/`) | 308 to the clean URL |
| Uppercase variants | 404 |
| Unknown slugs and cross-collection slugs (`/solutions/instagram-dm-automation`) | 404, because `dynamicParams = false` |
| `?utm_source=x` | canonical stays `https://linkar.in/features/instagram-comment-to-dm` |
| Longest URL | 60 characters |
| Duplicate slugs | none |
| Query-parameter content URLs | none |

**Recipe downloads (`/templates/<slug>/recipe`):**
- each returns `x-robots-tag: noindex`;
- robots.txt does not block them, so crawlers can see the noindex;
- they are excluded from the sitemap.

**Search Console:** URL Inspection on `https://linkar.in/features`, `/features/instagram-comment-to-dm` and `/templates/comment-guide-delivery` returns "URL is unknown to Google" for all three, with no referring URLs and no crawl. Launch starts from a clean slate with no 404 history.

---

## Critical issues (fix before publishing)

### C1. Three template pages fall below the 30% unique-content hard stop
- **Target:** local.
- **Evidence:** primary measure on rendered `main` text:
  - `/templates/reel-shopping-link` 26.9%;
  - `/templates/dm-shipping-faq` 27.9%;
  - `/templates/webinar-registration` 29.1%.

  Strict word bound: 20.8%, 21.5% and 21.1%. Full table in `prog/uniqueness.csv`.
- **Why it matters:** the skill's gate recommends a HARD STOP below 30%, because pages that are mostly shared template text are the pattern Google's scaled content abuse policy targets.
- **Recommendation:** hold these three pages, through the wave flag in H4 or by leaving them out of the first deploy, until they pass 40%. The fastest lifts are H2 and M2:
  - replace the three generic FAQs with page-specific ones;
  - replace the shared "Campaign notes" text with a page-specific note.

  Each template should also show what only it has: the full sample message set, with variants for a second keyword, an unrelated message and an exception reply. Run `prog/simulate.py` (or the CI check in M1) again to confirm.
- **Files:**
  - `src/content/seo/templates.ts`
  - `src/components/marketing/seo/sections/faq/copy.tsx`
  - `src/content/seo/index.ts`

---

## High priority (fix before the first deploy)

### H1. 56 of 64 pages are below the 40% unique-content gate
- **Target:** local.
- **Evidence:**
  - Mean 35.9%, median 35.0%.
  - Strict bound mean 26.9%, lenient bound 43.9%.
  - Editorial fields average 363 words of about 1,433 rendered words.
  - Words carried on 41 to 64 pages make up 14.7% of the set; topic-level copy (4 to 12 pages) makes up 16.6%.
- **Why it matters:** the skill flags pages under 40% unique as thin content (likely penalty risk), and lists "pages where >60% of content is shared template boilerplate" as a penalty-risk pattern. The pages are long and well written; the ratio is low because each page carries about 900 words of shared copy.
- **Recommendation:** treat "at least 40% on every page, at least 50% mean" as the launch bar. The simulation shows that personalising blocks found on 40+ pages raises the mean to 44.6% and leaves 9 pages under 40%. Adding blocks found on 16+ pages raises it to 52.1% with 1 page left. In order of payoff:
  1. Page-specific FAQs (H2).
  2. Page-specific campaign notes, or move the topic guide to the hub (M2).
  3. Show the channels block ("Where this works") and the "What you need to start" checklist only where they add page-specific facts. Otherwise keep them on the hubs.
  4. Cut the steps intro shared by 40 pages ("Start with one clear request...") and the FAQ sub line shared by 34 pages, or generate them from page data.
- **Files:**
  - `src/components/marketing/seo/sections/faq/copy.tsx`
  - `src/content/seo/index.ts` (`topicGuides`, line 73)
  - `src/components/marketing/seo/sections/extras/channels.tsx`
  - `src/components/marketing/seo/sections/extras/checklist.tsx`
  - `src/components/marketing/seo/sections/steps/copy.ts`

### H2. Three of four FAQ items are identical on all 64 pages
- **Target:** local.
- **Evidence:** `faqItems(page)` returns `[page.faq, ...genericQuestions(page)]` (`sections/faq/copy.tsx` lines 23 to 37). The rendered answers repeat word for word:
  - "Do I need to write code?": 64 pages;
  - "Can I try Linkar for free?": 64 pages;
  - "Which account do I need?": 57 pages, plus a Facebook variant on 7.

  Together that is about 120 words per page, and it is the largest single block of sitewide text.
- **Recommendation:**
  - Change the record type from `faq: ContentBlock` to `faqs: readonly ContentBlock[]` and require at least 3 page-specific questions. Good sources are the real objections for that use case, for example "Can I send different links for different Reels?" or "What happens if someone comments twice?".
  - Keep at most one generic question per page, and rotate which one.
  - Keep the account, free plan and no-code answers on the hubs, `/pricing` and the homepage FAQ.
  - Do not add FAQPage schema for Google rich results (commercial site). Visible Q&A still helps AI citation.
- **Files:**
  - `src/content/seo/types.ts`
  - `src/content/seo/features.ts`
  - `src/content/seo/solutions.ts`
  - `src/content/seo/templates.ts`
  - `src/components/marketing/seo/sections/faq/copy.tsx`

### H3. No detail or hub H1 contains the page's target phrase
- **Target:** local.
- **Evidence:**
  - Every hero renders `<HeroTitle text={page.headline} />`: `sections/hero/split.tsx:19`, `fullbleed.tsx:27`, `centered.tsx:19`, and `hub.tsx:44` for hubs.
  - 0 of 64 H1s contain the page `label`, and 0 of 64 mention "Instagram" or "Facebook". Examples:
    - `/features/instagram-comment-to-dm`: "A comment starts it. Your reply keeps it going.";
    - `/features/instagram-link-tracking`: "See what happened after you sent the link.";
    - `/features`: "Make every next reply a useful one.".
  - The label shows only as the current breadcrumb pill inside `<nav aria-label="Breadcrumb">` (`sections/hero/shared.tsx` lines 33 to 50) and in `<title>`.
- **Why it matters:** this is a template-level binding, so it weakens the main on-page relevance signal on all 67 pages at once. The slogan H1s also add to the sameness, since they carry no topic nouns.
- **Recommendation:** put the label inside the H1 without changing the look:

  ```tsx
  <h1 id="seo-title"><span className={styles.crumbPill}>{page.label}</span> {headline}</h1>
  ```

  Drop the current-page crumb from the visible breadcrumb so the label is not shown twice; keep it in BreadcrumbList. The alternative is to render the label as the H1 and the headline as a large `<p>`. For hubs, put "Instagram and Facebook automation features", "Instagram automation for creators and businesses" and "Instagram and Facebook automation templates" into the H1.
- **Files:**
  - `src/components/marketing/seo/sections/hero/shared.tsx`
  - `src/components/marketing/seo/sections/hero/split.tsx`
  - `src/components/marketing/seo/sections/hero/fullbleed.tsx`
  - `src/components/marketing/seo/sections/hero/centered.tsx`
  - `src/components/marketing/seo/sections/hero/hub.tsx`

### H4. No staged rollout: one deploy publishes all 67 URLs to a domain whose homepage is not yet indexed
- **Target:** both.
- **Evidence:**
  - **Live state** (brief and GSC):
    - homepage "Crawled, currently not indexed";
    - 0 impressions in 28 days;
    - no sitemap submitted;
    - all 3 sampled catalogue URLs "unknown to Google";
    - Bing Webmaster records 0 inbound links (brief, 15 Oct);
    - GA4 shows 0 organic sessions.
  - **Local build:** everything is driven by `seoPages`. `app/sitemap.ts` lines 31 to 42 add all 67 at once with a single lastmod, and the sitewide footer (`marketing-footer.tsx` lines 55 to 77) links all 64 from every page. The data has no field that can hold a page or a collection back.
- **Why it matters:** the skill's batch size (50 to 100) technically allows 67 pages in one go. On a brand-new domain with no indexed pages, though, the first pages Google evaluates shape how the whole site is judged, and templates (the least unique collection) make up 24 of the 64.
- **Recommendation:**
  - Add a `launch` (wave) field to each record, or a per-collection flag in `seoCollections`. Filter it inside `seoPages`, so routes (`generateStaticParams`), hubs, footer, related links, pager, sitemap, `llms.txt` and analytics paths all follow from one switch. `getRelatedSeoPages` already drops missing targets.
  - Roll out in this order (full plan in the Rollout plan section below):
    - Wave 1: `/features` and its 20 pages.
    - Wave 2: `/solutions` and its 20 pages.
    - Wave 3: `/templates` and its 24 pages, once H1 to H3 pass.
  - Holding pages back entirely is cleaner than shipping them `noindex`: noindexed URLs get crawled less, which slows the later flip.
- **Files:**
  - `src/content/seo/index.ts`
  - `src/content/seo/types.ts`
  - `app/sitemap.ts`
  - `src/components/marketing/marketing-footer.tsx`
  - `app/llms.txt/route.ts`

---

## Medium priority (fix within a month, ideally before waves 2 and 3)

### M1. The CI uniqueness test measures editorial fields, not the rendered page
- **Target:** local.
- **Evidence:** `src/content/seo/seo-pages.test.ts` ("keeps substantive editorial content...") compares `editorialText(page)` with 8-word shingles, pairwise, under 40% overlap. It never looks at the shared FAQ, topic guide, CTA, extras or UI copy. That is why the test passes while the rendered pages average 35.9% unique.
- **Recommendation:** add a set-level check that builds each page's rendered text from the same copy functions the sections use:
  - `faqItems`
  - `topicGuides`
  - the extras, steps and CTA copy

  It should fail when any page's unique 5-gram share drops below 40% or the set mean drops below 50%. As a cheaper option, a script can render the pages with `react-dom/server` and reuse the logic in `prog/analyze.py`.
- **Files:** `src/content/seo/seo-pages.test.ts`

### M2. Topic-level copy repeats on up to 16 pages, and the topics are lopsided
- **Target:** local.
- **Evidence:**
  - `topicGuides` (`src/content/seo/index.ts` from line 73) renders the same 99 to 114 words as "Campaign notes" on every page in a topic.
  - Pages per topic:

    | Topic | Pages |
    |---|---|
    | messages | 16 |
    | leads | 16 |
    | comments | 11 |
    | facebook | 7 |
    | stories | 5 |
    | followers | 3 |
    | team | 3 |
    | insights | 3 |

  - Topic pools also drive many H2s, which is why only 17% of H2s are unique to a page. Examples: "The same questions arrive every day. Answer them consistently." (6 pages), "Copy the recipe, then make it fit." (5 pages).
- **Recommendation:**
  - Either replace the topic guide on detail pages with a page-specific `notes` field (2 short paragraphs), or move topic guides to the hubs, where they already fit the "Planning notes" section.
  - Split the two overloaded topics. For example, `messages` could become price and hours answers, welcome and menus, and follow-ups; `leads` could become email capture and enquiry intake. That way topic-pool copy repeats on 8 pages at most.
  - Generate section H2s from page data where possible.
- **Files:**
  - `src/content/seo/index.ts`
  - `src/content/seo/types.ts`
  - `src/components/marketing/seo/sections/notes/*`
  - `src/components/marketing/seo/sections/*/copy.ts`

### M3. No India-specific data in any of the 64 records
- **Target:** local.
- **Evidence:** a regex search across all editorial fields for `India|₹|rupee|INR|Hindi|UPI|Mumbai|Delhi|Bengaluru|Diwali` finds 0 of 64 records. Rupee prices appear only in the shared CTA and hero proof line. The goal in the brief is to win "Instagram automation" searches in India.
- **Why it matters:** India-specific facts are the most natural source of unique, useful text per page, and they set Linkar apart from US-centric competitors such as ManyChat. They also lift the uniqueness ratio.
- **Recommendation:** add optional data fields per record and render them in a dedicated section:
  - `localExample`: an Indian scenario such as a Diwali sale Reel, a coaching batch enquiry or a Mumbai cafe's opening hours;
  - `keywordVariants`: how Indian audiences actually type the request, for example "link pls", "price?", "LINK bhejo";
  - `planFit`: which real plan fits the use case, built only from catalog facts. Free covers 5 automations and 1,000 messages a month; Creator is ₹199 a month for 20 automations and 5,000 messages.

  No invented metrics, testimonials or customer names.
- **Files:**
  - `src/content/seo/types.ts`
  - `src/content/seo/features.ts`
  - `src/content/seo/solutions.ts`
  - `src/content/seo/templates.ts`

### M4. Related-link coverage is uneven, and 6 pages get no related in-links
- **Target:** local.
- **Evidence:**
  - From the `related` arrays: 6 pages have zero related in-links (listed above), and 8 have one.
  - Solutions receive 35 of 192 related links, against 82 for features and 75 for templates. Solution pages link to each other only 5 times.
  - `getRelatedSeoPages` (`src/content/seo/index.ts:22`) follows hand-curated arrays. The test only checks that each page has 3 outgoing links.
- **Recommendation:**
  - Add a test that every page receives at least 2 related in-links.
  - Add an automated block that complements the curated one. On feature pages, a "Who uses this" row could link 2 solution pages that share the topic or the example keyword. On solution pages, link 1 to 2 sibling audiences (podcasters to newsletter creators, fitness coaches to online coaches).
  - Give `/features/no-code-instagram-flow-builder` links from the DM automation and keyword pages.
- **Files:**
  - `src/content/seo/features.ts`
  - `src/content/seo/solutions.ts`
  - `src/content/seo/templates.ts`
  - `src/content/seo/index.ts`
  - `src/content/seo/seo-pages.test.ts`

### M5. Google Analytics will not load on any catalogue page
- **Target:** local.
- **Evidence:**
  - `ANALYTICS_PAGE_PATHS` (`src/lib/analytics-path.ts` lines 48 to 64) lists 16 exact paths and none of the 67 catalogue URLs.
  - `isAnalyticsPage` matches exact paths only.
  - The CSP rule that allows the GA tag is generated from the same list (`src/lib/security/headers.ts:121`).
- **Why it matters:** each rollout wave needs landing-page data (organic sessions, engagement, sign-up clicks) to decide on the next wave. Search Console covers impressions but not behaviour after the click.
- **Recommendation:**
  - Derive the list: `[...ANALYTICS_PAGE_PATHS, ...Object.keys(seoCollections).map((c) => `/${c}`), ...seoPages.map(seoPagePath)]`, filtered by the wave flag from H4.
  - Use the same derived list in `headers.ts`, so the CSP and the tag stay in step.
  - Keep `/templates/*/recipe` out.
- **Files:**
  - `src/lib/analytics-path.ts`
  - `src/lib/security/headers.ts`

### M6. One sitemap and one hard-coded lastmod for every catalogue URL
- **Target:** local.
- **Evidence:**
  - `SEO_CONTENT_UPDATED = "2026-10-13"` (`src/content/seo/types.ts:24`) sets `lastModified` for all 67 entries (`app/sitemap.ts` lines 33 and 39) and `dateModified` in every page's JSON-LD (`src/lib/seo-pages.ts`).
  - The 12 core pages have no lastmod.
  - `app/robots.ts:43` declares a single sitemap.
- **Why it matters:** the skill wants lastmod to reflect real data updates. A constant that changes for every page at once (or never) teaches Google to ignore it. A single sitemap also means Search Console cannot report indexing per collection.
- **Recommendation:**
  - Add `updated: "YYYY-MM-DD"` to each record and use it for both lastmod and `dateModified`.
  - Split the sitemap with nested metadata files: `app/features/sitemap.ts`, `app/solutions/sitemap.ts` and `app/templates/sitemap.ts`, served at `/features/sitemap.xml` and so on, per the Next 16 docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md`, "Generating multiple sitemaps".
  - Keep `app/sitemap.ts` for the core pages.
  - List all of them in `robots.ts` (`sitemap` accepts `string[]`).
  - Submit each one separately in Search Console, so the Page indexing report can be filtered by wave.
  - Check that `/features/sitemap.xml` is not caught by `[slug]`.
  - `changeFrequency` and `priority` can stay, but Google ignores them.
- **Files:**
  - `app/sitemap.ts`
  - `app/robots.ts`
  - `src/content/seo/types.ts`
  - `src/lib/seo-pages.ts`

### M7. Feature and template pairs, and the three Facebook features, may compete for the same queries
- **Target:** local.
- **Verdict:** plausible. SERP overlap is unverified because DataForSEO is not installed and GSC has no data.
- **Evidence:** the highest content similarity is between pairs that target near-identical intents:

  | Pair | Jaccard | Notes |
  |---|---|---|
  | `/features/instagram-human-handoff` and `/templates/support-handoff` | 34.0% | |
  | `/features/instagram-first-message-welcome` and `/templates/first-message-welcome` | 32.6% | |
  | `/features/instagram-story-reply-automation` and `/templates/story-offer-reply` | 30.5% | |
  | `/features/instagram-follow-gate` and `/templates/follow-gated-freebie` | 29.2% | |
  | `/features/instagram-email-capture` and `/templates/email-resource-delivery` | 28.9% | the template label is "Instagram email capture template" |
  | `/features/instagram-dm-follow-ups` and `/templates/offer-follow-up` | 28.9% | |

  There are also three Facebook feature pages: `facebook-comment-auto-reply`, `facebook-keyword-comment-replies` and `facebook-post-specific-replies`. They all describe public Page comment replies and are likely to share one SERP for "facebook comment auto reply".
- **Recommendation:**
  - Make template pages unmistakably template-intent: lead with the copyable message set and the download, and keep the capability explanation short with a link to the feature page.
  - Before wave 1, run a SERP-overlap check (`seo-cluster` or `seo-dataforseo` once installed) on these pairs. If 7 or more of the top 10 results match, merge them: fold the template into the feature as a "Template" section and 301 the template slug.
  - Consider one strong Facebook Page comment reply page with keyword and post-selection sections in place of three thinner ones.
- **Files:**
  - `src/content/seo/features.ts`
  - `src/content/seo/templates.ts`

---

## Low priority (backlog)

### L1. Slug conventions are inconsistent
- **Target:** local.
- **Evidence:**
  - The `instagram-` prefix is on 16 of 20 feature slugs, 0 of 20 solution slugs and 0 of 24 template slugs.
  - Some slugs do not match their labels:

    | Slug | Label |
    |---|---|
    | `real-estate-teams` | "Instagram automation for property enquiries" (`solutions.ts:170`) |
    | `event-organizers` | "Instagram automation for events" (`solutions.ts:159`) |
    | `no-code-instagram-flow-builder` | "No code Instagram automation builder" (`features.ts:170`) |
    | `newsletter-creators` | "newsletters" |
    | `ecommerce-brands` | "ecommerce" |

- **Recommendation:** Google does not know these URLs yet (GSC "unknown"), so changing a slug costs nothing today. After launch, each change needs a 301. Pick one rule now, such as "slug = the label's query words, minus the brand", and align the outliers. Keep `/templates` as the path even though the UI says "Workflow recipes", because "template" is the search term.
- **Files:**
  - `src/content/seo/features.ts`
  - `src/content/seo/solutions.ts`
  - `src/content/seo/templates.ts`

### L2. Mad-libs strings and hard-coded counts in templates
- **Target:** local.
- **Evidence:**
  - `sections/related/copy.ts` lines 19 to 23 produce "Three guides and recipes picked to go with {label}." on all 64 pages.
  - The Facebook answer in `genericQuestions` (`sections/faq/copy.tsx` lines 25 to 27) says "These recipes use supported public Page comment replies" on the 3 Facebook **feature** pages too.
  - The templates hub description hard-codes "Browse 24 ..." (`src/content/seo/index.ts:63`), which will be wrong as soon as waves or merges change the count.
- **Recommendation:**
  - Write the related intro per collection, or drop it.
  - Make the Facebook answer collection-aware.
  - Build the count from `getSeoPages("templates").length`.
- **Files:**
  - `src/components/marketing/seo/sections/related/copy.ts`
  - `src/components/marketing/seo/sections/faq/copy.tsx`
  - `src/content/seo/index.ts`

### L3. Anchor text repeats, and the footer directory is heavy
- **Target:** local.
- **Evidence:**
  - Related cards always use the full label: "Instagram automation human handoff" is the anchor for all 8 related links to that page.
  - The channels extra repeats "Learn more about Facebook Page comment replies" to `/features/facebook-comment-auto-reply` on 26 pages.
  - The footer has 90 links, including all 64 detail pages, on every page, legal pages included. It does use shorter labels, which adds some variety.
- **Recommendation:**
  - Add an optional `anchor` alternative per record and rotate it in related cards.
  - Leave the footer directory as it is at 64 pages, but limit it to hubs plus about 6 headline features if the catalogue grows past about 100 pages.
- **Files:**
  - `src/components/marketing/seo/sections/related/*`
  - `src/components/marketing/seo/sections/extras/channels.tsx`
  - `src/components/marketing/marketing-footer.tsx`

### L4. `llms.txt` lists the 3 hubs but none of the 64 guides
- **Target:** local.
- **Evidence:** `app/llms.txt/route.ts` lines 21 to 29. The local `/llms.txt` output has no detail URLs.
- **Recommendation:** generate a "## Guides" section from `seoPages`, filtered by the wave flag, with `- [label](url): description` lines grouped by collection.
- **Files:** `app/llms.txt/route.ts`

---

## Info: what is already right (keep it)
- **URLs:** clean, lowercase, hyphenated and hierarchical (`/<collection>/<slug>`), all 60 characters or less. Trailing slashes 308 to the clean URL, uppercase and unknown slugs 404 (`dynamicParams = false`), and query strings do not change the canonical.
- **Canonicals:** every page and hub has a self-referencing canonical, plus unique titles, meta descriptions (120 to 165 characters, enforced by tests), headlines and hero photos (67 distinct files, hash-checked by tests).
- **Structured data:** WebPage plus BreadcrumbList on detail pages, and CollectionPage with ItemList plus BreadcrumbList on hubs. No HowTo, FAQPage or review markup, and a test enforces that.
- **Recipe downloads:** noindexed by header, crawlable so the noindex is seen, and kept out of the sitemap. No faceted or paginated URLs exist, so the index-bloat surface is small and limited to these 67 URLs.
- **Data quality:**
  - All records are complete.
  - Prices come from the billing catalog (`src/components/marketing/seo/sections/cta/copy.ts`), so they cannot drift from `/pricing`.
  - Editorial overlap between records is under 40% (8-gram, tested), and no pair of pages exceeds 34% Jaccard.
- **Layout:** sections are assigned per page by a seeded PRNG (`src/components/marketing/seo/seo-layout.ts`), so pages do not look alike, although Google judges sameness mostly on text.
- **Search Console:** a clean slate. Sampled catalogue URLs are unknown to Google, and live links nothing to the undeployed paths.

---

## Rollout plan (sitemap and indexing order)

Ground rules:
- Do not use the Indexing API. It covers JobPosting and livestream pages only, and the service account is not authorised.
- Search Console's "Request indexing" button is manual and limited to a few URLs a day, so save it for hubs and the top pages.

**Step 0. Prerequisites (live, now)**
1. Submit the existing `https://linkar.in/sitemap.xml` in Search Console (the user does this). Then request indexing for the homepage, which is "Crawled, currently not indexed" (homepage fixes belong to the other skills' reports).
2. Bing already has linkar.in, and its sitemap (12 URLs) is submitted and fetched (per the updated brief). When the per-collection sitemaps ship, submit each one in Bing as well; Bing also reads the robots.txt `Sitemap:` lines. Optionally add IndexNow for Bing and Yandex.

**Step 1. Before the first deploy (local)**
1. Fix H1 to H3: page FAQs, label in the H1, and the shared-block cuts. Rerun the measurement and require at least 40% on every page and at least 50% mean (M1 makes this a CI gate).
2. Add the wave flag (H4), the per-record `updated` date and per-collection sitemaps (M6), and catalogue paths in analytics (M5).

**Wave 1 (week 0): `/features` hub and its 20 pages**
- Why first:
  - highest uniqueness of the three collections (38.5% mean, top pages 43 to 49%);
  - closest match to the head query family: comment to DM, DM automation, keyword auto replies, Story replies;
  - the header "Product" link already points to `/features`.
- Submit `/features/sitemap.xml` in Search Console.
- Request indexing manually for `/features` and the 3 to 5 most commercial feature pages:
  - `instagram-comment-to-dm`
  - `instagram-dm-automation`
  - `instagram-keyword-replies`
  - `instagram-story-reply-automation`
  - `instagram-follow-gate`
- Monitor for 2 to 4 weeks:
  - Page indexing filtered to the features sitemap;
  - the count of "Crawled, currently not indexed" versus "Indexed";
  - first impressions in Search Analytics;
  - organic landings in GA4.

**Wave 2 (about week 3 to 4, if wave 1 is mostly indexed and no "crawled, not indexed" cluster appears): `/solutions` hub and its 20 pages**
- First complete M4 (in-links to the 5 orphaned solutions) and M3 (India-specific examples suit audience pages best).
- Submit `/solutions/sitemap.xml`.

**Wave 3 (about week 6 to 8): `/templates` hub and its 24 pages**
- Lowest uniqueness today (32.9% mean, including the 3 hard-stop pages).
- Ship only after C1 and M7 are resolved, so templates lead with template-intent content and do not duplicate their feature twins.
- Submit `/templates/sitemap.xml`. Recipe downloads stay noindex.

**Ongoing**
- Once a month, compare indexed counts per sitemap with the intended count (the skill's index-bloat audit).
- Bump `updated` only when a record's content really changes.
- Noindex or merge any page that is still "crawled, currently not indexed" after 8 weeks, rather than leaving it to drag on site quality.

If the owner prefers a single deploy, the skill's 50 to 100 batch size permits it. The minimum bar would then be every page at 40% or more unique, sitemaps submitted on deploy day, and analytics working on catalogue paths.

---

## Recommendations summary

**Data source improvements**
- Per-record fields:
  - `faqs` (3 or more);
  - `notes` in place of the shared topic guide;
  - `updated`;
  - `launch` (wave);
  - optional `localExample`, `keywordVariants`, `planFit` and `anchor`.
- Split the `messages` and `leads` topics so topic copy repeats on 8 pages at most.

**Template modifications**
- Label inside the H1.
- Drop or personalise sitewide blocks: generic FAQs, the steps intro, the FAQ sub line, and the channels and checklist extras where they add nothing page-specific.
- Make the related intro and the Facebook FAQ collection-aware.

**URL pattern adjustments**
- Align slugs with labels before launch (free now, 301s later).
- Add per-collection sitemaps.

**Quality gate compliance**
- Add a rendered-page uniqueness test in CI.
- Hold the 3 pages under 30%.
- Owner acknowledgment of the 40% warning before deploy.
- Launch in three waves with monitoring between them.
