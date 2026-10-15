# seo-content: content quality, E-E-A-T and AI citation readiness

**Run:** 15 October 2026, re-run after work groups G1 to G6 (audit section 11).
**Targets:** LIVE = https://linkar.in (home and `/pricing`, re-fetched today). LOCAL = http://localhost:3000 (all 79 sitemap URLs re-fetched today from the restarted dev server, all 200).
**Skill:** `~/.claude/skills/seo-content/SKILL.md` plus `~/.claude/agents/seo-content.md` (E-E-A-T weights 20 / 25 / 25 / 30).
**Read-only:** no repo edits, no account changes. Evidence files are listed at the end.

Known findings from `docs/seo/audit-2026-10-15.md` sections 1 to 8 are referenced by their IDs (C2, H2, H3, M7, M8, M13, M14, M18, L8, L12, L13) and are only repeated where this run adds new evidence or a changed status.

---

## 1. Scores

| Score | LIVE | LOCAL now | LOCAL before G4/G5 (same rubric, re-estimated) |
|---|---|---|---|
| **Content Quality** | **39 / 100** | **57 / 100** | about 52 |
| E-E-A-T (weighted 20/25/25/30) | 33 | 40 | 36 |
| **AI Citation Readiness** | **30 / 100** | **56 / 100** | about 50 |

The audit's own Content Quality category (42 LIVE, 58 LOCAL) used the orchestrator's method. This report uses the skill's rubric below, so the numbers are not directly comparable; the direction (LOCAL improved by about 5 points from G4 and G5, LIVE unchanged) is the comparable part.

**Content Quality rubric (LOCAL / LIVE):**

| Dimension | Weight | LOCAL | LIVE | Why |
|---|---|---|---|---|
| E-E-A-T | 30% | 40 | 33 | See section 2 |
| Depth and uniqueness | 20% | 55 | 30 | LOCAL: 64 guides of about 1,358 words, but only about 388 words each are unique; 45 of 64 under the 40% gate. LIVE: 2 commercial pages, no topic coverage. |
| Readability | 10% | 88 | 88 | Short sentences, plain words (section 6) |
| Structure and headings | 10% | 72 | 65 | One H1 on 79/79 pages, lists and FAQs; detail H2s are slogans, 83% shared |
| Head-term and keyword targeting | 10% | 70 | 15 | LOCAL titles and H1s fixed; head term split with `/solutions`. LIVE: 0 mentions of "Instagram automation". |
| AI citation readiness | 15% | 56 | 30 | Section 7 |
| Freshness | 5% | 45 | 40 | No visible dates; one fixed `dateModified` for all 67 catalogue pages |
| **Total** | | **56.7** | **39.2** | |

### E-E-A-T breakdown (LOCAL; LIVE in brackets)

| Factor | Score | Key signals |
|---|---|---|
| Experience | 8 / 25 (6) | No case studies, real examples, before/after results or first-hand data anywhere. Use cases are now honestly labelled "Example" (LOCAL). Guides show product familiarity (test from a second account, open links on a phone, deliveries vs clicks). LIVE still shows named persona quotes. |
| Expertise | 13 / 25 (11) | Accurate, careful product guidance with correct concepts (professional accounts only, private replies, public Facebook Page replies, delivery accounting). But 0 of 64 guides state Meta's actual messaging windows, 28 say "supported messaging window/rules" without a number, 0 outbound citations, no author or reviewer. |
| Authoritativeness | 3 / 25 (3) | 0 inbound links (Bing), not in Common Crawl, no listings, no `sameAs`, no brand mentions (audit H7). Unchanged. |
| Trustworthiness | 15 / 25 (12) | Strong: HTTPS, full legal set, grievance process with response times, GST-inclusive INR prices, Razorpay with UPI/cards/netbanking, cancel anytime, plain delivery rules. Weak: operator name and address still placeholders, no About page, unverified sitewide trust claims, unlabelled sample numbers in product UI. |

---

## 2. What G4 and G5 changed, verified on the LOCAL build today

| Audit ID | Expected change | Verified today | Status |
|---|---|---|---|
| H2 persona quotes | Names, quotes and blockquotes removed | LOCAL home shows "Example · Beauty creator in Bengaluru" and "Example · Growth marketer in Mumbai", no names, no blockquote (`src/components/marketing/proof-rail.tsx:13-32`). LIVE still has "Aanya Mehta" and "Arjun Nair" with portraits (2 occurrences each in live HTML). | already-fixed-locally (LIVE open until deploy) |
| M7 definition | First homepage FAQ defines the term | "What is Instagram automation?" answer is 50 words, answer-first, also in FAQPage and llms.txt | already-fixed-locally |
| H4 catalogue H1s | Label inside every H1 | 64/64 detail H1s and 3/3 hub H1s contain the label | already-fixed-locally |
| M6 homepage links | 4 card links plus "See all" | 5 contextual feature links in the homepage body (LIVE: 0) | already-fixed-locally |
| M16 pricing headings | Rewritten | "Find your plan", "Where do your conversations start?", "Every plan, side by side" | already-fixed-locally |
| L8 spelling | "recognise" forms | Fixed; other US forms remain (finding F13) | partly fixed |
| H3 shared FAQ | Own FAQ plus 1 rotating generic | Each generic answer now appears on 21 or 22 pages instead of 64 | already-fixed-locally (uniqueness still open, F1) |
| L10 related intro, hub count | Per collection; computed | "Three guides and recipes to read next when you set up…" (features), "Three guides to read before you adapt…" (templates); "Browse 24" computed | already-fixed-locally |
| L2 llms.txt guides | Guides section | 18,575 bytes, 64 guides grouped Features / Solutions / Workflow recipes, opens "Linkar is Instagram automation software for creators and brands in India" | already-fixed-locally |

---

## 3. Does any page own "Instagram automation"?

**Short answer: not cleanly.**
- **LIVE:** no page owns it. The phrase appears 0 times in the title, H1, description or body of the live home and `/pricing`.
- **LOCAL:** the homepage is the intended and most likely owner for the tool intent, but the `/solutions` hub now competes with it.
- **Both:** nothing on the site matches the informational intent ("what is Instagram automation"). The strategy hands that intent to a future `/instagram-automation` pillar guide (strategy 5.3).

**Evidence (LOCAL, all 79 sitemap URLs parsed):**

| Signal | Homepage `/` | `/solutions` hub | Other pages |
|---|---|---|---|
| Title | `Instagram Automation for Comments, DMs & Stories · Linkar` | `Instagram Automation for Creators & Businesses · Linkar` | 24 more titles contain the phrase (20 solution pages, `/pricing`, analytics, human handoff, flow builder): **26 titles in total** |
| H1 | Kicker "Instagram automation for comments and DMs" | Kicker "Instagram automation for creators and businesses" (added by G5) | 25 H1s in total contain the phrase |
| Meta description | Opens with the phrase | Contains it | 7 descriptions in total contain it |
| Body mentions (main content) | **5** (0.42% density) | **26** (2.51% density), mostly the 20 card titles "Instagram automation for …" | Solution pages 2 to 7 each |
| Definition passage | Yes (first FAQ, 50 words) | No | No |
| Internal anchors containing the phrase that point here | **0** | 0 | **80 point to `/features/no-code-instagram-flow-builder`** (sitewide footer label "No code Instagram automation builder"); 28 to `/features` |
| Internal links in total | 1,242 (mostly "How it works", "Linkar", "Questions", "Home") | 201 | |

**Reading:** the homepage carries the strongest link equity and the only definition, so Google will most likely pick it. But the hub's title follows the same "Instagram Automation for …" pattern, has 5 times the mentions, and its H1 kicker came from G5. On a domain with no indexed pages, two URLs that look this similar can swap or both stay out of the results. No internal anchor text supports the homepage for the term (finding F3). There is also no tool-intent wording: "tool" and "software" each appear 0 times in the homepage body (finding F7).

---

## 4. Catalogue uniqueness, re-measured

**Method.** Same as the earlier seo-programmatic run (`prog/analyze.py`): the text of `main#main-content` minus `<nav>`, script and style, across the 64 detail pages; 5-word shingles; a page's uniqueness is the share of its shingles found on no other page. Template text inside `<main>` is included, as the skill requires. Script: `content-work/rerun/analyze.py`; per-page output: `content-work/rerun/uniqueness-rerun.csv`.

| Measure (64 detail pages) | Before (audit) | Now | Pages < 40% (before → now) | Pages < 30% (before → now) |
|---|---|---|---|---|
| Unique 5-word shingles (primary) | mean 35.9%, median 35.0% | **mean 38.2%, median 37.4%** (min 28.7, max 51.9) | 56 → **45** | 3 → **2** |
| Unique words, strict bound | mean 26.9% | mean 28.6% | 62 → 62 | 52 → 43 |
| Unique words, lenient bound | mean 43.9% | mean 46.7% | 10 → 3 | 0 → 0 |
| Unique prose blocks | mean 36.4% | mean 39.7% | 55 → 34 | 3 → 1 |
| Rendered words per page | mean 1,433 | mean 1,358 | | |
| **Strictly unique words per page (absolute)** | **about 386** | **about 388** | | |
| Max pairwise Jaccard | | 28.3% (`instagram-human-handoff` and `support-handoff`) | no near-duplicates | |

**By collection (primary measure):** features mean 40.9% (12 of 20 under 40%), solutions 39.2% (11 of 20), templates **35.1% (22 of 24 under 40%, 2 under 30%)**.

**Under the 30% hard stop:** `/templates/reel-shopping-link` 28.7% (was 26.9), `/templates/dm-shipping-faq` 29.7% (was 27.9). `/templates/webinar-registration` moved out of the hard stop to 30.9% (was 29.1).

**Why it improved, and why that matters.** Every page rose by 1.8 to 3.3 points, but the absolute unique text did not change (386 to 388 words). The gain came from removing shared FAQ text, which shrank each page by about 75 words. To get further, pages need more unique text; removing more shared text will not be enough.

**Where the shared text sits now (prose words per detail page, average):**

| Shared by | Words per page | Share |
|---|---|---|
| This page only | 423 | 39.7% |
| 2 to 7 pages (sibling sections, example blocks) | 244 | 22.9% |
| 8 to 31 pages (topic "Campaign notes", channel cards, rotating generic FAQ) | 285 | 26.7% |
| 32 to 64 pages (CTA band, trust strip, H2s on every page) | 114 | 10.7% |

**What it takes to pass the gate.** On the primary measure, the 45 pages under 40% need on average **about 94 more page-specific words** each (features 57, solutions 77, templates 123; the most is 249 for `/templates/reel-shopping-link`), assuming no new shared text. Two page-specific FAQs per page (about 45 words each), or replacing the shared "Campaign notes" block with page-specific notes, would carry most pages over 40%.

**Most repeated blocks still on detail pages:** "Start free with 5 automations and 1,000 messages a month…" (64 pages); "Free to start. Paid plans from ₹199 a month." (64); "14K+ replies sent so far" and "Meta Verified Business" (64); "Start with one clear request…" (40); topic "Campaign notes" paragraphs of 46 to 53 words (11 to 16 pages each); "Linkar connects to Instagram professional accounts and Facebook Pages…" (26).

---

## 5. Page reviews

### LIVE home (https://linkar.in/): unchanged since the audit
- Title `Linkar · Instagram and Facebook automation` (42), H1 "Reply to every opportunity. Even when you are away.", "Instagram automation" 0 times.
- 2,155 main-content words; Flesch 71.1; 4 body links (`/signup` twice, `/#surfaces` twice).
- Named persona cards "Aanya Mehta" and "Arjun Nair" with portraits; "Approved by Meta" (4 times) and "14,000+" replies.
- JSON-LD: Organization, SoftwareApplication, 4 Offers. No FAQ or definition.

### LIVE `/pricing`: unchanged
- Title `Pricing · Linkar` (16); H1 "Plans that grow with you."; the three Manychat-matching headings are still live.
- 820 words; Flesch 74.6; no JSON-LD.

### LOCAL home
- Title 57, description 159 (opens with the head term), H1 kicker with the head term, 2,395 main words, Flesch 72.2, grade 5.2.
- 10 H2s, 33 H3s, 9 FAQ answers of 20 to 50 words, all answer-first.
- **41% of the main-content words (986 of 2,395) sit inside `aria-hidden` code-drawn UI.** Crawlers and AI parsers still read that text, and it includes unlabelled sample numbers (F9).
- India appears once in visible copy, inside a mock reply ("2 to 4 days across India"). "Indian" appears only in the meta description (F7).

### LOCAL `/pricing`: the most citation-ready page on the site
- Unique, factual, quotable content: four plans with limits; what counts as a delivery; reset on the 1st (UTC); sending stops at the limit; GST included; Razorpay with UPI, cards and netbanking; cancel anytime; 6 billing Q&As. Every figure matches `src/lib/billing/catalog.ts`.
- 817 words; Flesch 73.5.
- The H1 "Plans that grow with you." still has no keyword (F11).

### LOCAL hubs
- `/features`, `/solutions` and `/templates` have 2,013 to 2,627 main words and Flesch 52.8 to 56.9.
- Each has a good 70 to 90 word intro that explains how to choose.
- 49% to 56% of their words are `aria-hidden` mock UI, and each card's sample reply appears twice in the text.
- `/solutions` is the head-term competitor (section 3).

### LOCAL detail pages (9 sampled, 3 per collection)

| Page | Words | Unique words | Unique 5-gram % | Flesch / grade | Head term | India terms | Most similar |
|---|---|---|---|---|---|---|---|
| `/features/instagram-comment-to-dm` | 1348 | 384 | 36.6 (was 34.1) | 63.2 / 6.6 | 1 | 3 (shared CTA) | /solutions/travel-creators 25.6% |
| `/features/instagram-dm-automation` | 1443 | 369 | 34.3 (was 32.3) | 68.4 / 5.8 | 1 | 3 | /templates/dm-business-hours 21.5% |
| `/features/instagram-follow-gate` | 1442 | 464 | 42.4 (was 39.9) | 61.4 / 6.7 | 1 | 3 | /templates/follow-gated-freebie 23.3% |
| `/solutions/content-creators` | 1308 | 395 | 40.2 (was 37.8) | 64.5 / 6.3 | 4 | 3 | /templates/comment-guide-delivery 20.5% |
| `/solutions/small-businesses` | 1451 | 403 | 39.0 (was 36.7) | 64.6 / 6.3 | 4 | 3 | /solutions/local-service-businesses 20.2% |
| `/solutions/photographers` | 1370 | 356 | 33.9 (was 31.8) | 59.4 / 7.0 | 3 | 3 | /templates/lead-qualification 22.0% |
| `/templates/reel-shopping-link` | 1324 | 290 | 28.7 (was 26.9) | 62.3 / 6.6 | 3 | 3 | /solutions/fashion-brands 26.6% |
| `/templates/comment-guide-delivery` | 1298 | 331 | 33.8 (was 31.5) | 66.4 / 5.9 | 2 | 3 | /templates/giveaway-comment-confirmation 23.8% |
| `/templates/lead-qualification` | 1298 | 327 | 35.2 (was 32.8) | 59.9 / 6.8 | 1 | 3 | /solutions/online-coaches 23.9% |

**Common pattern on all 9:**
- The H1 contains the label.
- The intro opens with a scenario. The definition, if there is one, comes in sentence 2 or 3.
- 9 or 10 H2s, of which only "What you need to start" and "Where this works" describe their content. The rest are slogans ("A comment is a raised hand…", "Busy comment sections, calm replies.").
- 2 FAQ answers, only 1 of them page-specific.
- 6 or 7 CTA labels rendered three times each (about 50 extra words per page).
- 0 outbound links.
- `dateModified` 2026-10-13 in schema, no visible date.
- The only India signals are the shared ₹ CTA lines.

**Content is honest and accurate:**
- no invented metrics in the guide copy;
- clear "what Linkar does not do" boundaries ("Does the recipe create a checkout? No…");
- affiliate disclosure advice.

---

## 6. Readability (prose blocks only: p, li, dd, summary)

| Set | Flesch | FK grade | Avg sentence | Note |
|---|---|---|---|---|
| 64 detail pages | min 47.2, median 59.5, max 70.4 | median 7.0 (5.3 to 8.6) | 8.1 words | Slightly under the 60 to 70 target only because "automation", "conversation" and "Instagram" are long words. No action needed. |
| LOCAL home | 72.2 | 5.2 | 8.3 | |
| LOCAL pricing | 73.5 | 5.0 | 8.1 | |
| LIVE home / pricing | 71.1 / 74.6 | 5.3 / 4.9 | 7.9 / 8.1 | |

Readability is a strength. The skill notes that Flesch is not a ranking factor.

---

## 7. AI citation readiness

**What works (LOCAL):**
- server-rendered text;
- llms.txt with 64 guides, plans and Q&As;
- a 50-word definition;
- 9 homepage Q&As in FAQPage (no Google rich result, but useful to AI parsers);
- `/pricing` facts that are specific and quotable;
- one H1 per page;
- a clean H1 → H2 → H3 hierarchy.

**What holds it back:**
1. **The detail pages do not open with an answer.** Most intros start with a scenario; a crude heuristic finds a definition in the first two sentences of only 18 of 64 intros. Their H2s are slogans that a question never matches.
2. **Thin Q&A per guide.** Each record has a single `faq` ContentBlock (`src/content/seo/types.ts:18`), so each guide has 1 page-specific Q&A. G5 cut the visible FAQ from 4 answers to 2.
3. **No verifiable rule facts or sources.** 0 of 64 guides state a Meta messaging window, 28 refer to it vaguely, and no page links out to Meta's documentation.
4. **Noise in the extractable text:**
   - sample numbers in the product UI are not labelled (F9);
   - CTA labels are tripled (L12);
   - each hub card's sample reply appears twice.
5. **Entity and authority signals are absent:** no `sameAs`, no About page, no author, no brand mentions (owner actions).
6. **Trust claims propagate into AI answers.** "Linkar passed Meta App Review" is in the homepage FAQ, the FAQPage JSON-LD and llms.txt, so AI systems may repeat it verbatim (M18).

---

## 8. Findings (most severe first)

Each finding gives the target, the status and the evidence.

### F1. Catalogue uniqueness still fails the 40% gate on 45 of 64 pages (High, LOCAL, open)
- **Evidence:** section 4; `content-work/rerun/uniqueness-rerun.csv`. Mean 38.2% (was 35.9%); templates 35.1% with 22 of 24 under 40%. Absolute unique words unchanged (386 → 388); rendered words fell from 1,433 to 1,358.
- **Fix:** this is the deferred content pass (audit H3 and section 8), now with a measured target.
  - Add about 94 page-specific words per failing page (up to 249).
  - Start with 2 more page-specific FAQs per record: change `faq` to an array.
  - Replace the topic-level "Campaign notes" block (285 words per page shared across 8 to 31 pages) with page-specific notes.
  - Add the rendered-uniqueness CI gate (40% per page, 50% mean) with that change.
  - Do templates first.

### F2. Two templates are still under the 30% hard stop (High, LOCAL, owner-action)
- **Evidence:**
  - `/templates/reel-shopping-link` is 28.7%, most similar to `/solutions/fashion-brands` (26.6% Jaccard).
  - `/templates/dm-shipping-faq` is 29.7%.
  - `/templates/webinar-registration` has cleared the hard stop at 30.9%.
- **Fix:** the owner either holds both pages out of the first release (sitemap, footer and llms.txt) or approves a rewrite to 40% or more first. Needs about 249 and about 160 new page-specific words respectively.
- Updates audit C2 (was 3 pages).

### F3. The head term is split between the homepage and the `/solutions` hub, and no anchor text supports the homepage (High, LOCAL, open)
- **Evidence:** section 3.
  - `/solutions` title `Instagram Automation for Creators & Businesses · Linkar`, plus an H1 kicker added by G5.
  - 26 body mentions on `/solutions` against 5 on the homepage.
  - 26 titles and 25 H1s contain the phrase.
  - 0 internal anchors with the phrase point to `/`.
- **Fix:**
  - Re-point the hub at its audience intent, for example title `Instagram Workflows for Creators & Businesses · Linkar` (52 characters) and H1 kicker "Instagram workflows for creators and businesses". This lives in `src/content/seo/index.ts` (hub title) and `hero/hub.tsx`.
  - Show short names on the hub cards ("Creators", "Online coaches", as the footer already does), keeping the full label as each detail page's H1.
  - Add one contextual link to `/` with the anchor "Instagram automation" in each hub intro.
  - Keep the homepage as the tool-intent owner, and build the `/instagram-automation` pillar for the informational intent (strategy 5.3).
  - After indexing, watch Search Console for URL swapping on the term.

### F4. Persona quotes and the missing head term are still live (High, LIVE, already-fixed-locally)
- **Evidence:** the live homepage HTML has "Aanya Mehta" and "Arjun Nair" (names, portraits, alt text) and 0 occurrences of "Instagram automation". The live title is brand first; live `/pricing` keeps the Manychat headings.
- **Fix:** deploy the local build (owner, audit section 7 step 3), then re-fetch and re-run this check.
- Updates audit H1, H2, M7 and M16 for LIVE.

### F5. Guides are not answer-first, and their H2s do not describe their sections (Medium, LOCAL, open)
- **Evidence:**
  - Intros start with a scenario (for example, comment-to-DM opens "A viewer asks for your guide under a post." and defines the feature only in sentence 3).
  - Only 105 of 608 detail H2s are unique.
  - "Keep exploring.", "Questions, answered." and "Write it once. Keep the conversation moving." are on all 64 pages.
  - Section H2s are slogans.
- **Fix:**
  - Add a 40 to 60 word "what it is and how Linkar does it" passage directly under each hero, as a new record field.
  - Rename 2 or 3 H2s per page to descriptive headings that contain the page term (for example "How Instagram comment to DM automation works", "What to check before you switch it on").
  - Keep the slogan as a sub line if the design needs it.
  - See the sample copy in section 9.

### F6. No guide states Meta's actual messaging rules, and no page cites a source (Medium, LOCAL, open)
- **Evidence:**
  - 28 of 64 detail pages say "supported messaging window" or "messaging rules" without the rule. 0 state a window: the one page that mentions "seven days" (`offer-follow-up`) does so only in a question.
  - 0 outbound links in `<main>` on all 79 pages. The only external link sitewide is the GA opt-out on 2 legal pages.
  - Extends audit M14 and L13 from the comment-to-DM page to the whole catalogue.
- **Fix:** write one sourced, plain-words "Meta's messaging rules" block (private replies to comments, the messaging window after a person writes, follow-ups) and link to Meta's Instagram Platform documentation. Show it on the comment, DM, follow-up and Story pages, and on the future `/guides/instagram-messaging-rules` page. Check each number against Meta's current documentation on the day of writing; do not copy numbers from this report.

### F7. The homepage has weak India and tool-intent signals in its visible copy (Medium, both, open)
- **Evidence (LOCAL homepage body):**
  - "India" appears once, inside a mock reply.
  - "Indian" appears 0 times; it is only in the meta description.
  - "tool" and "software" each appear 0 times.
  - The INR, GST and UPI facts live only on `/pricing`.
- **Fix:** add one visible, factual line near the hero or the channels section, using only facts already on `/pricing`. For example: "Made for creators and businesses in India: prices in rupees with GST included, and checkout by UPI, card or netbanking." Strategy 5.3 gives the homepage the tool intent ("tool", "app", "software"), so one natural mention of "Instagram automation tool" in a subheading or FAQ would support it.

### F8. Identity and experience signals are missing (Medium, both, owner-action)
- **Evidence:**
  - `/about` returns 404 on LIVE and LOCAL.
  - `LEGAL_ENTITY_COMPLETE = false`, and proprietor, address and grievance officer are `LEGAL_FILL_ME` (`src/lib/legal-entity.ts:38-53`). The contact page reads "operated by its proprietor".
  - No author or reviewer on any of the 64 guides; no Person schema; no real case study or customer example.
- **Fix (owner):**
  - Fill in the legal entity.
  - Publish an About page that names who builds Linkar.
  - Add a "Written by the Linkar team, reviewed by <named person>" line to guides once that person is real and willing.
  - Supply real usage examples for the content pass (audit section 7 step 11). Do not invent any.
- Audit M13, now with the E-E-A-T scoring impact: Experience 8/25.

### F9. Sample numbers in the product UI are indexable and not labelled as samples (Low, both, open)
- **Evidence (live and local homepage):**
  - "Matched 412 / Replied 388 / Answered 216 / Handed over 34" and "1,284 taps / 1,012 unique" (`src/components/marketing/insights-showcase.tsx:35`, :101-102);
  - "1,284 replies sent / 0 failed" (`src/components/marketing/setup-steps.tsx:150-151`);
  - "Answered in 4 seconds" (`src/components/marketing/before-after-section.tsx:70`).

  The code comment in insights-showcase.tsx says "The figures are sample data", but neither the visible UI nor the sr-only figcaption says so. 41% of the homepage's main words are in `aria-hidden` mock UI, which crawlers still read.
- **Fix:**
  - Add "sample data" to the figcaption and a small visible "Sample" tag on the insights panel and the setup status row.
  - Optionally mark the decorative mock UI blocks with `data-nosnippet`, which Google honours for snippets and its AI features, so illustrative numbers are not quoted as Linkar results.

### F10. The sitewide footer sends "Instagram automation" anchor text to the flow builder (Low, LOCAL, open)
- **Evidence:** `footerLabel()` strips only a leading "Instagram automation for " or "Instagram " (`src/components/marketing/marketing-footer.tsx:61-66`). The label "No code Instagram automation builder" (`src/content/seo/features.ts:170`) therefore keeps the phrase: 80 sitewide links. Other footer labels are shortened ("Automation analytics", "Automation human handoff").
- **Fix:** shorten it to "No code flow builder" in the footer, for example by also stripping "Instagram automation " anywhere in the label.

### F11. The `/pricing` H1 has no keyword (Low, LOCAL, open)
- **Evidence:** H1 "Plans that grow with you."; title `Instagram automation pricing in India · Linkar`. Every catalogue H1 now has a label kicker. Noted only as a warning in audit section 11.
- **Fix:** add the same kicker pattern inside the H1, for example "Instagram automation pricing in India", with the visual design unchanged.

### F12. The homepage misses easy internal links to recipes and use cases (Low, both, open)
- **Evidence:**
  - The 4 "Ready-made Instagram DM automation workflows" cards have no links.
  - The 2 use-case cards end in "Comment to DM workflow →" and "Lead follow-up workflow →" but are not links (`src/components/marketing/proof-rail.tsx:75-77`).
  - The two channel cards' "Explore workflows →" point to `/#surfaces` on the same page.
  - The body never links to `/solutions` or `/templates`.
- **Fix:**
  - Link the workflow cards to `/templates/comment-guide-delivery`, `/templates/lead-qualification`, `/templates/offer-follow-up` and `/templates/support-handoff`.
  - Link the use-case cards to `/features/instagram-comment-to-dm` and `/features/instagram-lead-qualification`.
  - Link the channel cards to `/features` and `/features/facebook-comment-auto-reply`.

### F13. US spellings remain in British copy (Low, both, open)
- **Evidence:**
  - "Linkar uses the connection you authorize" (`src/components/marketing/marketing-content.ts:188`) appears on the live and local homepage and flows into FAQPage and llms.txt. Elsewhere the site says "authorised".
  - "enrollment", "enrollments" and "enroll" appear on 22 catalogue pages (20 guides plus the `/solutions` and `/templates` hubs) (for example `src/content/seo/index.ts:99`, :120; src/content/seo/features.ts:89, :187; src/content/seo/solutions.ts:28).
- **Fix:** use "authorise", "enrolment" and "enrol". This follows on from audit L8.

### F14. Tripled CTA labels add about 50 words of noise per guide (Low, both, open)
- **Evidence:** 6 or 7 ButtonRoll CTAs per detail page render "Create your first reply Create your first reply Create your first reply" (7 on comment-to-DM, 6 on content-creators). The homepage has 1 and the hubs 2. This adds new measurements to audit L12 (deferred).
- **Fix:** as L12: draw the decorative copies with CSS, or mark them `aria-hidden` and `data-nosnippet`.

### F15. No visible "last reviewed" date on the guides (Low, LOCAL, open)
- **Evidence:** a visible date was found on 0 of 67 catalogue pages. All 67 carry the same schema `dateModified` 2026-10-13 (`SEO_CONTENT_UPDATED`, `src/content/seo/types.ts:24`).
- **Why it matters:** these guides describe platform rules that change.
- **Fix:** add a per-record `updated` date with the content pass (audit section 8) and show "Last reviewed <date>" near the FAQ.

### F16. No India-specific content in the guides (Medium, LOCAL, open)
- **Evidence:**
  - 0 of 64 records contain any India term (India, ₹, GST, UPI, Hinglish, a city), checked on the dumped `seoPages`.
  - The 3 ₹ mentions on each detail page are the shared CTA lines.
  - The audit M8 status is unchanged after G4 and G5.
- **Fix:** add India scenarios and real plan-fit notes per record in the content pass, for example Hinglish request words people actually comment ("price?", "link pls") and GST-inclusive rupee plan notes. This is also the cheapest source of the unique words F1 needs.

### F17. Unverified trust claims now also feed AI answers (Medium, both, owner-action)
- **Evidence:**
  - "Meta Verified Business" and "14K+ replies sent so far" are on all 79 LOCAL pages.
  - "Linkar passed Meta App Review" is in the homepage FAQ, the FAQPage JSON-LD and llms.txt.
  - LIVE says "Approved by Meta" (4 times) and "14,000+".
- **Fix:** the owner confirms each claim against Meta's records and production data before deploying (audit M18). llms.txt and FAQPage make these claims especially likely to be quoted.

### F18. Readability is good and there are no near-duplicates (Info, both)
- **Evidence:** section 6. The detail-page median is Flesch 59.5, grade 7.0. Max pairwise Jaccard is 28.3%.
- **Action:** none. Keep the short-sentence style.

---

## 9. Sample copy (checked against the project rules: no em dashes, no banned words, no invented facts)

**Definition passage for `/features/instagram-comment-to-dm` (46 words):**
> Instagram comment to DM automation sends a private reply to someone who comments a chosen word on your post or Reel. In Linkar you pick the post, the word and the message, and the reply goes out through Meta's official Instagram API from your professional account.

**Descriptive H2 examples (comment-to-DM):** "How Instagram comment to DM automation works", "What happens after the private reply", "What to check before you switch it on".

**Homepage India line (facts from `/pricing`):**
> Made for creators and businesses in India: prices in rupees with GST included, and checkout by UPI, card or netbanking.

**`/solutions` hub:** title `Instagram Workflows for Creators & Businesses · Linkar`; H1 kicker "Instagram workflows for creators and businesses"; intro link "New to Instagram automation? See how Linkar works" pointing to `/`.

---

## 10. Data not available

- No keyword volumes or Google India SERPs: DataForSEO is not installed. Head-term ownership is judged from on-site signals plus the strategy's indicative snapshots (`docs/seo/2026-10-15/data/strategy/serp-snapshots-2026-10-15.json`, engine and locale unrecorded).
- No Search Console query data: 0 impressions, so cannibalisation cannot be measured yet.
- The answer-first count (18 of 64 intros) is a text heuristic, not a manual read of all 64 pages.

## 11. Evidence files

All under `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/content-work/rerun/`:

| File | What it holds |
|---|---|
| `html/` | 79 LOCAL pages fetched today |
| `live/` | LIVE home, pricing, contact and support |
| `live404/` | LIVE `/features`, `/llms.txt` and `/about`, all 404 |
| `llms.txt` | LOCAL llms.txt |
| `analyze.py` | The analysis script |
| `analysis.json` | All metrics |
| `uniqueness-rerun.csv` | Per page, with the before value and the delta |
| `content.json` | `seoPages` dumped with tsx |
| `fetch-log.txt` | HTTP codes |
