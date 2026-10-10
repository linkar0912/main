# Linkar full audit - 2026-10-10

Read-only audit of the whole repository by 7 parallel reviewers (admin, API security, backend/worker/DB, app UI/UX, marketing/auth/legal, API↔client contract, config/deploy/CI), plus the automated gates. Nothing was edited, no dev server was started, and the remote database was never touched.

**Legend:** ✅ = re-verified by reading the code after the reviewer reported it. Everything else was traced to code by the reviewer but not independently re-checked. File references are `path:line` at commit `ff22ee0`.

## Automated gates

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ pass |
| `pnpm lint` | ✅ pass |
| `pnpm check:copy` / `check:branding` | ✅ pass |
| `pnpm test` (vitest) | ✅ 304 files, 1644 tests pass |
| Secrets in git (tree + history) | ✅ none |

The tooling is green; every finding below is a logic, UX, security, or ops issue the tests do not cover. A recurring root cause: **route tests run against `memory-repository.ts`, which diverges from `prisma.ts`** (slug uniqueness, P2002 mapping, version semantics, sequence ordering), so several production-only bugs pass CI.

---

## P0 - fix first (broken core flows, money, security)

| # | Area | Issue | Where |
|---|---|---|---|
| 1 | Backend | **Instagram comment timestamps likely in seconds, treated as ms** → every comment looks like 1970 → classic private replies fail as `private_reply_window_expired`, campaign participants expire, scheduled flows skip. Confirm against one real Meta payload; FB normalizer already converts. ✅ code path | `src/lib/meta/webhooks.ts:88,120` → `runner.ts:225,1245` |
| 2 | Builder | **Classic builder can't save new Instagram automations**: `/automations/new` never passes an IG account, the picker is hidden for single-account workspaces (and defaults to `""` otherwise), server requires a pin → 400. ✅ | `app/(app)/automations/new/page.tsx:41-47`, `automation-builder/channel-selector.tsx:37-41`, `lib/automation/channel-target.ts:29` |
| 3 | Builder | **Classic builder creates duplicates on every save after the first** (never stores the new id; no caller passes `onSaved`). Hits Facebook automations today. ✅ | `src/components/automation-builder.tsx:709-717` |
| 4 | Security | **Tracked-link slug hijack across tenants**: slug unique per workspace, public `/r/[slug]` and DELETE look up globally → attacker pre-registers `sale` and receives other customers' traffic; victim can't delete. ✅ | `prisma/schema.prisma:588`, `src/lib/prisma.ts:3205`, `app/r/[slug]/route.ts:73`, `app/api/links/[slug]/route.ts:20` |
| 5 | Billing | **Second checkout double-bills**; webhook upserts by workspace so two subscriptions overwrite each other, a late cancel of the old sub downgrades a paying workspace. | `src/lib/billing/service.ts:135-171`, `billing/webhook.ts:188-238` |
| 6 | Billing | **Cancelled/paused/halted subs with future `current_end` keep the paid plan forever** - nothing re-evaluates at period end. | `src/lib/billing/webhook.ts:138-148` |
| 7 | Billing | Same-second Razorpay events tie-broken by random event id → `activated`/`charged` can be dropped as stale; customer pays, no plan. | `src/lib/billing/webhook.ts:159-163` |
| 8 | Delivery | **Meta throttling (HTTP 400, codes 4/17/32/613) classified as permanent** → DMs lost under load. `MetaApiError.retryable` already knows these codes. | `src/lib/automation/outbound-delivery.ts:57-70` |
| 9 | Delivery | **Quiet hours / hourly rate cap handled by throwing 429 into tiny BullMQ retry budgets** (1s–60s) → follow-ups/campaign DMs silently dropped; broadcasts stuck RUNNING. Re-enqueue with a delay instead. | `followup-runner.ts:111`, `broadcast-runner.ts:112`, `runner.ts:230`, `campaign-runner.ts` |
| 10 | Delivery | Broadcasts (≤500 recipients) share the realtime DM bucket (250/h) → recipient #251+ fail and all realtime automations on that account are blocked for the hour. | `app/api/broadcasts/route.ts:14`, `send-rate-limiter.ts` |
| 11 | Delivery | **Facebook public replies can double-post** on timeout (no outbound ledger, status-0 treated as retryable). | `src/lib/facebook/runner.ts:306,326` |
| 12 | Delivery | Lead-fulfilment email marked SENT even when `sendEmail` returns `delivered:false`. | `src/lib/automation/lead-delivery.ts:99` |
| 13 | Sequences | **"Add step" makes sequences unsaveable**: default 24h / `max=2160` vs server cap 23h. ✅ | `src/components/sequences-screen.tsx:123,313`, `lib/automation/sequence.ts:14` |
| 14 | Builder | DM-keyword / story-reply triggers hide the action-type select → can only send plain text (no link/button/image). | `src/components/automation-builder.tsx:984,1101` |
| 15 | Ops | **`pnpm test:e2e` migrates and creates users on whatever DB `.env.local` points to - currently the real remote Supabase.** No cleanup. | `e2e/auth.setup.ts:7-15,53-60` |
| 16 | Ops | Push to `main` deploys to prod with no CI gate, no `next build` in PR CI, no migration step/check; `cancel-in-progress: true` can kill a deploy mid-SSH (web/worker on different commits). | `.github/workflows/container.yml:8-10,32-34`, `ci.yml` |
| 17 | Admin | **Admin reason sent as HTTP header** → any curly apostrophe (iOS default), `₹`, em-dash or Hindi makes `fetch` throw → every audited command fails with "Operation failed". ✅ | `src/components/admin/shared/admin-request.ts:32` |
| 18 | Legal | Pricing page sells **Messenger**, which doesn't exist (support page says so). Terms lack refund/cancellation, legal entity, address, governing law - Razorpay KYC / Consumer Protection (E-Commerce) Rules risk. | `marketing/pricing-page.tsx:50,359`, `app/terms/page.tsx` |

## P1 - high impact

### Security
- **Password change without current password or recovery proof** - any session can hit reset-password; enables permanent takeover from a stolen session. `app/api/auth/reset-password/route.ts:16-20` (flagged by 2 reviewers)
- **No role checks outside billing/team** - MEMBER can disconnect integrations, delete/activate automations, broadcast to everyone, export all contacts. Add `requireRole`.
- **Blind SSRF** in `/r/[slug]` conversion callback: `fetch` follows redirects after first-hop validation + DNS-rebinding window. Use `redirect: "manual"` + pinned IP. `app/r/[slug]/route.ts:105-111` (2 reviewers)
- **Login CSRF / session fixation**: login POST has no Origin check; `/auth/confirm` verifies any `token_hash` on GET. `app/api/auth/login/route.ts`, `app/auth/confirm/route.ts:20-25`
- **Lockout DoS**: `.env.production.example` ships `TRUSTED_PROXY_HOPS=0` behind Cloudflare+Traefik → all clients share one bucket; limiter is per-email and non-atomic GET-then-INCR. Verify the live value. (2 reviewers)
- **Admin takedowns not enforced**: public link lookup ignores `disabledAt` and workspace status. `src/lib/prisma.ts:3206`
- **Meta data-deletion incomplete** vs the published policy (FB path leaves WebhookEvents/queued jobs; IG follow-up jobs keyed `instagramAccountId` survive deletion and re-insert ledger rows). `src/lib/prisma.ts:1248-1290,1463-1475`, `src/lib/queue.ts:263-283`
- **Supabase auth cookies not HttpOnly and scoped to `.linkar.in`**, with `script-src 'unsafe-inline'` - XSS on marketing/app reads the owner's AAL2 refresh token. (2 reviewers)
- Workspace **export in admin is unaudited, unbounded GET** of all contact/member emails. `app/api/admin/workspaces/[workspaceId]/export/route.ts`
- Plan limit bypass via **Duplicate automation** (no `assertEntitled`). `app/api/automations/[id]/duplicate/route.ts:30` (2 reviewers)

### Backend correctness
- Classic claims set `PROCESSING` with no lease/reaper → worker crash = execution stuck forever, remaining actions never run. `src/lib/prisma.ts:1536`
- First-contact welcome lost on retry (`touchContact().created` false on attempt 2). `runner.ts:1015`
- `replyOncePerUser` is a no-op for classic IG comment flows (counts v2-only participant rows). `runner.ts:1153`
- Unknown Razorpay `plan_id` → 400 → Razorpay retries forever / disables endpoint. `billing/webhook.ts:110`
- Any 4xx on token refresh marks connection EXPIRED; null `tokenExpiresAt` is never refreshed. `meta/token-refresh.ts:37`, `meta/oauth/callback/route.ts:63`
- Per-sender race on field capture (concurrency 15, read-modify-write) → duplicate questions, lost answers. `worker.ts:173`
- Web-process BullMQ producers use `maxRetriesPerRequest: null` → Redis outage hangs webhook requests. `src/lib/queue.ts:118`
- Premium invite redemption replaces a paid plan (Agency subscriber downgraded to Creator). `entitlements/repository.ts:50`
- Migrations hold ACCESS EXCLUSIVE through VALIDATE / run unbatched full-table UPDATEs. `prisma/migrations/20260930140000_*`, `20260930120000_*`

### API ↔ UI contract
- Server-side module cache in `useAutomations` can render **tenant A's automations into tenant B's SSR HTML** when `initialData` is undefined. `src/components/automation-list.tsx:37-64` - guard with `typeof window`.
- `Automation.version` used as definition version, restore counter, and admin lock counter simultaneously → automations vanish from Sequences picker; admin stale-check ABA.
- Inbox: duplicate bubble after manual reply (POST returns Meta mid, GET uses delivery id); `sort=unread` pagination skips conversations; message pages duplicate on same-ms ties.
- Duplicate slug → 500 in prod (P2002 not mapped; only memory repo throws "already used").
- Version restore ignores provider and skips pin/definition validation; status-only PATCH can activate an unpinned automation that never fires.
- Broadcast "all contacts" = 500 newest-created contacts, ignoring the 24h window, cap not disclosed.
- Handoff POST wipes assignee/notes when omitted; activity retry ignores failed transition (double processing).

### Admin console
- **Permanent deletion of a live workspace effectively impossible** - digest hashes live counts, retry re-validates against frozen digest.
- **Ban / Restore / Unban state confusion** - Restore never lifts the Supabase ban; UI says "can sign in".
- Failed integration disconnect strands connection as EXPIRED (state changed before Meta call).
- Retired-plan workspaces can't have entitlements edited; `free` plan can be retired.
- Queue command errors bypass mapping (`return` without `await`) → all 500. ✅ `src/lib/admin/system/commands.ts:5`
- No way to add a backup MFA factor → lost phone = lockout.
- Users page pages through the **entire** Supabase user base on every view.

### App UI/UX
- No `error.tsx` anywhere; `dashboard/page.tsx:22` has no `.catch` → bare "Application error".
- One-click Disconnect for Instagram/Facebook; no confirm on plan change, Revoke, Sign out all.
- Contact drawer: no close button while loading/after error (full-screen on mobile = stuck); failed load spins forever.
- Media picker: failed "Load more" wipes the grid and selections.
- Facebook channel with no Page connected only errors at the final step; template picker dead-ends.
- Classic builder asks users to paste raw Instagram media IDs.
- No unsaved-changes guard on the 6-step builder.
- Stale plan/avatar in sidebar after billing/connection changes (bootstrap cache not invalidated). (2 reviewers)
- Dark-mode `--danger` ≈ 2.6:1 contrast on every error.

### Public / auth
- Unconfirmed-email login shows "wrong password"; no logged-out resend; `?verify=invalid` never displayed.
- "Account without workspace" path redirects without signing out.
- `invite`/`next` dropped across error redirects and OAuth → retry silently creates a separate workspace.
- No Terms/Privacy consent on signup; GA4 loads without consent; privacy policy omits login, billing, click data, Resend, DPDP rights; service-providers page omits Resend.
- Proof-rail "testimonials" (named people, cities, portraits) - label as illustrative if not real customers.
- GA likely missing on `/` and `/pricing` (static prerender reads empty measurement ID at build).
- Footer "Help" → `/help` is auth-gated for visitors.
- `/contacts`, `/insights`, `/quick-automation` missing from proxy protected + app-host lists. ✅ `src/lib/site-routing.ts:7-29`

### Ops
- Production env validation accepts `replace-with-…` placeholders and short secrets; production can silently boot in demo mode with `/api/health` = ok.
- Health monitor doesn't see the worker; alerting is only a failed GitHub run.
- `ops/DOKPLOY_DEPLOYMENT.md:173-261` duplicates sections and references a nonexistent migration file.
- Release script lives only on the host, not in git.

---

## P2 - medium / low (condensed)

**Security:** logout-all & reset don't set `sessionInvalidBefore` (JWT valid ≤1h); CSRF relies on SameSite only; signup provisions workspace + consumes invite before email confirmation; deauthorize callbacks replayable; FB avatar `profileId` unvalidated; outbound URL blocklist gaps (NAT64, `::a.b.c.d`, 198.18/15, 6to4); raw Prisma/provider errors returned to clients; `/api/health` unauthenticated DB+Redis probe; click IP from spoofable XFF + committed salt; CSV formula guard misses `\t`/`\r`; verify tokens default `change-me`; no body size cap on webhooks; no captcha on auth (shared Supabase per-IP buckets).

**Backend:** worker shutdown doesn't await sweeps / disconnect Prisma; unbatched hourly deletes without indexes; O(N²) broadcast counter reconciliation; `BillingWebhookEvent.payloadHash` unindexed in Serializable tx with no P2034 retry; `touchContact` can move `lastSeenAt` backwards; captured emails stored in `execution.reason` and logged; daily send limit resets at UTC midnight; one sequence failure cancels all the contact's sequences; memory-repo `listDueSequenceSends` drift; broadcast monthly limit check-then-create, `broadcastsCreated` never incremented; lost-claim path lets another automation attempt a second private reply.

**API:** inbox reply status OPEN client-only; quota rejection → 502; `enrich=1` throw → empty 500; raw Zod errors in broadcasts; users can't cancel broadcasts; insights totals ignore `automationId`; keyword suggestions ignore V2; invite mailer failure → 500 after row created; invite-code malformed JSON → 500; Serializable automation save with no retry; contacts `sourceAutomationId` unchecked; stage pagination offset drift; unused `/api/insights/funnels` and version GET endpoints; plan usage card hardcodes `monthlyLimit: null` (2 reviewers).

**Admin:** no prior-state in audit rows; unaudited deletion previews and failed challenge attempts; drawer offers actions invalid for the record's state; messages render far from the action; membership APIs guard differently; non-UUID ids throw 500; deletion wizard says "UUID" but ids are `workspace_<uuid>`; premium invite revoke 500 on unknown id, no expiry shown; deletion table doesn't poll, no aria-labels; no backward pagination; dialogs unscrollable on mobile with keyboard; Instagram contacts unsearchable in Operations; two deletion jobs possible for one target; docs describe failed-job retry UI that doesn't exist.

**App UI:** focus traps / focus return missing in template picker and versions modal; `useSearchParams` without Suspense on settings/profile; no `<main>` landmark or skip link; inbox `aria-live` re-announces whole thread; Facebook activity shows raw Page IDs; versions restore error replaces list; plan usage card contradicts billing; misc copy (DATABASE_URL jargon, "Quick Automation" tag, raw RUNNING/PENDING, raw ISO date, wrong CSV export location, "Comment replies" label for all triggers); quiet-hours label/timezone UX; invite success reported as failure if refresh throws; profile shows only first connection; `button:disabled { cursor: wait }`; demo-banner link contrast; inbox drawer edits don't update list; `<a href="/settings">` full reload; account-menu/tablist ARIA patterns incomplete; inconsistent date locales; builder lists expired Pages; unknown automation id renders activity header; reminder datetime PATCHes per keystroke.

**Public:** no `robots.ts`, `sitemap.ts`, `metadataBase`, OG/Twitter images, JSON-LD; legal/auth pages share root title; auth pages indexable; hero CTA ≈3.2:1 contrast; header mega-menu tab order & close behavior; marquee unpausable for touch/keyboard; pricing FAQ hidden content still reachable; no pending state on auth forms; signed-in users see login form; OAuth cancel = "Something went wrong"; plan CTAs drop chosen plan; "From ₹199/mo"; Agency "Priority capacity" not implemented; pricing is static catalog vs editable DB plans (drift risk); pricing/story pages fully client-side; permanent `will-change`; fake "EN" language chip; inconsistent title separators and mock domains; `aria-describedby` missing on password rules; empty `app/__visual-system`, `app/visual-system-qa`, unused `icon-transparent.png`.

**Ops/config:** emails logged in plaintext, logger lets context override `level`/`message`; README demo steps don't work without Supabase; env example comments wrong (EMAIL_API_KEY, AUTH_SESSION_SECRET purpose, Resend/SES); env drift (`DIRECT_URL`, Redis password, dangling comments, `VISUAL_REVIEW`, unused `SUPABASE_*_URL` in `.env.local`); repo check scripts not in CI; Playwright traces never recorded, runs against `next dev`, reuses server in CI; Dockerfile no HEALTHCHECK, unpinned base, `tsx` in prod deps, no standalone output, no-op test delete; actions on mutable tags, no `permissions:`, no Dependabot; `X-Powered-By` header, HSTS preload on subdomain, no COOP; `NEXT_PUBLIC_` Supabase vars read server-side only; missing `migration_lock.toml`; stale `supabase/config.toml`; stale doc path in performance runbook; `next-env.d.ts` tracked; leftover `.worktrees`, stale branches, stash.

---

## Verified as sound
- No non-admin path into admin APIs/pages (owner UUID allowlist + AAL2 + Origin + reason + idempotency).
- Every non-public API route validates session and scopes by `workspaceId` - no IDOR found.
- Meta/Facebook/Razorpay webhook HMACs over raw body with `timingSafeEqual`; Razorpay payload-hash idempotency.
- OAuth state HMAC-signed, expiring, cookie-bound; Google nonce checked; `safeNextPath` on redirects.
- Tokens AES-256-GCM sealed; RLS on all tables with anon/authenticated grants revoked.
- No secrets or build artifacts in git; Node 24 consistent; Docker runs non-root.
- All in-app `href`s and marketing anchors resolve; reduced-motion handled.

## Suggested order of work
1. Confirm P0-1 (IG timestamp units) with a captured payload - if real, it's the single largest production impact.
2. Builder P0-2/3/14 + sequences P0-13 (core creation flows).
3. Slug hijack + public lookup filters (P0-4, takedowns).
4. Billing state machine (P0-5/6/7, unknown plan_id).
5. Delivery retry/delay semantics (P0-8 to 12).
6. Stop e2e from touching the remote DB; gate deploys on CI + migrations.
7. Role checks, reset-password proof, HttpOnly cookies, SSRF.
8. Legal pages + Messenger claim before the next Razorpay/Meta review.
