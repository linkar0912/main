# seo-backlinks: Linkar backlink profile, competitor gap and link-building plan

**Run date:** 15 October 2026 (re-run; the earlier seo-backlinks agent left only scratch files and no result).
**Skill:** `seo-backlinks` (SKILL.md v1.9.0) plus the `seo-backlinks` specialist method.
**Targets:**
- **LIVE**: https://linkar.in (the site other sites would link to today).
- **LOCAL**: http://localhost:3000, re-checked after work groups G1 to G6. Backlinks only exist for LIVE; LOCAL findings cover link targets and linkable assets that ship with the next deploy.

**Read-only.** No repo edits, no submissions, no setting changes. Every API key stayed redacted (Bing output was piped through `sed 's/apikey=[^& ]*/apikey=REDACTED/g'`).

---

## Backlink Health Score: INSUFFICIENT DATA (1/7 factors scored)

The skill's data sufficiency gate needs 4 of 7 factors with data. Only one has any.

| Factor (weight) | Source available | Result | Confidence |
|---|---|---|---|
| Referring domain count (20%) | Bing Webmaster (verified site), Common Crawl in-degree | **0 referring domains. Factor score 0/100** | Bing 0.70, CC 0.50 |
| Domain quality distribution (20%) | Moz only: API returns `400 Bad Request` for every call | Not scored | n/a |
| Anchor text naturalness (15%) | Bing anchors | Not scorable: there are no links, so no anchors | n/a |
| Toxic link ratio (20%) | Moz spam score (broken); verify crawler | Not scorable: no links to classify. No toxic links visible | n/a |
| Link velocity (10%) | DataForSEO only (not installed) | Not scored | n/a |
| Follow/nofollow ratio (5%) | Bing link details | Not scorable: no links | n/a |
| Geographic relevance (10%) | Bing country data | Not scorable: no links | n/a |

A number here would mislead. What the data does say plainly: **linkar.in has no backlinks that any available source can see.** Configure Moz (the current key is rejected) or install DataForSEO to make the profile scoreable once links exist.

| Section | Status | Score | Data source |
|---|---|---|---|
| Profile overview | fail | 0/100 (1 factor) | Bing (0.70), CC jul-aug-sep 2026 (0.50), CC URL index, verify crawler (0.95) |
| Anchor distribution | n/a | n/a | No links |
| Referring domain quality | n/a | n/a | No links |
| Toxic links | pass (nothing found) | n/a | Bing (0.70), CC (0.50) |
| Top pages | info | n/a | Bing (0.70) |
| Link velocity | n/a | n/a | DataForSEO only. Free sources give point-in-time snapshots only |

---

## What is new in this run (versus the audit and strategy documents)

The audit (`docs/seo/audit-2026-10-15.md`, H7 and section 3) and the strategy (`docs/seo/strategy-2026-10.md`, section 7) already say "0 inbound links in Bing, not in Common Crawl" and list listings to create. This run adds:

1. **The Common Crawl check used a stale release.** The earlier evidence (`docs/seo/2026-10-15/data/commoncrawl-linkar.json`) is from `cc-main-2026-jan-feb-mar`, which predates the Linkar launch. The skill script's release list stops there (`~/.claude/skills/seo/scripts/commoncrawl_graph.py:50-57`), but four newer graphs exist. I re-ran against the newest, **`cc-main-2026-jul-aug-sep`** (built from crawls CC-MAIN-2026-30, -34 and -39; 133,241,980 domains; 2.1 billion domain edges), and linkar.in is still absent.
2. **A real referring-domain gap**, computed by scanning all 2.1 billion edges of that graph (the skill script cannot list referrers: `commoncrawl_graph.py:290-292`). Results for ManyChat, SuperProfile and Zorcha (verified Indian) are below.
3. **Page-level link checks** with the verification crawler on about 40 directory, roundup and press pages: which ones actually link, and with which `rel`.
4. **The listing pages that rank for Linkar's target searches**, taken from the 48 search snapshots in `docs/seo/2026-10-15/data/strategy/serp-snapshots-2026-10-15.json`, with exact target URLs.
5. **Corrections to the strategy's listing plan**: Startup India (DPIIT) recognition is not open to a sole proprietorship; Capterra is now part of G2; most links in this niche are nofollow or absent.

---

## 1. Profile overview (LIVE)

| Check | Result | Source (confidence) | Evidence |
|---|---|---|---|
| Bing inbound links | `pages_with_inbound_links: 0`, `links: []` | Bing Webmaster `GetLinkCounts` (0.70), 15 Oct 2026 07:58 UTC | `backlinks-work/bing-counts-linkar.json`, `bing-links-linkar.json` |
| CC domain graph, newest release | `in.linkar` is **not a vertex** (sorted list goes `in.linkard`, then `in.linkarena`) | CC `cc-main-2026-jul-aug-sep` (0.50) | `backlinks-work/cc/target-ids.tsv`; vertex grep output |
| CC URL index | "No Captures found" for `linkar.in/*` and `*.linkar.in` in CC-MAIN-2026-30, -34 and -39 | CC CDX API | `backlinks-work/cc-cdx-linkar-*.json` |
| Verification crawler | 0 links to linkar.in on 32 relevant directory, roundup and media pages (21 fetched with no link, 7 blocked with 403, 2 JS-rendered and unverifiable, 2 more on enally.in with no link) | verify_backlinks.py (0.95) | `backlinks-work/verify/verify-linkar.in.json` |
| Web mentions | A search for `"linkar.in"` returns no Linkar page, only similar names: a French vehicle-warranty company "Linkar" (linkar-app.com), Linkr (Capterra) | WebSearch (US index) | Search of 15 Oct |
| Moz | `400 Client Error: Bad Request for url: https://api.moz.com/jsonrpc` | Moz | `backlinks-work/moz-metrics-linkar.json` |

**Reading this correctly.** Being absent from Common Crawl does not mean "low authority" (the skill validator says the same). It means no page that Common Crawl fetched between July and September 2026 linked to linkar.in, and Common Crawl did not fetch linkar.in itself. Together with Bing's 0, that is consistent with **zero referring domains**.

**Reciprocal-link check:** the live homepage has 0 external links (parsed with `parse_html.py`), so no reciprocal pattern exists. The local homepage, pricing and `/features` also have 0 external links.

**Validator:** `validate_backlink_report.py` returned PASS (1 info: the CC absence caveat above). Output: `backlinks-work/validator-output.json`.

## 2. Anchor text distribution

No links, so no anchors. For the links this plan earns, follow the strategy's rule (`strategy-2026-10.md`, 7.1): brand ("Linkar") and naked URL (`linkar.in`) first. Against the SaaS benchmark in `references/backlink-quality.md` (branded 40 to 55%, URL 15 to 20%, exact match 3 to 8%), never request the exact anchor "Instagram automation".

## 3. Referring domain quality

Nothing to grade. The target mix for India: listings and profiles first, then Indian editorial (`.in` and Indian media), then global roundups.

## 4. Toxic links and the domain's history

- The domain was a parked ad-redirect domain from 2022 to 2025 (audit M15). If spam links from that period still existed, Bing's index for this verified site would usually show some. It shows 0, and CC shows nothing.
- **No disavow file is needed.** Re-check Bing's inbound links once a month after the deploy.
- One site in the peer link graph, `themarketingheaven.com`, links to ManyChat, InstantDM, Interakt and CreatorFlow and sells Instagram followers, likes and comments (its own site search lists `/buy-instagram-followers/`). Do not seek links from engagement-selling sites.

## 5. Top pages and link targets

Bing reports no target pages. What matters now is where new links should point.

| URL | Use as a link target? | Evidence |
|---|---|---|
| `https://linkar.in/` | **Yes. The default "website" URL for every listing and profile** | 200, self-canonical |
| `https://linkar.in/pricing` | Yes, for pricing-led listings (Capterra, Techjockey) | 200 |
| `http://linkar.in/` | **No.** Still returns 200 with no redirect (re-checked 15 Oct), so links to it split signals | `curl`: `http://linkar.in/ -> 200`, `http://linkar.in/pricing -> 200` (audit M1, still open) |
| `https://linkar.in/signup` | **No.** It 307s to `https://app.linkar.in/signup`, and app.linkar.in robots.txt is `Disallow: /`, so a link there passes nothing | `curl -I`; `https://app.linkar.in/robots.txt` |
| `https://linkar.in/features`, `/solutions`, `/templates` and guides | After deploy, for roundups that cite a specific capability | 404 on live today; 200 locally |
| `/templates/<slug>/recipe` | **No.** It sends `x-robots-tag: noindex` (`app/templates/[slug]/recipe/route.ts:17`). Point links at the template page instead | Local response headers |

**Already fixed locally:** the homepage now links to four feature pages and to `/features` with descriptive anchors (`src/components/marketing/surface-runway.tsx:201`, `:211-212`; the local homepage has 21 distinct `/features` links, live has 0). After deploy, authority from links pointed at the homepage will flow into the catalogue.

## 6. Competitor gap analysis

### 6.1 Which competitors and why

- **manychat.com**: the global leader.
- **superprofile.bio**: Indian. Footer reads "© 2026 SuperProfile by Cosmofeed Technologies Pvt. Ltd."
- **zorcha.com**: the Indian alternative I verified. Footer reads "Zorcha Software Pvt Ltd". Its Organization schema has `"foundingDate": "2024-08-01"` and `"foundingLocation": "India"`, and its FAQ answers "Is Zorcha an Indian company?" with "Yes, Zorcha is proudly made and registered in India." It is the closest peer to Linkar: young, Indian, Instagram-first.

Bing's `compare` command cannot be used for competitors: Bing returns `400 Bad Request` for any site you have not verified, and the script then reports "0 competitor domains" without an error (`bing_webmaster.py:234-276`). Moz is broken. So the gap below comes from the Common Crawl domain graph.

### 6.2 Domain-level metrics (CC `cc-main-2026-jul-aug-sep`, confidence 0.50)

Referring domains are the distinct domains with at least one link in Common Crawl's sample of the web, so treat them as lower bounds rather than totals. PageRank rank: lower is stronger.

| Domain | Referring domains (CC sample) | `.in` referrers | PageRank rank | Hosts | Notes |
|---|---|---|---|---|---|
| manychat.com | **10,771** | 48 (0.4%) | 5,085 | 36 | Global; 5,906 `.com` referrers |
| superprofile.bio | **593** | 103 (17%) | 136,049 | 5 | Mostly creators linking their own SuperProfile store pages |
| interakt.shop (context) | 377 | 21 | 129,420 | 3 | Indian (Jio Haptik) |
| inro.social (context) | 176 | 0 | 612,546 | 5 | Wins 23 of 48 search snapshots with content, not links |
| creatorflow.so (context) | 168 | 4 | 616,651 | 2 | |
| instantdm.com (context) | 76 | 0 | 384,307 | 6 | |
| linkdm.com (context) | 45 | 1 | 1,762,293 | 3 | |
| **zorcha.com** | **19** | 3 | 10,067,136 | 4 | Absent from the Jan-Mar graph; present now |
| replykaro.com (context) | 4 | 0 | 28,861,504 | 2 | |
| **linkar.in** | **0** | 0 | not ranked | not a vertex | |

Files: `backlinks-work/cc/ranks-hits.txt`, `inbound-edges.tsv`, `inbound-named.tsv`, `gap.json`.

### 6.3 What the competitors' link profiles are made of

- **SuperProfile (593):** product-led. Most referrers are creators' own sites linking to their SuperProfile storefront. Examples: yogeshfitness.in, tradingmonks.in, sscenglishbypradeepsir.in; a page-level example is `https://www.pratiksinghrajput.com/dm` (verified link, `rel="noreferrer noopener"`). Linkar has no public creator pages (DM links are not crawlable, and `/r/` is disallowed in robots), so **this footprint cannot be copied**. Linkar has to earn links through listings, useful assets and PR.
- **SuperProfile's press:** its launch was covered by businessworld.in, cxotoday.com and itvoice.in. Each article names SuperProfile 11 to 12 times, but the crawler found **no link** to superprofile.bio in the HTML of cxotoday.com and itvoice.in (businessworld.in blocked the crawler with a 403). Indian trade press gives mentions more often than links.
- **Zorcha (19):** after about 14 months, its referrers are:
  - **Paid press release syndication.** The release "Zorcha makes Instagram DM automation free for everyone" appears on businesspanorama.in, mojopatrakar.com, globalgrowthforum.com and business-tweet.com (`/brand-connect/`). Every link is **`rel="nofollow sponsored"`** (verified). It probably also ran on tribuneindia.com, thetimesofbengal.com and entrepreneursnewsroom.com, which are CC referrers but I could not identify the pages.
  - **Competitors' comparison pages:** creatorflow.so, inro.social (`/vs/zorcha`, verified, `rel="noopener"`), replyrush.com, tryunlockdm.com and reeldrop.io.
  - **A `.in` tech blog:** enally.in (verified, followed link).
  - **AI tool directories:** invadeai.com/zorcha (verified, followed) and aiwithenoch.com.
  - **Listings that do not show up as links:** SaaSHub (`nofollow`, verified); Techjockey (the page names Zorcha 28 times but has 0 links to zorcha.com); Capterra (8 regional sites from one listing, all blocked to the crawler); Trustpilot (blocked).
- **ManyChat (10,771):** not a realistic near-term benchmark. Its link base is years of global press, agencies and integrations.

**Calibration:** the strategy targets 10 to 15 referring domains by week 12 (strategy 7.7). Zorcha, an active Indian peer, has 19 in Common Crawl's sample after about 14 months. The target is achievable with listings and profiles, but most of those links will be nofollow.

### 6.4 Gap lists

**Domains that link to all three of ManyChat, SuperProfile and Zorcha, but not Linkar:** enally.in, reeldrop.io, replyrush.com. The last two are competitors' comparison pages.

**Third-party domains that link to 3 or more Instagram DM tools (from the 54 that link to 2 or more), excluding the competitors themselves:**

| Domain | Links to | Type and fit |
|---|---|---|
| enally.in | CreatorFlow, LinkDM, ManyChat, SuperProfile, Zorcha | `.in` blog (Indian ccTLD) with comparison articles. High fit (page URLs in the tier D list) |
| saashub.com | CreatorFlow, Inrō, InstantDM, Interakt, ManyChat | Directory (nofollow). Listing |
| blotato.com | CreatorFlow, Inrō, InstantDM, LinkDM, ManyChat | Social tool vendor with comparison posts (followed links, verified on `/blog/superprofile-vs-manychat`) |
| sendpulse.com | CreatorFlow, Inrō, Interakt, ManyChat | Vendor alternatives lists |
| wati.io | CreatorFlow, Inrō, InstantDM | WhatsApp tool vendor; roundups |
| saastrac.com | CreatorFlow, InstantDM, LinkDM, ManyChat | SaaS directory (`/s_products/manychat/`; the crawler got an error on the page) |
| socialmediamanager.it, socialbyidm.com, usereplier.com, meetalto.ai, dealism.ai, igdm.me | 3 to 4 peers each | Vendor and blog roundups (non-Indian) |
| replyrush.com, reeldrop.io, upgrow.com, replymagic.ai, tryunlockdm.com, superpower.social, sumgenius.ai, sozee.ai, rupa.pro | 4 to 8 peers each | Competitor "alternatives" pages. Low reply rate; useful mainly to see which tools get compared |
| themarketingheaven.com | CreatorFlow, InstantDM, Interakt, ManyChat | **Avoid**: sells Instagram followers |

**Indian `.in` domains linking to peers:** 129 in total. Apart from enally.in (5 peers), telecrm.in and pancake.in (Interakt and ManyChat), almost all are creator storefront links to SuperProfile (product-led, as above).

**Competitors linking to competitors:** CreatorFlow and Inrō each link to 6 or 7 peers, including Zorcha; InstantDM links to 6; SuperProfile links to ManyChat. These are their vs and alternatives pages. Once Linkar is listed on directories, those authors are more likely to notice it.

### 6.5 Listing pages that rank for Linkar's target searches (search snapshots, 15 Oct)

| Ranking page | Query it ranks for | Linkar present? | Action |
|---|---|---|---|
| `https://www.capterra.in/alternatives/206636/manychat` | "manychat alternative", "manychat alternatives india" | No | Capterra listing in the same category as the Instagram DM tools |
| `https://techjockey.com/alternatives/manychat` | "manychat alternatives india" | No. The page lists Chatfuel 7 times and no Indian Instagram DM tool | Techjockey listing |
| `https://www.capterra.in/software/1108085/InstaMagic` and two others | "instagram automation tool india" | No | Capterra listing |
| `https://www.g2.com/sellers/quickdm`, `/products/chatautodm/discuss` | "free instagram automation tool" | No | G2 free profile |
| `https://alternativeto.net/software/manychat/?p=4` and `?p=5` | "manychat alternative" | No | AlternativeTo entry plus "suggest alternative" on ManyChat |
| `https://www.hunted.space/product/viraldm`, `/product/reachlee`, `/product/insteed` (Product Hunt data mirror) | "instagram automation tool india", INR pricing, follow gate | No | Product Hunt launch |
| `https://peerlist.io/sanjaykhanssk/project/instantdm--instagram-dm-automation-tool` | "instagram dm automation" | No | Founder project page on Peerlist |
| `https://dev.to/autopublix/best-instagram-dm-automation-tool-in-india-2026-2a66` | "instagram automation tool india" | No (names none of Linkar, SuperProfile or Zorcha) | Disclosed founder post on dev.to, plus an inclusion request |

Directory listings here are worth having **for the search results they occupy and the brand signal they send**, not mainly for PageRank. The crawler found `nofollow` on SaaSHub and **no link at all** on Techjockey's Zorcha page.

## 7. New and lost links

Link velocity needs DataForSEO. Free sources give point-in-time snapshots only. This report is the baseline: **0 on 15 October 2026**. After deploy, re-run `bing_webmaster.py links https://linkar.in/` monthly and keep each JSON file.

---

## Findings

### High

| # | Finding | Target | Status | Evidence | Fix |
|---|---|---|---|---|---|
| H-1 | **Zero referring domains in every source, re-confirmed on the newest Common Crawl graph.** Bing 0; not a vertex in `cc-main-2026-jul-aug-sep`; no captures in CC-MAIN-2026-30, -34 or -39; 0 links on 32 checked pages. The audit (H7) used the stale January to March graph | LIVE | owner-action | Section 1 | Work through the prioritised list below, starting with weeks 1 and 2 |
| H-2 | **Gap against the benchmarks:** SuperProfile 593, Zorcha 19 and ManyChat 10,771 referring domains (CC sample) against 0 for Linkar. Zorcha, a 14-month-old Indian peer, shows the realistic early mix: listings, comparison pages and paid PR marked `nofollow sponsored` | LIVE | owner-action | Section 6.2 and 6.3; `cc/gap.json` | Aim for 10 to 15 referring domains by week 12 (strategy 7.7) from listings and profiles, then editorial |
| H-3 | **Linkar is missing from the directory pages that rank for its money searches:** Capterra India's ManyChat alternatives, Techjockey's ManyChat alternatives, G2 seller pages, Product Hunt mirrors, Peerlist and AlternativeTo | LIVE | owner-action | Section 6.5 | Listings in tier A of the plan below, with the exact URLs |

### Medium

| # | Finding | Target | Status | Evidence | Fix |
|---|---|---|---|---|---|
| M-1 | **Link targets must be `https://linkar.in/`.** `http://linkar.in/` still answers 200 (audit M1, re-checked today), and `/signup` 307s to app.linkar.in, which is `Disallow: /` | LIVE | owner-action | Section 5 | Turn on Always Use HTTPS in Cloudflare before submitting anything. Use `https://linkar.in/` (or `/pricing`) as the website URL on every listing; never `/signup`, `app.linkar.in` or `http://` |
| M-2 | **Recipe downloads carry no source URL**, so copies shared in Notion, communities or docs cannot credit Linkar. The `/recipe` URL is also noindex, so links should go to the template page | LOCAL | open | `src/content/seo/index.ts:132-144` (no `linkar.in` in the output; 0 matches in the downloaded file); `app/templates/[slug]/recipe/route.ts:17` | Add a final plain line to `seoRecipeMarkdown`, for example `Source: Linkar template library, https://linkar.in/templates/<slug>`. Run `pnpm check:copy` |
| M-3 | **No official brand profiles and no `sameAs`**, and the name collides with "Linkar" (linkar-app.com) and Linkr. Zorcha's schema lists `sameAs` Instagram and LinkedIn | Both | owner-action | Live and local Organization JSON-LD have no `sameAs`; `src/lib/seo-pages.ts:117-118` deliberately waits for real profiles; CC has `com.linkar` and `com.linkar-app` vertices | Create LinkedIn, Instagram and YouTube profiles with the one-sentence description (strategy 3.7). Then add their URLs to Organization `sameAs` |
| M-4 | **Startup India DPIIT recognition is not available to a sole proprietorship.** The strategy lists it "if eligible"; the entity type rules it out | Both | owner-action | `src/lib/legal-entity.ts:15` and `:41` (`entityType: "Sole proprietorship"`); `strategy-2026-10.md:387`. Secondary sources citing the DPIIT notification say only private limited companies, LLPs and registered partnerships qualify | Drop it from the week 1 to 8 list. Revisit only if Linkar incorporates |
| M-5 | **Most links in this niche are nofollow, sponsored or missing:** SaaSHub `nofollow`; Techjockey's Zorcha page has no link; Zorcha's press links are `nofollow sponsored`; SuperProfile's trade press has no links | LIVE | owner-action | Section 6.3; `verify/*.json` | Set expectations: listings buy search-result space and brand signals. Never pay for "dofollow" placements (link scheme). Follow PR with polite requests to add a link to unlinked mentions |
| M-6 | **`.in` and global roundups link to peers but not to Linkar** (verified at page level): enally.in (Zorcha and SuperProfile, followed links), blotato.com (SuperProfile and ManyChat), inro.social (ManyChat) | LIVE | owner-action | Section 6.4; `verify/` | Factual inclusion requests after deploy (tier D below). Disclose that you run Linkar |
| M-7 | **Capterra now belongs to G2** (deal closed 5 February 2026). One Gartner Digital Markets listing still covers Capterra, GetApp and Software Advice; G2 is a separate free profile | LIVE | owner-action | Wikipedia "Capterra" (cites MarTech, 30 Jan 2026, and The Next Web, Feb 2026) | Create both; keep the descriptions and rupee prices identical |

### Low and info

| # | Finding | Target | Status | Evidence | Fix |
|---|---|---|---|---|---|
| L-1 | No toxic or legacy links visible despite the 2022 to 2025 parked-domain history | LIVE | open (monitor) | Bing 0; CC absent | No disavow. Check Bing monthly after deploy |
| L-2 | Avoid engagement-selling and AI-directory link sources that do not fit. themarketingheaven.com sells followers; AI directories (invadeai.com) suit only if Linkar ships AI features | LIVE | open | Section 4 and 6.3 | Leave them off the outreach list |
| I-1 | The homepage now links to feature pages locally (audit M6 fixed), so homepage-directed links will reach the catalogue after deploy | LOCAL | already-fixed-locally | `surface-runway.tsx:201`, `:211-212`; 21 distinct `/features` links locally, 0 live | Deploy |
| I-2 | Tooling: the CC script's release list is stale and it never returns referrers; Bing `compare` silently returns 0 for unverified competitors; the Moz key returns 400 | n/a | open | `commoncrawl_graph.py:50-57`, `:290-292`; `bing_webmaster.py:234-276` | Add the 2026 releases to `KNOWN_RELEASES`. Treat Bing compare as own-site only. Fix the Moz key or install DataForSEO |
| I-3 | No third-party integrations exist (only Meta and Razorpay), so integration-directory links (Zapier and similar) do not apply. Do not claim Meta Business Partner status | Both | open | Repo grep of features, solutions and templates content | n/a |

---

## Prioritised, legitimate link-building list (exact URLs)

Every row was checked on 15 Oct 2026. **"200"** means the page answered `curl`. **"403 (bot wall)"** means it blocks scripted requests but works in a browser; those URLs come from the site's own pages or search results. Link type comes from the verification crawler on comparable competitor pages where possible; "unverified" means I could not check it.

**Before any of it:** deploy, turn on Always Use HTTPS (M-1), and fill `src/lib/legal-entity.ts` (several directories need a company name and a business email).

**One description everywhere:** "Linkar is Instagram comment and DM automation for creators and businesses in India." Use real plan facts only: Free ₹0 (1,000 messages a month), Creator ₹199, Growth ₹499 and Agency ₹999 a month, GST included. No ratings, customer counts or testimonials you cannot show.

### Tier A: weeks 1 to 4 (profiles and listings that rank)

| # | Where | Exact URL to act on | Check | Link type | Why (evidence) |
|---|---|---|---|---|---|
| 1 | LinkedIn company page | `https://www.linkedin.com/company/setup/new/` | 302 to login (expected) | nofollow; entity signal | `sameAs`; Zorcha has one |
| 2 | Instagram professional account for Linkar (run Linkar on it) | In the Instagram app | n/a | Profile link | `sameAs`; real product proof (strategy 6.3) |
| 3 | Capterra, GetApp and Software Advice (one listing) | `https://digital-markets.gartner.com/capterra-vendor-signup` (curl timed out) or `https://www.capterra.com/vendors/sign-up` (403, bot wall) | see left | Unverified (crawler blocked) | `capterra.in/alternatives/206636/manychat` ranks for "manychat alternatives india". Zorcha: `capterra.com/p/10043452/Zorcha/`; ReplyKaro, Zemo, inDM, ChatAutoDM and XpressDM are also listed |
| 4 | G2 free profile | `https://sell.g2.com/create-a-profile` | 200 | Unverified | `g2.com/sellers/quickdm` ranks for "free instagram automation tool" |
| 5 | Techjockey (Indian marketplace) | `https://esellerhub.techjockey.com/` | 200 | **No outbound link** (Zorcha page: 0 links, 28 mentions) | `techjockey.com/alternatives/manychat` ranks for "manychat alternatives india" and lists no Indian Instagram tool |
| 6 | SaaSHub | `https://www.saashub.com/services/submit` | 200 | nofollow (verified) | Then suggest Linkar on `https://www.saashub.com/zorcha-alternatives` (lists FlowDM.in, ChatAutoDM, XpressDM) and `https://www.saashub.com/manychat-alternatives` |
| 7 | AlternativeTo | `https://alternativeto.net/faq/` (FAQ: "Suggest new application"), then "Suggest Alternatives" on `https://alternativeto.net/software/manychat/` | 403 (bot wall) | Reported nofollow (secondary source) | ManyChat alternatives pages `?p=4` and `?p=5` rank for "manychat alternative" |
| 8 | SoftwareSuggest (Indian directory) | `https://www.softwaresuggest.com/vendors` | 200 | Unverified | Free listing; needs a company email address (no Gmail or Outlook) |
| 9 | Trustpilot business profile | `https://signup.business.trustpilot.com/create-account` | 200 | Profile page | Zorcha and SuperProfile have profiles. Invite genuine customers only, with no incentives, and do not add `aggregateRating` from it |

### Tier B: weeks 4 to 8 (launch and founder pages)

| # | Where | Exact URL | Check | Link type | Why |
|---|---|---|---|---|---|
| 10 | Product Hunt launch (one, planned) | `https://www.producthunt.com/launch` | 403 (bot wall) | Unverified | hunted.space pages for viraldm, reachlee and insteed rank for India and INR-pricing searches |
| 11 | Peerlist founder project | `https://peerlist.io/` (create a project) | 403 (bot wall) | Unverified | Peerlist project pages rank for "instagram dm automation" |
| 12 | dev.to technical post by the founder, for example how Linkar applies Meta's private-reply and 24-hour rules, citing Meta's documentation | `https://dev.to/` (new post) | 200 (sample post) | Unverified | dev.to/autopublix posts rank for "instagram automation tool india" and "reel comment automation". State that you build Linkar |
| 13 | YouTube channel with real setup tutorials | `https://www.youtube.com/` | 200 | Description links nofollow | `sameAs`; video results; tutorials to embed in guides |

### Tier C: after deploy (assets that earn links; LOCAL work)

| # | Asset | Where | Status |
|---|---|---|---|
| 14 | Add a source line to every recipe download (M-2) | `src/content/seo/index.ts:132-144` | open |
| 15 | Instagram messaging rules explainer with Meta citations | Planned `/guides/instagram-messaging-rules` (strategy 7.3) | open |
| 16 | Rupee pricing and free-plan comparison, sourced and dated quarterly | Planned `/compare/free-instagram-automation-tools` (strategy 7.3) | open; the drafts await owner checks (audit H6) |

### Tier D: weeks 6 to 12 (inclusion requests; factual, disclosed, never paid)

Ask with a short note: what Linkar does, rupee prices with GST, the Free plan limit, the official Meta API, and what Linkar does not do. Track each request (URL, contact, date, reply, outcome).

| # | Page (exact URL) | Links to peers today (verified) | Notes |
|---|---|---|---|
| 17 | `https://enally.in/article/zapify-vs-manychat-vs-linkdm-vs-zorcha-vs-instantdm-vs-replyrush-vs-superprofile-vs-inro-vs-linktodm-vs-creatorflow` | Zorcha (followed) | `.in` site; the highest-fit page found |
| 18 | `https://enally.in/article/instagram-automation-in-2026--top-tools-to-grow--engage--and-convert-on-autopilot-6973e0aa34206` | SuperProfile (followed) | `.in` site |
| 19 | `https://dev.to/autopublix/best-instagram-dm-automation-tool-in-india-2026-2a66` | None of the three | Ranks for "instagram automation tool india" |
| 20 | `https://www.blotato.com/blog/superprofile-vs-manychat` (blotato.com links to 5 peers) | SuperProfile, ManyChat (followed, `noopener noreferrer`) | Ask about a related roundup rather than this two-way page |
| 21 | `https://www.elev8or.io/engage/best-free-instagram-dm-tools` and `https://www.elev8or.io/engage/manychat-alternative` | Mentions SuperProfile, ReplyKaro, InstantDM and LinkDM; no links in the HTML | A vendor that "names where others win". Offer the Free plan facts |
| 22 | `https://willosend.beehiiv.com/p/manychat-alternative-instagram-dm-automation` | Mentions ManyChat and LinkDM | Vendor newsletter |
| 23 | `https://www.visitoai.com/blog/manychat-alternatives` | Mentions ManyChat | Vendor |
| 24 | `https://www.jotform.com/ai/agents/instagram-automation/` | Mentions ManyChat and LinkDM | Large domain; low reply odds |
| 25 | `https://tagembed.com/blog/instagram-automation-tools/` and `https://topmate.io/blog/best-instagram-automation-tools-for-managing-growth` | Mention ManyChat; no links | Topmate has its own Auto DM product, so expect a low reply rate |

### Tier E: weeks 8 to 12 and later (Indian PR)

| # | Outlet | Exact URL | Check | Notes |
|---|---|---|---|---|
| 26 | Inc42 Startup Spotlight | `https://inc42.com/startup-spotlight/` (also `https://inc42.com/startup-submission/`) | 200 / 200 | The shortlist asks for a working product and revenue or near-term revenue |
| 27 | YourStory (story request) | `https://yourstory.com/` | 403 (bot wall) | Wants traction; pitch a verifiable angle (strategy 7.5) |
| 28 | afaqs! | `https://www.afaqs.com/page/contact-us` | 200 | Marketing trade press |
| 29 | Social Samosa | `https://www.socialsamosa.com/` (`/contact-us` returns 404) | 200 | Find the editorial contact on the site |
| 30 | Paid press release (optional) | n/a | n/a | Only with `rel="sponsored"` or nofollow links, as Zorcha's are. It buys mentions, not rankings |

**Communities** (referral and brand, not PageRank): `https://www.reddit.com/r/IndianStartups/` (200) and `https://www.reddit.com/r/InstagramMarketing/` (200). Answer real questions, say you work on Linkar, follow each subreddit's rules, and link only when the link answers the question.

**Do not:** buy dofollow links or "DR" directory packages; swap links; post in comments or forums at scale; take links from follower-selling sites; claim Meta Business Partner status; add `aggregateRating` before genuine reviews exist.

---

## Evidence index (all under `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/backlinks-work/`)

- Bing: `bing-counts-linkar.json`, `bing-links-linkar.json`, `bing-compare-manychat.json` (API keys redacted)
- Moz failure: `moz-metrics-linkar.json`
- Common Crawl, newest graph: `cc/ranks-hits.txt`, `cc/target-ids.tsv`, `cc/inbound-edges.tsv`, `cc/inbound-named.tsv`, `cc/gap.json`; scripts in `cc_scripts/`
- CC URL index: `cc-cdx-linkar-CC-MAIN-2026-{30,34,39}.json`, `cc-collinfo.json`
- Verification crawler: `verify/sources.json`, `verify/verify-{linkar.in,superprofile.bio,zorcha.com,manychat.com}.json`, `verify/mentions.json`, plus inline runs on `sources2-*.json` and `sources3.json`
- Validator: `report_data.json`, `validator-output.json` (PASS)
- Page snapshots: `live-home.html`, `live-pricing.html`, `local-home.html`, `local-pricing.html`, `local-features.html`, `parsed-live-home.json`
- URL status checks: `submission-url-status.txt`
- Search snapshots used for section 6.5: `docs/seo/2026-10-15/data/strategy/serp-snapshots-2026-10-15.json` (repo)

Data freshness: Bing is near real time (read 15 Oct 07:58 UTC). The CC graph covers July to September 2026 crawls (published 22 Sep 2026). The verification crawler ran 15 Oct around 08:05 UTC.
