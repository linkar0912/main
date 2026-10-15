# GEO analysis: Linkar, 15 October 2026 (seo-geo)

**Scope.** This report covers AI search readiness for two targets. Every finding says which one it is about.

- **LIVE:** https://linkar.in as deployed today.
- **LOCAL:** http://localhost:3000, the dev server re-checked after the G1 to G6 work groups (audit section 11).

**Method.** I followed `~/.claude/skills/seo-geo/SKILL.md` and `~/.claude/agents/seo-geo.md`, and read audit sections 1 to 8 and 11 and strategy section 8 first. Known findings are cited by their audit ID (C1, H7, M14 and so on) and only repeated where this run adds new evidence.

The earlier unreturned run captured HTML at 11:33 to 11:36 (`seo-run/geo/`). The G1 to G6 changes made that HTML stale, so I fetched every page again. All of this run's raw work is in `seo-run/geo2/`:
- `html/`: the pages fetched with the GPTBot user agent;
- `cat/`: all 64 catalogue detail pages;
- `analysis.json` and `catalogue_geo.json`, with the scripts `analyze.py` and `catalogue_geo.py`;
- `ua_live.txt` and `ua_local.txt`;
- `llms_local.txt`;
- `ga4_src.py`.

**Read-only.** I changed no repo file, account or setting.

---

## 1. GEO Readiness Score

| Dimension | Weight | LIVE | LOCAL (once deployed) | Why |
|---|---|---|---|---|
| Citability | 25% | 20 | 50 | **LIVE:** no definition passage, no FAQ, and the H1 has no topic.<br>**LOCAL:** the homepage FAQ opens with a 50-word definition, and the pricing Q&A blocks are self-contained. But 0/64 catalogue leads define their topic, there are no answer blocks of 134 to 167 words, and the Meta rules are vague. |
| Structural readability | 20% | 30 | 62 | **LIVE:** every heading sits inside a `hidden` segment.<br>**LOCAL:** each page has one H1 that carries its label, plus lists, a pricing table and a visible FAQ. But the catalogue H2s are slogans (3 identical H2s on all 64 pages), and FAQs sit in `<summary>` with 2 questions per page. |
| Multi-modal | 15% | 45 | 52 | Every page has a hero photo and code-drawn UI, with `primaryImageOfPage` locally. No video anywhere, and no comparison tables. |
| Authority and brand | 20% | 8 | 15 | 0 third-party mentions, 0 links, no Wikipedia or Wikidata entity, no `sameAs`, no About page, no visible dates or bylines, a name collision, and unverified trust claims. |
| Technical accessibility | 20% | 50 | 80 | **Both:** all 19 AI and search user agents get 200, and robots allows everything.<br>**LIVE:** content is in a hidden segment, `/llms.txt` returns 404, and nothing is indexed.<br>**LOCAL:** clean SSR, `/llms.txt` with 72 links and 4 sitemaps. |
| **Total** | | **31 / 100** | **54 / 100** | |

**Note on the audit's "AI Search Readiness" figures** (LIVE 35, LOCAL 55 before G1 to G6). Those were quick scores, not this skill's five-dimension weighting. Here, Authority and brand carries 20% and Linkar scores close to zero on it. So the LOCAL total stays near the audit figure even though the on-site work improved a lot.

### Platform breakdown (estimates, not measured; DataForSEO is not installed)

| Platform | LIVE | LOCAL once deployed and indexed | Gate |
|---|---|---|---|
| Google AI Overviews / AI Mode | 5 | 40 | Needs Google indexing first (C1). 92% of AIO citations come from top-10 pages. |
| ChatGPT search | 10 | 30 | Bing index plus entity presence (Wikipedia, Reddit, listicles). Linkar has none. |
| Perplexity | 10 | 30 | Leans on Reddit and community sources. Linkar is absent. |
| Bing Copilot | 15 | 40 | Bing has fetched the sitemap (12 URLs, per the brief). There is no IndexNow, and index status could not be verified (see section 5). |

---

## 2. AI crawler access status

**Test.** `geo2/uatest.sh` requested `/`, `/robots.txt` and `/pricing` with 19 user agents on both targets (`geo2/ua_live.txt`, `geo2/ua_local.txt`):
- GPTBot, OAI-SearchBot and ChatGPT-User;
- ClaudeBot, Claude-SearchBot and Claude-User;
- PerplexityBot and Perplexity-User;
- Google-Extended, Googlebot and Bingbot;
- CCBot, anthropic-ai, Bytespider, Applebot and cohere-ai;
- Meta-ExternalAgent, Amazonbot and curl.

**Results:**
- **LIVE:** 19/19 got 200 on all three URLs, with identical bytes (309,587).
- **LOCAL:** 19/19 got 200.
  - Bingbot, Applebot and Google-Extended got 380,457 bytes; the other agents got 380,779. Next.js treats some agents as HTML-limited bots and sends them blocking metadata. The difference is 322 bytes, and the content is the same.
- **robots.txt** (both): `User-Agent: *`, `Allow: /`, with only private paths disallowed (`/api/`, `/admin`, `/login`, `/signup`, `/dashboard`, `/help`, which 307s to the app host, and others). There are no AI-specific rules and no Cloudflare managed block.
  - LOCAL lists 4 `Sitemap:` lines; LIVE lists 1.
  - The `Host:` line is a Yandex-only directive and is harmless.
- **RSL 1.0:** none. It is optional, and no licence terms are needed for a site that wants maximum AI visibility.

| Crawler | robots.txt | HTTP (spoofed user agent) | Verdict |
|---|---|---|---|
| GPTBot, OAI-SearchBot, ChatGPT-User | Allowed | 200 / 200 | Allowed |
| ClaudeBot, Claude-SearchBot, Claude-User | Allowed | 200 / 200 | Allowed |
| PerplexityBot, Perplexity-User | Allowed | 200 / 200 | Allowed |
| Google-Extended | Allowed | 200 / 200 | Allowed (Gemini training; does not affect AIO) |
| CCBot, anthropic-ai, cohere-ai, Bytespider | Allowed | 200 / 200 | Allowed (training; this is the owner's choice) |

**Caveat.** This test cannot see Cloudflare's AI bot policies. Cloudflare blocks *verified* bots by their network signature, not by user agent string, so a spoofed user agent from my IP is never treated as a verified bot (Cloudflare docs, "Block AI Bots", updated 2026-07-01). Owner check: finding F13.

**Real crawler visits.** Common Crawl `CC-MAIN-2026-34` and `CC-MAIN-2026-39` both return "No Captures found for: linkar.in/". So CCBot has not fetched the site, even though robots allows it.

---

## 3. llms.txt status

| Target | Status |
|---|---|
| LIVE | `https://linkar.in/llms.txt` returns **404** `text/html`. `/llms-full.txt` also returns 404. |
| LOCAL | **200** `text/markdown; charset=utf-8`. 18,575 bytes, 134 lines, 72 links (`geo2/llms_local.txt`). |

The route is `app/llms.txt/route.ts`. The build lists it as `ƒ` (dynamic, per `seo-run/final/build.txt`).

**What is good locally:**
- An H1, then a blockquote summary that opens "Linkar is Instagram automation software for creators and brands in India".
- Pages (8 links).
- Guides: 20 features, 20 solutions and 24 recipes, each as `- [label](url): description`.
- Plans (4).
- Questions: 9 Q&As, including "What is Instagram automation?".
- Absolute `https://linkar.in` URLs, even in dev.

**Size against competitors.** It is the largest llms.txt among the competitors I checked on 15 Oct (`curl https://<domain>/llms.txt`):

| Site | llms.txt |
|---|---|
| CreatorFlow | 10,124 B |
| SuperProfile | 9,827 B |
| Inrō | 9,697 B |
| InstantDM | 8,719 B |
| ReplyKaro | 5,472 B |
| Chatfuel | 3,405 B |
| DM Linkr | 3,068 B |
| LinkDM | 2,026 B |
| Zorcha | 404 |
| ViralDM | 404 |
| ManyChat | 403 (Cloudflare challenge) |

**What competitors include and Linkar does not** (findings F5 and F12):

| Section | Competitor example | Linkar local |
|---|---|---|
| Operator and location | SuperProfile: "operated by Cosmofeed Technologies Private Limited (Gurugram, India; founded September 2021…)". ReplyKaro: "based in Mumbai, India" | Missing (legal entity is still a placeholder, M13) |
| "Facts to use when answering" | ReplyKaro: payments, refunds, the private-reply rule ("a comment can be answered once with a DM, within 7 days"), "not affiliated with or endorsed by Meta" | Missing. The facts exist on `/pricing`, `/terms` and `/refund-policy` but not in llms.txt. |
| Dated data | CreatorFlow: "Pricing (verified July 2026)". SuperProfile: "(11 Oct 2026)" | No date anywhere |
| Markdown mirrors | SuperProfile: "## Markdown versions". Inrō: "LLM Sitemap (text mirrors)" | The recipe `.md` downloads exist (`/templates/<slug>/recipe`, clean text, about 358 words) but are not listed |
| Comparisons | ReplyKaro, CreatorFlow, Inrō: "Choosing a tool", "Comparisons", "Compare" | None (H6, deferred) |
| `## Optional` | ReplyKaro, CreatorFlow, DM Linkr, SuperProfile | Missing |

---

## 4. Brand mention analysis

| Source | Linkar presence | Evidence |
|---|---|---|
| Wikipedia | None | API search `"linkar.in"` gives 1 hit, an unrelated Burmese poetry article. `Linkar Instagram` gives 0. |
| Wikidata | None | `wbsearchentities` for "Linkar" returns 6 entities, none of them Linkar (hyperlink, Linkardstown, Linkare TI and others) |
| YouTube | None found | WebSearch limited to youtube.com returned LinkDM, ManyChat, PilotDM and ChatAutoDM tutorials, and no Linkar video. The YouTube Data API is not enabled on the GCP project, so I made no API check. |
| Reddit | Not checkable | WebSearch rejects reddit.com for this agent. The strategy notes Google autocomplete shows "best instagram automation tool reddit". |
| LinkedIn, Product Hunt, X | None found | The WebSearch domain-filtered query returned LinktoDM on Product Hunt and LinkedIn listicles without Linkar |
| Review directories | None | Capterra lists ReplyKaro, DM Linkr, inDM and Linkr; Linkar is not listed. These listings show up in AI answers. |
| India listicles that AI answers cite | Not listed | **tryunlockdm.com** "Every Tool Priced in INR (2026)", dated 14 Jun 2026, names 11 tools and not Linkar.<br>**replyrush.com** "10 Best … India 2026" names 10 ranked tools and about 20 more, and not Linkar. |
| GA4 referrals from AI assistants | 0 | 180 days, `sessionSource`/`sessionMedium` (read-only `geo2/ga4_src.py`): `(direct)/(none)` 22, `(not set)` 2. No chatgpt.com, perplexity.ai, copilot or gemini referrals. |
| Bing inbound links | 0 | Brief (Bing Webmaster API, 15 Oct) |

**How Linkar shows up in AI-style answers.** WebSearch summarises results, much like ChatGPT search and Perplexity do. I ran these queries on 15 Oct 2026:

| Query | Linkar mentioned? | What was cited instead |
|---|---|---|
| best Instagram automation tool India | No | dev.to (AutoPubliX), Capterra India (Instazood, InstaManager), Product Hunt mirror (ViralDM), Shopify App Store (InstantDM, Spur) |
| ManyChat alternative India Instagram DM automation INR pricing | No | Repli, ReplyKaro, InstantDM blog, Inrō blog, ReplyRush, Elev8or, WilloSend |
| Instagram comment to DM automation India free tool rupees | No | Repli, SuperProfile Hinglish guide (`superprofile.bio/guides/auto-dm-kya-hai.md`), InstantDM, IGMsg, Elev8or |
| best Instagram DM automation tools 2026 comparison | No | Wati, Inrō (5 pages), Hyperleap, Boei, Zorcha |
| Instagram auto DM tool for Indian creators UPI pricing (extended) | No | replyrush.com India list, flowdm.in (2 pages), replykaro.com/instagram-automation-india, tryunlockdm.com, rapiddm.com, autodm.live |
| Instagram automation software India ₹199 per month comment to DM | No | Repli, Capterra (ReplyKaro, inDM), SuperProfile, ViralDM. The answer said "I couldn't find any tool offering a ₹199/month plan". That is Linkar's Creator price. |
| `"linkar.in"` | No | It returned the **French "Linkar"** (linkar-app.com, a vehicle-warranty startup, TrustMRR profile), Linkr (Capterra), Link Intime and Link Legal India |
| Linkar Instagram automation linkar.in | No | It suggested the name "may be a typo" and offered **Linkr.in**, Lnk.Bio and Linkjar |
| Linkar Instagram automation (YouTube, LinkedIn, Product Hunt) | No | **DM Linkr** (dmlinkr.com, an Instagram comment-to-DM tool with Capterra and Trustpilot pages), LinktoDM, LinkDM |

**Competitors the brief does not list, all active in India AI answers:**

| Tool | INR price or model | Source |
|---|---|---|
| ReplyKaro (Mumbai) | ₹99/mo | replykaro.com llms.txt, Capterra |
| FlowDM | ₹299/mo | flowdm.in |
| QuickDM | ₹199 to ₹399/mo | sources disagree |
| UnlockDM | per campaign, from ₹299 | tryunlockdm.com |
| RapidDM | ₹499/mo | rapiddm.com |
| AutoDM | ₹49/mo | autodm.live |
| Repli | ₹249 / ₹499 | repli-in.lovable.app |
| ViralDM | ₹499/mo | hunted.space |
| DM Linkr | | dmlinkr.com |
| ReplyRush | | replyrush.com |

Treat these prices as vendor claims gathered on 15 Oct, not verified facts.

---

## 5. Passage-level citability

### LIVE

There is nothing to cite, because a non-JS reader sees almost no visible text.
- `<main class="root-loading">` holds the single word "Linkar".
- All page content, including the header, H1, body and footer, sits inside `<div hidden id="S:0">`.
- Measured by removing `[hidden]` elements (script in finding F1):

| Page | Words, all | Words outside `[hidden]` |
|---|---|---|
| `/` | 2,269 | **1** |
| `/pricing` | 919 | **1** |

### LOCAL

**Homepage** (`geo2/html/local_home.html`):
- 0 hidden segments; 2,355 words outside `[hidden]`.
- The first FAQ, "What is Instagram automation?", is a 50-word self-contained definition. It also appears in FAQPage and llms.txt.
- 9 question headings in total (H3).
- No paragraph reaches 134 to 167 words; the longest is 50.

**Pricing** (`local_pricing.html`) has the strongest citable facts on the site. For example:
- "What counts as one delivery? One outbound message. A comment reply, a direct message, a sequence step, and a broadcast message each count once. Incoming conversations are free…"
- "Automations stop sending and report the limit rather than charging you for more."
- UPI, cards and netbanking through Razorpay.
- GST included.

The weakness: the H1 is "Plans that grow with you." (a known warning).

**Catalogue, all 64 detail pages** (`geo2/catalogue_geo.py` on `geo2/cat/`, output `geo2/catalogue_geo.json`):

| Signal | Result |
|---|---|
| Lead paragraph defines the page topic ("X is…") | **0 / 64** |
| Lead paragraph length (median) | 21 words. It is the meta description, imperative ad copy, for example "Turn Instagram comments into private replies with Linkar… Start free." |
| Page label (the target phrase) appears in any H2 | **0 / 64** |
| H2s that are identical on all 64 pages | "Questions, answered.", "Keep exploring.", "Write it once. Keep the conversation moving." In addition, "Where this works" is on 26 pages and "What you need to start" on 24. |
| H2 or H3 written as a real question | 18 pages, all of them "Seen this lately?" |
| FAQ questions per page | Exactly 2 (min = max = 2), in `<details><summary>` |
| Answer passages of 134 to 167 words | 0 paragraphs on the 12 sampled local pages. The longest is 57 words. |
| External citations (Meta docs and the like) | **0 / 64** pages |
| States Meta's private-reply rule (one reply per comment, 7 days) | 0 / 64. One page, `/templates/offer-follow-up`, has the question "Can I schedule a reminder after seven days?", but no rule. |
| States the 24-hour messaging window | 0 / 64 |
| Shows "14K+ replies sent so far" | 64 / 64 |
| Median words per page | 1,373 |

**Mock UI between the lead and the first H2.** A plain-text extractor reads this as the page's second paragraph, for example on `/features/instagram-comment-to-dm`: "Meta Verified Business Official Instagram API 14K+ replies sent so far aanya.makes now GUIDE Private reply Overview How it works…". So the first 60 words of every catalogue page contain no definition and no fact a model could quote.

---

## 6. Server-side rendering check

| Target | Result |
|---|---|
| LIVE | **Fail for non-JS readers that honour `hidden`.** Content is in the HTML but inside `<div hidden id="S:0">`, after a `root-loading` skeleton (M2). |
| LOCAL (dev) | **Pass.**<br>- 0 `div[hidden][id^="S:"]` and no `root-loading` on the 16 pages fetched as GPTBot or on the 64 catalogue pages.<br>- Each page's H1, body and FAQ answers are in the server HTML.<br>- All 67 catalogue URLs are linked in server HTML from every page checked (home, pricing, a guide); the homepage `<main>` links to 5 of them.<br>- The audit (section 11) confirmed the same on the 69 prerendered production files. |

---

## 7. Findings

The audit ID is given where a finding extends a known one.

| # | Severity | Target | Status | Finding |
|---|---|---|---|---|
| F1 | High | LIVE | already-fixed-locally | 1 visible word outside `hidden` on live `/` and `/pricing` (extends M2) |
| F2 | Critical | LIVE | owner-action | Not indexed, so no Google AIO is possible; 0 AI referrals in 180 days; no Common Crawl captures (extends C1) |
| F3 | High | Both | owner-action | Zero third-party brand presence in the sources AI answers cite (extends H7) |
| F4 | High | Both | open | Name collision: French Linkar, DM Linkr, Linkr.in; search engines treat "linkar.in" as a typo |
| F5 | Medium | LOCAL | open | llms.txt lacks the India buying facts and operator facts competitors provide |
| F6 | Medium | LOCAL | open | Catalogue leads and H2s are not citable: 0/64 definitions, 0/64 label in an H2 |
| F7 | Medium | LOCAL | open | Meta messaging rules on 0/64 pages; 0/64 external citations (extends M14, L13) |
| F8 | Medium | Both | owner-action | "passed Meta App Review", "Meta Verified Business" and "14K+ replies" sit in AI-quoted spots (extends M18) |
| F9 | Medium | Both | open | India AI answers are owned by INR competitors' "in India" pages and listicles; Linkar has neither (extends M8, H6) |
| F10 | Medium | LIVE | already-fixed-locally | `/llms.txt` returns 404 on live |
| F11 | Low | LOCAL | open | Entity schema gaps: Organization description, `disambiguatingDescription`, SoftwareApplication `featureList` |
| F12 | Low | LOCAL | open | llms.txt structure and wording: link-less sections, no Optional, CTA descriptions, "messages" vs "deliveries", recipes not listed |
| F13 | Low | LIVE | owner-action | Cloudflare AI bot policy cannot be verified by spoofing; check AI Crawl Control |
| F14 | Low | Both | open | No visible updated date or byline on guides; llms.txt is undated |
| F15 | Low | Both | open | No passage answering "how is this different from Instagram's built-in replies?" |
| F16 | Info | Both | already-fixed-locally | Positives to keep: crawler access, SSR, homepage definition, pricing Q&A, llms.txt size |

### F1. LIVE text is hidden from extractors that honour `hidden` (High, LIVE, already-fixed-locally)

**Evidence:**
- In `geo2/html/live_home.html`, the H1 "Reply to every opportunity. Even when you are away." has this ancestor chain: `h1#hero-title > section#top > main#main-content > div#S:0[hidden]`.
- The visible `<main class="root-loading">` contains only "Linkar".
- Removing `[hidden]` leaves 1 word on `/` and 1 on `/pricing`, against 2,269 and 919 words in total.
- LOCAL: 0 hidden segments; 2,355 words visible on `/` and 1,091 on `/pricing`.

**Fix:** deploy (G6 moved `app/loading.tsx` into `app/(app)/loading.tsx`). After deploy, re-run the measurement on live:
```sh
python3 geo2/analyze.py <live html>
```
Alternatively, repeat the `[hidden]` word count from this report.

### F2. Not indexed, so AI Overviews and AI Mode cannot cite Linkar (Critical, LIVE, owner-action; extends C1)

**New evidence:**
- **GA4 over 180 days:** 22 `(direct)/(none)` sessions and 2 `(not set)`, with 0 sessions from any AI assistant.
- **Common Crawl:** `CC-MAIN-2026-34` and `CC-MAIN-2026-39` have no captures of `linkar.in/*`. Common Crawl is a main source of training data.

**Fix** (owner, section 7 of the audit): deploy, request indexing, and submit the 4 sitemaps in Search Console and Bing. In GA4, add the "AI assistants" channel group the strategy proposes (chatgpt.com, perplexity.ai, copilot.microsoft.com, gemini.google.com, claude.ai), so the first AI referral is seen.

### F3. Zero third-party brand presence in the sources AI answers use (High, both, owner-action; extends H7)

**Evidence:** section 4.
- No Wikipedia or Wikidata entity.
- No YouTube, LinkedIn or Product Hunt result.
- No Capterra or Trustpilot page. Competitors ReplyKaro, DM Linkr and inDM each have Capterra pages that AI answers cite.
- Absent from both India "every tool" listicles the answers cite.

**Fix, in order of AI-citation value** (the skill reports YouTube mentions at about 0.737 correlation and backlinks at about 0.266):
1. Real tutorial videos on a Linkar YouTube channel, made from real setups.
2. Capterra (Capterra India) and Product Hunt listings, with the one-sentence description from the strategy (section 3.7).
3. A LinkedIn company page.
4. Factual inclusion requests to the publishers of tryunlockdm.com and replyrush.com and similar India lists: plan prices, the free plan, UPI and GST.
5. Honest Reddit and Quora answers that disclose the affiliation.

**Do not:**
- create a Wikipedia article (the notability bar is not met);
- create a Wikidata item until independent sources exist.

### F4. The name collides with other "Linkar" and "Linkr" products in the same results (High, both, open)

**Evidence** (WebSearch, 15 Oct):
- `"linkar.in"` returned the French Linkar (linkar-app.com, a vehicle-warranty startup, TrustMRR profile `trustmrr.com/startup/linkar.md`) as the best match.
- "Linkar Instagram automation linkar.in" said the name "may be a typo" and pointed to Linkr.in.
- The domain-filtered search returned DM Linkr (dmlinkr.com), an Instagram comment-to-DM tool in exactly Linkar's category, with Capterra listings in 9 countries and Trustpilot pages.

Strategy section 3.7 already notes LinktoDM, Linktree and Linkr.in. It does not cover DM Linkr or the French Linkar.

**Fix (repo, small):**
1. Start the llms.txt summary with "Linkar (linkar.in) is Instagram automation software…".
2. Add a facts line: "Linkar is spelled L-I-N-K-A-R. It is a separate product from DM Linkr, Linkr and LinkDM."
3. Give the Organization node a `description` and a `disambiguatingDescription` (for example "Instagram and Facebook Page automation software for creators and businesses in India, at linkar.in").
4. Use the same descriptor on every profile you create (F3).

The relevant files are `app/llms.txt/route.ts:25` and `src/lib/seo-pages.ts` (`homeStructuredData`).

### F5. llms.txt leaves out the facts AI answers ask Indian buyers about (Medium, LOCAL, open)

**Evidence.** AI answers for India queries use GST invoices, UPI, INR, the free tier and "official API" as their selection criteria (section 4). Linkar's `/pricing` states each of these:
- "Every price includes applicable GST";
- "UPI, cards, and netbanking" through Razorpay;
- "Tax invoice";
- "Cancel anytime… No exit fee";
- "Automations stop sending and report the limit rather than charging you for more";
- "Incoming conversations are free".

`/terms` says "Linkar is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc."

`geo2/llms_local.txt` contains none of them. Its Plans lines carry only price, automations and messages, and the annual prices appear only in one FAQ answer. Competitor practice: section 3.

**Fix:** add a `## Facts` section to `app/llms.txt/route.ts`, generated from the same sources the pages use (`BILLING_PLANS`, pricing copy). The proposed text has no em dashes, invents no figures, and takes every fact from the repo:
```
## Facts

- Prices are in Indian rupees and include applicable GST. Pay with UPI, cards or netbanking through Razorpay. Each payment has a tax invoice.
- Annual plans: Creator ₹1,990, Growth ₹4,990, Agency ₹9,990 a year.
- The Free plan needs no card.
- Usage counts outbound messages only. Incoming conversations are free. At the monthly limit, automations stop sending; nothing is billed beyond the plan.
- Cancel any time. The plan runs to the end of the paid period. There is no exit fee.
- Works with Instagram professional accounts (Business or Creator) and Facebook Pages, through Meta's official APIs.
- Linkar is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.
- Support: support@linkar.in
- Last updated: <SEO_CONTENT_UPDATED>
```

Add an operator line (legal name and city) once `src/lib/legal-entity.ts` is filled in (M13, owner).

### F6. Catalogue leads and headings are not citable (Medium, LOCAL, open)

**Evidence:** section 5.
- 0/64 lead paragraphs define the topic. The lead is the meta description (median 21 words, imperative, with "with Linkar" or "Start free").
- 0/64 pages put the label in any H2.
- 3 slogan H2s repeat on all 64 pages.
- 2 FAQ questions per page.
- No answer blocks of 134 to 167 words.
- The mock UI text ("14K+ replies sent so far aanya.makes now GUIDE…") is what an extractor reads right after the lead.

Strategy section 8.2.1 asks for a 40 to 60 word definition at the top of each feature page. It is not implemented yet.

**Fix (content pass):**
- Add a `definition` field per record (40 to 60 words, starting "<Label> is…" or "<Label> means…"). Render it as the first paragraph after the H1, before the mock UI.
- Change one H2 per page into the question people search for, containing the label (for example "How does Instagram comment to DM automation work?").
- Add one 134 to 167 word "how it works" answer block under it.

Example rewrites (facts already on the site or in Meta's documentation; no invented metrics):
- **`/features/instagram-comment-to-dm`** (52 words): "Instagram comment to DM automation sends a private message to someone who comments a chosen keyword on your post or Reel. In Linkar you pick the keyword, write the reply and add the link you promised. Meta allows one private reply per comment, sent within 7 days, through the official Instagram API."
- **`/features/instagram-follow-gate`** (44 words): "An Instagram follow gate sends a promised resource only to people who follow your account. Linkar starts from a comment, asks the person to tap to opt in, checks whether they follow you, and then sends the link, or explains what to do first."

Check the follow-gate wording against the shipped flow before use.

### F7. Meta's messaging rules are stated vaguely, with no sources (Medium, LOCAL, open; extends M14 and L13 catalogue-wide)

**Evidence:**
- 0/64 pages state the one-private-reply-within-7-days rule.
- 0/64 state the 24-hour window.
- 0/64 pages have any external link.
- The comment-to-DM FAQ answer reads "Further messages depend on the person's interaction and Meta's supported…".
- ReplyKaro's llms.txt states the rule in one sentence.

AI engines favour specific, sourced statements for "is Instagram DM automation allowed" questions. That is one of the strategy's prompt-panel questions.

**Fix:** state both rules in plain words on the comment-to-DM, DM, follow-up and Story pages and in llms.txt Facts. Link Meta's Instagram Platform documentation for private replies and the messaging window. Do this as part of the content pass.

### F8. Unverified trust claims sit in the most-quoted places (Medium, both, owner-action; extends M18)

**Evidence:**
- "Linkar passed Meta App Review" is in the llms.txt Questions section and in the homepage FAQPage JSON-LD (`src/components/marketing/marketing-content.ts:164`).
- "Meta Verified Business" and "14K+ replies sent so far" are in the hero of 64/64 catalogue pages and on all hubs (`src/components/marketing/trust-lockups.tsx:24`).
- The project memory for Meta App Review (30 Sep) records "Review in progress" for 8 permissions.
- `trust-lockups.tsx` says the owner decided the wording on 13 Oct.

AI engines quote llms.txt and FAQ answers word for word, and a wrong claim is hard to withdraw once it is cached.

**Fix (owner):**
- Confirm each claim against Meta's App Review status and production data on deploy day.
- Keep the non-affiliation sentence next to the "official API" claim (F5).

### F9. India answers belong to INR competitors' "in India" pages and listicles (Medium, both, open; extends M8 and H6)

**Evidence:** section 4. The India AI-style answers cited:
- `replykaro.com/instagram-automation-india` ("₹ Pricing, UPI and Free Plan");
- `flowdm.in/instagram-dm-automation-india`;
- `tryunlockdm.com/blog/instagram-dm-automation-india-2026`;
- `replyrush.com/post/best-instagram-dm-automation-tools-india-2026`;
- `rapiddm.com`;
- `autodm.live`;
- SuperProfile's Hinglish `.md` guide.

One answer said no ₹199 plan exists, which is Linkar's Creator price.

**Fix:**
- Build the strategy's `/compare/instagram-automation-tools-india`, with a dated INR price table (a table AI engines can lift) and a "checked on" date per competitor.
- Plan one Hinglish guide ("Instagram automation kaise kare").
- Add both to llms.txt. Competitor facts need dated sources (audit section 8).
- Add the competitors listed in section 4 to the competitor set.

### F10. `/llms.txt` returns 404 on live (Medium, LIVE, already-fixed-locally; known L2/G2)

**Evidence:** `curl https://linkar.in/llms.txt` gives 404 `text/html`; locally it gives 200 `text/markdown`, 18,575 B.

**Fix:** deploy.

### F11. Entity schema gaps (Low, LOCAL, open)

**Evidence** (`geo2/html/local_home.html` JSON-LD):
- Organization has `@id`, name, url, logo, email, `address` (IN) and `contactPoint`. It has no `description`, `disambiguatingDescription`, `sameAs`, `foundingDate` or `founder`.
- SoftwareApplication has no `featureList`, `image` or `screenshot`.
- Catalogue `WebPage` nodes have `about` `#software` and `isPartOf` `#website`, but no `publisher`.

**Fix:**
- Organization: add `description` and `disambiguatingDescription` (F4).
- SoftwareApplication: add `featureList`, built from the feature collection labels in `src/content/seo/features.ts`, so it never drifts. Add `image` pointing to `/opengraph-image`.
- WebPage: add `publisher: {"@id": "…/#organization"}`.
- `sameAs` and `founder` only once real profiles and legal facts exist (owner).
- No HowTo, no `aggregateRating`, and no new FAQPage for Google.

### F12. llms.txt structure and wording (Low, LOCAL, open)

**Evidence** (`geo2/llms_local.txt`):
- Guides uses H3 subsections, and Plans and Questions contain no links. llmstxt.org defines H2 sections as file lists, so strict parsers (for example `llms_txt2ctx`) may skip that content.
- There is no `## Optional` section.
- Guide descriptions are the meta descriptions, with ad wording ("Start free.", "with Linkar").
- Plans say "1,000 messages a month", but `/pricing` says "1,000 deliveries each month".
- The 24 recipe Markdown files (`/templates/<slug>/recipe`, 200 `text/markdown`, `x-robots-tag: noindex`, clean text) are not listed.

**Fix:**
- Keep Questions, but also give each guide a factual one-line description (what it is, not what to do).
- Use one usage term everywhere.
- Add `## Optional` with the 24 recipe `.md` URLs (noindex does not stop llms.txt readers).
- Optionally, add an `/llms-full.txt` that joins the recipes and the FAQ.

### F13. Cloudflare AI bot policy cannot be verified from outside (Low, LIVE, owner-action)

**Evidence:**
- `server: cloudflare` and `cf-ray` are present on live.
- Spoofed user agents all get 200, but Cloudflare's AI bot rules act on *verified* bot signatures, which spoofing cannot trigger.
- Cloudflare's new defaults since 15 Sep 2026 block Training and Agent bots only "on pages that display ads". Linkar shows none, so the defaults should not block it. Bot Fight Mode or a manual "Block AI bots" setting could still challenge real crawlers.

Sources: developers.cloudflare.com/bots/additional-configurations/block-ai-bots/ and the Bots changelog (2026-07-01).

**Fix (owner, read-only check in the dashboard):**
- In AI Crawl Control, under Crawlers, confirm GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot and Perplexity-User are allowed.
- In Security Settings, under AI bot policies, set Search and Agent to Allow.
- Use the AI Crawl Control Metrics tab to see whether any AI crawler has fetched linkar.in yet, and with which status codes.

### F14. No visible freshness or authorship (Low, both, open)

**Evidence:**
- Catalogue JSON-LD has `dateModified` 2026-10-13, but no page shows an updated date or a byline.
- `time` elements: 0 on all sampled pages.
- The home and pricing JSON-LD carry no date.
- llms.txt carries no date.

**Fix:** add a small "Updated <date> by the Linkar team" line on guides, recipes and pricing. Use the same date as `dateModified`, and per record once the deferred `updated` field exists. Do not invent people.

### F15. No answer to "how is this different from Instagram's built-in replies?" (Low, both, open)

**Evidence:** the AI-style answer to "Instagram DM automation tool India which is best" (Quora and YouTube sources) listed "Meta's own tool" first, as the lowest-risk option. No Linkar page explains how Linkar differs from Instagram's built-in automated responses.

**Fix:** add one FAQ item to the homepage FAQ and llms.txt that compares the two factually. Use only capabilities verified in the product, for example comment-triggered private replies, follow checks, team handoff and link tracking.

### F16. Positives to keep (Info, both, already-fixed-locally)

- All 19 AI and search crawlers get 200, and robots allows them.
- Local SSR is complete, with every catalogue URL linked in server HTML.
- The homepage has a 50-word definition FAQ.
- The pricing Q&A blocks are crisp and quotable.
- llms.txt is 18.5 KB with 72 links, the largest in the competitor set checked.
- `lang="en-IN"`.
- `primaryImageOfPage` on 67 pages.

Do not add AI-specific disallow rules.

---

## 8. Top 5 highest-impact changes

| # | Change | Target | Effort | Who |
|---|---|---|---|---|
| 1 | Deploy the local build, which removes the hidden segment and serves llms.txt (F1, F10). Then request indexing (F2). | LIVE | Low (deploy) plus owner time | Owner |
| 2 | Build third-party presence: YouTube tutorials, Capterra (India), Product Hunt, LinkedIn, and factual inclusion requests to the India "every tool" lists (F3, F9) | Both | High, ongoing | Owner |
| 3 | Add a `## Facts` section and name disambiguation to llms.txt, plus Organization `description` and `disambiguatingDescription` (F4, F5, F11) | LOCAL | Low (about 1 hour, one route and one schema helper) | Repo |
| 4 | Catalogue definitions: a 40 to 60 word "X is…" lead before the mock UI, one question H2 with the label, and Meta rules with a link to Meta's docs (F6, F7) | LOCAL | Medium to high (64 records, part of the content pass) | Repo plus owner facts |
| 5 | Resolve the trust claims before deploy, and keep the non-affiliation line next to "official API" (F8) | Both | Low | Owner |

## 9. Schema recommendations (AI discoverability)

- **Organization (`#organization`):**
  - add `description` (the strategy's one sentence) and `disambiguatingDescription` (F4);
  - add `sameAs` only for real profiles (Instagram, LinkedIn, YouTube, Product Hunt, Capterra) once they exist;
  - add `founder`, `foundingDate` and a full `PostalAddress` once `legal-entity.ts` is filled in.
- **SoftwareApplication (`#software`):** add `featureList`, generated from the features collection, and `image`. Keep the INR `UnitPriceSpecification` offers. No `aggregateRating` until genuine reviews exist.
- **WebPage and CollectionPage:** add `publisher` → `#organization`. Keep `about` → `#software` and `dateModified`.
- **FAQPage:** keep it on the homepage for AI parsers only. Do not add it elsewhere for Google rich results. **No HowTo anywhere.**

## 10. Content reformatting suggestions

1. **Every catalogue page (64):** insert the definition paragraph right after the H1 and before the mock UI (F6). Replace one of the three shared slogan H2s with a question H2 that contains the label.
2. **`/features/instagram-comment-to-dm` FAQ.** Replace "Does a comment let me send unlimited DMs? … Further messages depend on the person's interaction and Meta's supported…" with a specific answer. For example: "No. Meta allows one private reply to each comment, within 7 days of the comment. After the person replies, you can keep the conversation going within Meta's messaging window." Link Meta's documentation.
3. **`/pricing`:**
   - Give the H1 the topic, for example "Instagram automation plans in rupees" (H1 warning, audit section 11).
   - Keep the delivery, limit and payment Q&As as they are. They are the best citable passages on the site.
4. **llms.txt:** add Facts (F5) and Optional (F12). Rewrite the guide descriptions as factual one-liners without "Start free."
5. **Homepage FAQ:** add "How is Linkar different from Instagram's built-in automated replies?" (F15). Keep every existing question; `app/seo.test.ts` asserts one of them.

All proposed copy above follows the brief's rules: no em dashes, none of the banned words, no invented metrics, testimonials or prices. Run `pnpm check:copy` before shipping any of it.

---

**Data not available in this run:**
- Live ChatGPT, Perplexity and Google AIO answers (DataForSEO is not installed; WebSearch summaries were used as a proxy).
- Reddit (blocked for this agent).
- YouTube Data API (not enabled on the GCP project).
- Bing index status for linkar.in: direct Bing queries from this machine returned unrelated Chinese results, and the Bing Webmaster script offers only link counts.
