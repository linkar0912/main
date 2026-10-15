# Comparison pages: build plan (for owner review, not built in this run)

The page copy is in `drafts/linkar-vs-manychat.md` and `drafts/manychat-alternatives-india.md`. Facts and sources are in `sources.md`. Structured data is in `comparison-schema.json`.

## Where the pages live

| Path | Page | Primary keyword |
|---|---|---|
| `/compare` | Hub: one card per comparison, short intro, the disclosure line | manychat alternative, compare instagram automation tools |
| `/compare/manychat` | Linkar vs Manychat | linkar vs manychat, manychat india pricing |
| `/compare/manychat-alternatives` | Manychat alternatives in India | manychat alternative india |

`/compare/<slug>` keeps the same shape as the existing `/features`, `/solutions` and `/templates` collections, so the hub, breadcrumb and sitemap code can follow the same pattern.

## Data model

Keep competitor facts out of the page copy, in one typed file, so every number has a source and a date and can be checked by a test.

```ts
// src/content/compare/facts.ts (proposed)
export type SourcedFact = {
  value: string;          // exactly what the page shows, e.g. "$17 a month"
  sourceUrl: string;      // the vendor's own page
  checkedOn: string;      // ISO date, e.g. "2026-10-15"
};

export type Competitor = {
  slug: "manychat" | "instantdm" | "interakt" | "superprofile" | "zorcha";
  name: string;           // as the vendor writes it: "Manychat"
  site: string;
  facts: Record<string, SourcedFact>;
};
```

Linkar's own numbers must come from `src/lib/billing/catalog.ts` (prices and limits) and `prisma/seed.ts` or the entitlements service (which features each plan includes), never typed into copy, so a price change updates the comparison too.

## Page sections and word targets (Linkar vs Manychat)

| # | Section | Words | Notes |
|---|---|---|---|
| 1 | Hero: H1, two-line summary, disclosure, two buttons | 80 | Hero photo only |
| 2 | The short answer | 80 | Self-contained, quotable by AI answers |
| 3 | At a glance table | 120 | 10 rows |
| 4 | Pricing side by side: two tables, meter explainer, worked examples | 450 | Show "Prices checked <date>" right under the tables |
| 5 | Free plans compared | 170 | |
| 6 | Features compared table | 250 | "Not stated on the pages we checked" where the vendor is silent |
| 7 | Where Manychat is the better fit | 170 | Required for fairness |
| 8 | Where Linkar is the better fit | 130 | |
| 9 | Moving from Manychat | 140 | Says plainly that Linkar does not import flows |
| 10 | Questions (6) | 260 | Visible accordion; no FAQPage markup |
| 11 | How we compared, sources, trademark note | 120 | Links to every source |
| 12 | Closing call to action | 30 | |

The alternatives page follows the same idea: method, at-a-glance table, one section per tool (best for, free plan, paid plans, what it does, good to know, source), a "which one should you pick" list, why people switch, switching steps, questions, method and sources.

## Calls to action

- Above the fold: "Start free" and "See Linkar pricing".
- After the pricing tables: "Start free".
- Bottom: "Start free", "Compare all Manychat alternatives".
- No buttons inside competitor sections of the alternatives page (the skill's advice: aggressive CTAs there reduce trust).

## Trust signals to show

- "Prices checked 15 October 2026" under each price table and in the footer of the page, rendered from `checkedOn`.
- "Linkar is our product" in the hero.
- A "How we compared" section with every source link.
- No star ratings, review counts, testimonials or customer names (none are verified for Linkar).
- Use only Meta wording the owner confirms (see the report finding on "Approved by Meta").

## Internal links

- Footer: a "Compare" column with both pages (`src/components/marketing/marketing-footer.tsx`).
- `/pricing`: a quiet "How Linkar compares with Manychat" link under the plan comparison table (`src/components/marketing/pricing-page.tsx`).
- Feature pages that match comparison rows link to the comparison: comment to DM, follow gate, email capture, human handoff, Facebook comment replies.
- `/llms.txt`: add a "Comparisons" section (`app/llms.txt/route.ts`).
- Sitemap: add the hub and both pages with `lastModified` from the newest `checkedOn` (`app/sitemap.ts`).
- Analytics: add `/compare` paths to `ANALYTICS_PAGE_PATHS` (`src/lib/analytics-path.ts`).

## Tests to add with the build

1. Every competitor fact has a `sourceUrl` on the vendor's own domain and a `checkedOn` date.
2. A test fails when any `checkedOn` is older than 100 days, so a stale price cannot sit on the site for more than a quarter unnoticed.
3. Linkar prices on the page equal `BILLING_PLANS` and `FREE_BILLING_PLAN`.
4. The page copy passes `pnpm check:copy` and contains no em dash.
5. The rendered page has no `AggregateRating`, no competitor `Offer` and no `FAQPage` in its JSON-LD.
6. The existing "only the hero photo" image test in `seo-page.test.tsx` also covers `/compare` pages.

## Before publishing

- Owner answers every `[OWNER CHECK]` in the drafts.
- Re-read every source link on the day of launch and update `checkedOn`.
- Reword the pricing headings that match Manychat's (see report) so the side-by-side page does not invite a copy comparison.
- Confirm the Meta claim wording.
- Decide whether to name Indian companies as Indian. The drafts only do so where the vendor's own page says it (Zorcha), and otherwise give the company name the site states.
