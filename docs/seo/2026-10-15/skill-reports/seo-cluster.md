# seo-cluster: the "instagram automation" keyword universe, clustered by SERP overlap

- **Skill:** `seo-cluster` v1.9.0 (SKILL.md, `references/serp-overlap-methodology.md`, `references/hub-spoke-architecture.md`, agent method `~/.claude/agents/seo-cluster.md`)
- **Date:** 15 October 2026
- **Targets:** LIVE https://linkar.in (home, `/pricing`, legal and help) and LOCAL http://localhost:3000 (freshly restarted dev server, re-crawled for this report after work groups G1 to G6)
- **Rules kept:** read-only on the repo and all accounts. No volumes are invented. No HowTo, no FAQPage for Google rich results.
- **Machine-readable plan:** `cluster-work/v2/cluster-plan.json` (pillar, 5 clusters, 19 spokes, 102-link matrix with an `exists_locally` flag on each link, and both overlap matrices)
- **Raw evidence:** `cluster-work/v2/` holds `new_serps.json` (23 standard SERPs from this run), `ext_serps.json` (25 extended SERPs from this run), `normalized_sets.json`, `overlap_pairs.json`, `overlap_pairs_ext.json`, `crawl.json` (79 local URLs), `inlinks.json`, and the scripts `crawl.py`, `overlap.py`, `overlap_ext.py` and `build_plan.py`.

## 1. Summary

**Cluster architecture score: 53 / 100 for the LOCAL build. LIVE is about 15**, because only the homepage and `/pricing` are deployed, so 0 of the 19 planned spokes are live.

How the 53 is made up (my rubric, built on the skill's scorecard metrics):

| Part | Points | Why |
|---|---|---|
| Cluster coverage | 16 / 30 | 14 SERP-validated clusters. 6 have a matching local owner, 5 are partial, 3 plus the pillar are gaps. |
| Page type match | 13 / 20 | Feature pages match the comment-to-DM, Story, follow gate, email and team SERPs. The DM automation, Facebook and broad audience SERPs reward guides and roundups instead. |
| Internal links | 10 / 20 | There is no pillar, so pillar links are 0%. 11 of 26 recommended intra-cluster links exist. 6 pages get no related link. The homepage now links to 4 lead features. |
| Cannibalisation | 8 / 15 | Four risks: the welcome twins, the hub vs child "for creators" and "for small businesses" phrases, the Facebook trio, and the future pillar vs the homepage. |
| Searcher vocabulary | 6 / 15 | The head term is now in the titles and H1s. But "auto DM" appears 0 times on 67 pages plus home, "India", "UPI" and "GST" appear 0 times in the 64 guides, and there is no Hinglish. |

**The five things that matter most**

1. **The clusters with the most commercial value have no page:** the head-term guide, India buyers, free tools, rules and safety, and Manychat comparisons. The local catalogue covers the long tail of features well. The money clusters are all gaps (F1, F2, F6, F7).
2. **"Auto DM" is a separate search with its own results, and Linkar never says it.** Autocomplete in India offers "auto dm instagram free", "free unlimited", "meta verified" and "kya hota hai". The results for it overlap with comment-to-DM (2 to 3 shared URLs on both engines). Yet the phrase appears 0 times across the 67 local catalogue pages, the homepage and llms.txt (F3).
3. **The welcome-message feature and template compete for one result page.** Both engines return example lists for this query. Merge the two pages, and let the template own "instagram welcome message examples" (F4).
4. **Internal link weight does not follow demand.** Human handoff gets 8 related in-links and link tracking gets 7. The welcome feature and DM follow-ups get 1 each, and 6 pages get 0. Comment-to-DM and DM automation link to each other only through the previous and next buttons (F5).
5. **The strategy document draws on two different search engines without saying so.** Its 48 result snapshots mix WebSearch standard mode (41) with extended mode (7). For the same query the two engines share 0 or 1 of 9 URLs. Its domain-share table, and its claim that Inrō is the benchmark, depend on that mix. In extended mode the leaders are CreatorFlow and ReplyRush, each in 17 of 25 result pages (F10).

**Already fixed locally since the first audit pass** (the LIVE site is still stale until deploy):
- the homepage title, H1 kicker and "What is Instagram automation?" FAQ answer;
- hub H1s that now contain the head term;
- 4 homepage links to the lead features;
- the `/pricing` keyword title and its link to `/features`.

See F13.

---

## 2. Data and method

### 2.1 Sources

| Source | What it is | Snapshots |
|---|---|---|
| WebSearch, **standard** mode (US index) | 41 from the earlier cluster run (`cluster-work/serp/b1.py` to `b4.py`, the same data as the `C:` keys in `docs/seo/2026-10-15/data/strategy/serp-snapshots-2026-10-15.json`), plus 20 new queries and 4 re-runs on 15 Oct (`cluster-work/v2/new_serps.json`) | 61 keywords |
| WebSearch, **extended** mode (a different index) | 7 from the earlier SXO run (the `X:` keys in the strategy file), plus 25 fresh queries on 15 Oct (`cluster-work/v2/ext_serps.json`) | 31 keywords |
| Google autocomplete, India (`gl=in`) | `docs/seo/2026-10-15/data/strategy/autocomplete-gl-in-2026-10-15.json` and `autocomplete-manychat-gl-in-2026-10-15.txt` | 38 seeds plus the Manychat seeds |
| LOCAL crawl | 79 sitemap URLs fetched with a Googlebot user agent on 15 Oct after G1 to G6: titles, H1, H2, main-body links, header and footer links (`cluster-work/v2/crawl.json`) | 79 URLs, all 200 |

That makes 66 distinct keywords with result-page data, and 92 snapshots in total.

**What is not available, said plainly:**
- **No search volumes.** DataForSEO is not installed, and Search Console has 0 impressions.
- **Neither engine is Google India.** The WebSearch tool is US-only.
- So the pillar and spoke choices rest on result-page overlap, intent and autocomplete, not on volume.

### 2.2 How I found that the snapshots come from two different engines

The extended re-run of "instagram automation india" matched the earlier `X:` snapshot on 7 of 8 URLs. Standard mode for the same query matched it on 0 of 8.

| Same query, two runs | Shared URLs | Meaning |
|---|---|---|
| "instagram automation", standard vs standard re-run | 8 / 9 | Standard is stable |
| "instagram comment to dm automation", standard vs re-run | 8 / 8 | Stable |
| "instagram dm automation", standard vs re-run | 9 / 9 | Stable |
| "instagram story reply automation", standard vs re-run | 9 / 9 | Stable |
| "instagram automation india", extended vs earlier `X:` | 7 / 8 | Extended is stable |
| "instagram automation", standard vs extended | 1 / 9 | **Different engines** |
| "instagram dm automation", standard vs extended | 0 / 7 | Different engines |
| "instagram automation india", standard vs extended | 0 / 8 | Different engines |
| "manychat alternative", standard vs extended | 1 / 9 | Different engines |

So I computed overlap **within each engine only**. A cluster is "robust" when both engines agree.

**Normalisation** (`overlap.py`):
- strip the protocol, `www.`, the trailing slash and query strings, but keep WordPress `?p=` IDs;
- treat `.md` mirrors as the same page;
- remove hacked or spam hosts before scoring: `erpstaging.fha.gov.ng`, `cmc.imexhs.com`, `jobs.doral.edu`, `ldap.kayako.com` and `groups.google.com`.

**Thresholds** (the skill's): 7 to 10 shared = same page; 4 to 6 = same cluster; 2 to 3 = interlink; 0 to 1 = separate.

---

## 3. Keyword universe and intent

Navigational queries are excluded from clustering, as the skill requires. These are "manychat india", which returns company-information pages, and brand queries. Out of scope are "instagram chatbot", which returns AI chatbot builders while Linkar has no AI replies, plus GitHub, n8n and Python bots, follower and like bots, and Story mention viewers.

| Cluster | Keywords (S = standard SERP, E = extended SERP, A = autocomplete only) | Dominant intent | What ranks (page type) |
|---|---|---|---|
| Head term | instagram automation (S, E); what is instagram automation (S, E); instagram automation kaise kare / hindi (S, E); instagram automation tools (S, E); instagram automation tool (S, E); instagram automation app (S, E); instagram automation software (A) | Informational, then commercial | S: long guides, many about post scheduling (Boltic, Outfy, Nuelink, ContentStudio, Blaze, WebFX). E: guides plus tool roundups (Flowgent "11 best tools", Planable, SetSmart, Heyy, Sprout Social, Sprinklr). **0 product homepages for the head term on either engine.** |
| India buyers | instagram automation india (S, E); instagram automation tool india (S, E); best instagram automation tool india (S, E); instagram dm automation india (S); instagram automation pricing inr per month india upi (S) | Commercial investigation | E: only India vendor roundups plus one ₹ landing page (ReplyKaro "Instagram Automation in India: ₹ Pricing, UPI and Free Plan", Reachlee, QuickDM, heyy.to, FlowDM, Loopfuel, Zextra, ReplyRush India, DMRabbit, ReplyMitra). S: directories (Capterra India), a Product Hunt mirror, a vendor dev.to post, a Shopify listing. |
| Free | instagram automation free (S, E); free instagram automation tool (S); instagram dm automation free (S); comment to dm instagram free (S, E); auto dm instagram free (A) | Commercial | E: vendor free-plan pages (zorcha.com, repli.in/free, replykaro.com) and "best free tools" lists. S: thin or junk pages, so the result page is weak. |
| Comment to DM and auto DM | instagram comment to dm automation (S, E); instagram comment to dm (E); instagram auto dm from comment (S); auto dm instagram (S, E); send link in instagram dm automatically when someone comments (S); instagram comment par auto dm kaise bheje (S); how to auto reply to instagram comments with a dm (S); instagram auto reply to comments (S, E); auto dm instagram kya hota hai (S, E); instagram reel comment automation send link (S) | Commercial plus how-to | S: guides (Inrō x3, Zorcha, Metricool, Wati). E: **product homepages** (linkdm.com, replyrush.com, linktodm.com, chatautodm.com, creatorflow.so) next to guides. |
| DM automation | instagram dm automation (S, E); how to automate instagram dms (S, E) | How-to | S: 9 of 9 guides (Mailchimp, SocialBee, Inrō, bot.space). E: guides (Buffer, Hootsuite, Flowgent) plus 2 product homepages. |
| Auto reply and keywords | instagram auto reply (S, E); instagram auto reply kaise kare (S); instagram keyword auto reply (S, E) | How-to | Setup guides (Klaviyo, Metricool, Omnichat, CreatorFlow, ReplyRush) |
| Welcome and reply examples | instagram welcome message examples for business (S); instagram welcome message automation (S, E); instagram auto reply message examples (S) | Informational (lists) | Example lists (Trengo, respond.io, Jotform, Sked Social, Dealism "30+ examples", SetSmart "12 examples") |
| Stories | instagram story reply automation (S, E); instagram story mention auto reply (S, E) | How-to | Help docs, how-to guides, vendor use-case pages |
| Leads | instagram follow gate / follow to get link (S, E); collect email addresses in instagram dms (S, E); instagram lead generation automation (S) | How-to plus commercial | Follow gate and email: vendor feature and use-case pages (tadlo.ai/features, reachlee use-cases, creatorflow use-case). Lead generation: guides (bot.space, Interakt x4). |
| Rules and safety | is instagram automation safe (S, E); is instagram automation allowed (S); instagram private reply 24 hour window rules (S); instagram dm follow up automation 24 hour window (S) | Informational | Safety guides (Inrō safety page, Zorcha, ReplyRush, CreatorFlow). Rules: Meta's developer docs, Chatfuel's messaging rules, Inrō's glossary. |
| Team and insights | instagram automation human handoff (S); instagram dm link tracking (S); no code instagram automation builder (S) | Commercial | Meta's human agent docs, vendor feature pages and changelogs |
| Facebook | facebook page comment auto reply (S, E); facebook auto reply to comments keyword (S) | How-to | Help docs and tool pages (respond.io, NapoleonCat, Statusbrew, Chatfuel docs) |
| Audiences | instagram automation for small business (S, E); for creators (S, E); for coaches (S); for restaurants (S); for ecommerce (S, plus a Shopify variant) | Mixed | Niche audiences: vendor audience pages (Inrō fitness coaches, InstantDM `/for/restaurants` and coaches, Zorcha `/for/`). Broad audiences: generic tool roundups. |
| Comparisons | manychat alternative (S, E); manychat alternative(s) india (S, E); manychat pricing (S); superprofile vs manychat (S); linkdm alternative (S) | Commercial investigation | Alternatives lists and vs pages. For India in E: 10 India vendor alternatives pages (ReplyKaro x2, EngageDM, Kwikzy, UnlockDM, MizUp, WhoseDM). |

---

## 4. SERP overlap results

### 4.1 Pairs at or above the interlink threshold

| Pair | Standard | Extended | Decision |
|---|---|---|---|
| instagram automation tool india ↔ instagram automation india | **6** | **5** | Same cluster on both engines |
| instagram automation tools ↔ instagram automation tool | **6** | 2 | Same cluster |
| instagram automation tool india ↔ best instagram automation tool india | **4** | 3 | Same cluster |
| instagram automation india ↔ instagram dm automation india | **4** | n/a | Same cluster |
| free instagram automation tool ↔ instagram automation free | **4** | n/a | Same cluster |
| manychat alternatives india ↔ manychat alternative india | **4** | n/a | Same page |
| instagram automation ↔ instagram automation tools | 0 | **4** | **The engines disagree.** Cover tools inside the pillar (see F1). |
| instagram automation ↔ what is instagram automation | 3 | **4** | Same page (pillar) |
| instagram automation ↔ instagram automation app | 0 | **4** | Engines disagree |
| instagram automation tools ↔ instagram automation for creators | 0 | **4** | The broad audience result page is a roundup page (F9) |
| instagram automation ↔ instagram automation for small business | 1 | 3 | Same as above |
| instagram automation ↔ instagram automation kaise kare hindi | 3 | 0 (E shows safety guides) | Interlink. Hinglish goes into the pillar and the safety page. |
| how to automate instagram dms ↔ instagram dm automation | 3 | n/a | One page |
| instagram comment to dm automation ↔ instagram auto dm from comment | 3 | n/a | One page |
| instagram comment to dm automation ↔ send link automatically when someone comments | 3 | n/a | One page |
| instagram comment to dm automation ↔ instagram comment to dm | n/a | 3 | One page |
| instagram comment to dm automation ↔ instagram dm automation | n/a | 3 | Interlink (F5) |
| comment par auto dm kaise bheje ↔ instagram auto dm from comment | 3 | n/a | Hinglish block on the comment-to-DM page |
| auto dm instagram ↔ auto dm instagram kya hota hai | 2 | 2 | Same as above |
| auto dm instagram ↔ instagram comment to dm automation | 0 | 2 | "Auto DM" belongs on the comment-to-DM page (F3) |
| instagram auto reply ↔ instagram auto reply kaise kare | 3 | n/a | One guide |
| instagram auto reply ↔ instagram keyword auto reply | 2 | n/a | Interlink |
| instagram story reply automation ↔ instagram story mention auto reply | 2 | 2 | Interlink, separate pages (already done, F11) |
| is instagram automation safe ↔ is instagram automation allowed | 2 | n/a | One page |
| instagram automation free ↔ comment to dm instagram free | 0 | 2 | Interlink |
| manychat alternative ↔ manychat alternative india | 3 | 1 | Borderline. Make one India-first page (F7). |

### 4.2 Pairs at 0 or 1, kept on separate pages

| Pair | Standard | Extended |
|---|---|---|
| welcome message automation ↔ welcome message examples | 0 | n/a. But the extended "welcome message automation" result page is itself mostly example lists (Trengo, Dealism, SetSmart). |
| facebook page comment auto reply ↔ facebook keyword variant | 1 | n/a |
| lead generation ↔ email capture | 0 | n/a |
| lead generation ↔ follow gate | 0 | n/a |
| safe ↔ 24-hour rules | 0 | n/a |
| manychat alternative ↔ manychat pricing | 0 | n/a |
| manychat alternative ↔ linkdm alternative | 0 | n/a |
| instagram chatbot ↔ instagram dm automation | 0 | n/a |
| reel comment send link ↔ comment to dm | 0 | n/a |
| reel comment send link ↔ send link automatically | 1 | n/a |

### 4.3 Who owns the result pages, by engine

| Domain | Standard (61 SERPs) | Extended (31 SERPs) |
|---|---|---|
| inro.social | 28 | 5 |
| superprofile.bio | 14 | 4 |
| elev8or.io | 12 | n/a |
| instantdm.com | 10 | 6 |
| interakt.shop | 9 | n/a |
| zorcha.com | 8 | n/a |
| creatorflow.so | n/a | **17** |
| replyrush.com | n/a | **17** |
| flowgent.ai | n/a | 11 |
| reachlee.co | n/a | 9 |
| replykaro.com | n/a | 8 |

In extended mode the winners publish use-case, feature and blog pages at scale, mostly product-led. In standard mode it is the guide libraries (Inrō, SuperProfile, Interakt).

---

## 5. Cluster architecture, mapped to pages

**Status key:** L = exists in the LOCAL build (not deployed). N = gap, new page. M = merge. LIVE has none of these except `/` and `/pricing`.

### Pillar

| Page | Primary keyword | Secondary | Template | Words | URL | Status |
|---|---|---|---|---|---|---|
| Instagram automation: what it is, what Meta allows and how to choose a tool | instagram automation | what is instagram automation; instagram automation tools; instagram automation kaise kare | ultimate-guide | 2,500 to 4,000 | `/instagram-automation` | **N (gap)**. The homepage is the interim owner: G1 title, G6 H1 kicker, G4 FAQ definition. |

### Cluster 1: Buying (India, free and tool choice)

| Page | Primary | Secondary | Template | URL | Status |
|---|---|---|---|---|---|
| Instagram automation tools in India compared | instagram automation india | instagram automation tool india; best instagram automation tool india; instagram dm automation india | best-of | `/compare/instagram-automation-tools-india` | **N** |
| Free Instagram automation tools compared | instagram automation free | free instagram automation tool; instagram dm automation free; comment to dm instagram free | comparison | `/compare/free-instagram-automation-tools` | **N** |
| Homepage | instagram automation app | instagram automation software; brand | landing-page | `/` | L (LIVE is stale) |
| Pricing | instagram automation pricing india | rupee plan queries | landing-page | `/pricing` | L and live |

### Cluster 2: Comment to DM and auto DM

| Page | Primary | Secondary | URL | Status |
|---|---|---|---|---|
| Instagram comment to DM automation | instagram comment to dm automation | auto dm instagram; instagram auto dm from comment; send link when someone comments; comment par auto dm kaise bheje; auto dm instagram kya hota hai; instagram auto reply to comments | `/features/instagram-comment-to-dm` | L (vocabulary gap, F3) |
| Instagram Reel comment automation | instagram reel comment automation | instagram reels comment auto reply | `/features/instagram-reel-comment-automation` | L |
| Instagram follow gated campaigns | instagram follow to get link | instagram follow gate | `/features/instagram-follow-gate` | L |
| Instagram comment to guide template | comment to get link template | none | `/templates/comment-guide-delivery` | L |

### Cluster 3: DMs, auto replies and welcome messages

| Page | Primary | Secondary | URL | Status |
|---|---|---|---|---|
| Instagram DM automation | instagram dm automation | how to automate instagram dms | `/features/instagram-dm-automation` | L. The result page wants a how-to, so lead with the setup steps. |
| Instagram auto reply guide, with a Hinglish section | instagram auto reply | instagram par auto reply kaise kare; instagram auto reply message | `/guides/instagram-auto-reply` | **N** |
| Instagram keyword auto replies | instagram keyword auto reply | none | `/features/instagram-keyword-replies` | L |
| Instagram welcome message examples and template | instagram welcome message examples | instagram welcome message automation; for business | `/templates/first-message-welcome` | L, and **M**: merge in `/features/instagram-first-message-welcome` (F4) |

### Cluster 4: Stories and leads

| Page | Primary | URL | Status |
|---|---|---|---|
| Instagram Story reply automation | instagram story reply automation | `/features/instagram-story-reply-automation` | L |
| Instagram Story mention auto replies | instagram story mention auto reply | `/features/instagram-story-mention-replies` | L |
| Instagram email capture automation | collect emails from instagram dms | `/features/instagram-email-capture` | L |
| Instagram lead generation with DM automation | instagram lead generation automation | `/guides/instagram-lead-generation` | **N** (F8) |

### Cluster 5: Rules and safety

| Page | Primary | Secondary | URL | Status |
|---|---|---|---|---|
| Is Instagram automation safe and allowed? | is instagram automation safe | is instagram automation allowed; legit; auto dm instagram meta verified | `/guides/is-instagram-automation-safe` | **N** |
| Instagram messaging rules explained | instagram 24 hour messaging window | instagram private reply rules | `/guides/instagram-messaging-rules` | **N** |
| Instagram DM follow up automation | instagram dm follow up automation | none | `/features/instagram-dm-follow-ups` | L |

### Secondary hubs, outside the head-term pillar

These are kept out of the pillar to stay within the skill's limit of 2 to 5 clusters and 21 pages per pillar.

- **`/compare` (N):**
  - `/compare/manychat-alternatives`, with an India-first title (F7);
  - `/compare/manychat`;
  - later `/compare/superprofile` and `/compare/linkdm`. Each of these queries has its own result page, with 0 overlap between them.
- **`/solutions` (L):** release the niche audiences first, because their result pages show vendor audience pages:
  - `/solutions/online-coaches`;
  - `/solutions/fitness-coaches`;
  - `/solutions/restaurants-cafes`;
  - `/solutions/ecommerce-brands`.
- **Facebook (L, M):** `/features/facebook-comment-auto-reply` absorbs the keyword and post-specific pages (F12).
- **Team and insights (L):** human handoff, link tracking, analytics, and the no-code builder. Each has its own result page, and feature pages match it.

### Cannibalisation check

| Risk | Evidence | Action |
|---|---|---|
| Welcome feature vs welcome template | Both target "instagram welcome message"; the result pages are example lists | Merge (F4) |
| `/solutions` hub vs `/solutions/content-creators` and `/solutions/small-businesses` | The hub title is "Instagram Automation for Creators & Businesses". The child labels are "Instagram automation for creators" (`src/content/seo/solutions.ts:5`) and "... for small businesses" (`:49`). | Give the hub a collection-level target such as "Instagram automation by industry", or keep it and watch Search Console (F9) |
| Facebook trio | 3 pages for a single query family. The keyword variant shares only 1 URL. | Merge, as the strategy says (F12) |
| Future pillar vs homepage | Both would carry "Instagram automation" in the title | Once the pillar ships, move the homepage title towards app, software and brand wording (F1) |

---

## 6. Internal link matrix

Full adjacency list: `cluster-plan.json`, key `links` (102 links), with `exists_locally` checked against the main body of each LOCAL page (`crawl.json`).

### 6.1 Rules applied

- **Mandatory:** pillar ↔ every spoke, with the anchor set to the spoke's keyword.
- **Recommended:** 2 or 3 links between spokes in the same cluster.
- **Optional:** 0 or 1 cross-cluster link.
- **Minimum:** 3 incoming links per page.

| Planned incoming links | Pages |
|---|---|
| Pillar | 19 |
| `/features/instagram-comment-to-dm` | 6 |
| `/features/instagram-follow-gate` | 6 |
| `/features/instagram-dm-automation` | 6 |
| Every other spoke | 4 to 5 |
| `/features/instagram-dm-follow-ups` | 3 |

No page is orphaned. The footer directory (89 links on every page) already makes every guide reachable in one click.

### 6.2 Recommended links that exist today (LOCAL)

Between pages that already exist, **11 of 26** recommended links are in place.

| From → to | Today |
|---|---|
| comment-to-dm → reel, follow-gate, comment-guide template | Exists (related block) |
| reel, follow-gate, comment-guide template → comment-to-dm | Exists |
| reel ↔ follow-gate ↔ comment-guide template | **Missing (6 links)** |
| dm-automation ↔ keyword-replies | Exists |
| dm-automation → first-message-welcome template | Missing |
| keyword-replies → welcome template, and welcome template → dm-automation and keyword-replies | **Missing** |
| story-reply ↔ story-mention | Exists |
| story pages ↔ email-capture | Missing |
| dm-follow-ups → rules and safety guides | Missing (the guides are N) |
| comment-to-dm ↔ dm-automation | Only through the "Previous / Next feature" sequence links, not a contextual link |
| home → comment-to-dm, dm-automation, story-mention, follow-gate, `/features` | Exists (G4) |
| home → `/compare/*`, `/instagram-automation` | Missing (the pages are N) |
| `/pricing` → `/features` | Exists (G4) |
| `/pricing` → the free and India compare pages | Missing (the pages are N) |

### 6.3 Anchor text

- **Mostly good.** The related links use page labels such as "Instagram comment to guide template".
- **Two weak spots:**
  - 26 pages carry the identical body anchor "Learn more about Facebook Page comment replies" pointing to `/features/facebook-comment-auto-reply`. That is above the skill's 40% single-anchor ceiling.
  - No internal anchor names the head term for the future pillar, because the pillar does not exist yet.

---

## 7. Reconciliation with `docs/seo/strategy-2026-10.md`

| Strategy item | Agree or differ | Evidence and position |
|---|---|---|
| 0. Evidence base: "48 search result snapshots ... combined" | **Differ** | The 48 are two engines: 41 standard and 7 extended. For the same query they share 0 or 1 of 9 URLs (section 2.2). They must not be pooled. My overlap is computed per engine. |
| 1.5 and 4.1: "Inrō is the content benchmark" (23 of 48) | **Differ in part** | That holds in standard mode (Inrō in 28 of 61). In extended mode CreatorFlow and ReplyRush lead (17 of 25 each), followed by Flowgent (11), Reachlee (9) and ReplyKaro (8). Add CreatorFlow and ReplyRush to the benchmark set: product-led use-case pages at scale. |
| 4.3 #3: "kaise kare hindi shares 4 of its top URLs with what is instagram automation" | **Minor correction** | One of the 4 is the spam URL `erpstaging.fha.gov.ng/?p=37175`. The real overlap is 3. The conclusion still holds. |
| 1.3 and 5.3: the head term is a guide result page, so build a pillar at `/instagram-automation` | **Agree** | Both engines show 0 product homepages for "instagram automation" (section 3). |
| A2: "tool, app, software, free" → homepage | **Differ** | The "tool(s)" result pages are 9 of 9 roundups in standard mode and 6 or 7 of 9 in extended. Extended also puts head ↔ tools at 4 shared URLs. Fold "instagram automation tools" into the pillar as an honest tool-types comparison section. Keep the homepage for "app", "software" and the brand. "Free" is its own cluster, as A4 already says. |
| A3: `/compare/instagram-automation-tools-india` | **Agree, and add** | India is a robust cluster: 6 shared URLs in standard, 5 in extended. Extended shows a second winning page type, an India landing page with ₹, UPI and a free plan (ReplyKaro). Linkar's homepage and pricing should carry those signals: the homepage says "UPI" 0 times today (F2). "Winnable sooner" is plausible, but the extended result page is crowded with about 10 small India vendors doing the same thing. |
| A4: `/compare/free-instagram-automation-tools` | **Agree** | Free is a cluster (4 shared in standard). The extended result page also rewards free-plan landing pages, so strengthen the Free plan on `/pricing` (F6). |
| B: comment to DM → `/features/instagram-comment-to-dm` | **Agree, and add** | It is the largest validated cluster. Add "auto DM" wording and a Hinglish block there, not only in the pillar (F3, F14). |
| C1: DM automation | **Agree** | Lead with how-to content. The result page is 9 of 9 guides in standard mode. |
| C2: `/guides/instagram-auto-reply` | **Agree** | auto reply ↔ kaise kare share 3 URLs, and auto reply ↔ keyword share 2. |
| C3: `/templates` plus `/guides/instagram-auto-reply-message-examples` | **Partly differ** | Agree on the examples guide: "auto reply message examples" shares only 1 URL with "auto reply". But the welcome feature and template twin compete for one example-list result page. Make the template the welcome-examples page and merge the feature into it (F4). |
| D: Story pages, keep both | **Agree** | 2 shared URLs on both engines, so interlink. The two-way links already exist. |
| E: leads = email capture, follow gate, lead qualification | **Differ** | "instagram lead generation automation" shares 0 URLs with the email and follow-gate result pages, and lead qualification is a different intent. Add a lead-generation guide (F8). |
| G: merge the Facebook trio | **Agree, low confidence** | The keyword variant shares 1 URL. That is fragmented help docs, not a distinct intent. There is no demand evidence for "post specific". |
| H: 20 solution pages | **Differ in priority** | The niche audiences (coaches, restaurants) show vendor audience pages. The broad ones ("small business", "creators") collapse into the head and tools roundup result pages in extended mode (3 and 4 shared). Release and link the niche ones first. `/solutions/fitness-coaches` has 0 related in-links (F9). |
| I: comparisons | **Agree, and adjust** | Each competitor query has its own result page (0 overlap). The "manychat alternative india" result page shares only 1 URL with the global one in extended mode, and is full of India alternatives pages. Give the alternatives page an India-first title (F7). |
| J: two trust pages | **Agree** | safe ↔ allowed share 2 URLs, so one page. safe ↔ 24-hour rules share 0, so a second page. Extended "instagram automation kaise kare" returns safe-automation guides, so add a Hinglish block to the safety page. |
| K: `/guides/comment-to-dm-vs-link-in-bio` | **Unverified; lower priority** | No result page was collected for "link in bio vs DM". The only link query I collected ("send link ... when someone comments") belongs to the comment-to-DM cluster (3 shared URLs). |
| 5.8: out of scope | **Add** | Add "instagram chatbot" to the out-of-scope list: its result page is AI chatbot builders, with 0 overlap. |
| 5.6: internal link matrix | **Agree, and make concrete** | Section 6 gives the page-level adjacency list and shows that 15 of 26 recommended links are missing today. |

---

## 8. Findings

Each finding states its target (LIVE, LOCAL or both) and its status: open, already-fixed-locally or owner-action.

### F1. No page owns the head-term informational result page (High, both, open)

- **Evidence:**
  - "instagram automation" shows 0 product homepages in the top 9 on either engine. Standard is guides (Boltic, Outfy, Engati, Fiverr, WebFX, Nuelink, ContentStudio, Blaze, SendPulse). Extended is guides and roundups (Outfy, Sprout Social, Sprinklr, Flowgent, SetSmart, Heyy).
  - head ↔ what is: 3 shared (standard), 4 (extended).
  - head ↔ tools: 4 shared (extended).
  - The LOCAL homepage is the interim owner. Its title is "Instagram Automation for Comments, DMs & Stories · Linkar", its H1 kicker contains the term, and the phrase appears 5 times in the body (`crawl.json`).
- **Fix:**
  - Build `/instagram-automation` as a 2,500 to 4,000-word guide:
    - a 40 to 60-word definition;
    - both meanings (conversations vs post scheduling);
    - Meta's rules;
    - a section on types of tools, with criteria stated, Linkar disclosed as the publisher, and competitors that beat Linkar on some criteria;
    - a short Hinglish section.
  - Link it from the homepage and every spoke.
  - Once it ships, shift the homepage title towards "app" and "software" and watch Search Console for URL swapping.
  - This is the strategy's N item, still a gap.

### F2. The India buyer cluster has no page, and India signals are missing on the pages that exist (High, both, open)

- **Evidence:**
  - India ↔ tool india: 6 shared (standard), 5 (extended). tool india ↔ best tool india: 4 and 3. India ↔ dm automation india: 4.
  - The extended result page is entirely India roundups plus a ₹/UPI landing page.
  - LOCAL crawl:
    - "India" appears in 0 of 64 guides (`grep -ci india src/content/seo/*.ts` returns 0 in all four files);
    - "UPI" appears in 0 of 64 guides and 0 times on the homepage (`marketing-content.ts` has 0);
    - `/pricing` mentions UPI once (`pricing-page.tsx`).
  - This is related to audit M8 (deferred), which covers India content inside the guides. This finding adds the cluster evidence and the homepage gap.
- **Fix:**
  - Ship `/compare/instagram-automation-tools-india`, with sourced, dated rupee prices and GST, UPI and free-plan criteria.
  - Add one plain line to the homepage about rupee prices with GST included and UPI, card or netbanking checkout. These are real facts per `/pricing`.

### F3. "Auto DM" is a validated search, and the site never uses the phrase (High, LOCAL, open)

- **Evidence:**
  - India autocomplete for "auto dm instagram" suggests free, comments free, free unlimited, free app, meta verified, app and kya hota hai (`autocomplete-gl-in-2026-10-15.json`).
  - Overlaps with comment-to-DM queries:
    - auto dm instagram ↔ comment par auto dm kaise bheje: 2 (standard);
    - auto dm instagram ↔ auto dm from comment: 2 (standard);
    - auto dm instagram ↔ comment to dm automation: 2 (extended);
    - auto dm instagram ↔ kya hota hai: 2 (both).
  - Extended mode ranks product homepages for it (linkdm.com, linktodm.com, creatorflow.so).
  - LOCAL: a regex count for `auto[- ]?dm` gives 0 on `/`, all 3 hubs and all 64 guides. `grep -rniE "auto[- ]?dm"` over `src/content/seo/`, `marketing-content.ts`, `app/page.tsx` and `app/llms.txt/route.ts` returns nothing.
  - The seo-page report found the same on the comment-to-DM page alone. This finding extends it sitewide, with result-page evidence.
- **Fix:**
  - Put "auto DM" into the comment-to-DM page's description, intro and one H2. For example: "Auto DM anyone who comments your keyword".
  - Use it once on the homepage, near the comment card.
  - Use it in the llms.txt summary.
  - Keep "private reply" as the precise term beside it.

### F4. The welcome-message feature and template compete for one result page (Medium, LOCAL, open)

- **Evidence:**
  - Standard "instagram welcome message examples for business": 9 of 9 example lists (Trengo, respond.io, Jotform, Sked Social x2, Juphy, SendPulse, Dealism x2).
  - Extended "instagram welcome message automation": also mostly example lists (Trengo examples, Dealism "30+ examples", SetSmart "Setup + 12 Examples").
  - LOCAL has two pages for that one result page:
    - `/features/instagram-first-message-welcome`, label "Instagram first message welcome" (`src/content/seo/features.ts:71`), with 1 related in-link;
    - `/templates/first-message-welcome`, label "Instagram welcome message template" (`src/content/seo/templates.ts:50`), with 2 related in-links.
  - This is related to audit M12 (deferred, "check SERP overlap first"). This finding supplies that check.
- **Fix:**
  - Make the template the owner of "instagram welcome message examples", with more real, copy-ready examples and a short setup section.
  - Merge the feature page into it with a 301 before launch, when changing costs nothing.
  - If the owner wants to keep both, retitle the feature away from "welcome message" wording.

### F5. Internal link weight does not follow the validated clusters (Medium, LOCAL, open)

- **Evidence** (`inlinks.json`):
  - related in-links: human handoff 8, link tracking 7, email capture 7;
  - comment-to-DM 6, DM automation 5;
  - Story mention 2, welcome feature 1, DM follow-ups 1;
  - 0 for `/features/no-code-instagram-flow-builder`, `/solutions/podcasters`, `/solutions/fitness-coaches`, `/solutions/fashion-brands`, `/solutions/real-estate-teams` and `/solutions/travel-creators`. That matches audit M9, which is still open.
  - Only 11 of 26 recommended intra-cluster links exist (section 6.2).
  - Comment-to-DM ↔ DM automation, which share 3 URLs in extended mode, link only through the previous and next sequence links.
  - Solution → solution related links: only 5 in total.
- **Fix:** with the deferred related-link rebalancing, add the missing intra-cluster links from `cluster-plan.json` (`type: recommended`, `exists_locally: false`). The priority links are:
  - comment-to-DM ↔ DM automation;
  - reel ↔ follow gate;
  - welcome template ↔ DM automation and keyword replies;
  - Story pages ↔ email capture.

### F6. The free cluster has no page, and `/pricing` does not answer "free" in its H1 (Medium, both, open)

- **Evidence:**
  - free tool ↔ instagram automation free: 4 shared (standard).
  - automation free ↔ comment to dm free: 2 (extended).
  - Extended winners are free-plan pages (zorcha.com, repli.in/free, replykaro.com/instagram-dm-automation) and "best free tools" lists.
  - The standard result page is low quality: beehiiv, velog, a GitHub bot, lovable.app. That makes it an opening.
  - The LOCAL `/pricing` H1 is "Plans that grow with you." It has no keyword, as the audit 11 warnings also note.
- **Fix:**
  - Ship `/compare/free-instagram-automation-tools`, with every row sourced and dated.
  - Consider a `/pricing` H1 or kicker that names the Free plan with its real limits (5 automations, 1,000 messages a month, from `src/lib/billing/catalog.ts`).

### F7. "Manychat alternative India" needs an India-first comparison page (Medium, both, owner-action)

- **Evidence:**
  - manychat alternative ↔ manychat alternative india: 3 shared (standard), 1 (extended).
  - The extended India result page is 10 India vendor alternatives pages (ReplyKaro x2, EngageDM, Kwikzy, UnlockDM, MizUp, WhoseDM and others).
  - The global page is WhatsApp-heavy (respond.io, Tidio, SendPulse, ChatDaddy).
  - Autocomplete includes "manychat alternative india", "manychat indian alternative" and "manychat pricing india".
  - Known as audit H6 (deferred). The drafts need the owner checks.
- **Fix:**
  - Title the alternatives page for India, for example "Manychat alternatives in India: rupee pricing compared".
  - Keep `/compare/manychat` for the head-to-head.
  - The owner answers the [OWNER CHECK] lines first.

### F8. Lead-generation intent has no owner (Medium, LOCAL, open)

- **Evidence:**
  - "instagram lead generation automation" shares 0 URLs with "collect email addresses ..." and 0 with "follow gate ...".
  - Its result page is lead-generation guides (bot.space, Interakt x4, Inrō "best lead generation tools").
  - `/features/instagram-lead-qualification` targets qualifying questions, which is a different intent (`features.ts:104`).
- **Fix:** add `/guides/instagram-lead-generation` to cluster 4. It should link to email capture, follow gate and lead qualification, and they should link back.

### F9. Broad audience pages face roundup result pages; niche audiences match (Low, LOCAL, open)

- **Evidence:**
  - Extended: small business ↔ head 3, ↔ app 3; creators ↔ tools 4, ↔ head 2.
  - Standard: coaches return audience pages (Inrō fitness coaches, InstantDM coaches, Zorcha `/for/fitness-nutrition`).
  - Standard: restaurants return audience pages (Kittychat, InstantDM `/for/restaurants`).
  - `/solutions/fitness-coaches` has 0 related in-links. The `/solutions` hub title "Instagram Automation for Creators & Businesses" (`src/content/seo/index.ts`) overlaps the child labels at `solutions.ts:5` and `:49`.
- **Fix:**
  - Put the coaches, fitness, restaurants and ecommerce solution pages first in wave 2, and link them from the matching features.
  - Consider a hub target that does not repeat the child labels.

### F10. The strategy pools two search engines; its benchmark and shares need correcting (Medium, docs, open)

- **Evidence:** section 2.2:
  - same-query overlap across engines is 0 or 1 of 9;
  - the extended re-run matched the `X:` snapshots on 7 of 8;
  - within-engine re-runs matched on 8 or 9 of 9.
  - Domain leaders differ by engine (section 4.3).
  - The "4 shared URLs" in strategy 4.3 includes a spam host.
- **Fix:**
  - Label the engine on every snapshot.
  - Report shares per engine.
  - Add CreatorFlow and ReplyRush to the competitor benchmark.
  - Keep the per-engine overlap files in `docs/seo/2026-10-15/data/strategy/` when the doc is next updated.
  - Replace both proxies with Search Console queries from about week 6.

### F11. Story reply and Story mention: keep separate, interlinked (Info, LOCAL, already-fixed-locally)

- **Evidence:**
  - 2 shared URLs on both engines, which is interlink level.
  - The two-way related links exist: `/features/instagram-story-reply-automation` ↔ `/features/instagram-story-mention-replies` (`inlinks.json`).
- **Fix:** none beyond giving each page different examples and FAQs (the deferred content pass).

### F12. Facebook trio: the merge still stands; one anchor repeats too often (Low, LOCAL, open)

- **Evidence:**
  - facebook page comment auto reply ↔ keyword variant: 1 shared, both fragmented help docs.
  - No result page exists for "post specific".
  - "Learn more about Facebook Page comment replies" is the same body anchor on 26 pages pointing to `/features/facebook-comment-auto-reply`.
- **Fix:**
  - Merge as the strategy (5.4) says, and 301 the two slugs before launch.
  - Vary the FAQ link anchor by collection.

### F13. Head-term ownership signals have landed locally (Info, LOCAL, already-fixed-locally)

- **LOCAL evidence** (`crawl.json`):
  - homepage title "Instagram Automation for Comments, DMs & Stories · Linkar";
  - H1 "Instagram automation for comments and DMs ...";
  - first FAQ "What is Instagram automation?";
  - hub H1s "Instagram and Facebook automation features", "Instagram automation for creators and businesses" and "Instagram and Facebook automation templates";
  - home body links to the 4 lead features plus `/features`;
  - `/pricing` title "Instagram automation pricing in India · Linkar".
- **LIVE** still serves the old homepage (audit H1). Deploying fixes it. That is an owner action.

### F14. Hinglish belongs on the comment-to-DM and safety pages, not only the pillar (Low, LOCAL, open)

- **Evidence:**
  - "auto dm instagram kya hota hai" ↔ "auto dm instagram": 2 shared on both engines.
  - SuperProfile's Hinglish guide `superprofile.bio/guides/auto-dm-kya-hai` ranks first and second (with its `.md` mirror) in standard mode for "auto dm instagram kya hota hai" and "instagram dm automation india".
  - "comment par auto dm kaise bheje" ↔ comment-to-DM queries: 2 to 3 shared.
  - Extended "instagram automation kaise kare" returns safe-automation guides.
  - LOCAL: 0 Hinglish terms in the 64 guides (regex for bhejo, kaise, kya, pls, batao).
- **Fix:** a short, plain Hinglish Q&A block on the comment-to-DM page and the safety guide. Then test a standalone "auto DM kya hai" guide, since that page type demonstrably ranks.

### F15. Exclude "instagram chatbot" (Info, both, open)

- **Evidence:** its result page is AI chatbot builders (Jotform agent, Engati, Freshworks, WotNot, Trengo), with 0 overlap with any Linkar cluster. Linkar sends no AI-written replies (strategy 3.4).
- **Fix:** add it to the out-of-scope list in strategy 5.8.

### F16. LIVE covers 0 of the 19 cluster spokes (High, LIVE, owner-action)

- **Evidence:**
  - The live sitemap has 12 URLs, 10 of them legal or help pages (brief and audit C1).
  - `/features` returns 404 on live (brief).
  - Every cluster in section 5 is therefore a gap on LIVE.
- **Fix:**
  - Deploy, with the launch waves the owner chooses (audit H5).
  - Wave 1 should include the cluster 2 and cluster 3 owners: comment-to-DM, DM automation and keyword replies. These have the strongest result-page evidence.

---

## 9. What I could not check

- **Google India result pages:** both engines are proxies, and the WebSearch tool is US-only.
- **Search volumes:** there are no volumes, so the pillar choice rests on breadth and overlap, not on volume.
- **The "link in bio vs DM", "manychat vs linktree" and "superprofile pricing" result pages:** not collected.
- **The cluster map:** `cluster-map.html` was not generated, because the skill's `templates/cluster-map.html` is not present in `~/.claude/skills/seo-cluster/` (only `references/` exists).
- **Content briefs** (the skill's execute step): not produced. That is outside an audit-phase run.
