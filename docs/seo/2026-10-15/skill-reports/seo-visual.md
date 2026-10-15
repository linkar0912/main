# seo-visual: above-the-fold and mobile review, 15 October 2026 (re-run)

**Skill:** seo-visual (method from `~/.claude/agents/seo-visual.md`; there is no `~/.claude/skills/seo-visual/SKILL.md` on this machine).
**Focus:** H1 and value proposition clarity for "Instagram automation", CTA visibility, mobile usability.
**Targets:**
- **LIVE**: https://linkar.in/ and https://linkar.in/pricing (as deployed today).
- **LOCAL**: http://localhost:3000 dev server as it is now, after work groups G1 to G6 (audit section 11): `/`, `/pricing`, `/features`, `/features/instagram-comment-to-dm` (split hero), `/solutions/content-creators` (centered hero), `/templates/comment-guide-delivery` (centered hero).

**Read-only.** No repo edits, no account changes, no form submissions. The only interaction was opening the mobile menu on the local homepage.

---

## Score

| Target | Score | Basis |
|---|---|---|
| **LOCAL (as it is now, the build that will ship)** | **77 / 100** | Rubric below |
| LIVE (today) | 56 / 100 | Rubric below |

| Category (weight) | LIVE | LOCAL | Why |
|---|---|---|---|
| H1 and value proposition for "Instagram automation" (30) | 8 | 21 | LIVE: the phrase appears 0 times on the home or pricing page. LOCAL: the home H1 opens with "Instagram automation for comments and DMs" and every catalogue H1 carries its label, but the keyword text is the smallest type in each hero, the home lead never says "Instagram", and the pricing H1 has no keyword. |
| CTA visibility above the fold (25) | 18 | 19 | Home and all catalogue pages show the primary CTA in the fold at every tested size (360x740 to 1920x1080). Pricing shows no CTA at all in the fold on 360x740, 375x812 and 390x844 phones, on both targets. |
| Mobile usability (25) | 22 | 22 | No horizontal scroll in 32 of 32 captures; every mobile tap target is 44x44 px or larger; mobile menu rows are 44 px with a full-width "Get started". Small deductions: auto-scrolling proof-rail cards clip text mid-word on phones, home trust row falls below the fold on phones (LOCAL), 12 px kicker and breadcrumb text. |
| First paint and visual stability (20) | 8 | 15 | LIVE: root loading skeleton and a hidden segment at DOMContentLoaded, hero text fading in. LOCAL: home and catalogue heroes paint fully at DOMContentLoaded. Pricing still fades its H1, lead and toggle in from opacity 0 on both targets. CLS fine everywhere (max session window 0.018). |
| **Total** | **56** | **77** | |

---

## What changed since the earlier (unreported) run

The earlier run captured at 11:32 to 11:34 and never captured local `/` or local `/pricing`. All screenshots below were re-captured after the G1 to G6 changes and the dev-server restart. The old set in `screenshots/visual/` is superseded; the new set is in `screenshots/visual-v2/`.

Verified visually on LOCAL, now (status: already fixed locally, LIVE still needs the deploy):

| Audit item | Evidence now |
|---|---|
| H1 (home head term) | Local home H1 = "Instagram automation for comments and DMs" + "Reply to every opportunity." + "Even when you are away." Body text contains "Instagram automation" 5 times (LIVE: 0). Title `Instagram Automation for Comments, DMs & Stories · Linkar`. |
| H4 (catalogue H1s) | All 4 catalogue pages tested render the label inside the H1, for example `/solutions/content-creators`: "Instagram automation for creators" + "Keep creating. Your replies can keep up." |
| M2, home part (first paint) | At DOMContentLoaded, LIVE has `main.root-loading` and `div[hidden][id^="S:"]` on home (desktop, mobile, Android) and pricing (desktop, laptop); LOCAL has neither on any of 32 captures. Local home H1 computed opacity is 1 at DOMContentLoaded and `local-home-mobile-early.png` shows the full hero painted; `live-home-mobile-early.png` shows washed-out hero text and the tagline still fading. |
| H2 (persona quotes) | Local proof rail shows "Example · Beauty creator in Bengaluru · sends the shade guide when someone comments SHADE." with no names or quotation marks. |

---

## Above-the-fold summary (positions in CSS px, from the top of the viewport)

| Page | Viewport | H1 as read by a browser | "Instagram automation" visible in fold | First body CTA (top to bottom) | In fold |
|---|---|---|---|---|---|
| LIVE `/` | 1920x1080 | Reply to every opportunity. Even when you are away. | No | Create your first reply, 740 to 794 | Yes |
| LIVE `/` | 375x812 | same | No | 384 to 436 | Yes |
| LIVE `/pricing` | 1920x1080 | Plans that grow with you. | No | Start free, 929 to 983 | Yes |
| LIVE `/pricing` | 375x812 / 360x740 | same | No | 854 to 908 | **No** (header shows only logo, theme toggle, menu) |
| LOCAL `/` | 1920x1080 | Instagram automation for comments and DMs / Reply to every opportunity. / Even when you are away. | Yes (16 px kicker) | 840 to 894 | Yes |
| LOCAL `/` | 1366x768, 1280x720 | same | Yes | 531 to 585; 526 to 580 | Yes |
| LOCAL `/` | 375x812, 360x740 | same | Yes (14 px kicker) | 414 to 466; 410 to 462 | Yes |
| LOCAL `/pricing` | 1920x1080 | Plans that grow with you. | No | 880 to 934 | Yes |
| LOCAL `/pricing` | 375x812, 360x740, 390x844 | same | No | 805 to 859; 805; 806 to 860 | **No** (412x915: yes) |
| LOCAL `/features` | 375x812 | INSTAGRAM AND FACEBOOK AUTOMATION FEATURES / Make every next reply a useful one. | No exact phrase | 523 to 577 | Yes |
| LOCAL `/features/instagram-comment-to-dm` | 375x812 | INSTAGRAM COMMENT TO DM AUTOMATION / A comment starts it. Your reply keeps it going. | No exact phrase (page targets comment-to-DM) | 472 to 526 | Yes |
| LOCAL `/solutions/content-creators` | 375x812 | INSTAGRAM AUTOMATION FOR CREATORS / Keep creating. Your replies can keep up. | Yes | 487 to 541 | Yes |
| LOCAL `/templates/comment-guide-delivery` | 375x812 | INSTAGRAM COMMENT TO GUIDE TEMPLATE / Promise a guide. Have the reply ready. | No exact phrase | 487 to 541 | Yes |

The catalogue kicker reads in capitals because of CSS `text-transform: uppercase`; the source text is sentence case. Full data per viewport: `screenshots/visual-v2/analysis.json`.

---

## Findings

### F1. Pricing hero still fades in from opacity 0, and that text is the live LCP element (Medium, BOTH, open)

- **Evidence.**
  - `src/components/marketing/pricing-page.module.css:34-42`: `.intro h1`, `.intro > p` and `.intro .periodRow` run `pricingRise 780ms ... backwards` with 60, 180 and 300 ms delays; `@keyframes pricingRise` at `:760-761` starts from `opacity: 0`. `.price strong` runs `priceSwap` (`:234-235`), which starts from `opacity: 0` and `filter: blur(5px)` (`:765-767`). `git status` shows this file is unchanged by G1 to G6: G6 removed the entrance only from the home hero.
  - Live PageSpeed (earlier today, `perf/raw/pricing-mobile-1.json`): mobile LCP 5.6 s; the LCP element is `header.intro > p` ("Start free, then add capacity..."), time to first byte 32 ms, **element render delay 1,824 ms**. Desktop (`pricing-desktop-1.json`): LCP element is the H1 "Plans that grow with you.", render delay 1,898 ms.
  - Local, at DOMContentLoaded on 375x812: H1 computed opacity 0.003 to 0.07, lead paragraph and plan toggle not yet visible, the ₹0 price blurred (`local-pricing-mobile-early.png`).
- **Why it matters.** The audit's M2 lists pricing LCP of 5.1 to 5.7 s but attributes the root causes to the home hero and the root loading boundary. The loading boundary is fixed locally; this entrance animation is the remaining cause on pricing, and it ships unchanged.
- **Recommendation.** Remove the opacity part of `pricingRise` for `.intro h1`, `.intro > p` and `.intro .periodRow` (keep a transform-only settle, as G6 did for the home hero), and drop the opacity and blur from the first-load `priceSwap` (keep it for interval toggles only). Re-run PSI mobile on `/pricing` after deploy; target LCP of 2.5 s or less.

### F2. No CTA above the fold on pricing for most phones (Medium, BOTH, open)

- **Evidence.** First body CTA ("Start free") top edge: LOCAL 805 px on 375x812, 360x740 and 390x844 (fully visible only on 412x915); LIVE 854 px. The mobile header holds only the logo, the theme toggle and the menu button, so the pricing fold on these phones has no tappable conversion action. Screenshots: `local-pricing-mobile-fold.png`, `local-pricing-android-fold.png`, `live-pricing-mobile-fold.png`.
- **What fills the fold.** About 80 px of empty space between the header and the H1 (H1 top at 143 px), the 3-line lead, the Monthly or Annual toggle, a separate "Save 2 months" badge row, and the top half of the Free card (title, description, ₹0, "No card required", deliveries).
- **Recommendation.** Any one of these brings "Start free" into the fold on a 360x740 screen:
  - reduce the intro's top padding on phones and put the "Save 2 months" badge inline with the toggle;
  - add a compact text link under the lead, for example "Start free, no card needed", pointing to `/signup`;
  - on phones, move the Free card's button above its deliveries line.

  Keep the header without a CTA if that is a design choice; the fix belongs in the page body.

### F3. Pricing H1 and fold never say "Instagram" (Medium, BOTH, open)

- **Evidence.** H1 `pricing-page.tsx:279` = "Plans that grow with you." The phrase "Instagram automation" is not visible in the pricing fold at any viewport (`kwInFold: false`; the local page body has only 2 occurrences, both below the fold). The audit's section 11 already lists this as a warning; this finding adds the visual evidence and a fix that matches the other pages.
- **Recommendation.** Use the same kicker pattern the homepage and catalogue now use: a span inside the H1 that reads "Instagram automation pricing", styled like the home kicker, followed by the existing "Plans that grow with you." This keeps the design and the e2e text. Update `pricing-page.test.tsx:31`, which matches the full H1 name.

### F4. On the homepage, the head term is the smallest text in the hero and the lead never says "Instagram" (Low, LOCAL, open)

- **Evidence.**
  - The kicker `.titleKicker` is 16 px on desktop and 14 px on phones (`hero-section.module.css:100-108`, `:552-555`), against 72 px and 39 px for the slogan lines. That is a 4.5:1 size ratio on desktop and 2.8:1 on phones.
  - The lead (`hero-section.tsx:34`) reads "Choose what someone says or does, write the reply once, and let Linkar answer comments and messages for you." It does not name Instagram.
  - On a phone, a visitor arriving from an "Instagram automation" search reads, in order: a small kicker, a 4-line slogan, a lead without "Instagram", then the CTA. The trust row with "Official Instagram API" would add a mention, but it falls below the fold on phones (F6).
- **Recommendation.**
  - Name the channel in the lead, for example: "Choose what someone says or does, write the reply once, and let Linkar answer Instagram comments, DMs and Story mentions for you." Update `hero-section.test.tsx:38`.
  - Optionally raise the kicker to about 18 to 20 px on desktop.

  SEO is already covered (the H1 and title contain the phrase); this is about the human reader confirming the match in the first second.

### F5. Catalogue kickers are 12 px monospace capitals (Low, LOCAL, open)

- **Evidence.** On `/features`, `/features/instagram-comment-to-dm`, `/solutions/content-creators` and `/templates/comment-guide-delivery`, the H1 kicker is 12 px JetBrains Mono uppercase at every viewport (`seo/sections/hero/hero.module.css:39-50`, `:313`), against 36 to 104 px slogan lines. The leads carry the topic on 3 of the 4 pages, so the value proposition is still clear. On `/features` the lead says "Instagram and Facebook Page automation features"; on the template page the lead says "recipe" while the kicker says "template".
- **Recommendation.** Raise the kicker to 14 px on phones and 14 to 15 px on desktop, with the letter-spacing reduced to suit. This needs no change to the H1 text or schema.

### F6. Home trust row drops below the fold on phones (Low, LOCAL, open)

- **Evidence.** On LOCAL phones the trust row ("Meta Verified Business", "Official Instagram API", "14K+ replies") starts at 877 px on 375x812 and 360x740 and 883 px on 390x844, so it is out of view. It is visible only on 412x915. About 140 px of empty photo sits between the price line (bottom near 510 px) and the chat bubbles (near 640 px). LIVE shows its trust row inside the fold on phones (`live-home-mobile-fold.png`). The placement is deliberate per the comment at `hero-section.module.css:62-71`.
- **Recommendation.** On phones, place the trust row directly under the price line and let the chat scene follow it, or reduce the empty band. Before deploy, the owner still has to confirm each trust claim (audit M18).

### F7. Proof-rail cards auto-scroll and clip mid-word on phones (Low, BOTH, open)

- **Evidence.** In the 375 px capture the moving card reads "ends the shade guide when someone / omments SHADE." and "omment to DM workflow", cut at the left edge (`local-home-mobile-proofrail.png`). A pause button exists, which is good. LIVE has the same marquee (with the persona content).
- **Recommendation.** Below 720 px, show the cards as a static horizontal scroller with snap points, or start the marquee paused, so each use case can be read in full.

### F8. The home hero chat animation causes many small layout shifts (Info, BOTH, open)

- **Evidence.** `div.hero-section-module__messageSlot` grows in height as each bubble arrives. Over 20 s on 375x812 there were 90 shift entries; the largest 5-second session window was **0.018 on LOCAL** (dev mode) and **0.013 on LIVE**, well under the 0.1 "good" limit. Live lab CLS was 0.002 to 0.014 earlier today.
- **Recommendation.** No action needed for Core Web Vitals. If the scene is reworked, reserve the slot height and animate with `transform` only.

### F9. Split and hub hero images are preloaded but sit below the fold on phones (Low, LOCAL, open)

- **Evidence.**
  - On 375x812, the `/features` hub image starts at 769 px and the split hero on `/features/instagram-comment-to-dm` starts at 784 px. On 360x740 neither is in the fold.
  - Both use `preload` (per audit section 11 and the `loading: auto` seen in the DOM). On desktop the same images are in the fold (top 139 to 146 px) and are the likely LCP elements, so the preload is right for desktop.
  - On phones the LCP is the H1 or lead text, and the image preload competes with fonts and CSS.
- **Recommendation.** Measure on LIVE after deploy (PSI mobile on `/features` and one split page) before changing anything. If mobile LCP is above 2.5 s with the image request early in the waterfall, use a `media`-scoped preload (desktop only) or `fetchPriority="high"` without preload on split and hub heroes.

### F10. The templates collection uses three names in the fold (Low, LOCAL, open)

- **Evidence.**
  - The URL is `/templates`. The header menu and breadcrumb say "Workflow recipes" (`marketing-header.tsx:26`, `:54`; `content/seo/index.ts:61`).
  - The hub tab says "Recipes" (`seo/seo-page.tsx:73`).
  - The H1 kicker on `/templates/comment-guide-delivery` says "Instagram comment to guide template", and its lead says "recipe".
- **Recommendation.** Choose one visible word. "Templates" matches the URL, the page titles (`... Template · Linkar`) and the search wording seen in autocomplete. If "recipes" stays as the brand word, keep the kicker and the breadcrumb consistent with each other. This needs an owner decision on wording; it is cheaper before launch.

### F11. Illustrative handles in code-drawn mock UI look like real accounts (Low, LOCAL, open)

- **Evidence.**
  - The desktop fold of `/features/instagram-comment-to-dm` shows a comment from "aanya.makes" with an "AM" avatar (`seo/seo-theme.ts:97`, which also lists "rohit.codes" and "meera.bakes"; `:233` lists "zoya.reads", "arjun.lifts" and "pooja.paints").
  - "@arjun.builds" appears in `pricing-finder.tsx:89` and `before-after-section.tsx:16`.
  - These names echo the removed persona names (audit H2) and could match real Instagram accounts.
- **Recommendation.** Use handles that are obviously placeholders and cannot belong to a real person, or check that each handle is unregistered. This is not a testimonial issue: the mock UI makes no claim.

### F12. LIVE homepage and pricing do not target the head term (High, LIVE, already fixed locally)

- **Evidence.** LIVE title `Linkar · Instagram and Facebook automation`; H1 "Reply to every opportunity. Even when you are away."; "Instagram automation" appears 0 times on `/` and `/pricing` (`live-home-*-fold.png`, `analysis.json` `kwBodyCount: 0`). LOCAL fixes the homepage (F4 refines it). This is audit H1, re-confirmed.
- **Recommendation.** Deploy the local build (owner, audit section 7 step 3), then re-capture these screenshots on LIVE.

### F13. LIVE first paint is a skeleton and a hidden segment, then fading hero text (Medium, LIVE, already fixed locally)

- **Evidence.** At DOMContentLoaded, LIVE home (1920x1080, 375x812, 360x740) and LIVE pricing (1920x1080, 1366x768) have `main.root-loading` plus `div[hidden][id^="S:"]`, and the H1 is not yet visible. `live-home-mobile-early.png` shows the hero text at partial opacity. On LOCAL this is gone on all 32 captures, and the home and catalogue heroes paint at DOMContentLoaded. This is audit M2 (home part), re-confirmed; F1 covers the part that is still open on pricing.
- **Recommendation.** Deploy, then run PSI mobile on `/` and `/pricing`.

### F14. Catalogue H1s now carry their label (Info, LOCAL, already fixed locally)

- **Evidence.** All 4 catalogue pages tested render the label inside the H1 (table above). The H1 is fully in the fold at every viewport from 360x740 to 1920x1080, with the primary CTA, the secondary "See how it works" or "Browse all" link, the ₹199 price line and the trust row all visible on 375x812. This is audit H4, verified visually. F5 is the remaining styling note.
- **Recommendation.** None.

### F15. Dev-mode artefacts seen in captures (Info, LOCAL, open)

- **Evidence.**
  - The Next.js dev indicator ("N") appears on every local capture.
  - One capture (local `/pricing`, 375x812) logged a hydration attribute-mismatch warning and showed a "1 Issue" toast. It did not reproduce in 3 reruns, so treat it as noise unless it shows in a production build.
  - Full-page captures show blank bands where scroll-reveal sections (for example `manifesto-section`, at opacity 0 until scrolled into view) have not been revealed. The text is in the DOM, so indexing is unaffected.
- **Recommendation.** None for SEO. Re-capture on LIVE after deploy for clean visuals.

---

## Mobile responsiveness assessment

| Check | LIVE | LOCAL |
|---|---|---|
| Viewport meta `width=device-width, initial-scale=1` | Pass | Pass |
| Horizontal scroll (375 and 360 px) | None | None. Wide strips (topic tabs, on-page nav) scroll inside their own containers. |
| Tap targets below 44 px on phones | 0 | 0. The smallest are the breadcrumb links at 45x44. |
| Navigation | Hamburger, 44x44 | Hamburger, 44x44. The menu has 44 px rows: Product, Solutions, Workflow recipes, Pricing, Instagram, Facebook Pages, How it works, Questions, Help center, Sign in, and a full-width Get started (`local-home-mobile-menu.png`). |
| Base and lead text | 15 px body, 16 px lead | 15 px body, 16 to 17 px lead. Kicker, breadcrumb and trust-row text are 12 to 13 px; that passes Lighthouse's 12 px floor (F5). |
| Text contrast (computed) | n/a over photo | Catalogue lead is white on #5F2CE0 at 7.18:1; pricing lead is #5F6068 on white at 6.25:1. Both pass AA. |
| Layout shift | Max session window 0.013 | Max session window 0.018 (dev) |
| Desktop header links | 21 to 23 px tall | 21 to 23 px tall. Fine for a pointer; not a mobile issue. |

---

## Method and limits

- **Tooling.** Playwright with Chromium headless shell 1234; script `visual_capture_v2.py`, probes in `visual-scripts/`.
- **Viewports.** 1920x1080 and 1366x768 at DPR 1; 375x812 (iPhone user agent) and 360x740 (Android user agent) at DPR 2, with mobile emulation and touch. Extra position probes at 1536x864, 1440x900, 1280x720, 375x667, 390x844 and 412x915.
- **Timing.** One "early" read at DOMContentLoaded (H1 opacity, root-loading skeleton, hidden segment, plus a phone screenshot), then a read after `load` + 3 s.
- **LOCAL is dev mode.** Timings, CLS and paint order there are indicative only. Performance numbers are quoted only from LIVE PageSpeed runs made earlier today (`perf/raw/`); no new PSI run was made.
- **GA4.** Requests to google-analytics.com failed in headless capture on LIVE (blocked or aborted collect calls). This does not affect the visuals; GA4 is out of scope here.
- **Not checked.** Real devices, landscape, dark mode, and the 60 catalogue detail pages not listed above.

## Screenshot index

All files are in `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/screenshots/visual-v2/`:

- `{page}-{desktop|laptop|mobile|android}-fold.png` for each page; `{page}-{desktop|mobile}-full.png`; `{page}-mobile-early.png`. Pages: `live-home`, `live-pricing`, `local-home`, `local-pricing`, `local-features-hub`, `local-feature-comment-to-dm`, `local-solution-content-creators`, `local-template-comment-guide`.
- `local-home-mobile-menu.png`, `local-home-mobile-proofrail.png`, `local-home-mobile-full-top.png`, `live-home-mobile-full-top.png`.
- `analysis.json`: per-capture H1, lead, CTAs, tap targets, overflow, fold text, hero images, early-paint state and CLS.
