# Linkar SEO strategy: winning "Instagram automation" in India

- **Written:** 15 October 2026
- **Method:** `seo-plan` skill (v1.9.0) with its SaaS template (`~/.claude/skills/seo-plan/assets/saas.md`)
- **Horizon:** a detailed 12-week plan (19 October 2026 to 10 January 2027) inside a 12-month roadmap
- **Revised:** 15 October 2026, with the audit's corrections (M30): who owns the head term, two India pages instead of one, engine labels on the search snapshots, the listing plan, the wider rupee-priced competitor set, a lead-generation guide, "instagram chatbot" out of scope, and the sign-up key event
- **Companion audit:** [audit-2026-10-15.md](audit-2026-10-15.md) holds the technical findings, the health scores and the repo work groups. This document holds the strategy. Where the two touch, this one links to the audit rather than repeating it.

The skill asks for five deliverables. They are sections of this one file:

| Skill deliverable | Section here |
|---|---|
| SEO-STRATEGY.md | 1 to 3, 7 to 11 |
| COMPETITOR-ANALYSIS.md | 4 |
| SITE-STRUCTURE.md | 5 |
| CONTENT-CALENDAR.md | 6 |
| IMPLEMENTATION-ROADMAP.md | 12 |

---

## 0. Inputs, evidence and limits

**Inputs used**

- Specialist reports from this run, copied to [2026-10-15/skill-reports/](2026-10-15/skill-reports/): seo-competitor-pages, seo-programmatic, seo-page, seo-images and seo-hreflang.
- The competitor fact sheet and draft pages in [2026-10-15/competitor-drafts/](2026-10-15/competitor-drafts/).
- The companion audit and its data folder [2026-10-15/data/](2026-10-15/data/).
- Fresh checks made for this plan on 15 October 2026, saved in [2026-10-15/data/strategy/](2026-10-15/data/strategy/):
  - Google autocomplete for India (`gl=in`, `hl=en`) on 38 seed phrases: `autocomplete-gl-in-2026-10-15.json`;
  - 48 search result snapshots gathered by the seo-cluster and seo-sxo audit agents: `serp-snapshots-2026-10-15.json`. They come from **two engines**, labelled throughout this document: 41 from WebSearch standard mode (a US index; the `C:` keys) and 7 from WebSearch extended mode (a different index; the `X:` keys). For the same query the two share only 0 or 1 of 9 URLs, so they are not pooled (seo-cluster report, section 2.2);
  - one **Google India** page-1 capture for 7 target queries and 6 supporting ones (`gl=in`, `hl=en`, signed out, 15 October): [google-in-serps-2026-10-15.json](2026-10-15/data/google-in-serps-2026-10-15.json), analysed in the [seo-sxo report](2026-10-15/skill-reports/seo-sxo.md). Where it disagrees with the WebSearch snapshots, Google India wins;
  - Common Crawl web graph lookups for linkar.in and 8 competitors: `commoncrawl-competitors-2026-10-15.json`;
  - Search Console sitemaps list (read only), live HTTP checks, AI crawler user agent checks and Wayback Machine history.
- The repo: `src/lib/billing/catalog.ts`, `src/content/seo/*`, `app/robots.ts`, `app/llms.txt/route.ts`, `src/lib/analytics-path.ts`, `src/lib/legal-entity.ts`.

**What was missing, said plainly**

- The seo-cluster, seo-sxo, seo-backlinks and seo-content audits did not leave reports in the run's `reports/` folder. I used their raw working files instead (the search result snapshots and saved pages) and did the backlink and positioning work for this plan myself.
- **There is no search volume data.** DataForSEO is not installed, the Keyword Planner script cannot run (the `google-ads` library and Ads credentials are missing), and Search Console has 0 impressions. Autocomplete shows that a query exists, not how many people type it.
- **Most search result snapshots are not Google India.** The 48 WebSearch snapshots come from two US-indexed engines (see above). The only Google India data is the one-day, page-1 capture made for the seo-sxo audit. DuckDuckGo answered with a bot challenge, and nobody tried to get past it.
- So every keyword priority below is a judgement from intent, autocomplete and observed result types. Section 10 sets up the data that will replace these judgements from about week 6.

---

## 1. Executive summary

1. **The first job is to get indexed, not to rank.** Google has indexed no Linkar URL. The homepage is "Crawled, currently not indexed", the sitemap was submitted on 15 October (12 submitted, 0 indexed), no site links to linkar.in, and the domain was a parked ad-redirect domain from 2022 to 2025. See the audit, section 3.
2. **"Instagram automation" in India means DM and comment automation.** Indian autocomplete for the head term suggests "tool", "free", "dm", "message", "reply" and "comment to dm". The result pages still mix in post-scheduling guides, so the head term is ambiguous, but the conversational meaning that Linkar serves leads in what people type.
3. **In Google India the head term is a commercial SERP, so the homepage owns it.** Google India page 1 for "instagram automation" (15 October) has 4 vendor landing or hybrid pages out of 9, with CreatorFlow's homepage first, then 3 listicles and 2 guides. "what is instagram automation" is 7 of 7 guides and shares only 1 URL with it. The guide-heavy results seen earlier came from the WebSearch engines, not Google India. So the homepage owns "instagram automation" and the tool intent, and the pillar guide targets "what is instagram automation" and the Hinglish "kaise kare" queries (5.3).
4. **The India SERP is winnable sooner.** Google India page 1 for "instagram automation india" is 67% India vendor landing pages (Repli, DMGO and ReplyKaro, each at `/instagram-automation-india`, with ₹, UPI or GST in the title), while "best instagram automation tool india" is 6 of 9 best-of lists. The WebSearch extended snapshot shows small India vendors too (ReplyKaro, ReplyMitra, Reachlee, FlowDM, DMRabbit, QuickDM): rupee landing pages and roundups, not global giants. Two page types win here, so Linkar needs an India landing page and a separate India comparison page (A3 in 5.2). Linkar's real advantages (GST-inclusive rupee prices, UPI checkout, a meter that stops at the limit, plain-language rules) are what these SERPs reward.
5. **Inrō, CreatorFlow and ReplyRush are the content benchmarks.** In the WebSearch standard snapshots, inro.social appears in 22 of 41 (23 of all 48), through guides, a glossary, use-case and template pages; SuperProfile (11), Interakt (10) and InstantDM (8) follow. In the WebSearch extended engine, CreatorFlow and ReplyRush lead, each in 17 of 25 fresh snapshots (seo-cluster), with product-led use-case pages at scale. CreatorFlow is also first in Google India for the head term. Linkar appears in none.
6. **The catalogue is the base, but it must pass quality gates first.** 64 detail pages and 3 hubs exist locally. Only 36% of an average page's text is unique to it, and no H1 contains its target phrase. Release in waves after the content pass.
7. **Links are the long pole.** Linkar has 0 recorded inbound links. The plan builds them from real listings, genuinely useful assets (rules explainer, rupee pricing comparison, free tools, templates) and Indian creator-economy PR. No paid or exchanged links.
8. **Honest expectation.** Long-tail feature and comparison queries can show impressions within weeks of indexing. A top-10 position for "instagram automation india" is a 6 to 12 month target. A #1 position for "instagram automation" would take sustained links and content over many months, and nothing guarantees it.

---

## 2. Where Linkar starts (baseline, 15 October 2026)

| Measure | Value | Source |
|---|---|---|
| Google impressions and clicks | 0 and 0 (last 28 days; also 0 over 480 days) | Search Console, brief; [gsc-performance-480-days.json](2026-10-15/data/gsc-performance-480-days.json) |
| Indexed URLs | 0. Homepage "Crawled, currently not indexed", last crawl 24 Sep 2026 | [gsc-inspect-home.json](2026-10-15/data/gsc-inspect-home.json) |
| Sitemaps in Search Console | `https://linkar.in/sitemap.xml` submitted 15 Oct 2026 05:47 UTC: 12 submitted, 0 indexed. A 2019 `https://www.linkar.in/sitemap.xml` from the domain's previous owner is still listed | `gsc_query.py sitemaps`, read 15 Oct |
| Hosts | `www` 301s to `https://linkar.in/`. `http://linkar.in/` answers 200 with no redirect | `curl -I`, 15 Oct |
| Domain history | 2015: a Portuguese link shortener on WordPress ("Linkar, Encurtador de Links"). 2019: "LINKAR Hindi Blog" on `www`. 2022 to 2025: parked, with 117 short paths answering 302 and `ww25.linkar.in` parking scripts. Old paths now return 404 | Wayback CDX API; [wayback-linkar-in-history.txt](2026-10-15/data/wayback-linkar-in-history.txt) |
| Inbound links | 0 recorded in Bing Webmaster. linkar.in is not in the Common Crawl web graph (release cc-main-2026-jan-feb-mar) | Brief; [commoncrawl-linkar.json](2026-10-15/data/commoncrawl-linkar.json) |
| Organic sessions in GA4 | 0 | GA4 property 552805358 |
| Mobile lab performance, live homepage | Performance 75, LCP 5.0 s, TBT 200 ms, CLS 0.002. Repeat runs ranged from 2.9 s to 5.1 s LCP | Brief; seo-page report |
| Field Core Web Vitals | None yet (too little traffic for CrUX) | Brief |
| Live pages | 12 URLs, 10 of them legal or help pages. No feature, comparison or guide page | Live sitemap |
| Local pages ready but not deployed | 3 hubs, 64 detail pages, `/llms.txt`, recipe downloads (noindex). Homepage SEO commit `f9b5d58` is not pushed | seo-programmatic and seo-page reports |
| Catalogue uniqueness | Mean 35.9%. 56 of 64 pages below 40%, 3 below 30% | seo-programmatic report |
| AI crawler access, live | GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Bingbot and Googlebot all get 200 on `/`. `/llms.txt` returns 404 on live | `curl` with each user agent, 15 Oct |
| Presence in AI answers | A web search for "linkar.in Instagram automation" returned no Linkar page. A search summary for "best Instagram automation tool India 2026" named Wati, ManyChat, Chatfuel, Inrō, LinkDM, InstantDM, Interakt, Respond.io, TailorTalk, Kommo and Replykaro, not Linkar | WebSearch tool (US index), 15 Oct |
| Comparison, guide, About pages | None on live or local | seo-competitor-pages report; `app/` listing |

---

## 3. Positioning

### 3.1 What searchers in India mean

Google autocomplete for India, 15 October 2026 (`autocomplete-gl-in-2026-10-15.json`):

- **"instagram automation"** suggests: tool, tool free, free, dm, github, message, app, reply, comment to dm.
- **"instagram automation india"** suggests: tool india, dm automation india, best instagram automation tool india, dm automation free india.
- **"auto dm instagram"** suggests: free, comments free, free unlimited, free app, **meta verified**, app, kya hota hai, comments.
- **"comment to dm"** suggests: automation instagram free, automation, automation free, comment to dm instagram.
- **Hinglish:** "instagram automation kaise kare", "instagram automation tool kya hai", "instagram par auto reply kaise kare", "auto dm instagram kya hota hai".
- **Trust:** "is instagram automation legit", "is instagram automation allowed", "is manychat safe".

Three things stand out:

- The market language is **auto DM, comment to DM and auto reply**. Linkar's copy says "conversation flows" and "private replies". The pages should use the searcher's words.
- **"Free"** is attached to almost every query. The Free plan (5 automations, 1,000 messages a month, no card) is a lead message, not a footnote.
- **"Meta verified" and "allowed"** show that safety is a buying criterion. Linkar's plain explanation of Meta's rules can win here, as long as every trust claim is true (see 3.5).

One caution: the result pages for "instagram automation" are not only about DMs. The WebSearch standard snapshot has post-scheduling guides from Outfy, ContentStudio, Nuelink and Boltic next to DM guides. The pillar guide on "what is instagram automation" (5.3) should name both meanings in its first section, say plainly that Linkar does conversations, not post scheduling, and then go deep on conversations.

### 3.2 Positioning statement

> **Linkar is Instagram comment and DM automation built for India.** Prices are in rupees with GST included, you pay by UPI, card or netbanking, the Free plan includes 1,000 messages a month, and when you reach your limit sending stops instead of adding charges. It runs on Meta's official Instagram API and hands a conversation to a person when it needs one.

Every clause is checkable today (3.3). It does not say "cheapest", "best" or "most generous", because none of those is true against every competitor:

- Zorcha's free plan advertises unlimited automations and DMs.
- SuperProfile's Creator plan starts at ₹99 for the first month.
- ReplyKaro is listed on Capterra from ₹99 a month (search summary of its Capterra listing; not checked on its own pricing page).

### 3.3 Proof points Linkar can state

| Claim | Source |
|---|---|
| Free ₹0 (5 automations, 1,000 messages a month), Creator ₹199, Growth ₹499, Agency ₹999 a month; annual ₹1,990, ₹4,990, ₹9,990 | `src/lib/billing/catalog.ts` lines 4 to 60; https://linkar.in/pricing |
| "Every price includes applicable GST" | https://linkar.in/pricing |
| Razorpay checkout with UPI, cards and netbanking | https://linkar.in/pricing |
| At the limit, sending stops and nothing extra is billed | /pricing, "What counts as a delivery" |
| Comment to DM on posts and Reels, keyword replies, Story replies and mentions, welcome message, email capture, follow-gated campaigns, lead qualification, follow-ups, human handoff, link tracking, analytics, reply variants | `src/content/seo/features.ts` |
| Facebook Page public comment replies | `src/content/seo/features.ts` |

### 3.4 Limits Linkar states openly

A fair page that names its limits earns more trust than one that hides them, and it protects the comparison pages:

- no AI-written replies (keyword replies FAQ in `features.ts`);
- no DM on follow;
- Facebook support is public Page comment replies, not Messenger DMs;
- no WhatsApp, TikTok, Telegram, SMS or email channels;
- no paid-plan trial (the Free plan is the trial), and plan changes take effect at the next cycle (https://linkar.in/refund-policy).

### 3.5 Claims to hold back until they are verified

- "Approved by Meta" (live), "Meta Verified Business" (`src/components/marketing/trust-lockups.tsx` line 24) and "Linkar passed Meta App Review" (`src/components/marketing/marketing-content.ts` line 144). Project notes from 30 September record App Review as "in progress". Until the result is confirmed, use only "connects through Meta's official Instagram API". "Meta Verified" is also the name of Meta's paid verification subscription, so it can mislead even when business verification is real.
- Named persona quotes ("Aanya Mehta", "Arjun Nair" in `src/components/marketing/proof-rail.tsx`) unless they are real, consenting users.
- Any usage count, customer number or rating. Nothing of this kind should appear on any page without a source.
- Three pricing headings match Manychat's word for word (seo-competitor-pages finding 2). Reword them before any comparison page goes live.

### 3.6 Message pillars and where each one lives

| Pillar | What it says | Main pages |
|---|---|---|
| Built for India | Rupees, GST included, UPI, Indian examples ("LINK bhejo", a Diwali sale Reel, a coaching batch enquiry) | Home, /pricing, /instagram-automation-india, /compare/instagram-automation-tools-india, solutions |
| Safe and official | Meta's official API, Meta's rules in plain words, no password sharing | /guides/instagram-messaging-rules, /guides/is-instagram-automation-safe, comment-to-DM feature |
| Predictable cost | Counts messages sent, stops at the limit, no overage | /pricing, /compare/manychat, /compare/free-instagram-automation-tools |
| A person when it matters | Human handoff, team seats | /features/instagram-human-handoff, agency and small business solutions |
| Start free | Free plan, no card | Home, every CTA |

### 3.7 Entity naming

- Use one sentence everywhere (homepage, About, llms.txt, Organization schema, directory listings, social bios): "Linkar is Instagram comment and DM automation for creators and businesses in India." The Organization schema already carries it as `description` (`src/lib/seo-pages.ts`).
- Keep the name "Linkar" exactly. The domain history and similar names (LinktoDM, Linktree, Linkr.in) make consistency important: a brand search on 15 October returned those names instead of Linkar. DM Linkr (an Instagram comment-to-DM tool), the UK social rewards app at linkar.co.uk and a French vehicle-warranty Linkar also share the name.
- llms.txt carries the spelling line "Linkar is spelled L-I-N-K-A-R. It is a separate product from DM Linkr, Linkr and LinkDM." The Organization schema carries a `disambiguatingDescription`. Do not invent `alternateName` values.

---

## 4. Competitive analysis

### 4.1 Who wins the result pages today

Snapshots in which each domain appears at least once, by engine (`serp-snapshots-2026-10-15.json`; `C:` keys are WebSearch standard, `X:` keys are WebSearch extended). The engines are counted apart because they barely overlap:

| Domain | WebSearch standard (of 41) | WebSearch extended (of 7) | What ranks |
|---|---|---|---|
| inro.social | 22 | 1 | Guides (comment to DM, DM automation, auto replies), glossary (comment to DM, follow gate, 24-hour window, human handover), use-case and audience pages (fitness coaches), templates |
| superprofile.bio | 11 | 0 | Guides (auto reply, comment to get link, follow to get link, Hinglish "auto dm kya hai"), compare pages, use cases, changelog |
| interakt.shop | 10 | 0 | A large `/instagram-automation/` guide hub: what it is, safety, lead generation, Story replies, top tools |
| instantdm.com | 7 | 1 | Homepage, vs pages, blog how-tos, use-case pages, Shopify app listing |
| metricool.com, elev8or.io | 7 each | 0 each | Guides and best-tool lists |
| zorcha.com, wati.io, alternativeto.net | 6 each | 0 each | Zorcha: safety, follow-gate and Story guides, audience pages. AlternativeTo: listings |
| bot.space | 5 | 0 | Product and guide pages |
| linkdm.com | 4 | 1 | Compare and free-alternative pages, product pages |
| creatorflow.so | 2 | 3 | Homepage and product-led use-case pages |
| replyrush.com | 2 | 2 | Long landing page with video, "best tools in India" list |
| capterra.in, hunted.space (Product Hunt mirror), apps.shopify.com, g2.com | 3 to 4 each | 0 each | Directory and marketplace listings, including small Indian tools |

The seo-cluster re-run added 25 fresh WebSearch extended snapshots on 15 October. In those, CreatorFlow and ReplyRush each appear in 17, Flowgent in 11, Reachlee in 9 and ReplyKaro in 8 (seo-cluster report, section 7). In Google India, CreatorFlow's homepage is first for "instagram automation" (seo-sxo report).

Two lessons:

1. **Guides win in the WebSearch standard engine; product pages win in Google India.** In the standard snapshots the winners are vendors that publish many specific guides, not those with the strongest domains. In Google India, vendor landing and hybrid pages lead for "instagram automation" (44%), "instagram dm automation" (56%) and "instagram comment to dm" (71%), and guides lead for "what is instagram automation" (7 of 7). Linkar needs strong product pages and specific guides.
2. **Directories rank too.** Capterra India, AlternativeTo, G2 and Product Hunt pages appear in the WebSearch standard snapshots, so listings are both links and extra result positions.

### 4.2 Competitor profiles

Authority proxy: Common Crawl web graph PageRank rank (lower is stronger; cc-main-2026-jan-feb-mar). Moz is broken and no other authority source was available. It is a rough proxy: Inrō ranks poorly here yet dominates the WebSearch standard snapshots, which shows that content depth is doing the work.

| Competitor | India pricing (own pages, 15 Oct) | Content strategy seen | Structured data seen | CC PageRank rank | E-E-A-T signals |
|---|---|---|---|---|---|
| Manychat | USD, before tax: Free (25 contacts), Essential $17, Pro $39 a month | Blog incl. "what is Instagram automation" and "top 10 alternatives"; help centre | Not checked (Cloudflare blocks fetches) | 5,823 | Claims "Official Meta Business Partner"; help centre |
| Inrō | Not checked | Glossary, guides, use cases, templates, audience pages | SoftwareApplication, Article on guides | 3,737,195 | A dedicated safety page; deep, specific guides |
| SuperProfile (Cosmofeed Technologies) | Free Starter; Creator ₹99 first month, then ₹499 | Guides incl. Hinglish, compare pages, changelog | Not recorded | 169,846 | Indian company named on site |
| Zorcha (Zorcha Software Pvt Ltd) | Free (unlimited automations); Pro ₹1,199 a month | Blog (safety, follow gate, comment to DM), compare pages vs 8 tools, `/for/` audience pages | WebPage, BreadcrumbList, FAQPage | Not in graph | "Made and registered in India"; "Reviewed 28 September 2026" dates |
| InstantDM | Free (500 DMs a month); Legend Pro ₹999 a month | Vs pages, 7,730-word alternatives list, use cases, Shopify app | SoftwareApplication, AggregateRating, Offer, FAQPage | 567,761 | "Updated August 2026" |
| Interakt (Jio Haptik) | Starter ₹999 + taxes a month | Big guide hub under `/instagram-automation/` | Not recorded | Not checked | Jio Haptik Technologies Limited named in the footer |
| ReplyKaro and other new Indian tools (ReplyMitra, Reachlee, FlowDM, DMRabbit, QuickDM) | ReplyKaro from ₹99 a month per Capterra | India landing pages ("Instagram automation in India: ₹ pricing, UPI and free plan") and "best tools in India" roundups | ReplyKaro: Article, FAQPage, Offer, SoftwareApplication, AggregateRating | ReplyKaro not in graph | Dated pages; vendor-written roundups |
| CreatorFlow | Not checked on its own pages; its ranking snippet leads with "Free plan: 500 DMs/month" | Homepage first in Google India for "instagram automation"; product-led use-case pages at scale; 1,902-word landing page | AggregateRating, FAQPage, Offer, SoftwareApplication; HowTo (see 4.4) | Not checked | "Trusted by +20,000" user count |
| ReplyRush | Not checked | 3,159-word landing page with video; a "10 Best ... India 2026" list that names 10 tools and not Linkar | AggregateRating | Not checked | "41000+" user count |

Sources: [competitor-drafts/sources.md](2026-10-15/competitor-drafts/sources.md); `work/sxo/serp_scan.json` (page types, schema and price signals of the ranking pages); `commoncrawl-competitors-2026-10-15.json`; [seo-sxo](2026-10-15/skill-reports/seo-sxo.md) and [seo-geo](2026-10-15/skill-reports/seo-geo.md) for CreatorFlow, ReplyRush and the rupee-priced tools below.

#### 4.2.1 Rupee-priced tools that India AI answers cite

India AI answers and India result pages name more tools than the brief listed, all priced in rupees. They belong in the competitor set, the comparison pages and the regex in Appendix A. The prices are vendor claims gathered on 15 October 2026 (seo-geo report, section 4), not verified facts; check each one on the vendor's own page before it appears on a Linkar page.

| Tool | INR price or model claimed | Seen at |
|---|---|---|
| ReplyKaro (Mumbai) | ₹99 a month | replykaro.com llms.txt, Capterra |
| FlowDM | ₹299 a month | flowdm.in |
| QuickDM | ₹199 to ₹399 a month (sources disagree) | seo-geo report; the Google India AI Overview cites about ₹399 from Reddit |
| UnlockDM | Per campaign, from ₹299 | tryunlockdm.com |
| RapidDM | ₹499 a month | rapiddm.com |
| AutoDM | ₹49 a month | autodm.live |
| Repli | ₹249 and ₹499 | repli-in.lovable.app; ranks as repli.in in Google India |
| ViralDM | ₹499 a month | hunted.space (Product Hunt mirror) |

DM Linkr (dmlinkr.com) is not priced here but matters for another reason: it is an Instagram comment-to-DM tool whose name is close to Linkar's (3.7).

### 4.3 Gaps Linkar can fill

1. **No one owns "rupee-first and honest" comparison content.** Most vs pages compare in dollars, and none sets GST-inclusive rupee prices beside Manychat's pre-tax dollar prices (seo-competitor-pages).
2. **The India SERP is thin.** In the WebSearch extended snapshot for "instagram automation india", 6 of the 8 pages are vendor pages of 800 to 1,700 words. In Google India the same query is 67% India vendor landing pages, and "best instagram automation tool india" is mostly best-of lists. A rupee landing page and a thorough, sourced, dated India comparison page can both compete (A3).
3. **Hinglish queries are answered by English pages.** In the WebSearch standard snapshots, "instagram automation kaise kare hindi" shares 3 of its top URLs with "what is instagram automation" (a fourth shared URL was a spam host, `erpstaging.fha.gov.ng`, and is not counted), and "instagram auto reply kaise kare" shares 3 with "instagram auto reply". SuperProfile is the one vendor seen with a Hinglish guide (found by web search). Hinglish sections inside the English pillar pages are the first test; standalone Hinglish guides follow only if Search Console shows demand.
4. **Meta's rules are explained vaguely almost everywhere.** A plain, cited explainer (one private reply per comment within 7 days, follow-ups only after the person replies and within 24 hours, per Meta's private replies documentation as cited in the seo-page report) is useful, linkable and quotable by AI answers.
5. **Free plan confusion.** "Free" dominates autocomplete, and every tool means something different by it (Manychat 25 contacts, InstantDM 500 DMs, SuperProfile 10 leads, Zorcha unlimited, Linkar 1,000 messages). A sourced "free plans compared" page answers the real question.

### 4.4 What not to copy

- **AggregateRating markup without genuine reviews** (InstantDM, ReplyKaro, LinktoDM and CreatorFlow use it). Add ratings only after real reviews exist and Google's review snippet rules allow them.
- **HowTo markup** (CreatorFlow uses it). Not part of this plan.
- **Roundups that quietly rank the author's tool first.** Linkar's roundups should state the criteria, disclose that Linkar is the publisher, and include tools that beat Linkar on some criteria.
- **Manychat's wording and identity** (see 3.5).

---

## 5. Keyword and cluster architecture

### 5.1 Method and confidence

- **Universe:** autocomplete for India on 38 seeds plus the Manychat-modifier seeds from the competitor work.
- **Grouping:** by intent and by the page type that ranks, checked against shared URLs where possible, within one engine at a time. Strong pairs in the WebSearch standard snapshots: "instagram automation" and "what is instagram automation" (3 shared URLs); "how to automate instagram dms" and "instagram dm automation" (3); "instagram story reply automation" and "instagram story mention auto reply" (2); "instagram comment to dm automation" and "instagram comment par auto dm kaise bheje" (2). Google India disagrees on the first pair: there the head term and "what is instagram automation" share only 1 URL, which is why they get different owner pages (5.3).
- **Confidence:** medium for intent, low for priority (no volumes). Re-check every cluster against Search Console queries from week 6, and against DataForSEO if it is installed.

### 5.2 Clusters mapped to pages

Status: **L** = exists in the local build (not deployed), **N** = new page, **M** = merge.

| # | Cluster | Representative queries (autocomplete, India) | Intent and ranking page type | Owner page | Supporting pages | Status |
|---|---|---|---|---|---|---|
| A1 | What is Instagram automation (informational) | what is instagram automation; instagram automation kaise kare; instagram automation tool kya hai | Informational: guides (Google India: 7 of 7 guides for "what is instagram automation") | **/guides/what-is-instagram-automation** (pillar guide, 3,000+ words, with a Hinglish "kaise kare" section) | Home, /features, /guides/* | N |
| A2 | Head term and tool | instagram automation; instagram automation tool; instagram automation app; instagram automation software; instagram automation free | Commercial: Google India page 1 for the head term is 4 of 9 vendor landing or hybrid pages (CreatorFlow's homepage first), 3 listicles and 2 guides; the tool queries mix landing pages and lists | **/** (homepage) | /pricing, /features, the pillar guide | L (deploy `f9b5d58`) |
| A3a | India landing | instagram automation india; instagram dm automation india | Commercial: Google India page 1 is 67% India vendor landing pages with ₹, UPI or GST in the title (Repli, DMGO and ReplyKaro, each at `/instagram-automation-india`) | **/instagram-automation-india** (landing page: rupee plans with GST, payment methods, Indian scenarios, the official API; UPI goes in the title only after the owner confirms recurring UPI payments) | Home, /pricing, /compare/instagram-automation-tools-india | N |
| A3b | India comparison | best instagram automation tool india; instagram automation tool india | Commercial investigation: Google India page 1 for "best instagram automation tool india" is 6 of 9 best-of lists | **/compare/instagram-automation-tools-india** (dated rupee comparison with the buyer criteria first) | /instagram-automation-india, /pricing, /compare/manychat-alternatives | N |
| A4 | Free | instagram automation free; instagram dm automation free; auto dm instagram free unlimited; comment to dm automation free | Commercial: free tools and lists | **/compare/free-instagram-automation-tools** | /pricing (Free plan), home | N |
| B | Comment to DM | instagram comment to dm (automation, tool, free); auto dm instagram from comment; instagram comment auto reply; comment to get link | Commercial and how-to: tool pages and setup guides | **/features/instagram-comment-to-dm** | /features/instagram-reel-comment-automation, /templates/comment-guide-delivery, /templates/reel-shopping-link, /guides/instagram-messaging-rules | L |
| C1 | DM automation | instagram dm automation (tool, free, app); how to automate instagram messages; how to send automated dms on instagram | Commercial and how-to | **/features/instagram-dm-automation** | /features/no-code-instagram-flow-builder, /features/instagram-dm-follow-ups | L |
| C2 | Auto reply | instagram auto reply; instagram auto reply message (example, for business); instagram keyword auto reply; instagram par auto reply kaise kare | How-to guides | **/guides/instagram-auto-reply** | /features/instagram-keyword-replies, /templates hub | N |
| C3 | Reply examples and templates | instagram auto reply message example; instagram welcome message (examples, copy paste, in hindi, for business) | Template and example lists | **/templates** (hub) plus **/guides/instagram-auto-reply-message-examples** | /templates/first-message-welcome, /templates/dm-price-list, /features/instagram-first-message-welcome | L + N |
| D | Stories | instagram story reply automation; story mention auto reply | Setup guides and feature pages | **/features/instagram-story-reply-automation** | /features/instagram-story-mention-replies, Story templates | L |
| E1 | Leads and growth | follow to get link; collect emails in instagram dms; giveaway automation | Commercial and how-to | **/features/instagram-email-capture**, **/features/instagram-follow-gate**, **/features/instagram-lead-qualification** | Matching templates (merge candidates, 5.4) | L, M |
| E2 | Lead generation (cluster 4 in the seo-cluster plan) | instagram lead generation (tool, automation) | How-to: lead-generation guides (bot.space, Interakt, Inrō). In the WebSearch standard snapshots it shares 0 URLs with the email capture and follow gate queries, so it needs its own page | **/guides/instagram-lead-generation** | /features/instagram-email-capture, /features/instagram-follow-gate, /features/instagram-lead-qualification, each linking back | N |
| F | Team and insights | instagram automation human handoff; instagram dm link tracking; automation analytics | Feature pages | Matching feature pages | Agency solution | L |
| G | Facebook | facebook comment auto reply; facebook page comment auto reply; facebook post comment auto reply | Tool pages and setup docs | **/features/facebook-comment-auto-reply** (absorbs the keyword and post-specific pages) | 4 Facebook templates | M |
| H | Audiences | instagram automation for creators, coaches, small business, ecommerce, restaurants | Vendor audience pages rank (Inrō, Zorcha, InstantDM) | 20 **/solutions/** pages | Matching features and templates | L |
| I | Comparisons | manychat alternative (india, free, for instagram); manychat india pricing; manychat free plan limit; manychat vs superprofile; superprofile pricing; zorcha pricing; instantdm alternative; linkdm alternative; manychat vs linktree | Alternatives lists and vs pages | **/compare/manychat**, **/compare/manychat-alternatives**, later **/compare/superprofile**, **/compare/zorcha**, **/compare/instantdm**, **/compare/linkdm** | /compare hub, /pricing | N (drafts exist for the first two) |
| J | Trust and rules | is instagram automation allowed, legit, safe; auto dm instagram meta verified; 24 hour messaging window | Guides and safety pages (Inrō, Zorcha, Interakt, Metricool) | **/guides/is-instagram-automation-safe** | /guides/instagram-messaging-rules, comment-to-DM feature | N |
| K | Link in bio versus DM | manychat vs linktree; manychat vs stan store; link in dm instagram | Comparison and how-to | **/guides/comment-to-dm-vs-link-in-bio** | /features/instagram-link-tracking | N |

### 5.3 Who owns the head term

- **The homepage owns "instagram automation"**, the tool intent ("tool", "app", "software") and the brand. Google India shows a commercial SERP for the head term: 4 of 9 page-1 results are vendor landing or hybrid pages, with CreatorFlow's homepage first (seo-sxo, SXO-01). The homepage already has the title `Instagram Automation for Comments, DMs & Stories · Linkar`, the H1 kicker and a definition FAQ.
- **/guides/what-is-instagram-automation (new pillar guide)** targets "what is instagram automation" and the Hinglish "kaise kare" queries ("instagram automation kaise kare", "instagram automation tool kya hai"). In Google India, "what is instagram automation" is 7 of 7 guides and shares only 1 URL with the head term. The guide's URL and title lead with the question, so it does not compete with the homepage. It defines the term in 40 to 60 words near the top, names both meanings (conversation automation and post scheduling) and says which one Linkar does, explains what can and cannot be automated under Meta's rules, walks through the main use cases with code-drawn product UI, compares tool types with a sourced rupee table, and includes a short Hinglish section. It links to the homepage with the anchor "Instagram automation" and to every feature cluster.
- **Watch for cannibalisation.** If Search Console shows Google swapping the two URLs for the same query after 8 weeks, sharpen the guide's question wording and keep the homepage title on the head term, or merge.

### 5.4 Merges and consolidation (before or during the waves)

From the seo-programmatic report (M7), decide by Search Console data or a SERP overlap check (merge when 7 or more of the top 10 match):

- Feature and template twins: human handoff, first-message welcome, Story reply and Story offer, follow gate and follow-gated freebie, email capture and email resource delivery, DM follow-ups and offer follow-up. The default is to keep the template but make it unmistakably template intent (full message set first, download, short capability note linking to the feature).
- **Merge the three Facebook features** into one strong `/features/facebook-comment-auto-reply` page with keyword and post-selection sections, and 301 the other two slugs.
- Story reply and Story mention share result URLs. Keep both for now, but give each different examples and FAQs.

### 5.5 URL hierarchy

```
/                                   home: head term, tool intent, brand          L (deploy)
/instagram-automation-india         India landing page                           N
/pricing                                                                         live
/features                           hub                                          L, wave 1
  /features/<slug>                  20, Facebook trio merged to 1 (18)           L, wave 1
/solutions                          hub                                          L, wave 2
  /solutions/<slug>                 20                                           L, wave 2
/templates                          hub ("workflow recipes" in the UI)           L, wave 3
  /templates/<slug>                 24 (fewer if twins merge)                    L, wave 3
  /templates/<slug>/recipe          Markdown download, noindex                   L
/compare                            hub                                          N
  /compare/manychat                                                              N (draft ready)
  /compare/manychat-alternatives                                                 N (draft ready)
  /compare/instagram-automation-tools-india                                      N
  /compare/free-instagram-automation-tools                                       N
  /compare/superprofile, /compare/zorcha, /compare/instantdm, /compare/linkdm    N, later
/guides                             hub for evergreen how-to and rules           N
  /guides/what-is-instagram-automation  pillar guide: "what is", "kaise kare"   N
  /guides/<slug>                    8 or 9 more in the first 12 weeks            N
/tools/<slug>                       free calculators and checkers                N, phase 3
/about                              operator, team, why Linkar exists            N
/support, legal pages                                                            live
```

Why `/guides` and not `/blog`: the plan is evergreen how-to and reference content that gets updated, not dated news. Dates still show on every guide ("Updated on").

### 5.6 Internal link matrix

| From | Must link to |
|---|---|
| Home | /guides/what-is-instagram-automation, /features, the 4 lead features from the surface cards (comment to DM, DM automation, Story mention replies, follow gate), /pricing, /instagram-automation-india, /compare |
| /guides/what-is-instagram-automation | The homepage (anchor "Instagram automation"), each feature cluster owner (B to G), /templates, /guides/instagram-messaging-rules, /guides/is-instagram-automation-safe, /compare/instagram-automation-tools-india, /pricing |
| /instagram-automation-india | /pricing, /compare/instagram-automation-tools-india, the 4 lead features, 2 or 3 solutions with Indian examples |
| Feature page | Its template twin, 2 solutions that use it, the matching guide, /pricing; back to /features and /guides/what-is-instagram-automation |
| Solution page | 2 or 3 features, 2 templates, 1 or 2 sibling audiences (fixes the 6 pages with zero related in-links) |
| Template page | Its feature twin, 1 solution, the recipe download |
| Compare page | /pricing, the features it mentions, the other compare pages, /compare hub |
| Guide | The owning feature or pillar, 1 or 2 templates, /pricing (one contextual CTA, not more) |
| Footer | Hubs, /compare, /guides, /about. Keep the full 64-link directory only while the catalogue stays under about 100 pages |

Anchor text: descriptive and varied ("send a DM when someone comments", "comment to DM automation"), never the same exact phrase on every page.

### 5.7 Sitemaps and quality gates

- Split sitemaps (seo-programmatic M6): `/sitemap.xml` (core), `/features/sitemap.xml`, `/solutions/sitemap.xml`, `/templates/sitemap.xml`, plus `/compare/sitemap.xml` and `/guides/sitemap.xml` when those launch. List each in `robots.ts` and submit each in Search Console and Bing.
- A URL enters a sitemap only when it is self-canonical, indexable, at least 40% unique (50% mean across its collection), and its `lastmod` comes from a real per-page `updated` date.
- Recipe downloads stay noindex and out of sitemaps.

### 5.8 Out of scope

Do not target: "github", "n8n", "python" (do-it-yourself bots); "bot for followers" or "likes" (against Instagram's rules and Linkar's purpose); "story mention viewer" or "checker" (consumer tools); "instagram automation stock price" and "ig automation share price" (unrelated stock queries); "instagram chatbot" (its result page is AI chatbot builders, with no URL overlap with Linkar's clusters, and Linkar sends no AI-written replies; seo-cluster report, section 3).

---

## 6. Content strategy and 12-week calendar

### 6.1 Page types and counts

| Type | Today (local) | Added in 12 weeks | Notes |
|---|---|---|---|
| Home, pricing | 2 | 0 | Rework copy for the tool intent and the Free plan |
| Pillar guide | 0 | 1 | /guides/what-is-instagram-automation |
| India landing page | 0 | 1 | /instagram-automation-india |
| Feature, solution, template pages | 64 | 0 (about 60 after merges) | Content pass before each wave |
| Compare pages | 0 | 6 (hub + 5) | 2 drafts exist |
| Guides | 0 | 8 (+ hub), 9 if a second Hinglish guide earns its place | Rules, safety, auto reply, examples, link in bio, lead generation, Hinglish test, one seasonal |
| About | 0 | 1 | Needs the legal entity details |

### 6.2 Quality bar for every page

- **Unique and specific:** at least 40% unique text per page (50% mean), page-specific FAQs, and an Indian example where it helps.
- **Sourced:** Meta rules link to Meta's developer documentation. Competitor facts carry a source URL and a "checked on" date, and are re-checked quarterly (a typed `checkedOn` field with a test that fails after 100 days, per the competitor report).
- **Real numbers only:** prices and limits come from `src/lib/billing/catalog.ts`. No invented statistics, testimonials, customer names or ratings.
- **Visuals:** a hero photo plus code-drawn Linkar UI. No AI-generated images.
- **Copy rules:** no em dashes; never the words "payload", "recipient" or "webhook"; pass `pnpm check:copy`.
- **Searcher words:** say "auto DM", "comment to DM" and "auto reply" alongside "private reply".
- **Dates:** show "Updated on" and keep `dateModified` honest.

### 6.3 E-E-A-T plan

1. **About page** (week 1 or 2, once `src/lib/legal-entity.ts` is filled): who runs Linkar, where in India, why it exists, how to reach a person. Link it from the footer. Add `founder` and `address` to Organization.
2. **Bylines:** guides and compare pages carry a real author with a short bio and a link to the About page. Article schema names the author.
3. **Show experience:** use real screens from Linkar (code-drawn UI or real screenshots), real setup steps and real limits. When customers agree in writing, add short case notes with their own numbers.
4. **Official sources:** link Meta's documentation wherever a rule is stated.
5. **Dogfooding:** run Linkar on Linkar's own Instagram. "Comment GUIDE and we will DM you the link" on posts that promote each guide. This is real product experience the guides can describe.

### 6.4 Calendar: 19 October 2026 to 10 January 2027

Assumes one owner with part-time writing help. **Must** items protect indexing and quality; **Should** items can slip a week.

| Week | Dates | Ship (technical and catalogue) | Publish (new content) | Links, PR and distribution |
|---|---|---|---|---|
| 1 | 19 to 25 Oct | **Must:** deploy `main` (homepage SEO commit `f9b5d58`); Cloudflare "Always Use HTTPS"; remove the persona quotes and unverified Meta wording; move the root loading skeleton off public pages; catalogue paths in GA4 and the CSP; remove the 2019 `www` sitemap in Search Console; request indexing for `/` and `/pricing` | **Must:** /about (if legal details are ready) | Create the Linkar Instagram, LinkedIn and YouTube profiles if missing, with the one-sentence description; collect official URLs for `sameAs` |
| 2 | 26 Oct to 1 Nov | **Must:** wave 1, the `/features` hub and its pages, after labels go into the H1s and each feature gets page-specific FAQs; submit `/features/sitemap.xml`; request indexing for the hub and 5 lead features | **Must:** /guides/what-is-instagram-automation pillar guide, with its Hinglish "kaise kare" section | Listings: a G2 profile and one Capterra listing (owned by G2; it also covers GetApp and Software Advice, and shows up as capterra.in), SaaSHub, AlternativeTo |
| 3 | 2 to 8 Nov | Reword the 3 pricing headings shared with Manychat; add the `@id` schema graph and billing periods (audit G1) | **Must:** /compare hub and /compare/manychat (from the draft, after the owner checks); **Should:** /guides/festive-sale-comment-to-dm (Diwali is 8 November; this one is for social and email, since a new page is unlikely to rank in time) | Use comment to DM on Linkar's own posts to deliver the festive guide |
| 4 | 9 to 15 Nov | Review wave 1 in Search Console: indexed versus "crawled, not indexed" | **Must:** /compare/manychat-alternatives; **Must:** /guides/instagram-messaging-rules (cited Meta rules) | Techjockey listing; prepare the Product Hunt page |
| 5 | 16 to 22 Nov | **Must, if wave 1 is mostly indexed:** wave 2, `/solutions`, with India examples and the in-link fixes; submit its sitemap | **Must:** /instagram-automation-india (rupee plans with GST, payment methods, Indian scenarios, the official API; UPI in the title only after the owner confirms recurring UPI payments); **Should:** /guides/is-instagram-automation-safe | Start listicle outreach (section 7.4): 10 accurate inclusion requests |
| 6 | 23 to 29 Nov | First Search Console query review: map real queries to clusters and fix titles | **Must:** /compare/free-instagram-automation-tools (sourced free plan table); **Should:** Hinglish test guide /guides/instagram-automation-kaise-kare | Pitch the free plans table to 5 creator-economy newsletters and blogs |
| 7 | 30 Nov to 6 Dec | Merge the Facebook trio and 301 the slugs; add per-record `updated` dates | **Must:** /compare/instagram-automation-tools-india (buyer criteria: GST, UPI, rupee prices, Meta API, free plan limits) | Product Hunt launch, if the owner can be online that day |
| 8 | 7 to 13 Dec | **Must, if quality gates pass:** wave 3, `/templates`, twins resolved, the 3 low pages fixed or held; submit its sitemap | **Should:** /guides/instagram-auto-reply-message-examples (copy-ready examples with Hinglish variants, linking to templates) | Share the recipe downloads in creator communities, with disclosure |
| 9 | 14 to 20 Dec | Uniqueness CI gate on (40% per page, 50% mean) | **Should:** /compare/superprofile (fact-checked like the Manychat page); **Should:** /guides/instagram-lead-generation (links to email capture, follow gate and lead qualification, which link back) | Second outreach batch: 10 roundup owners and 5 Indian startup and marketing media pitches (section 7.5) |
| 10 | 21 to 27 Dec | Light week (holidays) | **Should:** /guides/instagram-auto-reply | Reply to any journalist or blogger follow-ups |
| 11 | 28 Dec to 3 Jan | Refresh the 10 feature pages with the most impressions: add the queries they are seen for, extra FAQs, India examples | **Should:** /guides/comment-to-dm-vs-link-in-bio | Update the listings with new screenshots |
| 12 | 4 to 10 Jan | Quarter review: KPIs (section 11), pruning (noindex or merge any URL still "crawled, not indexed" after 8 weeks), plan Q1 | **Could:** /compare/zorcha or a second Hinglish guide, only if week 6's Hinglish guide shows impressions | Publish the Q1 update of the rupee pricing tables and tell everyone who cited them |

### 6.5 Distribution for every piece

- Post on Linkar's Instagram with a comment-to-DM trigger that delivers the link.
- Short tutorial video for YouTube and Reels showing the real setup.
- Add the page to `llms.txt` and the right sitemap on the day it ships.
- Link it from at least two existing pages (section 5.6).

---

## 7. Link building and digital PR

### 7.1 Baseline and principles

- **Baseline:** 0 inbound links in Bing; not in Common Crawl. Every link from here is a gain.
- **Principles:** earn links with useful things; no paid links without `rel="sponsored"`, no link exchanges, no private networks, no comment or forum spam (Google's spam policies treat these as link schemes).
- **Anchors:** mostly the brand and plain URLs. Descriptive anchors for feature pages come naturally from guides that cite them. Do not ask for exact-match "instagram automation" anchors.

### 7.2 Tier 1: real listings (weeks 1 to 8)

| Where | Why (evidence) | Action |
|---|---|---|
| Capterra, GetApp and Software Advice (owned by G2 since the deal closed on 5 February 2026) | capterra.in pages appear in the WebSearch standard snapshots for "instagram automation tool india" and "manychat alternatives india" | One free Capterra vendor listing with rupee pricing still covers all three; ask real users for reviews later |
| G2 | g2.com pages appear in the WebSearch standard snapshots for "free instagram automation tool" and "instagram automation for creators" | A separate free profile, with the same description and rupee prices as the Capterra listing |
| AlternativeTo | Ranks for "manychat alternative" (several result pages) | List Linkar as an alternative to Manychat, SuperProfile, LinkDM and InstantDM, honestly tagged |
| SaaSHub | Has pages for Manychat and Zorcha ("Is Zorcha good?") | Free listing |
| Techjockey (Indian software marketplace) | techjockey.com appears for "manychat alternatives india" | Listing with INR pricing |
| Product Hunt | Product Hunt data sites such as hunted.space rank for "instagram automation tool india" | One planned launch (week 7) |
| Peerlist | peerlist.io project pages appear for "instagram dm automation" | Founder project page |
| Own profiles: Instagram, LinkedIn, YouTube, X | Entity signals and `sameAs` | One description everywhere |

Do not claim "Meta Business Partner" or join any Meta directory unless Meta's records show Linkar qualifies.

Startup India (DPIIT) recognition is not on this list: it is not open to a sole proprietorship, which is Linkar's entity type (`src/lib/legal-entity.ts`). Revisit only if Linkar incorporates.

### 7.3 Tier 2: assets worth linking to

1. **Instagram messaging rules, explained** (`/guides/instagram-messaging-rules`): the private reply window, the 24-hour window, what happens on Live, what "official API" means, each with a Meta citation. Bloggers and AI answers need a clear, citable source for this.
2. **Rupee pricing and free plans tables** (`/compare/free-instagram-automation-tools`, `/compare/instagram-automation-tools-india`): public prices only, every row sourced and dated, refreshed every quarter. Dated, refreshed data gets cited and linked.
3. **Free tools** (phase 3, code-drawn, no sign-up):
   - a cost calculator that compares "per message" and "per contact" pricing using public prices (it explains Manychat's Active Contact meter next to Linkar's delivery meter);
   - a keyword list builder for comment triggers, including common Hinglish spellings ("link", "LINK", "lnk", "link pls", "bhejo");
   - a DM message checker (length, link placement, plain-language tips).
4. **Templates library:** the 24 recipes with Markdown downloads are already a shareable resource for creator educators.

### 7.4 Tier 3: accurate inclusion in roundups

Both WebSearch engines and the Google India capture show roundups ranking for the money terms (in Google India, "best instagram automation tool india" is 6 of 9 best-of lists). Ask the owners to consider Linkar, with a short, factual note (rupee price with GST, Free plan limits, Meta API, what Linkar does not do):

- **India roundups:** reachlee.co, replymitra.in, flowdm.in, dmrabbit.com, quickdm.app, the tryunlockdm.com and replyrush.com India lists (both cited by AI answers, neither names Linkar), dev.to posts about India tools. Most are written by vendors; expect a low reply rate, and never pay for placement.
- **Global roundups:** influencermarketinghub.com, hypeauditor.com, socialpilot.co, heyy.io, flowgent.ai, setsmart.io, skedsocial.com, kommo.com, brandwatch.com, wati.io, metricool.com.
- **Alternatives lists:** respond.io, tidio.com, sendpulse.com, helply.com, chatplace.io and the Manychat-alternative roundups.

Track every request in a sheet: URL, contact, date, reply, outcome.

### 7.5 Tier 4: Indian digital PR

**Story angles** (each built on verifiable facts, no invented numbers):

- "What Instagram's rules actually allow: a plain-language guide for Indian creators", based on Meta's documentation.
- "What Instagram automation costs in India: rupee prices and GST compared", the quarterly pricing table.
- The founder story: an Indian SaaS built for creators who pay in rupees and by UPI.

**Outlets to pitch** (check each one's submission rules first):

- startup and tech media: YourStory, Inc42, Entrackr;
- marketing and creator-economy trade media: Social Samosa, afaqs!, exchange4media, ETBrandEquity;
- creator educators on YouTube and Instagram who teach growth in Hindi and English: offer free accounts for honest tutorials, with clear sponsorship disclosure where anything is given.

### 7.6 Communities

Autocomplete shows "manychat alternative reddit" and "best instagram automation tool reddit". Answer genuinely in relevant Reddit, Quora and Facebook group threads. Always say you work on Linkar, follow each community's rules, and link only when the link answers the question.

### 7.7 Link targets

| Window | Referring domains (target, not a forecast) |
|---|---|
| Week 12 | 10 to 15 (mostly listings and profiles) |
| Month 6 | 25 to 40, at least 5 of them editorial (articles, roundups, guides) |
| Month 12 | 60 or more, at least 20 editorial, including 3 or more from Indian media or creator-economy publications |

---

## 8. AI search (GEO)

### 8.1 Baseline

- Robots: `User-Agent: * Allow: /` with only private paths disallowed. GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Bingbot and Googlebot all got 200 on 15 October. Keep it this way, and check that Cloudflare's AI bot blocking stays off.
- `/llms.txt` exists locally (`app/llms.txt/route.ts`) and returns 404 on live.
- Linkar is not named in the AI-style search summaries checked on 15 October (section 2).

### 8.2 What gets a brand into AI answers, and the actions

AI answers lean on the same sources that rank: roundups, directories, comparison pages, Reddit and the vendor's own clear pages. So most of section 7 is also AI search work. On Linkar's own pages:

1. **Quotable passages:** a 40 to 60-word definition at the top of the pillar guide and of each feature page; short, self-contained answers under question headings; tables for prices and limits with "checked on" dates.
2. **Entity clarity:** one description everywhere (3.7); Organization with `sameAs` to the real profiles; an About page; SoftwareApplication with a stable `@id` that every page's `about` points to (audit G1).
3. **llms.txt:** deploy it. Locally it already opens with "Linkar (linkar.in) is Instagram automation software..." and the spelling line, and has a Facts section (GST, payments, yearly prices, the Free plan, how messages are counted, cancelling, non-affiliation with Meta, a last-updated date), every guide with a factual one-line description, and an Optional section with the 24 recipe downloads. Add Compare and the new guides as they launch, filtered by launch wave, each as `- [label](url): one-line description`.
4. **FAQ content:** keep visible questions and answers. The homepage FAQPage markup can stay for AI parsers; do not add FAQPage elsewhere for Google rich results (Google limits them to government and health sites).
5. **Bing:** Bing's index feeds Microsoft Copilot, so the Bing sitemaps and IndexNow (Cloudflare Crawler Hints) matter.
6. **YouTube and Reddit:** short real tutorials and honest community answers are sources AI answers often cite.

### 8.3 Monthly prompt panel

On the first Monday of each month, ask ChatGPT (search on), Perplexity, Google (AI Overviews or AI Mode, India) and Microsoft Copilot these prompts. Log whether Linkar is mentioned, whether linkar.in is cited, and which sources are cited.

1. best Instagram automation tool in India
2. cheapest Instagram DM automation tool with UPI payment
3. ManyChat alternative for India
4. free Instagram comment to DM tool
5. is Instagram DM automation allowed by Meta
6. how to send a link automatically when someone comments on my Reel
7. Instagram auto reply tool for small business India
8. what is Instagram automation
9. SuperProfile vs ManyChat vs Linkar
10. Instagram automation kaise kare
11. Instagram automation for coaches in India
12. what is Linkar

---

## 9. Technical foundations

### 9.1 Must-fix items (details and file lists in the audit)

| Item | Target | Audit reference |
|---|---|---|
| Deploy `main` so live gets the keyword title, H1 kicker, WebSite data and internal links | Live | Section 3 and work group G4 |
| HTTP to HTTPS 301 at Cloudflare | Live | Owner actions |
| Remove unverified trust claims and persona quotes | Both | Owner actions |
| Move the root `loading.tsx` off public pages; remove delayed hero text and CTA animations | Both | G6 |
| Target phrase inside every hub and detail H1 | Local | G5 |
| Page-specific FAQs and notes; rendered uniqueness gate | Local | Deferred content pass |
| Launch-wave switch, per-collection sitemaps, per-record `updated` dates | Local | G2 and deferred |
| Catalogue, compare and guide paths in `ANALYTICS_PAGE_PATHS` and the CSP | Local | G3 |
| `@id` schema graph, billing periods on Offers | Both | G1 |
| `lang="en-IN"`, OG image for /pricing | Both | G1 and seo-images |

### 9.2 Schema per page type

| Page type | Types | Notes |
|---|---|---|
| Home | Organization (`#organization`, with `description` and `disambiguatingDescription`; `sameAs`, `address` and `founder` only once real profiles and legal facts exist), WebSite (`#website`), WebPage (`#webpage`, hero photo as `primaryImageOfPage`), SoftwareApplication (`#software`) with `featureList`, `image` and INR Offers: monthly for every plan and yearly for each paid plan, each with a `UnitPriceSpecification` (`billingDuration` P1M or P1Y, `unitCode` MON or ANN, `valueAddedTaxIncluded: true`) | No AggregateRating until genuine reviews exist |
| Pricing | WebPage with `about` → `#software` | Offers live on the one SoftwareApplication node |
| Contact, support | ContactPage (contact) or WebPage (support) + BreadcrumbList | Every page node names `isPartOf` (a typed WebSite) and `publisher` (`#organization`) in full |
| Feature, solution, template | WebPage + BreadcrumbList, `about` → `#software` | Replace the inline anonymous SoftwareApplication |
| Hubs | CollectionPage + ItemList (in the visible order) + BreadcrumbList | |
| Pillar guide and guides | Article with a named author (Person), `datePublished`, `dateModified`, `about` → `#software` where relevant | No HowTo markup |
| Compare (vs) | WebPage + BreadcrumbList; competitors only as `mentions` | No competitor Offers or ratings |
| Compare (lists) | WebPage + ItemList (`ItemListUnordered`) | The list is not a ranking |
| About | AboutPage + Organization | |

### 9.3 Core Web Vitals targets

- **Field, p75 (once CrUX has data):** LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less.
- **Lab, mobile, until then:** LCP under 2.5 s on `/`, `/pricing`, `/features` and one guide; TBT under 200 ms (an INP risk indicator only).
- Test on a mid-range Android phone over a throttled connection as well as in PageSpeed Insights.

### 9.4 Crawl and index management

- Release in waves (features, then solutions, then templates), each when the previous wave is mostly indexed (seo-programmatic rollout plan).
- Request indexing by hand only for hubs and the top pages; the Indexing API is for job postings and is not authorised here.
- After 8 weeks, noindex or merge any URL still "Crawled, currently not indexed" rather than letting it drag down how the site is judged.
- Keep `app.linkar.in` and `admin.linkar.in` closed to crawlers (`app/robots.ts` already does this).

---

## 10. Measurement setup

### 10.1 Google Search Console (`sc-domain:linkar.in`)

1. **Sitemaps:** remove the 2019 `https://www.linkar.in/sitemap.xml`. After each deploy, resubmit `/sitemap.xml` and submit each collection sitemap as its wave ships.
2. **URL Inspection:** after deploying, inspect `/` and request indexing; re-inspect after 7 to 14 days. Do the same for each hub and 3 to 5 lead pages per wave.
3. **Page indexing report:** filter by sitemap to see each wave's indexed, "crawled, not indexed" and "discovered, not indexed" counts. Check weekly.
4. **Performance report:** filter Country = India. Save these regex query filters (Appendix A): head term, comment to DM, auto reply, competitors, Hinglish, free.
5. **Links report:** monthly, to confirm the links section 7 earns.
6. **Link GA4 to Search Console** (GA4 Admin, Product links) to see queries next to landing-page behaviour.

### 10.2 GA4 (property 552805358, stream G-CLMXQ4YFD1)

- **Coverage first:** today only the 15 paths in `ANALYTICS_PAGE_PATHS` load the tag (`src/lib/analytics-path.ts` lines 48 to 64), and the CSP follows the same list. Add the hubs, detail pages, compare pages and guides, filtered by launch wave, and keep `/templates/*/recipe` out. After deploying, confirm `page_view` hits from a catalogue page in Realtime.
- **Key event:** the site sends only `page_view` (`src/components/site-analytics-routes.tsx` line 57), and `/signup` is one of the tagged paths. In GA4 Admin, Events, create a custom event `signup_page_view` (a `page_view` whose `page_location` contains `/signup`) and mark it as a key event. It needs no code change. A real `sign_up` event on account creation comes later (audit M27). Check in GA4 Admin, Data streams, Enhanced measurement whether outbound clicks to `app.linkar.in` are collected as well.
- **Attribution beyond the click:** the app does not load GA. To connect organic landings to real sign-ups, store the first landing path and referrer (no personal data) with the new workspace at sign-up. This is a product change for the owner to approve.
- **Reports to save:** Landing page filtered to Organic Search; a custom channel group "AI assistants" for referrals from chatgpt.com, perplexity.ai, copilot.microsoft.com and gemini.google.com; country India.
- **Consent:** analytics storage starts denied only in EEA, UK and Swiss regions (`src/lib/analytics-consent.ts` line 68), so Indian data is not reduced by the banner.

### 10.3 Bing Webmaster Tools

- linkar.in is verified and its 12-URL sitemap is fetched (brief, 15 Oct). Add each collection sitemap as it ships.
- Turn on IndexNow through Cloudflare Crawler Hints, so new and changed URLs reach Bing quickly.
- Monthly: Search Performance (queries and pages) and Backlinks. Scripts: `bing_webmaster.py counts|links https://linkar.in/` (source the Linkar `env.sh` and redact keys in any output).

### 10.4 Rank and AI tracking without paid tools

- **Rankings:** use Search Console average position for a fixed list of about 40 queries (the representative queries in 5.2). Once a month, check the top 10 queries by hand in a clean browser profile set to India and record the URLs above Linkar.
- **AI answers:** the monthly prompt panel (8.3), logged in the same sheet.
- **Optional:** DataForSEO (budget permitting) for Indian volumes, SERP overlap and rank tracking.

### 10.5 Cadence

| When | What | Time |
|---|---|---|
| Weekly (Monday) | Indexing by sitemap, new queries, crawl errors, GA4 organic landings | 15 minutes |
| Monthly (first Monday) | KPI table (11.2), links gained, prompt panel, outreach log, competitor price changes | 1 to 2 hours |
| Quarterly | Strategy review, pricing table refresh, pruning, plan the next quarter | Half a day |

---

## 11. KPIs and honest expectations

### 11.1 What to expect

- **Nothing here is a forecast.** There is no search volume, no ranking history and no traffic, so the numbers below are planning targets that decide where effort goes. They will be re-set at the week 12 review with real data.
- **Indexing comes first.** On a new, link-poor domain with a parked-domain past, Google may take weeks to index even good pages. The homepage was crawled and declined once already.
- **Long-tail before head.** Feature, template, comparison and Hinglish queries have fewer and weaker competitors. They are where the first impressions and clicks will come from.
- **The head term takes months and links.** "instagram automation" is contested by global publishers and by vendors with years of content. Reaching the top 10 needs sustained, earned links and a homepage that is genuinely the best answer, supported by the pillar guide. A #1 position is a 12-month-plus ambition, and it is not guaranteed by anything in this plan.
- **Rankings move.** Google updates, competitor launches and Meta policy changes can move positions either way.

### 11.2 KPI table

| Metric (source) | Baseline 15 Oct 2026 | Month 3 (mid Jan 2027) | Month 6 (mid Apr 2027) | Month 12 (Oct 2027) |
|---|---|---|---|---|
| Indexed URLs (Search Console, by sitemap) | 0 | Home, pricing and at least 70% of released catalogue and new pages | At least 85% of intended URLs | At least 90% of intended URLs |
| Impressions, India, monthly (Search Console) | 0 | First steady weekly impressions; target 2,000 or more a month | 10,000 or more a month | 40,000 or more a month |
| Organic clicks, monthly (Search Console) | 0 | First non-brand clicks; target 50 or more a month | 400 or more a month | 2,000 or more a month |
| Tracked queries in top 10 (of about 40) | 0 | 3 or more long-tail | 10 or more, including a compare page | 20 or more, including "instagram automation india" |
| Head term "instagram automation" position (India) | Not ranking | Not expected | Top 50 | Top 20 (top 10 is a stretch goal) |
| Referring domains (Bing Webmaster and Search Console Links) | 0 | 10 to 15 | 25 to 40 | 60 or more |
| Organic sign-up page views (`signup_page_view` key event in GA4) | Not measured | Event live and recording | 100 or more a month | 500 or more a month |
| AI answers mentioning Linkar (12 prompts × 4 engines) | Panel not run yet; 0 in the web search checks on 15 Oct | 1 or more | 5 or more | 12 or more |
| Core Web Vitals | Lab LCP 5.0 s, no field data | Lab LCP under 2.5 s on key pages | Field p75 LCP, INP and CLS "good" if CrUX has data | All "good" in field data |

### 11.3 Milestone ladder

1. Homepage indexed.
2. First 100 impressions in a week.
3. First non-brand click.
4. Five feature or template pages in the top 20 for their own phrases.
5. A compare page in the top 10 for "manychat alternative india".
6. Top 10 for "instagram automation tool india".
7. Top 10 for "instagram automation india".
8. Top 20, then top 10, for "instagram automation".

Leading indicators (indexing, impressions, links, AI mentions) move first. Lagging ones (clicks, sign-ups, head-term rank) follow. Judge the plan at month 3 mostly on the leading ones.

---

## 12. Implementation roadmap

### Phase 1: Foundation (weeks 1 to 4, 19 October to 15 November 2026)

- **Goals:** get indexed; measure everything; publish the pages that define Linkar.
- **Deliverables:** deploy and HTTPS fix; trust clean-up; loading and animation fixes; GA4 and CSP coverage; Search Console clean-up (old sitemap, inspections); schema `@id` graph; About page; wave 1 (features); pillar guide; /compare/manychat and /compare/manychat-alternatives; /guides/instagram-messaging-rules; Tier 1 listings started.
- **Success criteria:** homepage inspected after deploy with no blocking issue; feature sitemap submitted; at least half of wave 1 indexed or "discovered" by week 4; catalogue page views visible in GA4 Realtime; 5 or more listings live.
- **Resources:** owner, about 15 to 20 hours a week (engineering plus review); a writer, about 8 hours a week.
- **Dependencies:** legal entity details (About page, Organization); Meta App Review outcome (trust wording); owner answers to the `[OWNER CHECK]` lines in the competitor drafts; a legal view on visual similarity to Manychat before the vs page.

### Phase 2: Expansion (weeks 5 to 12, 16 November 2026 to 10 January 2027)

- **Goals:** release the rest of the catalogue at quality; cover comparison, free and India intent; start earning editorial links.
- **Deliverables:** waves 2 and 3; Facebook merge; uniqueness CI gate; the India landing page /instagram-automation-india; /compare/free-instagram-automation-tools, /compare/instagram-automation-tools-india, /compare/superprofile; guides on safety, auto reply, reply examples, lead generation, link in bio; Hinglish test guide; Product Hunt launch; two outreach batches; week 11 refresh; week 12 review.
- **Success criteria:** at least 70% of released URLs indexed; first steady impressions in India; 10 to 15 referring domains; KPI baselines replaced by real Search Console data.
- **Resources:** as phase 1, plus about 3 hours a week of outreach.
- **Dependencies:** wave 1 indexing health (wave 2 waits for it); the content pass on templates (wave 3 waits for it).

### Phase 3: Scale (weeks 13 to 24, 11 January to 4 April 2027)

- **Goals:** turn content into links and AI citations; widen the comparison set; reach field Core Web Vitals.
- **Deliverables:** the free tools (cost calculator, keyword list builder, message checker); /compare/zorcha, /compare/instantdm, /compare/linkdm; the Q1 pricing table refresh with a PR push; more guides where Search Console shows demand (for example more Hinglish guides, coach and ecommerce playbooks); an optional glossary of 10 to 15 terms with real substance; GEO improvements from the prompt panel; performance work on `/pricing` (mobile TBT 670 ms per the audit).
- **Success criteria:** 25 to 40 referring domains; 10 or more tracked queries in the top 10; Linkar named in at least 5 of 48 prompt-panel answers.
- **Dependencies:** developer time for the tools; a reliable source of updated competitor prices.

### Phase 4: Authority (months 7 to 12, April to October 2027)

- **Goals:** become a source others cite on Instagram automation in India.
- **Deliverables:** quarterly pricing tables as a recurring PR moment; an annual "state of Instagram automation in India" report built from public data and, only with users' consent and in aggregate, Linkar's own anonymised usage data; case notes from consenting customers; partnerships with creator educators and agencies; ratings markup only after genuine reviews exist; continuous refresh of the top 20 pages.
- **Success criteria:** 60 or more referring domains, at least 3 from Indian media; top 10 for "instagram automation india"; top 20 for "instagram automation".

### 12.5 Risks and mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| Google keeps declining to index (domain history, thin signals) | No impressions | Deploy the stronger homepage, fix HTTPS, earn listings and links, release at quality, prune what is still unindexed at 8 weeks |
| Catalogue judged as scaled or thin content | Site-wide quality drag | Content pass, 40% and 50% gates, waves, merges |
| Meta App Review rejected or delayed | Trust claims unusable; product risk | Use only "official Instagram API" wording; the rules guide still works |
| A trust claim on the site proves untrue | Credibility and legal exposure | Remove unverified claims now (3.5) |
| Similarity to Manychat (headings, brand study) | Weakens comparisons; possible legal question | Reword headings; legal review before vs pages |
| Competitor prices change | Stale or wrong comparisons | Sourced, dated facts; quarterly checks; a test that fails after 100 days |
| Cannibalisation (pillar and homepage; feature and template twins) | Neither page ranks well | Search Console checks at 8 weeks; merge by evidence |
| Owner bandwidth | Calendar slips | Must, Should and Could labels; the Must items alone carry the indexing work |
| No volume data | Effort spent on the wrong clusters | Re-prioritise at week 6 and week 12 on real queries; DataForSEO if affordable |

### 12.6 Decisions needed from the owner

1. Confirm or remove each Meta trust claim and the persona quotes.
2. Approve the wave rollout and whether to hold the three templates under 30% unique.
3. Fill in the legal entity details (About page, Organization data).
4. Answer the `[OWNER CHECK]` items in the competitor drafts and get a legal view before publishing vs pages.
5. Approve storing a first-touch landing path at sign-up (10.2).
6. Choose whether to fund DataForSEO for volumes and rank tracking.
7. Name the author or authors for guides and compare pages.
8. Confirm that UPI works for recurring Razorpay subscriptions before UPI goes into any title or meta description.

---

## Appendix A: Search Console regex filters (Query, "Custom (regex)")

| Name | Regex |
|---|---|
| Head term | `^(what is )?instagram automation( tool| tools| app| software| free| india)?$` |
| Comment to DM | `comment.*(dm|reply)|auto ?dm|private repl` |
| Auto reply | `auto ?repl|keyword repl|welcome message` |
| Stories | `story (repl|mention)` |
| Competitors | `manychat|many chat|superprofile|zorcha|instantdm|instant dm|linkdm|creatorflow|replyrush|inro|chatfuel|interakt|replykaro|flowdm|quickdm|unlockdm|rapiddm|autodm|\brepli\b|viraldm|dm ?linkr` |
| Hinglish | `kaise|kya|karna|kare|bheje|hota` |
| Free | `\bfree\b` |
| Brand | `linkar` |

## Appendix B: Sources

- Audit and specialist reports: [audit-2026-10-15.md](audit-2026-10-15.md), [2026-10-15/skill-reports/](2026-10-15/skill-reports/)
- Competitor facts, checked 15 Oct 2026: [2026-10-15/competitor-drafts/sources.md](2026-10-15/competitor-drafts/sources.md)
- Strategy evidence, 15 Oct 2026: [2026-10-15/data/strategy/](2026-10-15/data/strategy/) (WebSearch standard snapshots under `C:` keys, extended under `X:` keys)
- Google India page-1 capture, 15 Oct 2026: [2026-10-15/data/google-in-serps-2026-10-15.json](2026-10-15/data/google-in-serps-2026-10-15.json)
- Search Console, Wayback and Common Crawl data: [2026-10-15/data/](2026-10-15/data/)
- Meta private replies documentation (as cited in the seo-page report; re-verify before publishing): https://developers.facebook.com/docs/instagram-platform/private-replies/
- Google localized versions (hreflang not needed for a single-language site): https://developers.google.com/search/docs/specialty/international/localized-versions
- Google software app structured data: https://developers.google.com/search/docs/appearance/structured-data/software-app
- Capterra listing used for ReplyKaro's price: https://www.capterra.com/p/10048111/Replykaro/
- Diwali 2026 date (8 November): https://www.kissht.com/blog/diwali-2026-date-and-lakshmi-puja-timing
