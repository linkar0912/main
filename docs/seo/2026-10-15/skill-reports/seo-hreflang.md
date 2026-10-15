# Hreflang and International SEO: linkar.in

Skill: `seo-hreflang` (v1.9.0). Run date: 15 Oct 2026.
Targets: LIVE https://linkar.in (12 sitemap URLs) and LOCAL http://localhost:3000 (all 79 sitemap URLs).
Mode: read-only. No repo files were edited and no account setting was changed.

## Verdict

**Linkar does not need hreflang.** It is a single-language (English), single-market (India) site. Every URL has exactly one version. Google's hreflang guidance is written for sites that "have multiple versions of a page for different languages or regions" ([Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)). There is nothing for an hreflang annotation to point at, so adding one changes nothing for Google and adds tags across 79 URLs that someone has to keep correct.

The India targeting already comes from stronger signals: the `.in` country-code domain, INR pricing with GST, UPI and netbanking, Indian law and DPDP Act references, `areaServed: "IN"`, and `og:locale` `en_IN`. Two things are worth fixing instead:

1. **(Medium, LIVE)** Plain `http://linkar.in` answers `200 OK` instead of redirecting to HTTPS.
2. **(Low, BOTH)** `<html lang="en">` is the one language signal that does not say India. Change it to `en-IN`.

**Category score: 86 / 100.** This skill has no built-in score for a single-language site, so the score rates how correct and consistent the language and region signals are. Deductions: no HTTP to HTTPS redirect (-8), `lang` out of step with `en_IN` / `en-IN` (-3), live is missing `inLanguage` until the deploy (-1), and a few stray US spellings in otherwise British-spelled copy (-2).

## Summary

| Item | Value |
|---|---|
| Pages scanned | 12 live (the full live sitemap), 79 local (the full local sitemap) |
| Language variants detected | 1: English for India (`en` in `<html lang>`, `en_IN` in Open Graph, `en-IN` in JSON-LD) |
| hreflang tags found | 0 on every page, live and local; none in either sitemap; no `Link` hreflang headers |
| Locale-adaptive redirects | None. A request with `Accept-Language: de-DE` gets the same `200`, and `Vary` does not include `Accept-Language` |
| Issues | Critical 0, High 0, Medium 1, Low 1, Info 4 |

## Validation results

Not applicable as a set: there are no alternates, so the self-reference, return-tag and x-default checks have nothing to test. These are the per-URL language signals instead.

| Target | URLs | `<html lang>` | hreflang | `og:locale` | JSON-LD `inLanguage` | Canonical | Status |
|---|---|---|---|---|---|---|---|
| LIVE | 12 / 12 | `en` | none | `en_IN` | none on any page | self, exact match to sitemap | OK, Low mismatch |
| LOCAL | 68 / 79 (home, 3 hubs, 64 detail pages) | `en` | none | `en_IN` | `en-IN` | self, exact match to sitemap | OK, Low mismatch |
| LOCAL | 11 / 79 (pricing, support, contact, legal) | `en` | none | `en_IN` | none | self, exact match to sitemap | OK, Low mismatch |

Evidence commands (all output is in `scratchpad/seo-run/hreflang-work/`):

- Each live sitemap URL was fetched with `curl` using a Googlebot UA. `hreflang_extract.py` then read `<html lang>`, hreflang links, the canonical, `og:locale`, `inLanguage`, `priceCurrency` and `areaServed`.
- Each local sitemap URL was mapped to `localhost:3000` and checked the same way. Result: `68 pages: lang=en hreflang_count=0 og:locale=en_IN inLanguage=('en-IN',)`, `11 pages: lang=en hreflang_count=0 og:locale=en_IN inLanguage=()`, and 0 canonical mismatches.

Where each signal comes from in the repo:

- `app/layout.tsx:41`: `lang="en"`. Also `app/global-error.tsx:26`.
- `src/lib/site-url.ts:5`: `OPEN_GRAPH_DEFAULTS = { ..., locale: "en_IN" }`.
- `app/page.tsx:40-41`: Organization `contactPoint` with `areaServed: "IN"` and `availableLanguage: "English"`. `app/page.tsx:50`: WebSite `inLanguage: "en-IN"`. This node is local only; the live homepage has no WebSite node.
- `src/lib/seo-pages.ts:35` and `:58`: WebPage and CollectionPage `inLanguage: "en-IN"`.
- `app/sitemap.ts`: plain `<urlset>` with no `xhtml:link` alternates. That is correct for a site with one version per URL.

## Findings

### 1. Medium, LIVE: `http://linkar.in` serves 200 instead of redirecting to HTTPS (protocol consistency)

Evidence:
- `curl -sI http://linkar.in/` returns `HTTP/1.1 200 OK`. So do `http://linkar.in/pricing` and `http://linkar.in/privacy`, through Cloudflare (`Server: cloudflare`).
- `www` is fine: `http://www.linkar.in/pricing` returns `301` to `https://linkar.in/pricing`.
- The hstspreload.org API (`/api/v2/preloadable?domain=linkar.in`) returns:
  - error `redirects.http.no_redirect`: "`http://linkar.in` does not redirect to `https://linkar.in`";
  - warning `redirects.http.useless_header`, because the HSTS header is sent over HTTP, where browsers ignore it.
- The preload status is `unknown`, so the `preload` directive in the header is not doing anything yet.
- Mitigation already in place: every HTTP page still declares an HTTPS canonical (`<link rel="canonical" href="https://linkar.in"/>`). Google will most likely consolidate to HTTPS, but the HTTP copy is still a crawlable duplicate.

Why it matters for this skill: protocol consistency is check 7. A site should expose one protocol so that every canonical, sitemap URL and any future hreflang set is HTTPS only.

Recommendation (an account setting for the owner to change, not a code change):
1. In Cloudflare, go to SSL/TLS, then Edge Certificates, and turn on "Always Use HTTPS". The alternative is one redirect rule: `http://*linkar.in/*` to `https://$1linkar.in/$2`, 301, query string preserved.
2. Verify that `curl -sI http://linkar.in/pricing` returns `301` with `location: https://linkar.in/pricing`.
3. Optionally, once the redirect is live, submit `linkar.in` at hstspreload.org. The header already has `max-age=63072000; includeSubDomains; preload`. Preloading covers `app.` and `admin.` too, which already use HTTPS.
4. Add one line to `ops/DOKPLOY_DEPLOYMENT.md` (line 18 describes the Cloudflare to Traefik routing) recording that HTTP to HTTPS is enforced at Cloudflare.

Repo files: `ops/DOKPLOY_DEPLOYMENT.md` (documentation only).

### 2. Low, BOTH: `<html lang="en">` disagrees with `og:locale` `en_IN` and `inLanguage` `en-IN`

Evidence:
- All 12 live and 79 local URLs render `<html lang="en">` (`app/layout.tsx:41`, and `app/global-error.tsx:26` for the error shell).
- The same pages declare `og:locale` `en_IN` (`src/lib/site-url.ts:5`).
- On local, 68 pages also declare JSON-LD `inLanguage: "en-IN"` (`app/page.tsx:50`, `src/lib/seo-pages.ts:35`, `:58`).
- Google does not read `lang`. Its docs say "Google doesn't use hreflang or the HTML lang attribute to detect the language of a page" ([Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)). So this change is not for Google.
- Bing does read it. Bing's documented order of location signals is the `content-language` meta, then the `content-language` HTTP header, then `<html lang>` and `<title lang>` ([Bing Webmaster Blog, Mar 2011](https://blogs.bing.com/webmaster/March-2011/How-To-Tell-Bing-Your-Website-s-Country-and-Langua)). Linkar sends none of the first two, so `<html lang>` is the only signal Bing gets, and today it says no region.
- No test asserts the `lang` value. A grep across `app src scripts tests e2e` finds only the two source lines.

Recommendation: a one-attribute change in two files. It is consistent with the `.in` domain, rupee pricing and the existing `en_IN` / `en-IN` declarations.

```tsx
// app/layout.tsx, line 41 (and the same in app/global-error.tsx, line 26)
<html lang="en-IN" ...>
```

- Do **not** add `<meta http-equiv="content-language">`. The HTML Standard marks that pragma non-conforming and tells authors to use `lang` instead ([WHATWG HTML, content language state](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-content-language)).
- A `Content-Language: en-IN` response header is optional and not needed once `lang` is set.
- `en-IN` is a valid BCP 47 tag: ISO 639-1 `en` plus ISO 3166-1 alpha-2 `IN`. Screen readers fall back to their English voice when no Indian English voice is installed, so accessibility is unaffected.
- Leave `app.linkar.in` as is. It is noindex, but the shared root layout means it would pick up `en-IN` too, which is harmless.

Repo files: `app/layout.tsx`, `app/global-error.tsx`.

### 3. Info, BOTH: hreflang is not needed; keep it out until a second version exists

Evidence:
- No URL, live or local, has an hreflang tag, header or sitemap alternate.
- Each URL exists in one language for one market. There are no `/hi/` or `/en-us/` paths, no regional subdomains and no second domain. `www` 301s to the apex.
- The app sets no `i18n` config, and `next.config.ts` has no locale settings.
- Google's guidance covers multiple versions of a page ([Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)). Google lists hreflang as one way to "tell Google which pages apply to which locations or languages" when such pages exist ([Google: multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).

Recommendation: do not add hreflang now.
- A self-referencing-only set (`hreflang="en-IN"` plus `x-default` pointing at the same URL) is technically valid, but it has no effect.
- It would not geotarget India, because hreflang only swaps between alternates and never limits where a page can rank. It would not hide the page from searchers outside India either.
- It would add 158 tags across the 79 URLs, and each one has to match the canonical exactly, trailing slash included.

Add hreflang only when one of these exists:
- a translated version, for example Hindi;
- a second English version for another market, for example USD pricing for a global audience.

The template for that day is under "Future template" below.

Repo files: none now. The future touch points are `src/lib/seo-pages.ts` (`metadataFor`), `app/sitemap.ts` and `app/layout.tsx`.

### 4. Info, BOTH: the `.in` domain already sets India geotargeting; nothing in Search Console can override it

Evidence:
- Google says ccTLDs "provide a strong signal to both users and search engines that your site is explicitly intended for a certain country". `.in` is not on Google's list of ccTLDs it treats as generic, unlike `.io`, `.co`, `.me` or `.tv` ([Google: multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).
- Search Console's International Targeting report and its country setting were removed on 22 Sep 2022 ([Search Console Help](https://support.google.com/webmasters/answer/12474899)), so there is no manual setting to change.
- Search Console data cannot confirm country distribution: the brief records 0 impressions in the last 28 days, so there is nothing to segment.

Recommendation:
- Accept this. It matches the India-first goal and the INR-only checkout.
- Know the trade-off: ranking for "Instagram automation" in the US or UK will be harder from a `.in` domain, and no hreflang or code change on `linkar.in` can fix that.
- If Linkar later targets non-India English markets, that needs a separate site on a generic TLD with USD pricing, linked to `linkar.in` by cross-domain hreflang (`en-IN` on linkar.in, `en` plus `x-default` on the global site). Both properties must be verified in Search Console.
- For Bing: once `linkar.in` is added to Bing Webmaster Tools (the brief notes it is missing), check whether the UI offers a country/region setting. The Bing Webmaster API still documents `AddCountryRegionSettings` ([Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.addcountryregionsettings)). This is optional, and only worth doing if the setting is exposed.

Repo files: none.

### 5. Info, BOTH: locale formats and India market cues are consistent (pass)

I checked the page text against the skill's Locale Format Validation and Default Profile.

| Check | Expected for en-IN | Found | Result |
|---|---|---|---|
| Currency | `₹` before the amount, no space | `₹0`, `₹199`, `₹499`, `₹999`, `₹1,990`, `₹4,990`, `₹9,990` (live `/pricing`, local home FAQ) | Pass |
| Machine-readable currency | `INR` | `priceCurrency: "INR"` on all four offers (live and local home JSON-LD) | Pass |
| Number grouping | lakh grouping (`1,00,000`) for 6+ digits | Largest number is `50,000` deliveries. No 6+ digit numbers on any page, and Indian and Western grouping are identical below 1,00,000 | Pass |
| Dates | DD Month YYYY | "10 October 2026" on `/terms`, `/privacy`, `/refund-policy`. No US-style "October 10, 2026" found | Pass |
| Tax and payments | GST, UPI | "Every price includes applicable GST", "UPI, cards, and netbanking, all at Indian rates in rupees" (live `/pricing`) | Pass |
| Legal and trust | Indian law, DPDP Act, grievance officer | Live `/privacy` names India's Digital Personal Data Protection Act, 2023 and a grievance officer; `/terms` sets governing law to India; `/contact` gives "Sole proprietorship, India" | Pass |
| Region in schema | `IN` | `areaServed: "IN"` on the Organization `contactPoint` | Pass |
| Phone format | +91 if shown | No phone number is published, which is fine | N/A |
| Locale redirects | none | Same 200 for any `Accept-Language`; no IP or language redirect | Pass |

India market adaptation score (the Default Profile): **95 / 100**. The only point taken off is the spelling inconsistency in Finding 6.

Recommendation:
- Keep this as it is.
- Guard for the future: if a figure of 1,00,000 or more ever appears in public copy, format it with `toLocaleString("en-IN")`, as the app code already does (for example `src/lib/insights-summary.ts:66`), so it renders as `1,00,000` rather than `100,000`.
- Do not add Hindi to `availableLanguage` unless support really answers in Hindi.

Repo files: none.

### 6. Info, BOTH: a few US spellings in copy that otherwise uses British spelling

Evidence:
- Public copy mostly uses British spelling, which is the usual convention for Indian English. A grep of `src/content`, `src/components/marketing` and `app` finds 84 British forms, such as "colours", "organise", "customise", "recognise" and "personalisation" on local `/templates`, `/solutions`, `/features` and live `/privacy`.
- The visible US strays:
  - `src/components/marketing/marketing-content.ts:74`: "Recognize questions about prices, hours, or delivery..." (live and local home);
  - `src/components/marketing/automation-story-scenes.tsx:19`: "Linkar recognizes “GUIDE”" (live and local home);
  - `src/components/marketing/automation-story-scenes.tsx:282`: "GUIDE recognized" (live and local home).
- The local SEO pages use "recognise" (for example `/templates/comment-guide-delivery`), so the homepage and the SEO catalogue disagree.
- The slug `event-organizers` (`src/content/seo/solutions.ts:159`) is also a US form.
- This is not a ranking factor. Google matches spelling variants. It is a consistency cue only.

Recommendation:
- Change the three visible strings to "Recognise questions about prices, hours, or delivery and answer them straight away.", "Linkar recognises “GUIDE”" and "GUIDE recognised". Then update any test snapshots that contain them.
- Keep the `event-organizers` slug. "Event organizer" is common in Indian searches too, and changing a URL costs more than it gains.
- Optionally, add a small US-to-British word list to `scripts/check-customer-copy.mjs` (`pnpm check:copy`) so new copy stays consistent.

Repo files: `src/components/marketing/marketing-content.ts`, `src/components/marketing/automation-story-scenes.tsx`, `scripts/check-customer-copy.mjs` (optional).

## Generated hreflang tags

**None are needed today** (see Finding 3).

### Future template (only when a second version exists)

Hypothetical structure: a Hindi version under `/hi/...` on the same domain. This shows the shape only. It is not a recommendation to build a Hindi site.

HTML, through the Next.js 16 Metadata API. `alternates.languages` renders `<link rel="alternate" hreflang>` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, section `alternates`). The change would go in `metadataFor` in `src/lib/seo-pages.ts`:

```ts
alternates: {
  canonical: path,                          // e.g. "/pricing"
  languages: {
    "en-IN": path,                          // self-reference is required
    "hi-IN": `/hi${path}`,
    "x-default": path,
  },
},
```

The `/hi/...` page must carry the identical `languages` map, with its own canonical `/hi${path}`, so that the return tags match.

Sitemap alternative: `app/sitemap.ts` entries accept `alternates.languages` (`.../03-file-conventions/01-metadata/sitemap.md`). The Next.js example leaves out the self entry, so add the self entry and `x-default` yourself:

```ts
{ url: `${origin}/pricing`, alternates: { languages: {
  "en-IN": `${origin}/pricing`, "hi-IN": `${origin}/hi/pricing`, "x-default": `${origin}/pricing` } } }
```

Use one method, HTML or sitemap, not both. When this happens, set `<html lang>` per route: `en-IN` on English pages and `hi-IN` on Hindi pages. Next.js does this with a `[lang]` segment in the root layout (`01-app/02-guides/internationalization.md`).

## Recommendations, in order

1. **LIVE, Medium:** turn on Cloudflare "Always Use HTTPS" (or a 301 redirect rule) so `http://linkar.in/*` 301s to HTTPS, then verify with `curl -sI`. This is an owner action in the Cloudflare dashboard.
2. **BOTH, Low:** set `lang="en-IN"` in `app/layout.tsx:41` and `app/global-error.tsx:26`.
3. **BOTH, Info:** do not add hreflang. Revisit only if a translated or second-market version is created.
4. **BOTH, Info:** make the three homepage strings use British spelling ("Recognise", "recognises", "recognised"). Optionally enforce it in `pnpm check:copy`.
5. **BOTH, Info:** when `linkar.in` is added to Bing Webmaster Tools, set the country to India if the UI offers it.

## Data not available

- Search Console has no country or language segmentation to analyse: 0 impressions in 28 days, per the brief.
- GA4 has 0 sessions, so there is no visitor locale data.
- Bing Webmaster has no `linkar.in` site, so Bing's view of the site's language or region cannot be checked.

## Sources

- [Google Search Central: Tell Google about localized versions of your page](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google Search Central: Managing multi-regional and multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Search Console Help: The International Targeting report is deprecated](https://support.google.com/webmasters/answer/12474899)
- [Bing Webmaster Blog: How To Tell Bing Your Website's Country and Language (Mar 2011)](https://blogs.bing.com/webmaster/March-2011/How-To-Tell-Bing-Your-Website-s-Country-and-Langua)
- [Microsoft Learn: Bing Webmaster API AddCountryRegionSettings](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.addcountryregionsettings)
- [WHATWG HTML Standard: content language pragma](https://html.spec.whatwg.org/multipage/semantics.html#attr-meta-http-equiv-content-language)
- hstspreload.org API: `https://hstspreload.org/api/v2/preloadable?domain=linkar.in` (queried 15 Oct 2026)
