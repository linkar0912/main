# SXO analysis: Linkar (seo-sxo)

- **Run date:** 15 October 2026 (re-run; the first seo-sxo run returned nothing)
- **Skill:** `seo-sxo` v1.9.0, following `~/.claude/skills/seo-sxo/SKILL.md` and `~/.claude/agents/seo-sxo.md`
- **Targets:**
  - **LIVE**: https://linkar.in (home, `/pricing`, legal and help pages). `/features/*` and `/llms.txt` return 404.
  - **LOCAL**: http://localhost:3000, the build as it is now, after work groups G1 to G6 (audit section 11).
- **Keywords (7):** "instagram automation", "instagram automation tool", "instagram dm automation", "instagram auto reply", "instagram comment to dm", "manychat alternative", "instagram automation india".

## SXO Gap Score (separate from the SEO Health Score)

| Target | SXO Gap Score | SEO Health Score (audit, for reference) |
|---|---|---|
| LIVE | **37 / 100** | 51 / 100 |
| LOCAL (as built now) | **52 / 100** | 66 / 100 (scored before G1 to G6) |

The SXO Gap Score is the mean of the seven keyword-to-page gap scores in section 4. It measures how well the best Linkar page for each search matches what Google India rewards today. It does not include indexing. Today no Linkar URL is indexed (`site:linkar.in` returned "did not match any documents" on 15 Oct), so neither target can rank yet whatever its alignment.

**Status legend used for every finding:** `open` (still to do in the repo or plan), `already-fixed-locally` (fixed in the local build, LIVE waits for deploy), `owner-action` (needs an account, a decision or a fact only the owner has).

---

## 0. What I reused and what I re-checked

- **Reused:** the first run's competitor page scan (`work/sxo/serp_scan.json`) for context only. Its result lists came from an unknown engine and locale, so I replaced them.
- **Re-checked from scratch:**
  - **Google India SERPs.** The first run never captured real Google results. This time I opened Google in the Claude Browser pane (signed out, `gl=in&hl=en`, page 1) for the 7 keywords plus 6 supporting queries. I pulled organic results, AI Overview text and sources, People Also Ask (PAA), "People also search for" and video blocks from the page DOM. Raw capture: `sxo-work/google-in-serps-2026-10-15.json`.
  - **Linkar pages now.** I fetched 5 LIVE URLs with the skill's `fetch_page.py` and 14 LOCAL URLs with curl, because `fetch_page.py` blocks localhost as a private IP. All were parsed with the skill's `parse_html.py` (`sxo-work/scan_linkar.py`, output `sxo-work/linkar_scan.json`). I took mobile screenshots of the LOCAL home and the comment-to-DM page.
  - **Ranking competitor pages.** 25 URLs fetched with `fetch_page.py` (`sxo-work/scan_serp.py`, output `sxo-work/serp_pages_scan.json`).
- **What I did not repeat:** audit findings C1, H1 to H7, M1 to M18 and L1 to L15 stand as written. Where a finding below touches one of them, it says which one and adds the new SXO evidence.

---

## 1. SERP landscape (Google India, 15 Oct 2026)

Page types follow `references/page-type-taxonomy.md`:
- **L**: Landing (vendor product or feature page)
- **H**: Hybrid (product page with an educational layer)
- **C**: Comparison (listicle, alternatives or vs page)
- **B**: Blog, guide or help article
- **P**: Product (app store listing)
- **T**: Tool or template
- **F**: Forum or user-generated content (Reddit, an Instagram reel)

| Keyword | Page-1 types | Dominant type and consensus | SERP features | Who ranks |
|---|---|---|---|---|
| instagram automation | L3 H1 C3 B2 | **Commercial mix.** Vendor L/H 44%, listicles 33%, guides 22% (mixed) | AI Overview (sources: Manychat, repli.in, CreatorFlow, Interakt, LinkDM; quotes INR prices); PAA; no video block | CreatorFlow #1, Planable, Instagram Help, TailorTalk, Manychat, LinkDM, SuperProfile, Wati, Heyy |
| instagram automation tool | L4 C4 F1 | L 44% / C 44% (mixed) | AI Overview (Manychat, LinkDM, Repli at about ₹249, QuickDM at about ₹399 from Reddit); PAA | Manychat, CreatorFlow, TailorTalk, repli.in/free, SuperProfile, Planable, Reddit, LinkDM, SetSmart |
| instagram dm automation | L5 C3 B1 | **L 56%** (mixed, leaning landing) | AI Overview (comment-to-DM, keyword triggers, Story mentions, lead capture); PAA | CreatorFlow, Manychat, TailorTalk, Instagram Help, SuperProfile, LinkDM, repli.in/free, BotHelp, SetSmart |
| instagram auto reply | B2 F1 L3 P1 T1 | **Fragmented, how-to tilt.** How-to and help 38% (50% with the reel), feature L 38% | AI Overview gives **step-by-step Meta Business Suite instructions** and embeds 2 YouTube videos and 1 reel; video block | Instagram Help (AI auto replies), Play Store AutoResponder, LinkDM, Make template, Linktree feature page, Jotform, stepper.io, IG reel |
| instagram comment to dm | L5 B2 | **L 71% (strong)** | AI Overview embeds a 17:26 YouTube tutorial (32K views); video block | get.manychat.com use case, LinkDM, ReplyRush, Dealism, CreatorFlow, dmgo.in guide, Inrō glossary |
| manychat alternative | C7 F1 | **C 88% (strong)** | AI Overview segments by use case and names Meta Business Suite as the free option; video block | Kayako, Manychat's own alternatives post, Reddit, SetSmart, Zipchat, Steps AI, LinkDM, ChatPlace |
| instagram automation india | L5 H1 C2 B1 | **India vendor L/H 67% (strong)** | No AI Overview; PAA | repli.in/instagram-automation-india, Wati, SuperProfile, dmgo.in/instagram-automation-india, WACTO, Grow Creation, replykaro.com/instagram-automation-india, Ownchat, ReplyMitra |

**Supporting SERPs (same method):**
- **"what is instagram automation"**: 7 of 7 are guides (Heyy, QuickConnect, Sprinklr, Manychat guide, Metricool, systemintegration.in, Shiprocket). Only 1 URL (heyy.io) overlaps with the 9 for "instagram automation".
- **"best instagram automation tool india"**: best-of lists 6/9 (5 articles: TailorTalk, InstantDM, SuperProfile, Flowgent, ReplyMitra; plus a YouTube "5 best" video), plus Reddit and 2 vendor landing pages. The AI Overview leads with "official Meta Graph API" and "local pricing (UPI support)" and cites ReplyKaro (₹99, UPI, Razorpay).
- **"manychat alternative india"**: comparison pages 8/9. ReplyKaro (16 Aug), FlowDM (8 Aug), InstantDM (2 Oct), repli.in "Repli vs ManyChat" (1 Oct) and creatorlanehq (27 Jun) are all dated 2026. The AI Overview opens with "local payment options like UPI, flat pricing instead of expensive contact-based dollar tiers".
- **"instagram auto reply message for business"**: example lists dominate. Elpidan "40+ Templates", LeadResponse "25 ... Examples" and Trengo "Top 15 ... examples", plus guides.
- **Brand:** "linkar" returns linkar.co.uk (a UK social rewards app), Play Store apps by other publishers, linkar.ink and linkar.cc (an SSH client). The AI Overview says "Linkar most commonly refers to a social rewards mobile application". "linkar instagram automation" returns LinkDM, LinktoDM, CreatorFlow and others, and no Linkar page.

**PAA themes across the 7 keywords:**
- **Cost and free** (5 SERPs): "Is Instagram automation free?", "How much does Instagram DM automation cost?", "How much does Instagram automation cost?", "Is DM automation free?", "Is there a free version of ManyChat?".
- **Which tool** (4 SERPs): "Which DM automation is best?" (3 SERPs), "What is the best Instagram automation tool?", "Is there something better than ManyChat?".
- **Setup** (4 SERPs): "How to set up a comment to DM on Instagram?", "How to set up automated DM replies on Instagram?", "How do I turn on auto DM?", "How to set up auto reply?", "How do I turn off auto reply on Instagram?".
- **Permission and safety:** "Can you automate an Instagram account?", "Can I automate my Instagram account?".
- **Off-intent growth questions** on the head term: "How to get 20,000 followers on Instagram?", "What is the 5-3-1 rule on Instagram?".

**"Free" appears in the related searches of all 7 keywords**, for example "Instagram automation free", "Comment to DM automation free", "Manychat alternative free" and "Instagram automation india free".

**Ads:** none were rendered in any capture ("Sponsored" count 0 on all 13 SERPs), so ad-copy signals are not available (see Limitations).

**Content norms of the pages that rank** (from `serp_pages_scan.json`):
- **Vendor landing pages:** 1,400 to 3,600 words. CreatorFlow 1,902 (AggregateRating, FAQPage, Offer, SoftwareApplication), LinkDM 2,057, Wati 3,616, ReplyRush 3,159 (with video).
- **Trust signals:** user counts ("trusted by +20,000" CreatorFlow, "60,000+" LinkDM, "16,000+" Wati, "41000+" ReplyRush), Meta partner or official API wording on 13 of the 21 pages that fetched successfully, and AggregateRating on 4 (CreatorFlow, ReplyKaro's India page, FlowDM, ReplyRush).
- **India landing pages:** ₹ price, UPI and GST in the title (Repli, ReplyKaro), Hindi or Hinglish mentions (Repli, ReplyKaro, DMGO) and visible freshness (ReplyKaro "Last updated October 12, 2026").

---

## 2. Page-type alignment (mismatches first)

| Keyword | SERP expects | LIVE best page and verdict | LOCAL best page and verdict |
|---|---|---|---|
| manychat alternative | Comparison (88%) | None. **MISMATCH, no page** | None. **MISMATCH, no page** (0 mentions of "ManyChat" on all 14 LOCAL pages scanned) |
| instagram automation india | India landing page (67%); "best ... india" wants a listicle | `/` and `/pricing`. **MISMATCH (HIGH)**: brand-first titles, "India" appears once, inside a demo chat bubble | `/` (Landing; "Indian" only in the meta description) and `/pricing` (title "Instagram automation pricing in India", H1 "Plans that grow with you."). **PARTIAL MISMATCH (MEDIUM)**: no India landing page; UPI appears once, deep in `/pricing` |
| instagram auto reply | Fragmented, how-to tilt plus feature pages, video | `/`, with 0 uses of "auto reply". **MISMATCH (HIGH)** | `/features/instagram-keyword-replies` (feature landing, "Instagram keyword auto replies"). **PARTIAL MISMATCH (MEDIUM)**: no how-to layer, 0 mentions of Meta Business Suite on 14 pages, no video |
| instagram dm automation | Landing (56%) | `/`, with 0 uses of "DM automation". **MISMATCH (HIGH)** | `/features/instagram-dm-automation`. **ALIGNED** |
| instagram comment to dm | Landing (71%) | `/`, with 0 uses of "comment to DM". **MISMATCH (HIGH)** | `/features/instagram-comment-to-dm`. **ALIGNED**: 3-step setup, price line and trust lockups above the fold on mobile |
| instagram automation | Commercial mix: L/H 44%, C 33%, B 22% | `/` (Landing, but 0 uses of "Instagram automation"). Type aligned, topic missing | `/` (Landing plus a definition FAQ, close to Wati's hybrid). **ALIGNED** with the largest share |
| instagram automation tool | L 44% / C 44% | `/`. Type aligned, topic weak | `/`, with `/features` supporting. **ALIGNED** for the landing half; the listicle half needs third-party lists or a buyer's guide |

**Key insight.** LOCAL already has the right page type for 4 of the 7 keywords: the homepage and the comment-to-DM and DM-automation feature pages. The SXO gaps that remain are three missing page types:
1. a comparison page for ManyChat switchers;
2. an India landing page, as distinct from an India listicle;
3. a how-to hybrid page for "instagram auto reply".

On top of that, the trust and free-plan facts that the decision-stage SERPs reward are buried. LIVE misaligns on 5 of 7 keywords because none of the catalogue pages are deployed (audit C1 and H1).

---

## 3. User stories (from SERP signals)

1. **India price and payment checker (decision).** As an Indian D2C or service-business owner, I want an Instagram automation tool priced in rupees that I can pay by UPI with GST included, because dollar plans and contact-based pricing feel risky, but I am blocked by not knowing the real monthly cost and which tools use Meta's official API.
   *Signals: titles "Instagram Automation India, ₹499/Month, UPI & GST" (Repli) and "Instagram Automation in India: ₹ Pricing, UPI and Free Plan" (ReplyKaro); AI Overview for "manychat alternative india" ("UPI, flat pricing instead of expensive contact-based dollar tiers"); PAA "How much does Instagram automation cost?"; related "Instagram automation india free". Punctuation in quoted titles normalised.*
2. **Free-first creator (consideration).** As a solo creator, I want to start comment-to-DM for free, because I am not sure it will pay off yet, but I am blocked by unclear free-plan limits.
   *Signals: PAA "Is Instagram automation free?" and "Is DM automation free?"; "free" in the related searches of all 7 SERPs; snippets that lead with quotas ("Free plan: 500 DMs/month" CreatorFlow, "send up to 1000 DMs a month" LinkDM).*
3. **ManyChat switcher (decision).** As a ManyChat user whose contact count keeps growing, I want a cheaper tool that keeps comment-to-DM, because ManyChat's price rises with contacts, but I am blocked by comparison fatigue: every list is written by a vendor that ranks itself first.
   *Signals: "manychat alternative" is 88% comparison pages; Reddit "Is there any free manychat alternative for Instagram?" (80+ comments); PAA "Is there something better than ManyChat?"; AI Overview mention of "contact-based pricing".*
4. **Safety-anxious first-timer (awareness).** As someone with a new Business or Creator account, I want to know whether automation can get my account restricted, because the AI Overview warns against unofficial bots, but I am blocked by not knowing which tools use the official API and what Meta's limits are.
   *Signals: AI Overview "Important Safety Rule: Avoid unofficial bots" and its notes on the 24-hour messaging window and Business or Creator accounts; Instagram Help "Automated chats on Instagram" at #3 for the head term and #4 for "dm automation"; PAA "Can you automate an Instagram account?".*
5. **DIY setup seeker (awareness).** As a small business owner, I want to set up an auto reply myself tonight, because customers ask the same things after hours, but I am blocked by not knowing whether Meta's free instant replies are enough or I need a tool, and what to write.
   *Signals: AI Overview for "instagram auto reply" walks through Meta Business Suite (Inbox, Automations, Instant Reply); related "Instagram auto reply template" and "Instagram auto reply message for business"; PAA "What is a good auto reply message for business?"; video block.*

The stories span the awareness (4, 5), consideration (2) and decision (1, 3) stages.

---

## 4. Gap analysis per keyword (SXO Gap Score)

Dimensions: Page Type (PT, 15), Content Depth (CD, 15), UX (15), Schema (SC, 15), Media (ME, 15), Authority (AU, 15), Freshness (FR, 10).

| Keyword | LOCAL page | PT | CD | UX | SC | ME | AU | FR | **LOCAL** | **LIVE** |
|---|---|---|---|---|---|---|---|---|---|---|
| instagram automation | `/` | 12 | 11 | 12 | 12 | 10 | 4 | 4 | **65** | 48 |
| instagram automation tool | `/` | 11 | 11 | 12 | 12 | 10 | 4 | 4 | **64** | 46 |
| instagram dm automation | `/features/instagram-dm-automation` | 13 | 9 | 13 | 9 | 9 | 4 | 3 | **60** | 36 |
| instagram comment to dm | `/features/instagram-comment-to-dm` | 14 | 9 | 13 | 9 | 8 | 4 | 3 | **60** | 38 |
| instagram automation india | `/` and `/pricing` | 7 | 7 | 9 | 11 | 9 | 4 | 3 | **50** | 37 |
| instagram auto reply | `/features/instagram-keyword-replies` | 8 | 7 | 12 | 9 | 6 | 4 | 3 | **49** | 34 |
| manychat alternative | none (homepage fallback) | 0 | 2 | 5 | 3 | 5 | 2 | 1 | **18** | 18 |
| **Mean** | | | | | | | | | **52** | **37** |

**Evidence behind the scores**

- **Page type:** see section 2.
- **Content depth:**
  - LOCAL home: 2,673 words, 10 H2s, "Instagram automation" 7 times, and a FAQ that opens with "What is Instagram automation?".
  - LOCAL feature pages: 1,666 to 1,757 words. The catalogue's mean unique text is 36% (audit H3).
  - No page answers "Which DM automation is best?".
  - The keyword-replies page never covers native auto replies.
- **UX:**
  - Mobile above the fold (screenshots on 15 Oct): the LOCAL home shows the keyword kicker, the H1, one CTA and the line "Free to start. Paid plans from ₹199 a month." (`hero-section.tsx:48`).
  - The comment-to-DM page adds trust lockups above the fold.
  - The LIVE home has no keyword and no price line in the hero.
- **Schema:**
  - LOCAL home: Organization, WebSite, SoftwareApplication with `@id`, UnitPriceSpecification and FAQPage.
  - Catalogue: WebPage, BreadcrumbList, ImageObject and `about #software`.
  - Ranking vendors add AggregateRating, which Linkar correctly does not fake.
- **Media:** hero photos plus code-drawn UI on every page; 0 videos on the 16 Linkar pages that returned 200. Video blocks appear on 3 of 7 SERPs.
- **Authority:**
  - no reviews and no third-party mentions;
  - the "Meta Verified Business" and "14K+ replies sent so far" lockups are still waiting for the owner's check (audit M18);
  - legal entity placeholders (M13);
  - competitors show user counts and ratings.
- **Freshness:** no visible dates on any Linkar page. Ranking lists and India pages are dated within days (SuperProfile "1 day ago", DMGO "1 day ago", ReplyKaro "Last updated October 12, 2026").

---

## 5. Persona scores (LOCAL, with LIVE totals)

Weights reflect the commercial SERPs: Free-first 20%, India checker 20%, Tool evaluator 20%, Safety 15%, DIY 15%, ManyChat switcher 10%.

| Persona (journey stage) | Best LOCAL page | Relevance | Clarity | Trust | Action | **LOCAL** | Rating | **LIVE** |
|---|---|---|---|---|---|---|---|---|
| Free-first creator (consideration) | `/`, `/pricing` | 20 | 18 | 17 | 21 | **76** | Good | 65 |
| India price and payment checker (decision) | `/pricing` | 19 | 13 | 13 | 20 | **65** | Good | 61 |
| Safety-anxious first-timer (awareness) | `/` FAQ | 19 | 17 | 12 | 17 | **65** | Good | 56 |
| DIY setup seeker (awareness) | comment-to-DM and keyword-replies features, templates | 12 | 14 | 14 | 15 | **55** | Needs work | 42 |
| Tool evaluator, best-of shopper (consideration) | `/`, `/features` | 12 | 12 | 9 | 16 | **49** | Needs work | 40 |
| ManyChat switcher (decision) | none | 5 | 3 | 8 | 12 | **28** | Critical mismatch | 28 |
| **Weighted** | | | | | | **59** | | **51** |

**Notes per persona**

- **Free-first creator:**
  - LOCAL `/pricing` states "₹0 / month, No card required, 1,000 deliveries each month", and the meter "stops sending ... rather than charging you for more".
  - The home description says "Free, paid from ₹199 a month" but gives no quota.
  - The home FAQ says "1,000 messages a month" (`marketing-content.ts:170`) while `/pricing` says "deliveries". It is the same limit in two words.
- **India checker:**
  - UPI appears once in the whole site, at `pricing-page.tsx:92` ("UPI, cards, and netbanking, all at Indian rates in rupees"), under "No surprises on the invoice". It is in no title, description, H1 or hero.
  - The `/pricing` H1 is "Plans that grow with you." (`pricing-page.tsx:279`).
  - There is no `/instagram-automation-india`-style page, while three ranking competitors own that exact URL pattern.
- **Safety-anxious first-timer:**
  - The FAQ answers "Is Instagram DM automation allowed?" (`marketing-content.ts:162-164`), but its proof is Linkar's own claim ("passed Meta App Review"; M18).
  - Meta's own help page ranks on page 1 and is not cited.
  - The 24-hour window and the one-private-reply-within-7-days rule appear on 0 of 14 LOCAL pages (audit M14).
- **DIY setup seeker:**
  - The 3-step setup on the comment-to-DM page answers "How to set up a comment to DM".
  - No page explains Meta Business Suite instant replies, which is the answer Google's AI Overview leads with.
  - Each template carries one short sample reply (for example "Our current opening hours and location are here."), while the "auto reply message for business" SERP rewards lists of 15 to 40+ examples.
- **Tool evaluator:** there are no "how to choose" criteria and no dated comparison table anywhere.
- **ManyChat switcher:** no page.

**Weakest persona: ManyChat switcher (28/100).**
- **Top issue:** the SERP is 88% comparison pages and Linkar has none.
- **Fix:** see SXO-02.

**Systemic issues**
- **Trust is the lowest dimension for 5 of the 6 personas.** The trust layer rests on Linkar's own claims, with no third-party proof and no citation of Meta.
- **Clarity on decision facts.** UPI, free quota and pricing model are present but buried below the first screen, or appear only on `/pricing`.

---

## 6. Findings

### SXO-01. The head term is a commercial SERP in Google India, not a guide SERP. Keep the homepage as its owner (High, both, open)

- **Evidence:**
  - Google India page 1 for "instagram automation" (15 Oct): vendor landing or hybrid pages 4/9 (CreatorFlow #1, Manychat product page, LinkDM, Wati's product page with a "What is Instagram automation?" section), listicles 3/9, guides 2/9 (Instagram Help, Heyy).
  - "what is instagram automation" is 7/7 guides and shares only 1 URL (heyy.io) with the head term.
  - `docs/seo/strategy-2026-10.md` section 5.2 row A1 (line 222) and section 5.3 (lines 242-244) assign the head term to a new pillar guide `/instagram-automation` "because the head-term SERP rewards guides". Section 0 of that document says its snapshots are "indicative, not Google India".
- **Recommendation:**
  - The homepage owns "instagram automation" and the tool intent. It already has the keyword title (`app/page.tsx:11`), the H1 kicker and the definition FAQ (`marketing-content.ts:150`).
  - Re-scope the pillar guide to "what is instagram automation" and the Hinglish "kaise kare" queries, with a URL and title that lead with the question, so it does not compete with the homepage.
  - Keep the cannibalisation check in strategy section 5.3.
- **Files:** `docs/seo/strategy-2026-10.md` (lines 222, 242-244), `app/page.tsx:11`.

### SXO-02. "manychat alternative": comparison page type missing (High, both, open; adds evidence to audit H6)

- **Evidence:**
  - Comparison pages make up 88% of page 1 in Google India; 8 of 9 for "manychat alternative india".
  - Indian competitors with dated pages: ReplyKaro (16 Aug), FlowDM (8 Aug), repli.in "Repli vs ManyChat" (1 Oct), InstantDM (2 Oct).
  - Manychat ranks its own "Top 10 Manychat Alternatives" page (18 Jun 2026).
  - The AI Overview judges on "UPI, flat pricing instead of expensive contact-based dollar tiers".
  - PAA: "Is there a free version of ManyChat?", "What are some free alternatives to ManyChat for Instagram?".
  - LOCAL: 0 occurrences of "ManyChat" on the 14 pages scanned.
- **Recommendation:**
  - Build `/compare/manychat-alternatives` first, ahead of `/compare/manychat`, because the alternatives SERP is the larger pattern.
  - Open with a dated criteria table:
    - pricing model (ManyChat contacts vs Linkar monthly deliveries with a hard stop);
    - UPI and GST-inclusive rupee prices;
    - free plan limits;
    - official API;
    - human handoff.
  - Answer "Is there a free version of ManyChat?" with a cited, dated fact.
  - Follow the existing drafts and their [OWNER CHECK] lines (`docs/seo/2026-10-15/competitor-drafts/`).
- **Files:** `docs/seo/2026-10-15/competitor-drafts/COMPARISON-PAGE.md`, `src/components/marketing/pricing-page.tsx`.

### SXO-03. India decision triggers are buried, and the plan maps two different SERP types to one page (High, both, open)

- **Evidence:**
  - "instagram automation india" is led by India landing pages (Repli, DMGO and ReplyKaro, all at `/instagram-automation-india`), at 67% together with Wati's hybrid page. Titles carry ₹, UPI and GST.
  - "best instagram automation tool india" is led by best-of lists (6/9: 5 articles and 1 YouTube video). Its AI Overview leads with "local pricing (UPI support)".
  - Linkar LOCAL:
    - UPI appears once, at `pricing-page.tsx:92`, under "No surprises on the invoice";
    - no title, description, H1 or hero mentions UPI;
    - the `/pricing` H1 is "Plans that grow with you." (`pricing-page.tsx:279`);
    - the homepage's visible text says "India" only in a demo bubble ("2 to 4 days across India").
  - LIVE: `/pricing` title "Pricing · Linkar", home title brand first.
  - Strategy row A3 (line 225) maps both queries to one `/compare/instagram-automation-tools-india` page.
- **Recommendation:**
  1. **`/pricing`:** title `Instagram Automation in India: Rupee Plans, UPI & GST · Linkar` (62 characters), or keep the current 46-character title and change the description to "Compare Linkar plans for Instagram automation: Free, Creator ₹199, Growth ₹499 and Agency ₹999 a month. GST included, pay by UPI, card or netbanking." (149 characters, prices from `BILLING_PLANS`). Put "Instagram automation pricing in India" into the H1 as a kicker, the same pattern as the homepage, and keep "Plans that grow with you." as the display line.
  2. **Homepage proof line** (`hero-section.tsx:48`) and the catalogue `heroProofLine` (`seo/sections/hero/shared.tsx:30`): "Free to start. Paid plans from ₹199 a month, GST included, pay by UPI." (70 characters).
  3. **Split strategy row A3 into two pages:** an India landing page (Landing type) for "instagram automation india" with rupee plans, UPI, GST, Indian scenarios and the official API, and the planned `/compare/instagram-automation-tools-india` (Comparison type) for "best ... india".
  - **Owner check first:** confirm that UPI works for recurring Razorpay subscriptions before the claim moves into titles.
- **Files:** `app/pricing/page.tsx:11-16`, `src/components/marketing/pricing-page.tsx:92,279`, `src/components/marketing/hero-section.tsx:48`, `src/components/marketing/seo/sections/hero/shared.tsx:30`, `docs/seo/strategy-2026-10.md:225`.

### SXO-04. LIVE has no page for 5 of the 7 keywords (High, LIVE, owner-action; same root cause as audit C1 and H1)

- **Evidence:**
  - LIVE `/features/instagram-comment-to-dm`, `/features` and `/llms.txt` return 404.
  - The LIVE home text has 0 occurrences of "instagram automation", "dm automation", "comment to dm" and "auto reply".
  - Its title is "Linkar · Instagram and Facebook automation" and its H1 has no keyword.
  - `/pricing` is titled "Pricing · Linkar".
  - `site:linkar.in` returns no documents.
- **Recommendation:** deploy the local build (audit section 7, step 3), then request indexing for `/`, `/pricing`, `/features/instagram-comment-to-dm` and `/features/instagram-dm-automation` first. These are the two feature pages whose page type matches a strong landing-page consensus (71% and 56%).
- **Files:** `app/page.tsx`, `app/pricing/page.tsx`, `src/content/seo/features.ts`.

### SXO-05. "instagram auto reply": no page owns the query, and the SERP wants a how-to hybrid (Medium, LOCAL, open)

- **Evidence:**
  - The SERP is fragmented: Instagram Help, a Play Store app, LinkDM, a Make template, Linktree's `/features/instagram-auto-reply`, Jotform, stepper.io and an IG reel.
  - The AI Overview gives Meta Business Suite steps and embeds videos.
  - Related searches: "auto reply template", "message for business", "personal account".
  - Supporting SERP: "auto reply message for business" is led by lists of 15 to 40+ examples.
  - LOCAL: closest page `/features/instagram-keyword-replies` ("Instagram keyword auto replies", `features.ts:27`); "Business Suite" appears 0 times on 14 pages; templates carry one sample reply each.
  - Strategy rows C2 and C3 plan `/guides/instagram-auto-reply` and an examples guide.
- **Recommendation:**
  - Build `/guides/instagram-auto-reply` as a **hybrid** page:
    1. a short answer to "Can you set an automatic reply on Instagram?";
    2. an honest table of Meta Business Suite instant replies and away messages versus keyword, comment and Story automations;
    3. how to turn auto replies off;
    4. the Linkar setup in code-drawn UI;
    5. a link to `/features/instagram-keyword-replies`.
  - Build the examples guide from the 24 templates' real sample messages, grouped by business question, so the templates hub feeds it.
  - Personal accounts: state that Meta's API does not support them (the home FAQ already says so).
- **Files:** `src/content/seo/features.ts:27-30`, `src/content/seo/templates.ts`, `docs/seo/strategy-2026-10.md` (rows C2 and C3).

### SXO-06. Free-plan facts are not on the surfaces Google shows, and two words name one limit (Medium, both, open)

- **Evidence:**
  - Cost or free questions appear in the PAA of 5 SERPs, and "free" is in the related searches of all 7.
  - Ranking snippets lead with quotas: CreatorFlow "Free plan: 500 DMs/month", LinkDM "up to 1000 DMs a month", repli.in/free "1 active automation with unlimited replies".
  - Linkar LOCAL:
    - home description "Free, paid from ₹199 a month" (`app/page.tsx:13`), no quota;
    - feature descriptions end "Start free.";
    - the quota appears only in the home FAQ ("5 automations and 1,000 messages a month", `marketing-content.ts:170`) and on `/pricing` ("1,000 deliveries each month").
  - The `/pricing` FAQ ("Before you pay for anything", `pricing-faq.tsx:20`) has no "Is Instagram automation free?" question.
- **Recommendation:**
  - Put the quota into the home and `/pricing` descriptions and into `heroProofLine`, generated from `FREE_BILLING_PLAN`. Example (151 characters): "Instagram automation for Indian creators and brands: auto-reply to comments, DMs and Story mentions. Free plan: 1,000 messages a month, paid from ₹199."
  - Choose one public word for the limit ("messages" reads more plainly than "deliveries") and use it on both pages.
  - Add "Is Instagram automation free?" as the first `/pricing` question, answered from the plan facts. This is visible content only: no FAQPage for Google.
- **Files:** `app/page.tsx:13`, `app/pricing/page.tsx:16`, `src/components/marketing/marketing-content.ts:166-171`, `src/components/marketing/pricing-faq.tsx`, `src/components/marketing/seo/sections/hero/shared.tsx:30`.

### SXO-07. Brand SERP belongs to other "Linkar"s (Medium, both, owner-action)

- **Evidence:**
  - "linkar" (Google India) returns linkar.co.uk (a UK social rewards app), 3 Play Store "Linkar" apps from other publishers, linkar.ink and linkar.cc.
  - The AI Overview: "Linkar most commonly refers to a social rewards mobile application".
  - "linkar instagram automation" returns LinkDM, LinktoDM and CreatorFlow, and no Linkar page.
  - Strategy line 150 notes the name confusion. The AI Overview's entity definition is new evidence.
- **Recommendation:**
  - Once indexed, make "Linkar" plus "linkar.in" plus "Instagram automation" co-occur everywhere off-site: one description on Instagram, LinkedIn, YouTube, Product Hunt and the listings. Then add those profiles to Organization `sameAs` (owner supplies the URLs; audit H7).
  - Keep "Linkar" in every title, as now.
  - Recheck the brand SERP and its AI Overview monthly after indexing.
  - Do not add `alternateName` values that nobody uses.
- **Files:** `app/page.tsx` (Organization JSON-LD).

### SXO-08. No video, while 3 SERPs and 2 AI Overviews favour video (Medium, both, owner-action)

- **Evidence:**
  - Video blocks on "instagram auto reply", "instagram comment to dm" and "manychat alternative".
  - The AI Overview for "instagram comment to dm" embeds a 17:26 YouTube tutorial (32K views). The one for "instagram auto reply" cites 2 YouTube videos and an Instagram reel.
  - Linkar has 0 videos on the 16 scanned pages that returned 200, and no YouTube presence. Strategy line 362 lists a tutorial video.
- **Recommendation:**
  - Record real screen captures of the actual Linkar setup (comment-to-DM, keyword reply, follow gate), each 60 to 120 seconds, for YouTube and Reels.
  - Whether to embed them on SEO pages is the owner's call under the "code-drawn UI only" rule. Add VideoObject only if a video is embedded.
- **Files:** none (owner action).

### SXO-09. Trust layer: claims without third-party proof, and Meta's own page is not cited (Medium, both, open; adds evidence to audit L13, M18 and H7)

- **Evidence:**
  - Ranking vendor pages show user counts (20,000+, 60,000+, 16,000+, 41000+) and AggregateRating (4 of the 21 pages fetched).
  - The AI Overviews frame the choice as "official Meta API / Business Partner".
  - Instagram Help "Automated chats on Instagram" ranks #3 for the head term and #4 for "instagram dm automation".
  - Linkar LOCAL rests on its own lockups ("Meta Verified Business", "14K+ replies sent so far", `trust-lockups.tsx:24,41`) and the FAQ line "Linkar passed Meta App Review" (`marketing-content.ts:164`). There are no outbound citations.
- **Recommendation:**
  - Link the "Is Instagram DM automation allowed?" answer to Meta's help page and the Instagram Platform docs.
  - The owner verifies each lockup (M18).
  - Collect genuine reviews (G2, Capterra, Product Hunt) before showing any count or rating. Invent nothing.
- **Files:** `src/components/marketing/marketing-content.ts:161-165`, `src/components/marketing/trust-lockups.tsx`.

### SXO-10. Comment-to-DM and DM pages leave out the Meta rules the AI Overviews mention (Medium, LOCAL, open; adds evidence to audit M14)

- **Evidence:**
  - The AI Overviews for "instagram automation" and "instagram dm automation" state the 24-hour messaging window and the Business or Creator account requirement.
  - Ranking guides (dmgo.in, Inrō glossary) explain private replies.
  - LOCAL: "24 hour" and "7 days" appear 0 times on all 14 pages scanned.
- **Recommendation:** in the content pass, add one plain paragraph to `/features/instagram-comment-to-dm` and `/features/instagram-dm-automation`: one private reply per comment, within 7 days; further messages only after the person replies, inside 24 hours. Cite Meta's documentation.
- **Files:** `src/content/seo/features.ts:5-26`.

### SXO-11. No visible freshness signal against dated competitors (Low, both, open; part of the deferred per-record dates)

- **Evidence:** SuperProfile and DMGO pages show "1 day ago" in the SERP; ReplyKaro shows "Last updated October 12, 2026"; SetSmart is dated 23 Aug 2026. No Linkar page shows a date.
- **Recommendation:**
  - With the per-record `updated` field (audit section 8), show "Updated <month year>" on `/pricing`, comparison pages and guides, using real dates only.
  - Feature pages do not need it.
- **Files:** `src/content/seo/types.ts`, `app/pricing/page.tsx`.

### SXO-12. Head-term alignment on the homepage (Info, LOCAL, already-fixed-locally)

- **Evidence:**
  - LOCAL title "Instagram Automation for Comments, DMs & Stories · Linkar".
  - H1 kicker "Instagram automation for comments and DMs".
  - FAQ opens with "What is Instagram automation?" (in FAQPage). It is the kind of definition passage the AI Overview quotes from Manychat and repli.in.
- **Recommendation:** keep it. LIVE still waits for deploy (SXO-04).
- **Files:** `app/page.tsx:11-13`, `src/components/marketing/hero-section.tsx:29`.

### SXO-13. Catalogue H1s carry the searcher's phrase and the free/₹199 proof line (Info, LOCAL, already-fixed-locally)

- **Evidence:**
  - `/features/instagram-comment-to-dm` H1: "Instagram comment to DM automation / A comment starts it ...".
  - The mobile screenshot shows the kicker, CTA, "Free to start. Paid plans from ₹199 a month." and trust lockups above the fold.
  - The same pattern holds on the DM, keyword, follow-gate, solutions and templates pages scanned.
- **Recommendation:** keep it.
- **Files:** `src/components/marketing/seo/sections/hero/shared.tsx`.

---

## 7. Priority actions

1. **Deploy and get indexed** (SXO-04, owner). Nothing else counts until Google indexes the homepage and the two aligned feature pages.
2. **Fix the head-term plan** (SXO-01). The homepage keeps "instagram automation". The pillar guide moves to "what is instagram automation". This needs a strategy document edit only.
3. **Surface the India and free decision facts** (SXO-03 parts 1 and 2, SXO-06). These are small copy and metadata changes in files G1 and G4 already own. Confirm UPI for subscriptions first.
4. **Build the missing page types, in this order** (each needs owner review):
   - `/compare/manychat-alternatives` (SXO-02);
   - the India landing page (SXO-03 part 3);
   - `/guides/instagram-auto-reply` with an examples guide (SXO-05);
   - `/compare/instagram-automation-tools-india`.
5. **Trust and media** (SXO-09, SXO-08, SXO-07): cite Meta, verify the lockups, collect real reviews, record real setup videos, and keep brand and profile wording consistent.
6. **Content-pass items** (SXO-10, SXO-11): the Meta rules paragraph and real updated dates.

---

## 8. Cross-skill hand-offs

| Finding | Hand off to |
|---|---|
| SXO-02, SXO-03 (comparison and listicle pages) | `/seo competitor-pages` (drafts already exist) |
| SXO-09 trust and E-E-A-T | `/seo content` |
| SXO-05, SXO-01 page ownership and cannibalisation | `/seo cluster` (needs real SERP overlap; DataForSEO would replace these manual snapshots) |
| SXO-08 VideoObject if embedded | `/seo schema` |
| SXO-07 brand entity | `/seo geo` (AI Overview entity definition) |

---

## 9. Limitations

- **One snapshot.** The SERPs are a single signed-out Google capture on 15 Oct 2026 with `gl=in&hl=en`, page 1 only, from this machine's network location. Personalisation, a different Indian city or a later date can change positions. DataForSEO is not installed, so there is no volume or keyword difficulty data and no multi-day stability.
- **No ads were rendered** in any of the 13 captures, so the ad-copy signals the skill asks for (commercial triggers, objection handling) could not be analysed. Personas lean on PAA, AI Overviews, related searches and ranking titles instead.
- **Page counts** are from DOM extraction of page-1 `h3` results. Video carousels and "Short videos" tiles were noted as features and not counted as organic results.
- **Some competitor pages render client-side** (repli.in pages returned 210 to 337 words), so their word counts are floors. Manychat pages returned a 403 bot challenge and were classified from their SERP snippets.
- **LOCAL is dev-mode HTML.** It was fetched with curl because `fetch_page.py` refuses localhost. That is fine for copy, headings, schema and links. Performance was not assessed (measure on LIVE after deploy).
- **Indexing.** Gap scores assume the page could be indexed. Today `site:linkar.in` returns nothing, so real-world SXO for both targets is effectively zero until the indexing work in audit C1 lands.
- **Wireframes** were not requested (`/seo sxo wireframe`), so the recommendations give concrete copy and section orders instead of IST/SOLL wireframes.

## 10. Evidence files (scratchpad, outside the repo)

- `seo-run/sxo-work/google-in-serps-2026-10-15.json`: all SERP captures, page-type codes, PAA, related searches and AI Overview notes.
- `seo-run/sxo-work/linkar_scan.json` and `scan_linkar.py`: LIVE and LOCAL page parses (title, description, H1, H2, word count, schema, term counts, FAQ questions, CTAs).
- `seo-run/sxo-work/serp_pages_scan.json` and `scan_serp.py`: profiles of 25 ranking pages.
- The mobile screenshots of LOCAL `/` and `/features/instagram-comment-to-dm` were viewed in the browser pane during the run.
