# seo-drift: Linkar, 15 October 2026 (re-run)

**Skill:** `seo-drift` (baseline, compare, history). **Targets:** LIVE https://linkar.in/ and https://linkar.in/pricing; LOCAL build (production prerender in `.next/server/app` plus the dev server at http://localhost:3000) used only to forecast what the compare will report after deploy.

**Score:** none. Drift is a change detector, not a health score. The result that matters: **0 on-page drift on LIVE**, and a clear forecast of the drift the deploy should produce.

**Run folder:** `/private/tmp/claude-501/-Users-tejastelkar-Desktop-Software-Projects-Linkar/d5d74586-1715-46f2-87bc-74101882437b/scratchpad/seo-run/` (written below as `RUN/`).

---

## 1. Summary

| Check | Home `/` | `/pricing` |
|---|---|---|
| Baseline stored | Yes: ids 2 (06:09:24 UTC) and 4 (06:11:05 UTC), same on-page state | Yes: id 3 (06:09:55 UTC) |
| Compare now (08:03 UTC, baseline 4 / 3) | **0 CRITICAL, 1 WARNING, 0 INFO** | **0 CRITICAL, 1 WARNING, 0 INFO** |
| The one WARNING | `cwv_regressed`: CLS 0.0011 to 0.0018 ("+64%"), lab noise | `cwv_regressed`: TBT 68 to 109 ms ("+60%"), lab noise |
| On-page rules (15 of 17) | All untriggered | All untriggered |
| HTML hash vs baseline | Identical (`26af4c2638b4...`) | Identical (`a27327352e39...`) |
| Status code | 200 | 200 |

**Verdict:** LIVE has not changed since the baselines were taken, as expected. The only triggers are lab Core Web Vitals noise from single PageSpeed runs (section 4). The HTML is byte-identical, so nothing on the page moved.

**Forecast after deploy** (section 5, computed with the skill's own rule functions on the current local build): home **0 CRITICAL, 3 WARNING, 2 INFO**; pricing **0 CRITICAL, 2 WARNING, 3 INFO**. Every one of those triggers is an intended change from the work groups. Any CRITICAL after deploy is a real regression.

**What I reused from the earlier run:** the stored baselines (ids 2, 3, 4) and comparisons (ids 3, 4) in `~/.cache/claude-seo/drift/baselines.db`, and `RUN/drift-compare-*.json`. Those are still valid because LIVE has not changed. `RUN/drift-raw/*.json` are live HTML fetches (not JSON) made by a different fetch method; their bytes differ from what `fetch_page.py` hashes, so I used them only for markup checks (`root-loading`, `lang`), never for hashes.

---

## 2. Baseline inventory (stored, confirmed read-only)

Source: SQLite `~/.cache/claude-seo/drift/baselines.db` (81,920 bytes after this run), read with `mode=ro`. Export: `RUN/drift-rerun/baselines-export-linkar.json`.

| id | URL | Captured (UTC) | Title | Canonical | H1 | H2 / H3 | JSON-LD | OG tags | PSI mobile (lab) |
|---|---|---|---|---|---|---|---|---|---|
| 2 | `https://linkar.in/` | 2026-10-15 06:09:24 | `Linkar · Instagram and Facebook automation` | `https://linkar.in` | Reply to every opportunity. Even when you are away. | 14 / 30 | Organization, SoftwareApplication (hash `2d4640cf1bdc...`) | 11 | perf 92, LCP 2.93 s, TBT 145 ms, CLS 0.002 |
| 3 | `https://linkar.in/pricing` | 2026-10-15 06:09:55 | `Pricing · Linkar` | `https://linkar.in/pricing` | Plans that grow with you. | 14 / 7 | none | 6 (no og:image) | perf 78, LCP 5.61 s, TBT 68 ms, CLS 0 |
| 4 | `https://linkar.in/` | 2026-10-15 06:11:05 | same as id 2 | same | same | same | same hash | 11 | perf 77, LCP 5.10 s, TBT 207 ms, CLS 0.001 |

Notes:
- `drift_compare.py` picks the **latest** baseline for a URL, so home compares now run against **id 4**, not id 2 as the audit's section 9 says. The on-page state is identical; only the stored PSI run differs (id 4 is a slow run).
- No other Linkar URL has a baseline (the other 10 live sitemap URLs, `/login` and `/signup` have none). See finding F3.
- Comparison history: ids 3 and 4 (06:10 UTC, earlier run), ids 5 and 6 (08:03 UTC, this run). `drift_history.py` output: `RUN/drift-rerun/history-home.json`, `history-pricing.json`.

---

## 3. Compare results now (LIVE)

Commands (output in `RUN/drift-rerun/compare-home.json` and `compare-pricing.json`):

```sh
source ~/.config/claude-seo/linkar/env.sh; export PYTHONWARNINGS=ignore
P=~/.claude/skills/seo/.venv/bin/python; S=~/.claude/skills/seo/scripts
$P $S/drift_compare.py https://linkar.in/
$P $S/drift_compare.py https://linkar.in/pricing
```

### Triggered rules

| URL | Rule | Severity | Old (baseline) | New (08:03 UTC) | Action |
|---|---|---|---|---|---|
| `/` | 11 `cwv_regressed` | WARNING | CLS 0.00112; LCP 5,101 ms; TBT 207 ms | CLS 0.00184; LCP 2,701 ms; TBT 221 ms | None. CLS is about 0 in both runs and LCP got 47% better. Single-run lab noise (section 4). |
| `/pricing` | 11 `cwv_regressed` | WARNING | TBT 68 ms; LCP 5,610 ms | TBT 109 ms; LCP 5,658 ms | None for drift. TBT is still well under 200 ms. LCP stays about 5.6 s (finding F7). |

### Untriggered rules (both URLs)

`schema_removed`, `canonical_changed`, `canonical_removed`, `noindex_added`, `h1_removed`, `h1_changed` (similarity 100%), `title_removed`, `status_code_error` (200 to 200), `title_changed`, `meta_description_changed`, `perf_score_dropped` (home 77 to 90, pricing 78 to 77), `og_tags_removed`, `schema_modified`, `schema_added`, `h2_structure_changed` (14 to 14), `content_hash_changed`.

**Cross-skill recommendations:** none needed. No CRITICAL fired, and the only WARNING is measurement noise.

**HTML reports** (made by `drift_report.py`, kept local): `RUN/drift-rerun/drift-report-home.html`, `RUN/drift-rerun/drift-report-pricing.html`.

---

## 4. Why the CWV rule is not usable for the deploy check

Evidence, all against byte-identical HTML:

| Compare | Rule 11 verdict | What really happened |
|---|---|---|
| id 3 (06:10 UTC, home vs baseline 2) | LCP +74% (2,927 to 5,101 ms), perf 92 to 77 | Nothing changed on the page |
| id 5 (08:03 UTC, home vs baseline 4) | CLS "+64%" (0.0011 to 0.0018; the message prints "0 -> 0") | LCP **improved** 5,101 to 2,701 ms; perf 77 to 90 |
| id 6 (08:03 UTC, pricing vs baseline 3) | TBT +60% (68 to 109 ms) | LCP flat at about 5.6 s |

Why: `rule_11_cwv_regressed` in `~/.claude/skills/seo/scripts/drift_compare.py` takes one Lighthouse **lab** run, compares LCP, CLS and TBT by relative change above 20%, and has no absolute floor. `references/comparison-rules.md` says it compares p75 field LCP, INP and CLS, but the script never reads field data, and CrUX has none for linkar.in yet. **INP is not assessed at all.** The audit already records home mobile LCP ranging 2.6 to 5.2 s across runs.

Also, home compares default to baseline 4, which stored a slow run (LCP 5.1 s). Any CWV verdict against it is biased toward "improved".

**Rule for this deploy:** run the compare with `--skip-cwv`, and measure performance separately with 3 to 5 PageSpeed runs per URL, using medians (section 6, step 5).

---

## 5. Forecast: what the compare will report after deploy (LOCAL build as it is now)

**Method.** `drift_baseline.py` and `drift_compare.py` refuse local URLs by design: `validate_url()` returns False for `http://localhost:3000/` and `http://127.0.0.1:3000/`, verified this run. So I did not bypass the SSRF guard. Instead, `RUN/drift-scripts/project_drift.py` loads baselines 4 and 3 read-only and feeds locally rendered HTML to the skill's own `parse_html()` and rule functions 1 to 10 and 13 to 17. It stores nothing.

**Inputs:**
- the production prerender: `.next/server/app/index.html` and `pricing.html`, built 13:07 IST. No file under `app/`, `src/`, `public/` or `next.config.ts` is newer than `.next/BUILD_ID`.
- the dev server: `GET /` and `GET /pricing`, both 200.

Both inputs give **identical** results for every rule. Output: `RUN/drift-rerun/projection.json`.

### Home `/` (against baseline 4): 0 CRITICAL, 3 WARNING, 2 INFO

| Rule | Severity | Baseline (LIVE now) | Expected after deploy | Intended? |
|---|---|---|---|---|
| 9 `title_changed` | WARNING | `Linkar · Instagram and Facebook automation` (42) | `Instagram Automation for Comments, DMs & Stories · Linkar` (57) | Yes (G1) |
| 10 `meta_description_changed` | WARNING | "Build Instagram conversation flows..." (131) | "Instagram automation for Indian creators and brands: auto-reply to comments, DMs and Story mentions, plus Facebook Page comments. Free, paid from ₹199 a month." (159) | Yes (G1) |
| 14 `schema_modified` | WARNING | 2 blocks: Organization, SoftwareApplication | 4 blocks: Organization (`#organization`, PostalAddress IN), WebSite (`#website`), SoftwareApplication (`#software`, 4 offers with `billingDuration` P1M), FAQPage | Yes (G1, G4) |
| 16 `h2_structure_changed` | INFO | 14 H2s | 10 H2s. Footer column labels (Product, Resources, Company, Legal) are now `<p>`, and 9 section H2s were reworded to carry "Instagram" | Yes |
| 17 `content_hash_changed` | INFO | `26af4c2638b4...` | new hash | Yes |

Expected **not** to fire:
- canonical stays `https://linkar.in`;
- no `noindex`;
- the H1 stays present. Its similarity is 0.709, above the 0.5 threshold, so `h1_changed` does not fire even though the kicker "Instagram automation for comments and DMs" is added;
- OG stays at 11 tags;
- status 200.

### `/pricing` (against baseline 3): 0 CRITICAL, 2 WARNING, 3 INFO

| Rule | Severity | Baseline (LIVE now) | Expected after deploy | Intended? |
|---|---|---|---|---|
| 9 `title_changed` | WARNING | `Pricing · Linkar` (16) | `Instagram automation pricing in India · Linkar` (46) | Yes (G1) |
| 10 `meta_description_changed` | WARNING | "Start free with Linkar, then grow..." (127) | "Compare Linkar plans for Instagram automation: Free, Creator ₹199, Growth ₹499 and Agency ₹999 a month. Every displayed price includes applicable GST." (150) | Yes (G1) |
| 15 `schema_added` | INFO | none | WebPage (`about` `#software`) and BreadcrumbList | Yes (G1) |
| 16 `h2_structure_changed` | INFO | 14 H2s | 10 H2s: "Find your plan" and "Every plan, side by side" replace the two Manychat-style headings, and the footer labels are gone | Yes (G4) |
| 17 `content_hash_changed` | INFO | `a27327352e39...` | new hash | Yes |

Expected **not** to fire:
- canonical `https://linkar.in/pricing`;
- H1 "Plans that grow with you." is unchanged. This is the known no-keyword warning in audit section 11; there is no new evidence;
- OG grows from 6 to 11 tags (og:image, type, width, height and alt are added). Additions are not tracked by any rule.

**Pass rule after deploy:** the triggered set must equal the tables above. Then:
- **any CRITICAL** means stop and investigate;
- **a missing expected WARNING** (for example `title_changed` does not fire) means the deploy did not land, or an old prerender is being served. LIVE sends `x-nextjs-cache: HIT` and `cf-cache-status: DYNAMIC` (`curl -sI`, 08:0x UTC), so Cloudflare's edge does not cache the HTML. A stale page would come from the app's own prerender cache.

---

## 6. How to compare after deploying (runbook)

**Before deploying (owner, about 2 minutes).** Capture baselines for the LIVE URLs that have none, so the deploy's sitewide changes can be checked on them too. The deploy changes `lang`, removes the root loading boundary and changes the footer on every page. I tried to run this myself; the permission system blocked the write to the shared baseline store, so it is left for the owner.

```sh
source ~/.config/claude-seo/linkar/env.sh; export PYTHONWARNINGS=ignore
P=~/.claude/skills/seo/.venv/bin/python; S=~/.claude/skills/seo/scripts
for p in support contact terms refund-policy privacy cookies acceptable-use \
         data-processing service-providers data-deletion login signup; do
  $P $S/drift_baseline.py "https://linkar.in/$p" --skip-cwv
done
```

Use the skill's virtualenv Python. The system `python3` (3.9.6) crashes on import with `TypeError: unsupported operand type(s) for |` at `drift_baseline.py:204` (finding F9).

**After deploying (within the hour):**

1. **On-page drift:**
   ```sh
   $P $S/drift_compare.py https://linkar.in/ --skip-cwv
   $P $S/drift_compare.py https://linkar.in/pricing --skip-cwv
   # repeat for each URL baselined before deploy
   ```
   Check the result against section 5. For the legal and help pages, expect `content_hash_changed` (INFO) and possibly `h2_structure_changed` (INFO) from the footer change. Any CRITICAL or WARNING there is unexpected.

2. **Manual checks the drift rules cannot see** (finding F5):
   - the home H1 starts with "Instagram automation for comments and DMs";
   - `/pricing` has `og:image` (rule 13 fires only if *every* OG tag disappears);
   - `<html lang="en-IN">`;
   - no `root-loading` in the home and pricing HTML. Live has 2 occurrences on each today; the local build has 0;
   - `/robots.txt` lists 4 `Sitemap:` lines;
   - `/llms.txt`, `/sitemap.xml`, `/features/sitemap.xml`, `/solutions/sitemap.xml` and `/templates/sitemap.xml` all return 200;
   - the `content-security-policy` on `/features/instagram-comment-to-dm` contains `https://www.googletagmanager.com`.

3. **Re-baseline the new state** once step 1 matches the forecast, so future compares measure against the deployed site:
   ```sh
   $P $S/drift_baseline.py https://linkar.in/
   $P $S/drift_baseline.py https://linkar.in/pricing
   ```

4. **Baseline the newly deployed catalogue.** This is only possible after deploy, because local URLs are refused. All of these return 200 locally today:
   ```sh
   for p in features solutions templates features/instagram-comment-to-dm \
            features/instagram-dm-automation features/instagram-story-mention-replies \
            features/instagram-follow-gate; do
     $P $S/drift_baseline.py "https://linkar.in/$p" --skip-cwv
   done
   ```

5. **Performance, separately:** run 3 to 5 mobile PageSpeed runs each for `/`, `/pricing`, `/features` and one fullbleed guide (`pagespeed_check.py`), and compare **medians** with the pre-deploy runs:
   - home LCP runs so far: 2.6, 2.7, 2.9, 3.5, 5.0, 5.1 and 5.2 s, median 3.5 s;
   - pricing LCP runs so far: 5.61, 5.73 and 5.66 s, plus 5.1 and 5.7 s from the audit.

   INP needs CrUX field data, which does not exist yet.

6. **Ongoing:** run `drift_compare.py ... --skip-cwv` after every deploy and weekly. Use `drift_history.py <url>` to see when something changed.

7. **Keep a copy of the baselines** outside `~/.cache`. Copy `RUN/drift-rerun/baselines-export-linkar.json` into `docs/seo/2026-10-15/data/` at the next repo-write step (finding F8).

---

## 7. Findings

| ID | Severity | Target | Status | Finding |
|---|---|---|---|---|
| F1 | Info | LIVE | open | No on-page drift on `/` or `/pricing`; HTML hashes identical to the baselines |
| F2 | Medium | Both | owner-action | Post-deploy compare must match the forecast: home 3 WARNING + 2 INFO, pricing 2 WARNING + 3 INFO, 0 CRITICAL; then re-baseline |
| F3 | Medium | LIVE | owner-action | Only 2 of 12 live sitemap URLs have a pre-deploy baseline, but the deploy changes every page |
| F4 | Low | LIVE | open | The CWV drift rules fire on single-run lab noise; INP is never assessed |
| F5 | Low | Both | open | The drift rules cannot see several of this deploy's changes; a manual checklist is needed |
| F6 | Info | LIVE | owner-action | Google's only homepage crawl (24 Sep) predates the live canonical tag (10 Oct) |
| F7 | Info | LIVE | open | Pricing mobile LCP holds at about 5.6 s across 3 runs; the 670 ms TBT does not reproduce (68 to 109 ms) |
| F8 | Low | LIVE | owner-action | Baselines exist only in a local cache file outside the repo |
| F9 | Info | LOCAL | open | System `python3` 3.9.6 cannot run the drift scripts; use the skill virtualenv |
| F10 | Info | LOCAL | already-fixed-locally | Drift-visible fixes are confirmed in the current local build (production prerender and dev server) |
| F11 | Info | LOCAL | open | The audit's notes on drift baselines name the wrong home baseline and omit pricing |

### F1. No on-page drift on LIVE (Info, LIVE, open)

- **Evidence:** compare ids 5 and 6 at 08:03 UTC against baselines 4 and 3. All 15 non-CWV rules are untriggered, and `content_hash_changed` is false: `26af4c2638b4...` and `a27327352e39...` match. `RUN/drift-rerun/compare-home.json`, `compare-pricing.json`.
- **Recommendation:** none. Keep baselines 3 and 4 as the pre-deploy reference until step 3 of the runbook.

### F2. Post-deploy compare must match the forecast (Medium, Both, owner-action)

- **Evidence:** section 5, from `RUN/drift-rerun/projection.json`. The production prerender and the dev server agree on every rule.
- **Recommendation:** after deploying, run the runbook. Accept only the listed triggers. Treat any CRITICAL as a regression (`/seo technical` for canonical, noindex or status; `/seo schema` for schema). Then re-baseline.

### F3. Most live URLs have no baseline (Medium, LIVE, owner-action)

- **Evidence:**
  - The DB holds Linkar baselines only for `/` and `/pricing`.
  - The live sitemap lists 12 URLs.
  - The deploy changes markup sitewide. `lang` goes from `en` to `en-IN` (`app/layout.tsx`, G1). The root loading boundary is removed: `root-loading` appears 2 times in the live home and pricing HTML and 0 times locally. The footer changes (G4).
  - My attempt to baseline these URLs was refused by the permission system as a write to a shared resource.
- **Recommendation:** run the "Before deploying" block in section 6, before the deploy.

### F4. CWV rules fire on lab noise (Low, LIVE, open)

- **Evidence:** section 4. Rule 11 flagged LCP +74%, then CLS +64%, then pricing TBT +60%, all on byte-identical HTML. Home LCP swung 2.93, then 5.10, then 2.70 s. `drift_compare.py` `rule_11_cwv_regressed` reads only `lab_metrics` and uses a relative 20% threshold with no absolute floor. INP is never evaluated, and the default home baseline (id 4) holds a slow run.
- **Recommendation:** use `--skip-cwv` for deploy checks. Judge performance on 3 to 5 PageSpeed runs per URL using medians, and INP on CrUX once field data exists.

### F5. Drift rules miss parts of this deploy (Low, Both, open)

- **Evidence:**
  - `rule_13_og_tags_removed` fires only when all OG tags vanish, so the current `/pricing` og:image gap (audit M5) never registered.
  - The home H1 kicker is the main on-page change, but it scores 0.709 similarity against a 0.5 threshold, so no rule fires.
  - `lang`, `robots.txt`, the sitemaps, `llms.txt`, response headers (CSP) and the loading skeleton are not tracked.
  - `parse_html.py` joins heading text with `get_text(strip=True)`, so the stored H1 reads "...DMsReply to every opportunity.Even..." and an H2 reads "Set up Instagramauto-repliesin three steps." The raw HTML does have the spaces (`<span>...DMs </span><span>Reply to every opportunity. </span>`). This is a parser artifact, not a site bug; do not change the site for it.
- **Recommendation:** use the manual checklist in section 6, step 2, after every deploy.

### F6. Google has not seen the current live homepage (Info, LIVE, owner-action)

- **Evidence:**
  - `docs/seo/2026-10-15/data/gsc-inspect-home.json` shows `last_crawl_time` 2026-09-24T22:41:17Z and `user_canonical` None.
  - The canonical tag, robots and sitemap arrived in commit `24e515c` on 2026-10-10. That commit is on `origin/main`, so it is live.
  - Baseline 2 (15 Oct) stores canonical `https://linkar.in`.
  - So "no user-declared canonical" in Search Console reflects a page older than the live one. It is not a missing tag.
- **Recommendation:** no code change. This adds weight to audit C1: after deploying, request indexing for `/` and `/pricing` and re-inspect; the user canonical should then appear.

### F7. Pricing LCP is stable at about 5.6 s; the high TBT does not reproduce (Info, LIVE, open)

- **Evidence:** three separate PageSpeed mobile runs today (baseline 3, compare 4, compare 6):
  - LCP 5.61, 5.73 and 5.66 s;
  - TBT 68, 81 and 109 ms;
  - performance 78, 78 and 77.

  The audit's deferred item cites TBT 670 ms from a single run. On home, this run's result (performance 90, LCP 2.70 s) makes seven runs, with a median LCP of 3.5 s (the audit's six runs gave about 4.3 s).
- **Recommendation:** treat pricing LCP as a real problem (audit M2; it is not noise). Re-measure pricing TBT over several runs before spending time on the deferred TBT profiling.

### F8. Baselines are not stored durably (Low, LIVE, owner-action)

- **Evidence:** the only copy is `~/.cache/claude-seo/drift/baselines.db` (81,920 bytes after this run). A cache purge or a different machine loses the pre-deploy reference, and the old HTML cannot be re-captured after deploy. Export written to `RUN/drift-rerun/baselines-export-linkar.json`: 3 baselines (ids 2, 3, 4) and 4 comparison summaries (ids 3 to 6, including this run's).
- **Recommendation:** copy the export into `docs/seo/2026-10-15/data/drift-baselines.json` at the next repo-write step, before the deploy.

### F9. System Python cannot run the drift scripts (Info, LOCAL, open)

- **Evidence:** `/usr/bin/python3` is 3.9.6 and fails with `TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'` at `drift_baseline.py:204` (`dict | None` needs Python 3.10 or later). `~/.claude/skills/seo/.venv/bin/python` (3.12.13) works.
- **Recommendation:** always call the scripts with the virtualenv Python, as in the runbook.

### F10. Drift-visible fixes are confirmed in the local build (Info, LOCAL, already-fixed-locally)

- **Evidence** (production prerender, matching the dev server):
  - Home: new title and description; H1 kicker; 4 JSON-LD blocks, including SoftwareApplication `@id` `https://linkar.in/#software` with `billingDuration` P1M on all 4 offers and Organization `PostalAddress` IN.
  - `/pricing`: new title and description; 11 OG tags including `og:image` `https://linkar.in/opengraph-image` (fixes audit M5); WebPage `about` `#software` plus BreadcrumbList.
  - Both pages: `lang="en-IN"` (L1) and 0 `root-loading`.
- **Recommendation:** none until deploy. Then confirm with the runbook.

### F11. Audit notes on drift baselines need a small correction (Info, LOCAL, open)

- **Evidence:** `docs/seo/audit-2026-10-15.md`:
  - Line 568 names home "baseline 2, 06:09 UTC", but `drift_compare.py` defaults to the latest baseline, id 4 (06:11:05 UTC).
  - The pricing baseline (id 3) is not mentioned there.
  - Section 7, step 13 (line 522) says to compare only the homepage, with CWV.
- **Recommendation:** when the doc is next edited:
  - name both baselines (home 4, which matches 2; pricing 3);
  - say to use `--skip-cwv` with the virtualenv Python;
  - point to this runbook.

---

## 8. Evidence files

All under `RUN/`:

- `drift-rerun/compare-home.json`, `drift-rerun/compare-pricing.json`: today's compares (ids 5 and 6)
- `drift-rerun/history-home.json`, `drift-rerun/history-pricing.json`: `drift_history.py` output
- `drift-rerun/projection.json`: the post-deploy forecast; script at `drift-scripts/project_drift.py`
- `drift-rerun/local-prod-home.html`, `local-prod-pricing.html`: copies of the production prerender, 13:07 IST
- `drift-rerun/local-dev-home.html`, `local-dev-pricing.html`: dev server HTML, 08:04 UTC
- `drift-rerun/baselines-export-linkar.json`: export of the stored baselines
- `drift-rerun/drift-report-home.html`, `drift-report-pricing.html`: HTML reports from `drift_report.py`
- From the earlier run: `drift-baseline-home.json`, `drift-baseline-home-2.json`, `drift-baseline-pricing.json`, `drift-compare-home.json`, `drift-compare-pricing.json`

Nothing in the repo or in any account was changed. The only writes were comparison rows 5 and 6 in the skill's local drift database, which `drift_compare.py` records by design, plus files in the run folder.
