# SEO competitor pages: Linkar vs Manychat and Manychat alternatives

- **Skill:** seo-competitor-pages (v1.9.0)
- **Run date:** 15 October 2026
- **Targets:** LIVE https://linkar.in and LOCAL http://localhost:3000 (dev build with the SEO catalogue)
- **Category score:** 17 / 100
- **Mode:** read-only. No repo files edited; nothing submitted to any account. Drafts are for owner review and are not to be shipped in this run.

## Summary

Neither the live site nor the local build has a comparison or alternatives page: `/compare`, `/compare/manychat`, `/alternatives` and `/vs/manychat` return 404 on both targets. Every competitor checked targets this intent already (Zorcha, InstantDM, CreatorFlow and LinkDM each publish a "vs Manychat" page; InstantDM and CreatorFlow also publish alternatives lists), and Google autocomplete for India shows specific demand such as "manychat alternative india", "manychat india pricing", "manychat indian alternative" and "manychat vs superprofile". I researched Manychat plus three Indian alternatives (Zorcha, SuperProfile, Interakt) and one INR-priced tool (InstantDM) from their own pages, and wrote two dated, sourced drafts that state where Manychat is the better choice. Two risks need the owner before any comparison page goes live. First, the live pricing page reuses three of Manychat's headings word for word. Second, live still shows an "Approved by Meta" badge that I could not verify.

## Deliverables (all in the run folder)

| File | What it is |
|---|---|
| `competitor-work/drafts/linkar-vs-manychat.md` | Draft page copy, about 1,900 words, with title, meta, H1, tables, FAQ, sources |
| `competitor-work/drafts/manychat-alternatives-india.md` | Draft page copy, about 1,970 words, five tools with INR pricing |
| `competitor-work/sources.md` | Fact sheet: every competitor and Linkar fact with source URL and check date |
| `competitor-work/comparison-schema.json` | Draft JSON-LD for both pages (valid JSON) |
| `competitor-work/COMPARISON-PAGE.md` | Build plan: routes, data model, section word targets, internal links, tests |
| `competitor-work/raw/` | Saved HTML and text of every page used as evidence, plus `autocomplete_in.txt` |

## Method and limits

- **Manychat** blocks command-line fetches (HTTP 403, Cloudflare). I read its live pages in a real Chrome session, where the check passed by itself without any clicks. I also cross-checked the Wayback Machine copy from 9 October 2026 (`https://web.archive.org/web/20261009114350/https://manychat.com/pricing`); the prices match. The only clicks were the "Monthly" billing toggle, the "Full Comparison Table" expander and one help-centre article link.
- **Indian alternatives:** plain HTTPS fetches of each vendor's India pricing page, plus a browser check for SuperProfile and Interakt (the Interakt monthly price only shows after the toggle).
- **Demand data:** Search Console shows 0 impressions for linkar.in, DataForSEO and Firecrawl are not installed, and WebSearch is US-only. I used Google autocomplete (`gl=in`) as a qualitative signal only. It shows that queries exist, not how many people search them. **I have no search volume or difficulty data.**
- **Not done:** no product testing of any competitor; no dollar-to-rupee conversion (exchange rates and tax change it).

## Competitor facts (summary; full table with sources in `sources.md`)

### Manychat (manychat.com/pricing, checked 15 Oct 2026)

| Plan | Monthly billing | Yearly (per month) | Active Contacts / month | Extra contact (monthly) | Users |
|---|---|---|---|---|---|
| Free | $0 | $0 | 25 | n/a | 1 |
| Essential | $17 | $14 | 250 | $0.10 | 2 |
| Pro | $39 | $29 | 2,500 | $0.05 | 3 |
| Business | $99 | $69 | 7,500 | $0.025 | 5 |
| Advanced | $199 | $139 | 25,000 | $0.004 | 10 |

- "Prices do not include tax. The price is determined by the user's billing country." The page showed US dollars in the browser session used.
- New plans started on 2 March 2026. Older accounts are moving to them country by country, so some accounts are still on legacy plans (Manychat help centre article 25800347122716).
- Free plan: two channels, up to 4 live triggers, Manychat branding. Contact capture and unlimited automations start on Essential. Broadcasts and Manychat AI start on Pro. WhatsApp, SMS and email start on Pro.
- 14-day trial on Essential or Pro; refund within 30 days of the first purchase; upgrades are prorated.

### Indian and INR-priced alternatives (own pages, checked 15 Oct 2026)

| Tool | Company per its site | Free plan | First paid plan (monthly) | GST |
|---|---|---|---|---|
| Zorcha | Zorcha Software Pvt Ltd; "made and registered in India" | Unlimited automations, DMs, contacts; Ask for Follow | Pro ₹1,199 (₹799/mo yearly) | Not stated; GST invoice available |
| SuperProfile | Cosmofeed Technologies Pvt. Ltd. | Unlimited AutoDMs on Reels and posts; ask to follow and email collection; 10 leads | Creator ₹99 first month, then ₹499 | Not stated |
| Interakt | Jio Haptik Technologies Limited | None shown (free trial) | Starter ₹999 + taxes, Instagram only | Added on top |
| InstantDM | Not stated | 500 DM automations/month; comment to DM only | Legend Pro ₹999 (₹833/mo yearly) | Not stated |

### Linkar (live /pricing and repo, checked 15 Oct 2026)

Free ₹0 (1,000 deliveries, 5 automations), Creator ₹199, Growth ₹499, Agency ₹999 a month, GST included, Razorpay with UPI, cards and netbanking. Sending stops at the limit and nothing extra is billed. Sources: `src/lib/billing/catalog.ts` lines 4-60, `prisma/seed.ts` lines 7-10, https://linkar.in/pricing.

Note for the orchestrator: the brief says pricing is "Free and Creator plans", but both live /pricing and the repo show four plans (Free, Creator, Growth, Agency). The drafts use all four.

## Competitor content landscape

| Page | Title | Words | Structured data | Date shown |
|---|---|---|---|---|
| https://zorcha.com/compare/manychat/ | Free Manychat Alternative: Zorcha vs Manychat (2026) | 1,747 | WebPage, BreadcrumbList, FAQPage | "Reviewed 28 September 2026" |
| https://instantdm.com/vs/manychat | InstantDM vs ManyChat: Which Instagram DM Tool Wins in 2026? | 2,145 | SoftwareApplication, AggregateRating, Offer, FAQPage | "Updated August 2026" |
| https://instantdm.com/blog/top-15-manychat-alternatives-for-instagram-automation-in-2026 | 15 Best ManyChat Alternatives for Instagram Automation (2026) | 7,730 | BlogPosting, SoftwareApplication, FAQPage | none found |
| https://creatorflow.so/vs/manychat | CreatorFlow vs ManyChat: $15 Flat vs Per-Contact Fees | 2,748 | Article, SoftwareApplication, FAQPage | "Last updated: April 2026" |
| https://creatorflow.so/alternatives | Best Instagram DM Automation Tools: Full Directory | 1,647 | ItemList, FAQPage | "Last updated: February 2026" |
| https://www.linkdm.com/compare/manychat | LinkDM vs Manychat | 416 | none | none |

What is missing from all of them, and where Linkar can be different:

1. **Rupee-first, GST-clear comparison.** Zorcha's vs page and InstantDM's pages compare in US dollars. None put GST-inclusive rupee prices beside Manychat's pre-tax dollar prices.
2. **An honest "where Manychat is better" section.** Zorcha has a short "Consider Manychat" block. Most others push one way.
3. **Explaining the two meters.** Linkar counts messages sent and stops at the limit. Manychat counts people and charges for extra ones. The draft explains both and works through two example months.
4. **Legacy plan caveat.** Only Zorcha mentions that older Manychat accounts may still be on legacy plans.

## Keyword strategy

**Primary**
- `/compare/manychat`: "linkar vs manychat" (brand comparison; little demand today, but this page also wins "manychat india pricing" and "manychat free plan limit")
- `/compare/manychat-alternatives`: "manychat alternative india"

**Secondary (from autocomplete, gl=in)**
- manychat alternatives, manychat alternative for instagram, manychat alternatives free
- manychat india pricing, manychat pricing plan india, manychat subscription india
- manychat indian alternative, indian manychat, manychat competitors in india
- manychat free alternative for instagram, free manychat alternative, is manychat free, manychat free plan limit

**Long tail and later pages**
- "manychat vs superprofile" and "manychat vs linkdm" appear in autocomplete. Linkar cannot rank a page about two other tools without looking like a review site, so answer them inside the alternatives page instead (SuperProfile has its own section). Consider `/compare/superprofile` and `/compare/zorcha` later, each with its own fact check.
- "instagram automation tool india" and the Hindi-English queries ("instagram automation tool kaise use kare") belong to the features hub and a future Hindi or Hinglish guide, not the comparison pages.

**Title and H1 drafts**
- Linkar vs Manychat (2026): INR Pricing, Features, Limits (56 characters) / H1 "Linkar vs Manychat for Instagram automation in India"
- 5 Manychat Alternatives in India With INR Pricing (2026) (56 characters) / H1 "Manychat alternatives in India, priced in rupees"

Drafts use Manychat's own spelling ("Manychat"), as on its pricing page and help centre. Search is not case-sensitive.

## Schema recommendations

- Reuse the existing pattern in `src/lib/seo-pages.ts` (WebPage with `about` SoftwareApplication, plus BreadcrumbList).
- Add `"@id": "<origin>/#software"` to the SoftwareApplication node in `app/page.tsx`, so the comparison pages can point at one Linkar entity. Its INR Offers are already built from the billing catalogue.
- Vs page: competitors appear only as `mentions` (name, url, category). Alternatives page: an `ItemList` with `ItemListUnordered`, because the list is not a ranking.
- Do **not** add Product with AggregateRating (the skill template suggests it). Linkar has no verified ratings, and marking up competitors' ratings or prices on our page would be inaccurate. InstantDM does this; we should not copy it.
- Keep the FAQ visible on the page for readers and AI answers, but do not add FAQPage markup for Google rich results on this commercial site.
- Draft JSON-LD: `competitor-work/comparison-schema.json`.

## Findings

### 1. HIGH: No comparison or alternatives pages exist on either target, while every competitor targets this intent (both)

- **Evidence:** `curl` returned 404 for http://localhost:3000/compare, /compare/manychat and /alternatives, and for https://linkar.in/compare and https://linkar.in/vs/manychat. The `app/` directory has no compare route, and `app/sitemap.ts` lists only the public pages and the three SEO collections. Competitors that already have these pages: zorcha.com/compare/manychat/ (and vs LinkDM, LinktoDM, CreatorFlow, Inrō, SuperProfile, InstantDM, Chatfuel), instantdm.com/vs/manychat, creatorflow.so/vs/manychat and /alternatives, linkdm.com/compare/manychat. Autocomplete (gl=in) shows "manychat alternative india", "manychat india pricing", "manychat indian alternative" and "manychat competitors in india".
- **Recommendation:** after the owner reviews them, build `/compare`, `/compare/manychat` and `/compare/manychat-alternatives` from the two drafts, following `competitor-work/COMPARISON-PAGE.md`. Ship them with the SEO catalogue deploy so they are crawlable from the start.
- **Files:** app/sitemap.ts, src/lib/seo-pages.ts, app/llms.txt/route.ts, src/components/marketing/marketing-footer.tsx, src/lib/analytics-path.ts

### 2. MEDIUM: The live pricing page reuses three Manychat headings word for word, and the brand doc describes the identity as a study of Manychat (both)

- **Evidence:** Linkar has "Pick your plan in 30 seconds" (`src/components/marketing/pricing-finder.tsx` line 145), "Where do people find you?" (line 36) and "Compare plans and pricing info" (`src/components/marketing/pricing-page.tsx` line 331). All three appear on https://linkar.in/pricing. Manychat's live pricing page (15 Oct 2026) has the identical headings "Pick your plan in 30 seconds", "Where do people find you?" and "Compare plans and pricing info". `docs/brand.md` lines 3-6 say the identity "is a direct study of ManyChat's real, live brand", and line 44 sets `--accent` `#fa0cf7` as "ManyChat's real CTA/interaction color".
- **Why it matters here:** a "Linkar vs Manychat" page sends readers to both sites side by side. Copied headings make Linkar look derivative and weaken the trust a fair comparison is meant to build. They may also raise a copying or passing-off question; that is for the owner and a lawyer to judge, not this audit.
- **Recommendation:** rewrite the three headings in Linkar's own voice before publishing any comparison page, for example "Find your plan", "Where do your conversations start?" and "Every plan, side by side". Update the matching assertions in `src/components/marketing/pricing-page.test.tsx`. Ask a lawyer whether any visual similarity also needs a look.
- **Files:** src/components/marketing/pricing-finder.tsx, src/components/marketing/pricing-page.tsx, src/components/marketing/pricing-page.test.tsx, docs/brand.md

### 3. MEDIUM: Live shows "Approved by Meta · Official Instagram API", which could not be verified and differs from the local wording (live)

- **Evidence:** the live HTML of https://linkar.in/pricing has a `meta-approved-badge` element with "Approved by Meta · Official Instagram API". The live /refund-policy footer shows the same text. The local repo no longer has that text (no match for "Approved by" in `src` or `app`) and uses "Meta Verified Business" and "Official Instagram API" lockups instead (`src/components/marketing/trust-lockups.tsx` lines 3-30). Project memory says Meta App Review was resubmitted on 30 September 2026 with status "Review in progress"; I could not check the current status, because the audit is read-only. On comparison pages these words sit next to Manychat's "Official Meta Business Partner" and LinkDM's "Meta Business Partner since 2021", so any overstatement would stand out.
- **Recommendation:** confirm the App Review result. Until it is confirmed, deploy the local lockup wording, and on comparison pages use only "connects through Meta's official Instagram API". Never write "Meta Business Partner" or "approved" unless Meta's records show it. The drafts mark this line `[OWNER CHECK]`.
- **Files:** src/components/marketing/trust-lockups.tsx

### 4. MEDIUM: Competitor facts go stale quickly, and the data shape to stop that does not exist yet (both)

- **Evidence:** Manychat moved to Active Contact pricing on 2 March 2026 and is moving older accounts country by country (help centre article 25800347122716). The price depends on billing country and excludes tax. Competitor pages show this drift: CreatorFlow's vs page says "Last updated: April 2026" and its alternatives directory "February 2026". The repo has a single content date (`SEO_CONTENT_UPDATED = "2026-10-13"` in `src/content/seo/types.ts`) and no per-fact source fields.
- **Recommendation:** store competitor facts in a typed file with `value`, `sourceUrl` and `checkedOn` for each fact (shape in `COMPARISON-PAGE.md`). Render "Prices checked <date>" under every table, and add a test that fails when any `checkedOn` is more than 100 days old. Take Linkar's own prices and limits from `src/lib/billing/catalog.ts` and the entitlements, never from typed copy.
- **Files:** src/content/seo/types.ts, src/lib/billing/catalog.ts, prisma/seed.ts

### 5. MEDIUM: A fair comparison must state Linkar's real limits; drafts that leave them out would mislead (both)

- **Evidence:** the repo itself says Linkar does not write AI replies (`src/content/seo/features.ts`, keyword replies FAQ: "No. These replies use the matching rules and messages you configure"). It does not DM on follow (instagram-dm-automation FAQ). Its Facebook support is public Page comment replies only, "not Messenger chatbots" (facebook-comment-auto-reply FAQ). There is no paid-plan trial and no refund for a started period, and plan changes take effect at the next cycle (https://linkar.in/refund-policy). Tracked links and sequences need Creator, and broadcasts and exports need Growth (`prisma/seed.ts` lines 7-10). Manychat offers AI on Pro, Messenger, WhatsApp, TikTok, Telegram, SMS and email, a 14-day trial and a 30-day refund window (manychat.com/pricing).
- **Recommendation:** keep the "Where Manychat is the better fit" section and the honest feature rows as drafted. Do not publish "cheaper than Manychat" as a blanket claim; show the two worked examples with their assumptions. Several Linkar free-plan claims (email capture, follow gate, handoff, reply variants on Free; no branding on messages) are inferred from the absence of a plan gate in `src/lib/entitlements/types.ts` lines 13-20. The owner must confirm them (`[OWNER CHECK]` markers).
- **Files:** src/content/seo/features.ts, src/lib/entitlements/types.ts, prisma/seed.ts

### 6. LOW: Use WebPage, BreadcrumbList and ItemList for comparison schema, not Product with AggregateRating (local)

- **Evidence:** the existing SEO pages emit WebPage, BreadcrumbList and an `about` SoftwareApplication (`src/lib/seo-pages.ts` lines 34-45). The homepage SoftwareApplication has INR Offers but no `@id` (`app/page.tsx` lines 53-70). InstantDM's comparison pages mark up AggregateRating and Offers for several products.
- **Recommendation:** use `comparison-schema.json`. It adds `@id` `#software` to the homepage node, uses `mentions` for Manychat, `ItemListUnordered` for the alternatives list, and Linkar Offers only. No AggregateRating, no competitor Offers, and no FAQPage for rich results.
- **Files:** src/lib/seo-pages.ts, app/page.tsx

### 7. LOW: Comparison pages need internal links, a sitemap entry, llms.txt and analytics paths (both)

- **Evidence:** the footer columns are Product, Resources, Company and Legal plus the SEO collections (`src/components/marketing/marketing-footer.tsx` lines 12-75). `app/llms.txt/route.ts` has Pages, Plans and Questions sections (lines 21-36). `ANALYTICS_PAGE_PATHS` starts at `src/lib/analytics-path.ts` line 48 and, per the brief, does not yet include the new SEO pages.
- **Recommendation:** add a "Compare" footer column, a "How Linkar compares with Manychat" link under the pricing comparison table, links from the matching feature pages, a "Comparisons" block in llms.txt, sitemap entries and analytics paths. Breadcrumb: Linkar > Compare > page.
- **Files:** src/components/marketing/marketing-footer.tsx, src/components/marketing/pricing-page.tsx, app/llms.txt/route.ts, app/sitemap.ts, src/lib/analytics-path.ts

### 8. INFO: No keyword volume or SERP data was available (live)

- **Evidence:** the brief records 0 Search Console impressions in 28 days. DataForSEO is not installed and WebSearch is US-only. Autocomplete output is in `competitor-work/raw/autocomplete_in.txt`.
- **Recommendation:** after launch, filter Search Console queries containing "manychat" by page and country (India) every month. If budget allows, add DataForSEO to measure volume and the Indian SERP for "manychat alternative india" before writing more vs pages.
- **Files:** none

### 9. INFO: Linkar's pricing offers real, checkable points for Indian buyers (both)

- **Evidence:** Linkar prices include GST, are paid by UPI, card or netbanking, and stop at the limit with no overage (https://linkar.in/pricing). Manychat's prices are in USD before tax and charge for extra Active Contacts (manychat.com/pricing). Interakt adds taxes. Zorcha, SuperProfile and InstantDM do not say on their pricing pages whether GST is included.
- **Recommendation:** lead both pages with these differences, which are true and easy to check, rather than with "cheapest" claims. Zorcha's free plan has no message cap, and the alternatives draft says so.
- **Files:** none

## Owner checks before publishing

1. Email capture, follow gate, human handoff and reply variants are available on the Free plan.
2. Linkar adds no branding to sent messages.
3. The Meta wording ("connects through Meta's official Instagram API") matches the App Review status.
4. Linkar never sees the Instagram password (the login runs on Meta's page). The FAQ answer relies on this.
5. Agree to publish named competitor facts with links, and to review them every quarter.
6. Reword the three pricing headings shared with Manychat (finding 2).

## Score rationale (17 / 100)

| Area | Points | Why |
|---|---|---|
| Comparison intent covered (vs and alternatives pages) | 0 / 40 | None on live or local |
| Facts ready to support claims | 10 / 15 | Prices and limits are typed in the catalogue; the feature catalogue states limits honestly |
| Trust and fairness readiness | 3 / 15 | A content date exists; Meta claim and copied headings are open risks |
| Internal linking slot | 0 / 10 | No compare section in footer, pricing or llms.txt |
| Schema readiness | 4 / 10 | WebPage and BreadcrumbList pattern ready; no shared `@id` for the app |
| Demand data | 0 / 10 | No volume or SERP data available |
