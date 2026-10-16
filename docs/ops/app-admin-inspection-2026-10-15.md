# App and owner console inspection after the 15 October outage

Date: 15 to 16 October 2026. Code inspected at commit `e1d9184` (main, the release live during the inspection). No repo code was changed for this report.

Scope:

- app.linkar.in (the signed-in app);
- admin.linkar.in (the owner console);
- the shared web container (Next.js 16 behind a Cloudflare Tunnel on Dokploy);
- the singleton worker.

The marketing host was only looked at where it shares the web container (the image optimizer, redirects).

How to read this report:

- Every finding below was confirmed by independent adversarial verifiers (3 of 3, or 2 of 3 where noted). They tried to refute each claim, and their corrections are folded in here: several severities were lowered and some impact claims were narrowed.
- Finding IDs (for example `db-queries-1`) point to the raw inspector output. Several inspectors found the same issue from different angles; those IDs are merged into one entry.
- "Group N" means the issue is in fix group N (section 7). "Account-restriction branch" means the fix needs files that branch `ban-risk-fixes` is editing right now, so it is left to that work (section 6).

---

## 1. Summary

**What happened.** On 15 October the onboarding screen got repeated 502s on `/api/onboarding` (about 18 requests). Cloudflare then showed Error 1033 (origin unreachable). The root cause was CPU starvation: AVIF encoding in the image optimizer took about 30 s of CPU per 1920 px image, and crawlers asked for many uncached sizes. That is fixed in `e1d9184` (WebP only). A separate console error came from the app prefetching `https://admin.linkar.in/admin`, which the CSP `connect-src` blocked. That link now has `prefetch={false}`.

**What we found.** 126 confirmed findings: 3 high, 40 medium and 83 low. After merging duplicates, that is 2 distinct high issues and 28 distinct medium issues. The ones that matter most for uptime:

1. **Any workspace can freeze the worker for every tenant (high).** A regex keyword such as `(a|a)+$` gets past the only safety check. Matching it against a 40-character comment never finishes on the worker's single event loop. All replies, follow-ups, broadcasts and sweeps stop, and the stalled job is redelivered after each restart.
2. **The container healthcheck turns a dependency blip into a full outage.** Liveness depends on a database `SELECT 1` through the shared pool and a Redis PING, within a 4 s budget. The probe already takes 1 to 2.4 s at idle. Three failed probes get the only web replica replaced, taking linkar.in, app. and admin. down together. This very likely turned today's 502s into the 1033.
3. **The image optimizer is still an unbounded CPU sink.**
   - Cloudflare never caches `/_next/image` (`cf-cache-status: DYNAMIC`).
   - Every deploy wipes the origin's image cache.
   - Each image can be requested at 15 widths in 2 formats.
   - Because no `localPatterns` are set, the optimizer will also run arbitrary internal routes, such as `/_next/image?url=/api/health`.
4. **Routine user actions can drain the 20-connection web database pool.** Each statement from the web container costs about 0.9 s, because it goes through the pgbouncer transaction pooler from Germany to Singapore.
   - Opening Contacts starts a reconciliation of up to about 4,000 statements, holding 10 connections for minutes. It also silently reopens closed inbox conversations.
   - Creating a broadcast starts about 500 inserts at once.
   - The insights view runs 11 to 18 queries at once.
5. **Supabase Auth and Redis calls have no timeouts.** And the proxy treats a database error as "signed out", so a database incident looks like a mass logout.
6. **The Meta and Facebook data-deletion callbacks fail at today's data size (high, compliance).** They run inside a single transaction with Prisma's default 5 s timeout and roll back.
7. **Owner console problems:**
   - Signing out and then signing back in at `admin.linkar.in/login` is silently blocked by CSP `form-action`.
   - A backup authenticator can never be used.
   - Contact export always fails.

**The ~18 onboarding requests.** Nothing in the onboarding code retries on its own. The likely explanation, inferred from code because there is no HAR file or server log, is a bounce loop. When `/api/onboarding` fails, "Go to Home" and "Skip" both navigate to `/dashboard`. If the bootstrap call still answers, the app shell sends the person straight back to `/onboarding`, and the dashboard fires 6 API calls on the way. One press costs about 9 requests, including 2 dynamic server renders. The first load plus two presses comes to about 19.

**Plan.** Section 7 sets out 6 fix groups with disjoint files, ordered by impact on uptime. Nine medium issues need files the account-restriction branch is editing, so they are left to it (section 6). A few need an owner decision or an infrastructure change (sections 8 and 10).

---

## 2. High severity

### H1. A tenant regex keyword freezes the singleton worker for every workspace

IDs: `server-cpu-memory-1`, `worker-background-2` (both 3/3).

**How it gets in.**

- Any workspace owner can choose "Advanced pattern (regex)" (`src/components/automation-builder/trigger-section.tsx:24`).
- The schema accepts mode `regex` on comment, message and story-reply triggers, with no plan gating (`src/lib/automation/definition.ts:46, 60, 71`).
- Nothing checks the pattern at save time.

**The only guard.** `safeRegex` (`src/lib/automation/match.ts:17-26`) rejects `(x+)+` but not alternation (`(a|a)+$`), nested groups (`((a+))+$`) or brace quantifiers (`(a+){2,}$`, `(.*a){12}$`). The real `validateFlowDefinition` accepted these patterns. `new RegExp(keyword, "i").test(text)` then runs synchronously on the raw comment or DM text (`match.ts:75-77, 105-107`), and again through `findMatchedKeyword` (`engine.ts:25`).

**Measured on Node 24:**

- `(a|a)+$` took 1.2 s on 24 characters and about 30 s on 26.
- `(a|a)*$` took 13 s on 27 characters.
- The time doubles with each extra character, and an Instagram comment can be 2,200 characters.

**What happens next.** BullMQ lock renewal, the heartbeat and the worker `/health` server share that event loop. The job stalls, the healthcheck fails and Swarm restarts the worker. The worker picks the same job up again, so it crash-loops, and every new matching comment is a fresh poison job.

**Impact.** One free account sets the pattern and comments on its own post, or simply has another account comment. Every tenant's replies, follow-ups, broadcasts and sequences stop until someone finds and pauses the automation.

**Fix:** Group 1.

### H2. The Meta and Facebook data-deletion callbacks roll back under Prisma's 5 s transaction default

ID: `db-queries-5` (3/3).

**Evidence.**

- `beginInstagramDataDeletion` (`src/lib/prisma.ts:1486-1553`) runs about 10 to 20 sequential statements in one interactive transaction. It has no timeout option, and the client sets no `transactionOptions`, so the defaults apply: 2 s maxWait and 5 s timeout.
- `automationContact.deleteMany({ instagramAccountId })` and `outboundDelivery.deleteMany({ instagramAccountId })` have no supporting index; both tables are indexed by workspaceId first.
- `beginFacebookDataDeletion` (`prisma.ts:1725-1753`) filters `WebhookEvent` by a JSON payload path inside its transaction.
- Both are called synchronously from `app/api/meta/data-deletion/route.ts:43` and `app/api/facebook/data-deletion/route.ts:51`.

**Reproduced.** The real repository method ran against a scratch Postgres 17 behind a 165 ms round-trip proxy, with `pgbouncer=true&connection_limit=20`, the web app's setting. For the last Instagram connection in a workspace with 500 rows of each kind, it failed with P2028 after 5,062 ms, and again on a repeat. The cause is round trips (about 335 ms per statement), not table size.

**Impact.**

- The callback returns 500, and Meta retries.
- Each retry repeats the work while holding row locks the worker also needs.
- The deletion never completes, which is a compliance failure on an endpoint Meta requires.

**Fix:** Group 3 adds an explicit transaction timeout and the two missing indexes. Moving the purge to an async worker job is an owner decision (section 8).

---

## 3. Medium severity

### A. Things that can take the whole origin down

#### M1. The container healthcheck ties liveness to the database and Redis through the shared pool

IDs: `external-calls-5`, `db-queries-4`, `error-handling-1`, `worker-background-1`, `production-probe-3`.

**Evidence.**

- The verdict depends on both dependencies:
  - `isWebServing` (`src/lib/health.ts:215-217`) needs database and Redis both "ok".
  - `app/api/health/route.ts:10-11` maps anything else to 503.
- The probe is strict:
  - `scripts/container-healthcheck.mjs:14` aborts after 4 s.
  - `Dockerfile:84-85` runs it every 30 s, with 3 retries.
- The probes have no deadline of their own:
  - `checkDatabase` is a bare `SELECT 1` through the same Prisma pool as user traffic, with a 10 s default `pool_timeout`.
  - The health Redis client has no `commandTimeout`.
- In production, `/api/health` took 1.0 to 2.4 s at idle, against 0.18 s for routes that do no I/O. That is less than 2x headroom.
- Dokploy's own service healthcheck also reads `dependencies.database` and `dependencies.redis` from the public body (commit `9e0c08e`).
- There is one web replica (`ops/DOKPLOY_DEPLOYMENT.md:9`).
- The worker's `/health` has the same coupling (`src/lib/worker-health.ts:88-92`).

**Impact.** Any of these for about 90 s makes three probes fail:

- a Valkey restart;
- a Supabase pooler blip;
- pool saturation (M5 to M8);
- CPU starvation like today's.

Swarm then replaces the only web task, and all three hosts go dark (Cloudflare 502, then 1033). A replacement never turns healthy while the dependency is still down, so it restart-loops, and each restart discards the image cache. Marketing pages and the login form need neither Redis nor the database.

**Fix:** Group 2 (a liveness route and bounded probes). The owner then points the Dokploy service healthcheck at it (section 9).

#### M2. The image optimizer is still a CPU sink

ID: `production-probe-1` (plus `server-cpu-memory-2`, low).

**Evidence.**

- Production GETs of `/_next/image?...&w=640&q=75` returned `cf-cache-status: DYNAMIC` with `x-nextjs-cache: MISS`, then `HIT`, although the origin marks them `public, max-age=2678400`. Static `.webp` files are edge-cached.
- `next.config.ts` sets only `minimumCacheTTL`. So:
  - all 15 default widths (32 to 3840) apply, although no source is wider than 1536 px;
  - a client whose Accept header lacks `image/webp` (most crawlers) gets a separate JPEG encode.
- The cache lives in `/app/.next/cache/images` with no volume. Main deployed 20 to 40 times a day on 10 to 13 October, and every deploy starts cold.
- `src/components/marketing/proof-rail.tsx:75` sets `sizes="68px"`, which emits 15 srcset candidates (up to 3840) for a 68 px avatar.
- sharp runs on the 4-thread libuv pool, which DNS and file reads share.

**Impact.** About 71 images x 15 widths x 2 formats is roughly 2,100 encodes per deploy. Cloudflare absorbs none of them. It is the same mechanism as today's outage, only cheaper per image.

**Fix:** Group 2 for the config, plus Cloudflare rules and a cache volume (section 9).

#### M3. The image optimizer runs any internal route, which bypasses the click limiter on `/r/[slug]`

ID: `server-cpu-memory-5`.

**Evidence.**

- With no `images.localPatterns`, every local path is accepted, and the internal request carries no headers.
- A production GET of `https://app.linkar.in/_next/image?url=%2Fapi%2Fhealth&w=32&q=75` returned 400 "The requested resource isn't a valid image", meaning the route ran. Cloudflare reported DYNAMIC.
- In `/r/[slug]`, the missing client IP makes `ipHash` "anon". `app/r/[slug]/route.ts:114` then skips the per-visitor limiter, so every request records a click and fires the tenant's conversion POST.

**Impact.** Anyone, signed out, can do the following, uncached at Cloudflare:

- inflate a workspace's link stats;
- flood a customer's conversion endpoint;
- render other GET routes through the optimizer.

**Fix:** Group 2.

#### M4. The proxy buffers up to 10 MB of every API request body before any route-level cap runs

ID: `external-calls-6` (plus `server-cpu-memory-4`, low).

**Evidence.**

- The proxy matcher includes `/api/:path*`. Next therefore clones and buffers every API request body up to the default `proxyClientMaxBodySize` of 10 MB (`next/dist/server/body-streams.js:30`).
- It waits for the whole upload before the handler runs. So the 1 MB `readBoundedBytes` cap on the Meta callbacks only runs afterwards.
- Locally:
  - a 12 MB POST to `/api/meta/webhook` spent 0.9 s inside Next before any app code ran;
  - eight unfinished 9.5 MB uploads grew dev RSS by about 360 MB.
- The Razorpay webhook reads `arrayBuffer()` with no cap.
- Admin handlers parse JSON before authenticating.

**Impact.** Unauthenticated callers can make the single web process hold 10 to 20 MB per open request.

**Fix:** Group 2 (a 1 MB cap in `next.config.ts`, which covers the Razorpay route too).

### B. Database pool pressure and data correctness

#### M5. Opening Contacts runs a minutes-long, 10-connection reconciliation that also reopens closed conversations

IDs: `db-queries-1`, `dev-preview-runtime-1`, `external-calls-10`, `db-queries-14` (plus `client-network-6`, low).

**Evidence.**

- **The trigger.** `src/components/contacts-screen.tsx:337-358` POSTs `/api/contacts` after the list loads.
  - The only throttle is a module variable. It resets on every reload and in every new tab.
  - The POST is sent even when the list request failed.
  - A failed POST is not recorded, so the next visit sends it again.
- **The work.** `app/api/contacts/route.ts:15-82` loads 500 participants and 500 webhook events, then calls `touchContact` up to twice per candidate, in batches of 10.
  - `touchContact` (`src/lib/prisma.ts:2466-2515`) is a findUnique plus an `UPDATE` that always sets `"inboxStatus" = 'OPEN'` and `"updatedAt" = NOW()`.
  - That is up to about 4,000 statements, or 1.5 to 4 minutes with 10 connections held at about 0.9 s per statement.
  - There is no server-side lock or cooldown.
  - The request outlives Cloudflare's 100 s limit (524), and a 524 counts as "not done", so the next visit repeats it.
- **The reopen.** A scratch test with the real route and the memory repository: a CLOSED conversation came back OPEN after one POST.
- **Wrong dates.** `listCapturedContacts` and the "Email captured" timeline step read `updatedAt`, so they jump to the reconciliation time.

**Impact.**

- Two members opening Contacts at once can take most of the pool. Everyone else then waits for `pool_timeout` and gets P2024 500s, and the healthcheck fails.
- Inbox triage breaks.
- Email capture times are wrong.

**Fix:** Group 3.

#### M6. Creating a broadcast fires about 500 inserts at once

IDs: `external-calls-9`, `db-queries-2`.

**Evidence.**

- `app/api/broadcasts/route.ts:131-144` runs `Promise.all` over up to 500 recipients of `ensureOutboundDelivery` (findUnique, then create). Prisma merges the findUniques into one SELECT, so it is about 501 statements.
- Replay with the real client behind a 160 ms latency proxy, at `connection_limit=20`:
  - the `Promise.all` rejected with P2024 after 10.9 s;
  - an unrelated query issued 1 s later also failed with P2024.
- **State left behind.** A RUNNING broadcast with partial delivery rows, nothing queued, and the monthly broadcast reservation used up.

**Impact.** One user creating a broadcast causes 10 s or more of 500s for everyone on the web container.

**Fix:** Group 3.

#### M7. `/api/insights` runs 11 to 18 queries at once per request

ID: `db-queries-3`.

**Evidence.**

- `include=automation` runs 18 concurrent queries for an email-capture automation (`app/api/insights/route.ts:82-101`).
- The full view runs 11 (`route.ts:199-209`), and the automations list loads the full view too.
- There is no cache and no `statement_timeout`.
- Scratch EXPLAIN plans were fast: 13 to 81 ms at 200,000 participants. The cost is how long each connection is held, about 0.9 s per statement on the web pool.

**Impact.** A few people viewing Insights at the same time occupy most of the 20 connections.

**Fix:** Group 3.

#### M8. Interactive transactions use Prisma's defaults (2 s wait, 5 s timeout) while admin flows do serial work inside them

IDs: `db-queries-8`, `admin-console-3` (plus `server-cpu-memory-7` and `worker-background-13`, low).

**Evidence.** The client at `prisma.ts:185` has no `transactionOptions`. Inside default-timeout transactions:

- Pause-all and resume (`src/lib/admin/workspace-service.ts:207-271`) run one UPDATE per automation.
- The workspace deletion preview (`src/lib/admin/deletion/impact.ts:68-104`) runs 13 statements in RepeatableRead.
- Broadcast `retry_failed` (`src/lib/admin/operations/service.ts:101-108`) loops once per delivery.

Replayed at 164 ms round trip:

- The preview-shaped transaction took 5,058 ms on a 1,000-row workspace.
- The retry loop failed with P2028 at 14 deliveries.

**Impact.**

- The per-workspace kill switch ("pause all automations") likely returns 500 for any workspace with more than a handful of automations, during exactly the incidents it exists for.
- Workspace deletion usually cannot be started from the console.
- Broadcast retry fails above about 12 failed recipients.

Each of these rolls back, so no partial state is left.

**Fix:** Group 3 (sensible defaults for every transaction) and Group 6 (set-based rewrites and explicit timeouts).

#### M9. The worker database pool is 5 connections for 15 concurrent jobs, plus the bulk worker and every sweep

ID: `worker-background-4` (plus `db-queries-7`, low).

**Evidence.**

- `src/lib/worker-database-url.ts:24, 38-43` sets `connection_limit=5` and `pool_timeout=10` on the session pooler.
- That one pool serves:
  - `WORKER_CONCURRENCY` (default 15);
  - the bulk worker;
  - 7 periodic sweeps;
  - the health `SELECT 1`.
- `.env.production.example:162-166` still documents the old rule (keep `DATABASE_URL`'s `connection_limit` at least `WORKER_CONCURRENCY`), which no longer applies.

The verifiers disproved the claim that replies are lost: post-send transactions retry. They confirmed the throughput cap, and that the health probe waits on the same pool.

**Impact.** Bursts queue behind 5 connections, and the worker health probe can time out, which risks a restart during a burst.

**Fix:**

- Group 3: corrected docs and transaction defaults.
- Owner: pool size, which needs the Supavisor session pool size.
- Account-restriction branch: classifying pool timeouts as retryable in `runner.ts`.

#### M10. Every web database statement costs about 0.9 s, and the proxy runs the access check on every navigation and prefetch

ID: `production-probe-2` (plus `db-queries-19`, low).

**Evidence.**

- Sequential production sampling:
  - a route with no I/O: p50 181 ms;
  - one findUnique: p50 1,053 ms.
  - So each statement adds about 870 ms. That matches `docs/reply-latency-runbook.md`: about 5.5 round trips per statement in pgbouncer mode, Germany to Singapore.
- `proxy.ts:90-101` runs `assertApplicationAccess` (3 queries in practice) for every gated page request, including RSC prefetches.
- The app shell renders 8 sidebar links with default prefetch.

**Impact.** About 30 connection-seconds per first signed-in page view. This latency is what makes M5 to M8 serious.

**Fix:** owner (database placement and the proxy authorization gate). See sections 8 and 9.

#### M11. No retention on the big tables, and AutomationVersion survives every kind of deletion

ID: `db-queries-13`.

**Evidence.**

- Nothing deletes these rows outside tenant or data deletion:
  - `AutomationExecution`;
  - `OutboundDelivery` (full DM payloads);
  - `WorkspaceUsageReservation`;
  - `TrackedLinkClick`;
  - `AdminAuditEvent`.
- `AutomationVersion` has no foreign key and no delete path. Its snapshots, which include DM text, survive all of these:
  - automation deletion;
  - workspace deletion;
  - Meta data-deletion callbacks.
- That contradicts `app/data-deletion/page.tsx`.

**Impact.** The tables grow without bound, which slows every scan-shaped query. The leftover versions are a privacy and compliance gap.

**Fix:** owner decision (section 8).

### C. External calls without timeouts

#### M12. Supabase Auth calls have no timeout on any signed-in request path

IDs: `external-calls-1`, `error-handling-2` (plus `external-calls-3` and `external-calls-13`, low).

**Evidence.**

- `src/lib/supabase/server.ts:12-21` adds a timed fetch only when a caller passes `fetchTimeoutMs`. Only `app/api/admin/security/route.ts:235` does.
- These have no timeout either:
  - the proxy builds its own client with no fetch override (`proxy.ts:77-90`);
  - `src/lib/supabase/admin.ts`;
  - the Google token exchange (`src/lib/auth/google-oauth.ts:67`).
- auth-js retries a token refresh for up to 30 s, and each attempt uses undici's 300 s default.
- Reproduced:
  - against a server that never answers, `getClaims` with a session cookie was still pending after 15 s;
  - against a fast 503, `getClaims` took 25.4 s and sent 8 refresh POSTs.

**Impact.** Any Supabase Auth slowdown pins these requests for 30 s to minutes:

- every navigation that needs a token refresh;
- every API call during a JWKS refresh;
- every sign-in.

Cloudflare returns 524, requests pile up in the single process, and the app multiplies its own load on Supabase.

**Fix:** Group 4.

#### M13. No ioredis client sets `commandTimeout`

ID: `external-calls-2` (plus `worker-background-3` and `external-calls-15`, low).

**Evidence.**

- None of these sets `commandTimeout`, so a connected but silent Valkey is never noticed:
  - `src/lib/auth/rate-limit.ts:71`;
  - `src/lib/security/replay-guard.ts:20`;
  - `src/lib/admin/challenges.ts:99`;
  - `src/lib/queue.ts:126, 141`;
  - `src/lib/automation/send-rate-limiter.ts:39`;
  - `src/lib/health.ts:90-94`.
- After SIGSTOP on a private Valkey, EVAL on all three option sets was still pending after 20 s.
- Login awaits two limiter calls before checking the password (`app/api/auth/login/route.ts:45-47`), and the webhook routes await the enqueue.
- BullMQ's first enqueue never settles if Redis is down when the process starts. It recovers when Redis returns.

**Impact.**

- A Valkey stall freezes sign-in and sign-up for everyone.
- Meta webhooks hang until Meta redelivers.
- The existing in-process fallbacks never run, because the promise never rejects.

**Fix:**

- Group 4: limiter, replay guard, challenge store and webhook routes.
- Group 2: the health client.
- Account-restriction branch: the producer and send-limiter clients.

#### M14. Tenant hostnames are resolved with `dns.lookup` and no timeout

ID: `external-calls-4`.

**Evidence.**

- `src/lib/security/outbound-url.ts:152-153, 170` resolves with `dns.lookup`. The 5 s abort only starts after DNS has resolved.
- `/r/[slug]` runs this for every counted click on a link with a conversion URL, inside the web process.
- Nothing sets `UV_THREADPOOL_SIZE`.

The verifiers narrowed the impact: libuv caps getaddrinfo at 2 of the 4 threads, so file reads, zlib and crypto are not starved. But every other `dns.lookup` in the web process queues behind slow tenant lookups: Supabase, Meta, Razorpay and Resend.

**Impact.** A tenant whose nameserver drops queries can stall all outbound HTTP from the web process.

**Fix:** account-restriction branch (`outbound-url.ts`). Group 2 adds a `UV_THREADPOOL_SIZE` margin.

#### M15. Lead webhook delivery checks DNS once, then lets fetch resolve again (DNS rebinding)

ID: `external-calls-12`.

**Evidence.**

- `src/lib/automation/lead-delivery.ts:30` validates with `resolveSafeOutboundTarget`, which returns only the URL.
- It then calls `fetch(safeTarget)`, which resolves again (lines 37-43), and redirect hops repeat the gap.
- Reproduced: with a nip.io name, the guard passed and the POST reached a local server on 127.0.0.1.

**Impact.** A blind POST SSRF from the worker into the internal network.

**Fix:** account-restriction branch (the pinned path in `outbound-url.ts`).

### D. Error handling and broken flows in the signed-in app

#### M16. The proxy treats a database error as "signed out"

IDs: `db-queries-15`, `error-handling-4` (plus `production-probe-6`, low).

**Evidence.**

- `proxy.ts:97-103` calls `assertApplicationAccess(...).catch(() => null)`, and a null result falls through to the `/login` redirect.
- `app/login/page.tsx:49` swallows the same error and shows the form.
- A scratch vitest with valid claims and a P2024 pool timeout got a 307 to `/login?next=%2Fdashboard`.

**Impact.** A database incident looks like a mass logout. People then sign in again, which costs Supabase and database work and consumes rate-limit attempts, and can leave them locked out after recovery.

**Fix:** Group 4.

#### M17. "Go to Home" and "Skip" bounce people straight back to onboarding, at about 9 requests per press

ID: `client-network-1`.

**Evidence.**

1. `src/components/onboarding/onboarding-screen.tsx:35-49` sends one GET per mount or per "Try again".
2. On failure, "Go to Home" pushes `/dashboard`. `skip()` (`onboarding-flow.tsx:312-318`) ignores a failed save and navigates anyway.
3. The app shell mounts fresh and refetches the bootstrap. If that call works, `onboarding.required` is still true, so `routeOnboarding` (`src/components/app-shell.tsx:195-200`) replaces back to `/onboarding`.
4. Meanwhile the dashboard has already fired 6 API calls.

**Impact.** In a partial outage (the bootstrap answers, `/api/onboarding` returns 502), new users cannot leave onboarding, and each press multiplies load on a starved origin. Even when healthy, a new user's first visit to Home fires 6 calls just to be redirected.

**Fix:** Group 5.

#### M18. Onboarding answers can be lost without any error

IDs: `error-handling-3`, `client-network-2`.

**Evidence.**

- **Client.**
  - `persist` is fire-and-forget (`onboarding-flow.tsx:302`).
  - Only the latest body is kept (line 180), and a later success clears the error (lines 184-185).
  - "Try again" resends only the latest body.
- **Server.** A read-modify-write of the whole answers JSON (`app/api/onboarding/route.ts:95-97`, then the `prisma.ts` upsert at line 3652).
- Two scratch tests reproduced both halves:
  - a failed step save was never resent, and the warning banner disappeared;
  - two concurrent PUTs dropped the niches answer.

**Impact.** The plan and the Home recommendations are built on partial answers, and nothing tells the user.

**Fix:** Group 5 (client) and Group 3 (server).

#### M19. Broadcast send and automation create have no idempotency key

ID: `client-network-7`.

**Evidence.**

- `src/components/broadcasts-screen.tsx:150-176` POSTs without a key. A Cloudflare 502 or 524 shows "Could not start this broadcast." and keeps the form filled.
- The route has no deduplication.
- The route also returns its own 502 after a partial queue, which invites a retry.
- `automation-builder.tsx:911-920` has the same gap.

**Impact.** The same audience can be DMed twice and charged two units of the monthly quota. Duplicate active automations can double replies.

**Fix:** account-restriction branch.

#### M20. The Broadcasts screen polls every 5 s with no visibility gate, no overlap guard and no backoff

ID: `dev-preview-runtime-4` (plus `client-network-5` and `worker-background-14`, low).

**Evidence.**

- `broadcasts-screen.tsx:84-89` polls while any broadcast is RUNNING or PENDING. PENDING includes broadcasts scheduled days ahead.
- Reproduced:
  - with the tab hidden and the API answering 502, it still polled every 5 s;
  - with the API hanging, 5 requests were outstanding after 26 s.

**Impact.** Steady load from background tabs, and up to about 20 concurrent requests per tab on a starved origin.

**Fix:** account-restriction branch.

### E. Owner console

#### M21. Signing in at `admin.linkar.in/login` without `next=/admin` is blocked by CSP `form-action`

IDs: `csp-cross-origin-1`, `admin-console-1`.

**Evidence.**

- The admin Sign out (`app/api/auth/logout/route.ts:17`) lands on `https://admin.linkar.in/login` with no `next`.
- `app/login/page.tsx:44` then defaults `next` to `/dashboard`, confirmed in the production HTML.
- For `/dashboard`, the login route picks `appUrl` (`app/api/auth/login/route.ts:38`). So success and every error are 303s to `https://app.linkar.in`.
- The CSP has `form-action 'self'` (`src/lib/security/headers.ts:80-82`).
- Chromium and WebKit both block the redirected submission. The page stays on `/login` and the button hangs on "Signing in...". By then the server has already:
  - run `signInWithPassword`;
  - used a rate-limit attempt;
  - for an owner with no workspace membership, possibly provisioned a workspace.

**Impact.** After signing out of the console, or from a bookmarked login page, the owner cannot sign back in, and this happens during incidents, when the Service health page is needed. The workaround is to open `admin.linkar.in/admin` first.

**Fix:** Group 6.

#### M22. A backup authenticator can never be used to reach AAL2

ID: `admin-console-2`.

**Evidence.**

- `src/components/admin/admin-security-screen.tsx:195` always sends `verifiedFactors[0]`, and there is no factor picker.
- The route calls `challengeAndVerify` with that factor, so a code from the backup app is rejected.
- The screen itself tells the owner to keep a backup app.

**Impact.** Losing the phone that holds the first factor locks the owner out of the whole console. Recovery then needs manual factor deletion in the Supabase dashboard.

**Fix:** Group 6.

#### M23. Contact "Export" in Records always fails, while the audit log records success

ID: `admin-console-5`.

**Evidence.**

- The route returns raw `text/csv` (`app/api/admin/operations/[kind]/[id]/route.ts:17`).
- `src/components/admin/operations/operation-actions.tsx:56-64` uses `adminCommand()`, which expects JSON.
- So `data` is undefined and the owner sees "Export unavailable". The CSV of personal data is generated, sent, and then discarded.

**Fix:** Group 6.

### F. Worker

#### M24. Meta rate-limit codes 80001, 80002 and 80006 are treated as permanent

ID: `worker-background-5`.

**Evidence.**

- `src/lib/meta/errors.ts:35` labels these codes "will be retried".
- But `TRANSIENT_META_CODES` (`src/lib/meta/client.ts:445`) and `src/lib/facebook/client.ts:41` leave them out.
- Run against a fake fetcher returning HTTP 400: the codes came back `retryable=false` and were classified KNOWN_PERMANENT.

**Impact.** When Meta throttles an account, every send in that window fails for good, while the owner is told it will be retried.

**Fix:** account-restriction branch.

#### M25. Retryable Meta throttles ignore Meta's usage headers and retry within about 3 s

ID: `worker-background-6`.

**Evidence.**

- Nothing reads `X-Business-Use-Case-Usage` or `estimated_time_to_regain_access`.
- Realtime jobs retry at about 1 s and 2 s and then fail.
- Sequences retry every 2 minutes until the 24 h window closes.

**Impact.** A throttle or Meta blip longer than about 3 s permanently drops the realtime replies in that window.

**Fix:** account-restriction branch.

#### M26. Rate-limit deferrals all wake within the same minute, at realtime priority

ID: `worker-background-7`.

**Evidence.**

- The deferral jitter is at most 60 s.
- `moveToDelayed` keeps REALTIME priority.
- Every re-run repeats about 8 to 10 statements before it is deferred again.
- Reproduced: of 3,000 attempts, 2,250 were deferred, and all of them woke 7 ms to 60 s after the window boundary.

**Impact.** For a viral account above 750 comments an hour, the backlog takes over the 5-connection worker pool for minutes each hour, and other tenants wait.

**Fix:** account-restriction branch.

#### M27. The workspace queue purge skips jobs when one page matches more than 500

ID: `worker-background-9`.

**Evidence.**

- `src/lib/queue.ts:273-282` shares one offset across 6 job states and subtracts the combined match count. The offset goes negative, and the loop exits early.
- The real function left 200 of 800 target jobs behind.

**Impact.** After an admin deletion or a Facebook data-deletion request, the deleted tenant's queued payloads stay in Redis. That is an incomplete deletion with a compliance angle.

**Fix:** account-restriction branch (`queue.ts`).

#### M28. No cap on keyword count or length, and the matcher compiles a Unicode RegExp per keyword per event

ID: `server-cpu-memory-3`.

**Evidence.**

- The keyword schema (`definition.ts:5`) has no maximum length.
- The keyword and media id arrays have no `.max()`.
- 5,000 keywords and a single 100,000-character keyword both validated.
- `containsWholeKeyword` (`match.ts:27-44`) re-normalizes the comment and compiles a new RegExp for every keyword, on every event. `engine.ts:25` and `campaign-match.ts:33` repeat the scan.
- Measured against a 2,200-character comment:
  - 500 keywords: 48 to 90 ms;
  - 5,000 keywords: 0.5 to 1.8 s.

**Impact.** One automation can cost seconds of worker CPU per comment for every tenant. The same multi-megabyte definition is also rendered into dashboard pages.

**Fix:** Group 1.

---

## 4. Low severity

These are real but small, or depend on rare conditions. Where a low item shares a file with a fix group and is trivial, it is folded into that group.

| Theme | IDs | Issue | Plan |
|---|---|---|---|
| Cross-host links (same class as today's console error) | `client-network-8`, `csp-cross-origin-2`, `-3`, `-4`, `error-handling-7`, `admin-console-7`, `admin-console-14`, `production-probe-4`, `dev-preview-runtime-2`, `-3` | Relative `next/link` hrefs that the proxy redirects to another host get blocked by `connect-src` when prefetched or clicked. Examples: admin "Back to workspace" to `/dashboard`, the app's `/admin`, and `/privacy`, `/terms`, `/support` and `/data-deletion` on Settings, Profile and Help. Confirmed on production: Chromium logged the violation. Clicks still work through a full reload. Note: `prefetch={false}` alone (the `e1d9184` fix) still makes a blocked RSC fetch on click. | Groups 5 and 6 (plain `<a>`) |
| Builder photo preview | `client-network-9`, `csp-cross-origin-7` | One CSP violation and a broken preview per keystroke. Relative prefixes render `/automations/h` and similar. | Account-restriction branch (`automation-builder.tsx`) |
| Cloudflare beacon blocked | `production-probe-5` | Cloudflare auto-injects Web Analytics on app and admin pages, and the base CSP blocks it on purpose. This produces console noise. | Owner: a Cloudflare zone setting (section 9) |
| No CSP reporting | `csp-cross-origin-6` | Violations are only seen by someone reading a console. | Section 9 |
| Admin login gets the public CSP | `csp-cross-origin-8` | Extra script and connect origins. Partly in use by the Cloudflare beacon. | No change |
| Failures not cached, and focus refresh | `client-network-3`, `dev-preview-runtime-5`, `error-handling-13` | Every window focus refetches the bootstrap, with no throttle or dedupe. Failures behave like cache misses. | Group 5 (focus throttle) |
| Inbox polling | `client-network-4`, `dev-preview-runtime-8`, `db-queries-12` (polling part) | A fixed 8 s poll with no backoff on errors. The poll is visibility-gated and has an in-flight guard. | Group 5 |
| Billing activation poll and Razorpay timeout | `client-network-10`, `error-handling-9` | Polls overlap, and the wording after a verify failure is wrong. The payment itself is safe. | Owner (billing) |
| Team members cache | `client-network-11`, `error-handling-14` | One non-2xx response caches an empty list for the session, which shows owner names as "Former member". | Follow-up |
| Loaders do not abort | `client-network-12` | MediaPicker refetches `/api/meta/media` on every remount. | Follow-up |
| Admin console 20 s refresh | `client-network-14`, `admin-console-4` | Fixed-rate `router.refresh`, and the 3 s `bounded()` limit abandons queries without cancelling them. The load is small. | Follow-up |
| Facebook Page picker | `client-network-15`, `error-handling-8` | Shows a raw JSON parse error on a 502. It also reports failure after a successful connect. | Group 5 |
| Admin bodies parsed before auth | `server-cpu-memory-4` | Covered by the 1 MB body cap. | Group 2 (cap) |
| Link stats | `server-cpu-memory-6`, `db-queries-16` | `groupBy(ipHash).length` loads every distinct visitor hash. | Follow-up |
| CSV exports truncate silently | `server-cpu-memory-8`, `db-queries-18` | Contacts stop at 10,000 rows and insights at 5,000, with no marker. | Follow-up |
| Data-deletion callback scans the queues | `server-cpu-memory-9`, `external-calls-8` | Full queue scans inline in the callback. | Account-restriction branch (`queue.ts`) |
| Facebook avatar route | `server-cpu-memory-10` | One uncached Graph call per commenter avatar on the Facebook activity tab. | Follow-up |
| Google token exchange timeout | `external-calls-3` | The token exchange has no timeout. | Group 4 |
| Razorpay webhook | `external-calls-7` | A Serializable transaction runs inline, with P2034 retries and no delay. | Owner (billing) |
| Activity retry | `external-calls-11` | A failed enqueue leaves the participant in COMMENT_MATCHED. It expires after 24 h. | Follow-up |
| Supabase admin client | `external-calls-13` | No timeout. Deletion jobs also run on the realtime queue. | Group 4 (timeout) |
| Owner user search | `external-calls-14`, `admin-console-10` | Up to 5 x 1,000 Auth users per debounced keystroke. Today it is one call per search. | Follow-up |
| Webhook enqueue errors | `external-calls-15` | An enqueue failure becomes Next's bare 500. | Group 4 |
| OAuth callbacks | `external-calls-16` | `completeOAuthSignIn` is unguarded. A database error shows a raw 500. | Follow-up (auth) |
| Admin integration repair | `external-calls-18` | A missing `return await` maps provider errors to a generic 500. | Follow-up |
| Instagram OAuth callback | `external-calls-19` | Up to 5 sequential 10 s Meta calls. | Follow-up |
| Three Prisma clients | `db-queries-6` | Route handlers, server components and the proxy each build their own pool. Consolidating them changes total pool capacity. | Owner (section 8) |
| Unindexed admin sorts | `db-queries-9`, `admin-console-8`, `admin-console-9` | The FAILED executions list and the Records deliveries and contacts views run sequential scans. | Follow-up (index migration) |
| Event-type filter scans | `db-queries-10` | Unknown `?type=` values scan the 90-day log. | Follow-up |
| Contacts list reads 500 events | `db-queries-11`, `dev-preview-runtime-7` | Each list or search request reads 500 full webhook payloads to resolve usernames. Search uses ILIKE. | Follow-up |
| Inbox unread sort | `db-queries-12` | An opt-in sort with no index. | Follow-up |
| Cascading deletes | `db-queries-17` | One statement deletes all of an automation's or workspace's history. | Owner (data deletion) |
| Auth form handlers | `error-handling-5` | A database error during sign-in shows a blank Chrome 500. | Follow-up (auth) |
| Home "Not connected" alarm | `error-handling-6` | A failed connections request shows a red "Not connected" alarm. | Group 5 |
| Client fetch timeouts | `error-handling-10`, `dev-preview-runtime-6` | Insights and the automation Overview spin for up to about 100 s. | Follow-up |
| Error boundaries | `error-handling-11`, `admin-console-11` | An admin layout error falls through to `global-error`. | Follow-up |
| Server error reporting | `error-handling-12` | No `onRequestError`, and the worker has no unhandledRejection handler. | Follow-up |
| MFA QR code | `admin-console-6` | Double `data:` prefix, so the QR image never renders. | Group 6 |
| First MFA factor | `admin-console-12` | Trust on first use. | Owner (auth) |
| Deletion wizard key | `admin-console-13` | A fresh idempotency key per attempt. | Follow-up (data deletion) |
| Worker restart drops in-flight jobs | `worker-background-8` | Replies in flight during a SIGKILL are recorded FAILED 35 minutes later. | Owner (stop grace period) plus follow-up |
| Owner alert dedupe | `worker-background-10` | An in-process, racy dedupe. | Follow-up |
| Lead deliveries | `worker-background-11` | Give up after about 3 s. | Account-restriction branch (`queue.ts`) |
| Admin deletion job | `worker-background-12` | One cascading statement, and no Supabase timeout. | Group 4 (timeout) |
| Billing sweep | `worker-background-15` | Runs outside the shutdown drain. | Follow-up |
| Unauthenticated one-query routes | `production-probe-7` | `/r/*`, `/api/t/*` and `/data-deletion/status/*` each cost about 1 s of pool time and have no rate limit. | Section 9 (Cloudflare rate limit) |

---

## 5. Where the inspection held up and where it did not

**Checked and found fine.** There is no uncapped automatic retry loop anywhere in the client. These calls already have timeouts:

- every Meta, Facebook, Razorpay and Resend call (10 s);
- the conversion callback and lead webhooks (5 s);
- the worker health probe (3 s);
- dashboard insights (15 s on the client);
- the Razorpay script load (15 s).

The dev-preview guard returns a bare 404 in production on every variant tried. There are no redirect loops between the hosts.

**Production probing.** Signed out, GET or HEAD only, sequential, 300 ms apart:

- 530 hops across both hosts and all 109 API GET routes;
- no 5xx responses, no HTML from any API route, and a CSP header on every HTML response.

---

## 6. Overlap with the account-restriction fixes

Branch `ban-risk-fixes` is editing these files, and no fix group touches them:

- `src/lib/meta/errors.ts`
- `src/lib/automation/outbound-delivery.ts`
- `src/lib/queue.ts`
- `src/lib/automation/send-rate-limiter.ts`
- `src/lib/env.ts`
- `src/lib/automation/campaign-runner.ts`
- `src/lib/facebook/runner.ts`
- `src/lib/automation/broadcast-runner.ts`
- `src/lib/automation/sequence-runner.ts`
- `src/lib/automation/followup-runner.ts`
- `src/lib/automation/runner.ts`
- `src/lib/automation/templates.ts`
- `src/lib/security/outbound-url.ts`
- `src/lib/automation/account-pause.ts`
- `src/components/automation-builder.tsx`
- `src/components/automation-builder/**`
- `src/components/broadcasts-screen.tsx`
- the tests for all of these

These findings need those files. They are handled with the account-restriction fixes, and the owner merges them after:

- M19 idempotency keys for broadcast send and automation create (`client-network-7`). The server half in `app/api/broadcasts/route.ts` should land after Group 3, which also edits that route.
- M20 Broadcasts screen polling (`dev-preview-runtime-4`).
- M24 rate-limit codes 80001, 80002 and 80006 (`worker-background-5`).
- M25 throttles ignore Meta usage headers (`worker-background-6`).
- M26 deferral herd at the window boundary (`worker-background-7`).
- M27 queue purge paging (`worker-background-9`). This is also a data-deletion completeness gap.
- M14 tenant DNS lookups without a timeout (`external-calls-4`). Group 2 adds a `UV_THREADPOOL_SIZE` margin only.
- M15 lead webhook DNS rebinding (`external-calls-12`).
- The producer and send-limiter parts of M13: `commandTimeout` on `PRODUCER_REDIS_OPTIONS` and on the send limiter, and a bounded first enqueue.
- The part of M9 that classifies Prisma P2024 and P2028 as retryable in `runner.ts`.
- These low items: builder photo preview (`client-network-9`, `csp-cross-origin-7`), the first-use producer hang (`worker-background-3`), the data-deletion queue scans (`server-cpu-memory-9`, `external-calls-8`), the lead delivery retry schedule (`worker-background-11`) and the broadcast poll (`worker-background-14`).

---

## 7. Fix groups

There are six groups, with no shared files, ordered by impact on uptime. Each lists concrete tasks. Tests run per file, with `--testTimeout=60000`.

### Group 1. Worker regex and keyword safety (H1, M28)

Files:

- `src/lib/automation/match.ts`
- `src/lib/automation/definition.ts`
- `src/lib/automation/campaign-match.ts`
- `src/lib/automation/engine.ts`
- the tests for each of these

Tasks:

1. **Linear-time regex engine.** Evaluate mode `regex` with a linear-time engine (the pure-JS `re2js` package, no native build) instead of `new RegExp`. A pattern the engine cannot compile counts as no match. If the owner rejects the dependency, treat regex mode as a literal phrase until they decide.
2. **Validate at save time.** In `definition.ts`:
   - reject regex keywords longer than 100 characters or that the linear engine cannot compile;
   - cap each keyword at 100 characters, each keywords array at 50 and each mediaIds array at 100.
   - Apply these caps only on the save path. First confirm that no read path, in the worker or on the dashboard, re-validates stored definitions with the strict schema, so existing automations above the caps keep running.
3. **Normalize once.** Normalize the event text once per event, and truncate the matched text to 2,200 characters.
4. **Cache compiled matchers.** Cache them in a bounded LRU (about 2,000 entries) keyed by mode and keyword.
5. **Report the matched keyword.** Have `matchesTrigger` return the matched keyword, so `engine.ts` (`findMatchedKeyword`) and `campaign-match.ts` stop rescanning.
6. **Tests:**
   - `(a|a)+$`, `((a+))+$`, `(a+){2,}$` and `(.*a){12}$` against 40 characters of `a` finish in under 50 ms;
   - a 5,000-keyword definition is rejected on save;
   - the existing match, engine and campaign-match tests still pass.

### Group 2. Origin survival: liveness healthcheck, image optimizer, body cap (M1, M2, M3, M4)

Files:

- `app/api/health/live/route.ts` (new)
- `app/api/health/route.ts`
- `src/lib/health.ts`
- `src/lib/worker-health.ts`
- `scripts/container-healthcheck.mjs`
- `Dockerfile`
- `next.config.ts`
- `src/components/marketing/proof-rail.tsx`
- `app/r/[slug]/route.ts`
- the tests for these

Tasks:

1. **Web liveness route.** Add `app/api/health/live/route.ts`. It answers 200 with `{ status: "ok", release }`, does no database or Redis I/O, and sends `Cache-Control: no-store`.
2. **Worker liveness path.** In `worker-health.ts`, add a `/live` path that answers 200 when the event loop responds and the worker reports it is processing, with no I/O. Leave `/health` unchanged.
3. **Healthcheck script.** Make `container-healthcheck.mjs` probe `/api/health/live`, then the worker's `/live`, with an 8 s fetch timeout.
4. **Bounded probes.** In `health.ts`, race `checkDatabase` and `checkRedis` against about 2 s and report "error" on timeout, and add `commandTimeout: 1_500` to the health Redis client. Keep `/api/health`'s status semantics and its public body keys in their current order: `ops/dokploy/release-linkar.sh` matches `"release":"<sha>","dependencies"`, and Dokploy's service healthcheck reads the dependencies.
5. **Dockerfile.** Add `ENV UV_THREADPOOL_SIZE=16`, a margin for sharp and DNS.
6. **Image config.** In `next.config.ts`:
   - `images.localPatterns: [{ pathname: "/marketing/**", search: "" }]`;
   - `images.deviceSizes: [640, 828, 1080, 1200, 1536]`;
   - `images.imageSizes: [64, 128, 256, 384]`;
   - `experimental.imgOptConcurrency: 1`.
7. **Body cap.** Add `experimental.proxyClientMaxBodySize: "1mb"` to `next.config.ts`. First grep to confirm no route accepts bodies over 1 MB.
8. **Avatar srcset.** Drop `sizes="68px"` in `proof-rail.tsx`, so the 136x136 avatar emits only 1x and 2x candidates.
9. **Anonymous clicks.** In `app/r/[slug]/route.ts`, rate-limit "anon" clicks under a shared per-link bucket instead of skipping the limiter.
10. **Verify with a production build:**
    - every marketing image renders;
    - `/_next/image?url=/api/health` is rejected;
    - the healthcheck exits 0 while Redis is stopped.

### Group 3. Database pool pressure and data correctness (H2 partial, M5, M6, M7, M8 partial, M9 partial, M18 server half)

Files:

- `src/lib/prisma.ts`
- `src/lib/repository.ts`
- `src/lib/memory-repository.ts`
- `app/api/contacts/route.ts`
- `src/components/contacts-screen.tsx`
- `app/api/broadcasts/route.ts`
- `app/api/onboarding/route.ts`
- `app/api/insights/route.ts`
- `prisma/schema.prisma`
- two new migrations under `prisma/migrations/`
- `src/lib/worker-database-url.ts`
- `.env.production.example`
- the tests for these

Tasks:

1. **Transaction defaults.** Construct the PrismaClient with `transactionOptions: { maxWait: 5_000, timeout: 15_000 }`.
2. **Data-deletion transactions.** Give `beginInstagramDataDeletion` and `beginFacebookDataDeletion` an explicit `{ maxWait: 10_000, timeout: 60_000 }`, with no change to what they delete.
3. **Indexes.** Add `@@index([instagramAccountId])` on AutomationContact and OutboundDelivery, each with its own single-statement `CREATE INDEX CONCURRENTLY IF NOT EXISTS` migration, following `20261013150000`.
4. **Contacts reconciliation, server side.** Add a `reconcileContacts(workspaceId, candidates)` repository method, mirrored in the memory repository:
   - one `INSERT ... SELECT FROM unnest(...) ON CONFLICT ("workspaceId","instagramAccountId","igScopedUserId") DO UPDATE` that applies LEAST and GREATEST to `createdAt` and `lastSeenAt`;
   - it never touches `inboxStatus` or `updatedAt`, and returns the number of inserted rows.
   - In the POST route, use it in place of the `touchContact` loop, and add a 15-minute per-workspace cooldown in process (there is a single web replica).
5. **Contacts reconciliation, client side.** In `contacts-screen.tsx`, skip the reconcile POST when the list load failed, and record every attempt time, failed ones included, in sessionStorage.
6. **Capture times.** Have `listCapturedContacts` and the contact timeline use `emailCapturedAt` (falling back to `updatedAt`) for capture times.
7. **Broadcast deliveries.** Add `ensureOutboundDeliveries(inputs)`: `createMany` with `skipDuplicates`, then `findMany` by `deliveryKey` in chunks of 500. Use it in `app/api/broadcasts/route.ts`. If that stage throws, mark the broadcast failed or cancelled and release the monthly reservation, as the `createBroadcast` catch already does. Leave the enqueue call and the response contract unchanged.
8. **Onboarding save.** Make it atomic: read, merge and write inside one transaction with `SELECT ... FOR UPDATE`, or use `answers || $patch::jsonb` if `mergeAnswers` is a shallow merge. Use it from `app/api/onboarding/route.ts`.
9. **Insights.** In `app/api/insights/route.ts`:
   - share results for 30 s per workspace, include, automationId and days, sharing in-flight promises;
   - run each request's queries with at most 6 in flight;
   - optionally add an automationId filter to `countExecutionsByStatusPerAutomation`.
10. **Docs.** Correct the stale worker pool sizing note in `.env.production.example` and `worker-database-url.ts`: the worker uses `WORKER_DATABASE_CONNECTIONS` on the session pooler. Leave the defaults unchanged.
11. **Tests:**
    - a CLOSED contact stays CLOSED after the reconcile POST;
    - a 500-recipient broadcast issues one `createMany`;
    - two concurrent onboarding PUTs keep both answers;
    - the insights cache serves a second call;
    - a memory repository parity test.

### Group 4. Dependency timeouts and proxy failure modes (M12, M13 partial, M16)

Files:

- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `proxy.ts`
- `src/lib/auth/google-oauth.ts`
- `src/lib/auth/rate-limit.ts`
- `src/lib/security/replay-guard.ts`
- `src/lib/admin/challenges.ts`
- `app/api/meta/webhook/route.ts`
- `app/api/facebook/webhook/route.ts`
- `src/proxy-auth.test.ts` and the tests for the other files

Tasks:

1. **Supabase server client.** Default `fetchTimeoutMs` to 8,000 in `createSupabaseServerClient`. The admin security route keeps its own value.
2. **Supabase admin client.** Give `createSupabaseAdminClient` a `global.fetch` that combines `AbortSignal.timeout(8_000)` with any caller signal (`AbortSignal.any`).
3. **Proxy.**
   - Pass the same timed fetch to the proxy's own client.
   - Race `getClaims` against a 10 s overall deadline.
   - When `getClaims` fails with a retryable or network error, or `assertApplicationAccess` throws, return 503 with `Retry-After: 5` and log it. Send a small HTML page for document requests and JSON for `/api/admin`.
   - Only a missing session or a null access result still redirects to `/login`.
4. **Google token exchange.** Add `signal: AbortSignal.timeout(10_000)` and map a timeout to `GoogleOAuthError(..., 0)`.
5. **Redis clients.** Add `commandTimeout: 1_500` to the ioredis options in `rate-limit.ts`, `replay-guard.ts` and `challenges.ts`, so the existing in-process fallbacks run when Valkey stalls.
6. **Webhook routes.** In both webhook routes, wrap the enqueue in try/catch with a 5 s race. On failure, log the event count and channel, and return 503 `{ received: false, retryable: true }`, as the inline branch does. Job ids are deterministic, so Meta redelivery is safe.
7. **Tests:**
   - the proxy returns 503 (not 307) for a P2024 from the access check and for a `getClaims` timeout;
   - a limiter whose Redis never answers falls back within about 2 s;
   - a webhook whose enqueue rejects returns 503.

### Group 5. Signed-in app client: onboarding exits, saves and polling (M17, M18 client half, plus same-file lows)

Files:

- `src/components/onboarding/onboarding-screen.tsx`
- `src/components/onboarding/onboarding-flow.tsx`
- `src/lib/onboarding/redirect.ts`
- `src/components/app-shell.tsx`
- `src/lib/client/workspace-data.ts`
- `src/components/dashboard-screen.tsx`
- `src/components/inbox/instagram-inbox.tsx`
- `src/components/help-screen.tsx`
- `src/components/settings-screen.tsx`
- `src/components/profile-screen.tsx`
- `app/not-found.tsx`
- the tests for these

Tasks:

1. **Make the onboarding exit work.**
   - When the onboarding load fails, or a skip save fails, store a sessionStorage deferral timestamp.
   - `shouldRedirectToOnboarding` honours it for 30 minutes, and the app shell passes it in.
   - `skip()` sets the deferral when its save fails, instead of ignoring the result.
2. **Cool down "Try again".** Add a cooldown with jitter that grows from 2 s to 4 s to 8 s (cap 30 s), and show a calmer message after 3 failures.
3. **App shell before the onboarding decision.** With no cached bootstrap and no remembered "onboarding not required" flag for this tab, render the existing skeleton until `routeOnboarding` has decided. That stops the dashboard firing 6 calls just to be redirected.
4. **Serialize onboarding saves.** Put saves through a promise queue that accumulates unsaved answers and sends them together. Retry with backoff (1 s, 2 s, 4 s, up to 30 s, with jitter), and keep the warning banner until the queue drains. The atomic server merge is in Group 3.
5. **Throttle the focus refresh.** Add a `refreshWorkspaceBootstrap({ minAgeMs })` option in `workspace-data.ts` that reuses an in-flight request. Have the app shell's focus handler use 60 s and skip when `document.hidden`. `WORKSPACE_CHANGE_EVENT` stays immediate.
6. **Inbox backoff.** Replace the fixed 8 s interval with a self-scheduling timer that backs off from 8 s to 2 minutes on failure and resets on success. Skip the thread fetch when the list request failed.
7. **Dashboard.** When the connection requests fail, keep connections as "unknown" (not `[]`). Show "Could not check your accounts" with Retry, and drop the "Not connected" alarm unless both requests succeeded.
8. **Cross-host links as plain anchors.** Render these as plain `<a>`, not `next/link`, so no RSC prefetch or fetch happens:
   - app-shell's `/admin`;
   - help-screen's `/data-deletion`, `/privacy`, `/terms` and `/support`;
   - settings-screen's `/support`, the Policies list and `/data-deletion`;
   - profile-screen's `/privacy` and `/data-deletion`;
   - not-found's `/support`.
9. **Facebook Page picker.** Use `response.json().catch(() => ({}))`, check `ok` first and show a readable error. A failed refresh after a successful select must not show as a failure.
10. **Tests:**
    - after a failed load, Home does not bounce back to onboarding;
    - a failed step save is resent;
    - focus events within 60 s cause one bootstrap request;
    - the inbox backs off under 502s.

### Group 6. Owner console: sign-in, factors, export, kill switch (M21, M22, M23, M8 admin half, plus same-file lows)

Files:

- `src/lib/security/headers.ts`
- `app/api/auth/logout/route.ts`
- `app/login/page.tsx`
- `src/components/auth/login-screen.tsx`
- `src/components/admin/admin-shell.tsx`
- `src/components/command-palette-items.ts`
- `src/components/admin/admin-security-screen.tsx`
- `src/components/admin/operations/operation-actions.tsx`
- `src/lib/admin/workspace-service.ts`
- `src/lib/admin/operations/service.ts`
- `src/lib/admin/deletion/impact.ts`
- `src/lib/admin/system/usage-reconciliation.ts`
- the tests for these

Tasks:

1. **form-action.** In production, build it as `'self' https://app.linkar.in https://admin.linkar.in`, from the hosts in `site-routing.ts`. Add a test that every origin `applicationOriginForPath`, `appUrl` or `adminUrl` can return is allowed.
2. **Logout redirect.** On the admin host, redirect to `/login?next=%2Fadmin`.
3. **Login default.** In `app/login/page.tsx`, when the request host is the admin host and `next` is missing or not an `/admin` path, default `next` to `/admin`.
4. **Admin-host login links.** In `login-screen.tsx`, render "Create an account" and "Forgot your password" as plain `<a>` when served on the admin host.
5. **Back to workspace.** In `admin-shell.tsx`, lines 193 and 231, render "Back to workspace" as plain `<a href="/dashboard">`.
6. **Palette items.** In `command-palette-items.ts`, mark "Back to workspace" and "Owner console" `external: true`, so the palette uses `window.location.assign`.
7. **Security screen.**
   - At AAL1, show a radio list of verified factors (default: the first) and send the chosen `factorId`.
   - Use `qrCode` as it is when it already starts with `data:`; otherwise encode the raw SVG.
   - Update the test fixtures to real auth-js output.
8. **Contact export.** In `operation-actions.tsx`, run `export_one` through `adminCommandResponse()` and `downloadAdminFile(await response.blob(), ...)`, and add a test.
9. **Pause and resume all.** In `workspace-service.ts`:
   - pause-all becomes one `UPDATE "Automation" ... WHERE "workspaceId" = $1 AND status = 'ACTIVE' RETURNING id, version`;
   - resume becomes one `UPDATE ... FROM unnest($ids, $versions)`;
   - pass explicit `{ maxWait: 5_000, timeout: 15_000 }`;
   - keep the audit payload format the same.
10. **Broadcast retry_failed.** In `operations/service.ts`, replace the per-delivery loop with one `updateManyAndReturn` filtered by the valid ids, `state: "FAILED"`, `retryable: true` and `providerMessageId: null`.
11. **Explicit timeouts only.**
    - `deletion/impact.ts` `previewWorkspace`: `{ maxWait: 5_000, timeout: 30_000 }`.
    - `usage-reconciliation.ts`: `{ maxWait: 5_000, timeout: 60_000 }`.
    - Nothing else changes in what is counted or deleted.
12. **Tests:**
    - an admin-host login POST never 303s off-origin under the new CSP;
    - verifying with a second factor works;
    - pause-all with 30 automations completes in one statement.

---

## 8. Not fixed in this round, and why

- **Account-restriction branch.** All the items in section 6.
- **H2 (part).** Moving the data-deletion purge out of the Meta callback into an async worker job, and denormalizing `pageId` for the Facebook path. This changes the data-deletion flow, so it needs the owner. Group 3 only makes the current flow fit its time budget.
- **M10.** Two options, both needing the owner:
  - Put the web database connection on the Supabase session pooler, or co-locate the app with the database region. This is an ops change.
  - Skip the proxy access check for prefetches, or cache it per user. This changes the authorization gate and delays revocation.
- **M11.** A retention policy for executions, deliveries, reservations, clicks and audit events. Whether to delete AutomationVersion rows with their automation depends on whether deleted automations can be restored from versions. Data deletion, so it needs the owner.
- **M9 (part).** Raising `WORKER_DATABASE_CONNECTIONS` or lowering `WORKER_CONCURRENCY` needs the Supavisor session pool size. `env.ts` is also on the account-restriction list.
- **M4 (part).** A route-level 256 KB cap on the Razorpay webhook body. This is the billing flow, so it is left for the owner. The global 1 MB proxy cap in Group 2 already covers the memory risk.
- **M1 (part).** Pointing Dokploy's service-level healthcheck at `/api/health/live`, setting a stop grace period, and running two web replicas. These are infrastructure settings outside the repo.
- **`db-queries-6`.** Consolidating the three Prisma clients onto one `globalThis` instance would cut the web process's total pool capacity from about 3 x `connection_limit` to 1 x. Decide it together with the `connection_limit` value.
- **Billing and auth lows** (`client-network-10`, `error-handling-9`, `external-calls-7`, `external-calls-16`, `error-handling-5`, `admin-console-12`). These are payment or sign-in flows, so they are left for the owner.

---

## 9. Recommendations that are not code changes

### Cloudflare

1. **Cache the image optimizer at the edge.**
   - Add a Cache Rule that makes `/_next/image*` eligible for cache and respects the origin TTL.
   - Add a Request Header Transform Rule on `/_next/image*` that sets `Accept: image/webp,*/*`, so the origin only ever encodes WebP and the cache key does not split on Accept.
   - Purge nothing; the URLs are content-keyed.
2. **Rate-limiting rules.** These turn a crawler or scanner into 429s at the edge instead of origin CPU and pool time:
   - `/_next/image*` per IP (for example 60 per minute);
   - `/r/*`, `/api/t/*` and `/data-deletion/status/*` (each costs about 1 s of database time signed out);
   - POSTs to `/api/auth/*`.
3. **Web Analytics automatic injection.** Decide on it. Either turn it off for the zone and render the beacon only on the marketing pages, or accept the console noise. Today the beacon is injected on app and admin pages and blocked there by design (`production-probe-5`).
4. **Origin error alerts.** If the plan allows, set up notifications for the origin error rate (502, 524 and 1033 spikes).

### Dokploy and the container

1. **Healthcheck.** After Group 2 ships, point the linkar-web service healthcheck at `/api/health/live`, and the worker's at `/live`. Keep `/api/health` for the release script and monitoring.
2. **A second web replica.** Run two, so replacing one task never empties the origin.
3. **Image cache volume.** Mount a persistent volume at `/app/.next/cache/images` for linkar-web, so deploys do not start the image cache cold.
4. **Worker stop grace period.** Set it to at least 35 s (`SHUTDOWN_DRAIN_TIMEOUT_MS` plus 10 s), so deploys do not SIGKILL jobs in flight (`worker-background-8`).
5. **Origin compression.** Consider `compress: false` in a later change once confirmed that Cloudflare compresses every response. Origin gzip shares the libuv pool with sharp and DNS.

### Database and Redis

1. **Cut per-statement latency.** Each statement costs about 0.9 s today. Either move the app server into the database region, or point the web `DATABASE_URL` at the session pooler with an explicit `connection_limit` (the worker already made that move). Set explicit `pool_timeout` and `connect_timeout` values.
2. **statement_timeout.** Set one for the app role (for example `ALTER ROLE ... SET statement_timeout = '15s'`), after checking that migrations and the worker's long jobs use a role or session that overrides it.
3. **Check pool sizes first.** Confirm the Supavisor transaction and session pool sizes before changing any `connection_limit`.
4. **Valkey memory.** Set `maxmemory` with the `noeviction` policy (BullMQ requires it), and alert on memory use. A worker outage lets the queue grow without bound.

### Monitoring and alerting

1. **External uptime monitor.** Monitor `https://app.linkar.in/api/health/live` (liveness) and `/api/health` (dependencies) separately, from outside Cloudflare's tunnel, and alert on each.
2. **Worker heartbeat.** Alert when the heartbeat in the `/api/health` detail goes stale, and on the age of the oldest waiting BullMQ job.
3. **Container restarts.** Alert on restarts and unhealthy events from Docker or Dokploy.
4. **Pool and timeout errors.** Count and alert on Prisma P2024 and P2028 errors in the logs.
5. **CSP reporting.** Add a `Reporting-Endpoints` and `report-to` collector (hosted, or a cheap sampled same-origin endpoint), so CSP regressions like today's prefetch error are seen without a console.
6. **Structured server errors.** Add `instrumentation.ts` `onRequestError` logging through the structured logger (`error-handling-12`). This is a small code change for a later round.

### Checks the owner needs to run, signed in

Inspectors could not sign in to production, so the owner should do these:

1. **Console check.** Open Settings > Policies, Profile, Help and any admin page with the browser console open, and confirm the cross-host prefetch violations (before and after Groups 5 and 6).
2. **Admin sign-out and sign-in.** Sign out of the owner console and sign back in at `admin.linkar.in/login`, in Chrome and Safari.
3. **Backup authenticator.** Enroll a backup authenticator and verify with it at AAL1 (after Group 6).
4. **Owner console flows.** Try contact export, and "pause all automations" on a test workspace with several automations.
5. **Read-only database checks.**
   - Row counts for AutomationExecution, OutboundDelivery, AutomationContact and WebhookEvent.
   - Any stored automations with regex-mode keywords or more than 50 keywords. Run this before Group 1 ships, so the caps do not surprise anyone.
6. **Dokploy settings.** Confirm the service healthcheck, the replica count, the stop grace period, the volumes, and the CPU and memory limits.
7. **Production DATABASE_URL.** Confirm its `connection_limit` and `pool_timeout`.

---

## 10. What each inspector covered, and what it could not

| Inspector | Covered | Could not cover |
|---|---|---|
| client-network | Every client file that calls the network (38 files and the client caches). Every interval, timeout, focus and visibility listener. The onboarding flow end to end with the app shell redirect. Admin consoles and the palette. Every Link and palette href against the host redirects and the CSP. Playwright against dev-preview with forced 502s and hangs: inbox, broadcasts, dashboard focus, contacts reconcile, builder photo field. Four production HEAD or GET probes. | Real signed-in onboarding and admin flows. Production-only Link prefetch (inferred from the docs plus the redirect probes). The exact source of the 18 requests: no HAR and no server log. Whether handlers stop when the client aborts. |
| csp-cross-origin | The effective CSP derived from code and matched against 9 production responses. Every cross-host Link, router push, server redirect, form POST and redirect origin, fetch target, img and next/image source, and Razorpay host. Local Playwright on the sign-in and signed-out redirects (no violations). Local Chromium repros of `form-action` and `connect-src` blocking redirects. | Signed-in production pages. The real admin console locally (needs the owner plus TOTP). Prefetch violations in dev (production builds only). Opening Razorpay checkout (needs a test key). Firefox and Safari. The hosts of Instagram GIF and sticker attachments. |
| server-cpu-memory | Image optimizer internals (sharp concurrency, timeout, fallback, cache, internal route fetch) with local encode timing. About 15 production probes of edge caching. OG images, llms.txt, avatar routes, exports and module caches (all bounded). Crypto and compression on request paths. Dynamic RegExp. The real `validateFlowDefinition` and `matchesTrigger` under tsx. | Production CPU count and memory limit. Cloudflare cache rules. Dokploy volumes (inferred from the Dockerfile). Real data volumes and keyword counts. A load test of concurrent encodes. Anything that writes: the local `.env.local` points at a Supabase pooler that may be production. |
| external-calls | Every outbound call site in src and app with its timeout and error mapping. Redis and supabase-js hang repros against stalled local servers. The Next body-clone code and the BullMQ emit and ready paths. One production GET of `/api/health`. | Production env values (`connection_limit`, `PROVIDER_REQUEST_TIMEOUT_MS`, `TRUSTED_PROXY_HOPS`, `UV_THREADPOOL_SIZE`). Whether Dokploy replaces unhealthy tasks (later confirmed by commit `9e0c08e`). The JWT algorithm (HS256 would make every `getClaims` a network call). Razorpay's webhook timeout. Real latencies. |
| db-queries | All about 99 query sites in `prisma.ts` and every repository method used by the routes. Filters and sorts against the schema and migration indexes. The three-client issue, from the Turbopack build output. EXPLAIN ANALYZE on a scratch Postgres 17 loaded with synthetic data (1M executions, 600k deliveries, 300k contacts, 600k events). Plan shapes are reliable; absolute timings are inflated by the loaded machine. | Production `DATABASE_URL` parameters. The Supavisor pool size. `statement_timeout`. Real row counts. `pg_stat_statements` or slow-query logs. Signed-in runtime behaviour. The worker hot path query by query. |
| error-handling | All 112 route handlers scanned for try/catch, the auth and onboarding routes in detail, the error boundaries, the proxy and session code, every client fetch site, process-level handlers and the health chain. Six production GET or HEAD probes. 10 vitest files, 151 tests, all passing. Two scratch tests reproducing the onboarding loss. | Signed-in and admin flows in a browser. Swarm replace-on-unhealthy behaviour and Traefik routing on the host. Prisma pool and statement timeouts. Worker processor internals. Marketing pages. |
| admin-console | Host routing and redirect loops (none). Every admin page, route, component and library file. AAL2 gating on every page and API. The dev-preview guard (404 in production on every variant). A production probe matrix on the admin host. Playwright on 14 dev-preview admin screens and 5 interactions. Chromium harnesses for `form-action` and the double `data:` QR. | Any signed-in production flow, so real TOTP behaviour, prefetch errors and transaction durations are inferred. EXPLAIN plans (the database may be production, so it was not queried). A production build locally. The worker side of deletions. |
| worker-background | The worker entry, both consumers, health and heartbeat, shutdown, all 8 periodic tasks. Every job's retry options. Deferral and rate limiting. Meta and Facebook error classification. Delivery and execution reconciliation. Every runner's claim and catch paths. The sweeps and the admin deletion processor. Experiments against a throwaway Valkey: the regex bypass, the producer hang, the purge paging bug. | Running the worker locally (`.env.local` may point at production). Dokploy and Swarm settings (restart on unhealthy, stop grace period, limits). Valkey `maxmemory`. The Supabase pool size. Meta's real status codes and throttle durations for 80002 and 80006. Runtime heap data. |
| production-probe | Signed out, GET or HEAD only: 61 page paths and all 109 API GET routes on both hosts, following up to 5 redirects. 530 hops, no 5xx. Latency: total p50 183 ms, p95 543 ms, p99 1,590 ms. One-query routes against routes with no I/O. `/api/health` timing. Playwright on the sign-in, reset, confirm, onboarding and 404 pages, desktop and mobile. `/_next/image` edge cache status. | Anything signed in (the admin-shell prefetch and onboarding PUT behaviour are inferred). POST or PUT endpoints. Load or concurrency tests. Cloudflare dashboard settings. Dokploy config, container limits, real `DATABASE_URL` parameters and server logs. Whether WebP variants are cached at the origin (not tested, to avoid triggering encodes). |
| dev-preview-runtime | Playwright on every dev-preview route at 1440 and 390 px: 58 base URLs and 49 state variants. Console, page errors, failed requests, CSP violations and request counts per page. Overflow scans. Interaction checks: broadcasts hidden and failing, inbox failing, a focus burst, palettes, a slow state at 20 s, admin drawers. HEAD probes confirming the cross-host redirects. No hydration, key or overflow problems found. | Production prefetch (dev only). Real API routes and timeouts (fixtures). The real `/api/onboarding` 502 path. The admin 20 s refresh, which is longer than the 10 s idle window. Browsers other than Chromium. Some table drawers (checked in code only). |

No inspector signed in to production, sent a POST or PUT to production, or changed any account. Scratch scripts and raw results are under the session scratchpad (`inspect/`), outside the repo.

---

## 11. Fixes made

Applied on 16 October 2026 to the working tree of `main`, on top of `e1d9184`. Nothing is committed or pushed. All six groups in section 7 are in, with the deviations noted under each group. No file on the account-restriction list in section 6 was touched, and `package.json` is unchanged, so there is no new dependency.

### Final checks

Run on the whole working tree after the last fix. Nothing failed, so this final pass changed no code.

| Check | Result |
|---|---|
| `npx tsc --noEmit -p .` | Pass |
| `pnpm exec eslint .` | Pass, no warnings |
| `pnpm check:deployment-hygiene` | Pass |
| `pnpm check:branding` | Pass |
| `pnpm check:copy` | Pass |
| `pnpm exec vitest run --testTimeout=60000` | 416 files and 4,106 tests pass on the first run; no reruns needed |
| `pnpm build` | Pass: 219 pages, plus the worker bundle |
| `pnpm check:css-budget` | Pass: `/` 34.6 of 45.0 KB, `/pricing` 24.2 of 34.0 KB |

Group 2 was also checked against a local production build (`next start` with a throwaway Valkey and no database):

- `/api/health/live` answers 200 with `Cache-Control: no-store`.
- `/_next/image` refuses `/api/health`, `/api/health/live`, `/r/<slug>`, a `/brand/` mark and a marketing photo with a query string. Each gets a 400, and none of them sends a Redis command.
- The proof rail portraits ask only for widths 128 and 256. Widths 136 and 3840 are refused.
- With Valkey stopped, and again with Valkey frozen (it accepts connections and never replies), the container healthcheck exits 0 in under 0.1 s. `/api/health` answers 503 with `redis: "error"` in 1.5 s.
- Playwright found 150 marketing images on 158 pages at 1440 and 390 px, none broken.

### Files per group

From `git status` and `git diff --stat`: 96 tracked files changed (6,005 insertions, 601 deletions) and 4 files are new. The line counts below include the new files. The two reports in `docs/ops/` are also new and belong to no group.

**Group 1. Worker regex and keyword safety (H1, M28).** 8 files, +1,308 / -110.

- `src/lib/automation/match.ts`, `src/lib/automation/definition.ts`, `src/lib/automation/campaign-match.ts`, `src/lib/automation/engine.ts`, and the test file next to each.
- Regex mode runs on a linear-time matcher (a Thompson NFA) written into `match.ts`, instead of the `re2js` package proposed in section 7.
  - It ignores case, as before.
  - It supports literals, escapes, classes, groups, alternation, greedy and lazy quantifiers, `^`, `$`, `\b` and `\B`.
  - It refuses lookarounds, backreferences and `\p{...}`. A pattern it cannot compile never matches.
- All regex checks for one event share one work budget (2,000,000 steps, a few tens of milliseconds). Once it runs out, the event's remaining regex keywords count as no match.
- The event text is normalized once and cut to 2,200 characters. Compiled matchers sit in a 2,000-entry LRU. `evaluateTrigger` returns the matched keyword, so `engine.ts` and `campaign-match.ts` no longer rescan.
- Save-time caps in `definition.ts`:
  - 100 characters per keyword, 50 keywords, 100 media ids, and 10 conditions (the conditions cap goes beyond section 7);
  - a regex keyword must compile with the new engine;
  - regex keywords keep their case, so `\D`, `\S`, `\W` and `\B` keep their meaning.
  - Read paths do not re-validate stored definitions.

**Group 2. Origin survival (M1, M2, M3, M4).** 17 files (2 new), +729 / -39.

- New: `app/api/health/live/route.ts` and `scripts/container-healthcheck.test.ts`.
- Changed:
  - `app/api/health/route.ts`, `src/lib/health.ts`, `src/lib/worker-health.ts`, `src/components/marketing/proof-rail.tsx` and `app/r/[slug]/route.ts`, each with its test;
  - `scripts/container-healthcheck.mjs`, `Dockerfile`, `next.config.ts` and `ops/DOKPLOY_DEPLOYMENT.md`;
  - `src/lib/security/route-guard-coverage.test.ts`, which registers the new public route.
- The image's HEALTHCHECK now probes `/api/health/live`, then the worker's new `/live`, with an 8 s timeout. Neither does database or Redis I/O.
- `/api/health` keeps its body and status semantics, and its probes now have deadlines:
  - 5 s for the database, not about 2 s as planned, because an idle `SELECT 1` already takes up to 1.2 s from this host;
  - 2 s for Redis, with `commandTimeout: 1_500` on the health client.
- `next.config.ts`:
  - `localPatterns` limited to `/marketing/**` with no query string;
  - `deviceSizes` [640, 828, 1080, 1200, 1536] and `imageSizes` [64, 128, 256, 384];
  - `imgOptConcurrency: 1` and `proxyClientMaxBodySize: "1mb"`.
- `Dockerfile`: `UV_THREADPOOL_SIZE=8`, not 16 as planned. The pool size also caps parallel sharp encodes, and 8 keeps the peak no higher than before on a host with 4 or more cores.
- Proof rail portraits are now 68 x 68 with no `sizes`, so they emit only the 128 and 256 widths.
- Tracked-link clicks without a client address share one `<link>:anon` limiter bucket instead of skipping the limiter.

**Group 3. Database pool pressure and data correctness (H2 part, M5, M6, M7, M8 part, M9 part, M18 server half).** 18 files (2 new), +1,062 / -176.

- New: `prisma/migrations/20261016120000_automation_contact_instagram_account_index/migration.sql` and `prisma/migrations/20261016120100_outbound_delivery_instagram_account_index/migration.sql`.
- Changed:
  - `src/lib/prisma.ts`, `src/lib/repository.ts`, `src/lib/memory-repository.ts` and `prisma/schema.prisma`;
  - `app/api/contacts/route.ts`, `app/api/broadcasts/route.ts`, `app/api/onboarding/route.ts` and `app/api/insights/route.ts`, each with its test;
  - `src/components/contacts-screen.tsx` and its test;
  - `src/lib/worker-database-url.ts` and `.env.production.example`.
- PrismaClient defaults to `{ maxWait: 5_000, timeout: 15_000 }`. Both data-deletion transactions get `{ maxWait: 10_000, timeout: 60_000 }`, and what they delete is unchanged.
- `@@index([instagramAccountId])` on AutomationContact and OutboundDelivery, each in its own single-statement `CREATE INDEX CONCURRENTLY IF NOT EXISTS` migration.
- Contacts reconciliation:
  - it is one `INSERT ... SELECT FROM unnest(...) ON CONFLICT DO UPDATE` (`reconcileContacts`);
  - it only widens `createdAt` and `lastSeenAt`, never reopens a closed conversation, and leaves `updatedAt` alone;
  - the route has a 15-minute per-workspace cooldown;
  - the Contacts screen skips the POST when the list failed, and records every attempt in sessionStorage.
- Capture times use `emailCapturedAt`, falling back to `updatedAt`.
- Broadcast deliveries go through `ensureOutboundDeliveries`: `createMany` with `skipDuplicates`, then one read per 500. If that throws, the broadcast is cancelled and the month's broadcast is released.
- The onboarding save reads, merges and writes under `SELECT ... FOR UPDATE` (`updateWorkspaceOnboarding`).
- Insights:
  - results are shared for 30 s per workspace and view, and so are loads still in flight;
  - each request keeps at most 6 queries in flight;
  - the per-automation funnel count takes an `automationId` filter.
- The worker pool sizing notes now describe `WORKER_DATABASE_CONNECTIONS` on the session pooler. Defaults are unchanged.

**Group 4. Dependency timeouts and proxy failure modes (M12, M13 part, M16).** 15 files, +660 / -36.

- Changed:
  - `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts` and `src/lib/security/replay-guard.ts`;
  - `proxy.ts`, tested in `src/proxy-auth.test.ts`;
  - `src/lib/auth/google-oauth.ts`, `src/lib/auth/rate-limit.ts`, `src/lib/admin/challenges.ts`, `app/api/meta/webhook/route.ts` and `app/api/facebook/webhook/route.ts`, each with its test.
- Every Supabase call from the server, admin and proxy clients gives up after 8 s, and the proxy's whole session check after 10 s.
- The proxy answers 503 with `Retry-After: 5` when `getClaims` hits a retryable or network failure, or when the access check throws.
  - It sends a small HTML page for documents, JSON for `/api/`, and an empty body for RSC fetches.
  - Only a missing session or a null access result still redirects to `/login`.
- The Google token exchange has a 10 s timeout, mapped to `GoogleOAuthError(..., 0)`.
- The limiter, replay-guard and admin-challenge Redis clients have `commandTimeout: 1_500`. A challenge-store failure answers 503 `challenge_unavailable` instead of a 500.
- Both webhook routes give the enqueue 5 s. On failure they log and answer 503 `{ received: false, retryable: true }`, so Meta redelivers.

**Group 5. Signed-in app client (M17, M18 client half, same-file lows).** 19 files, +1,802 / -145.

- Changed:
  - `src/components/onboarding/onboarding-screen.tsx`, `src/components/onboarding/onboarding-flow.tsx`, `src/lib/onboarding/redirect.ts`, `src/components/app-shell.tsx`, `src/lib/client/workspace-data.ts`, `src/components/dashboard-screen.tsx`, `src/components/inbox/instagram-inbox.tsx` and `src/components/settings-screen.tsx`, each with its test;
  - `src/components/help-screen.tsx`, `src/components/profile-screen.tsx` and `app/not-found.tsx`.
- A failed onboarding load or skip stores a 30-minute deferral for the tab, tied to the signed-in account, and the shell honours it. "Go to Home" and "Skip" no longer bounce back.
- "Try again" cools down from 2 s to 4 s to 8 s, capped at 30 s, with jitter. After 3 failures it shows a calmer message.
- The shell shows its skeleton until the onboarding decision is known, so the dashboard does not fire its calls only to be redirected.
- Onboarding saves go through a queue that merges unsaved answers and retries with backoff (1 s up to 30 s, with jitter). The warning stays until the queue drains.
- The focus refresh reuses a request in flight, runs at most once a minute and skips hidden tabs.
- The inbox backs off from 8 s to 2 minutes on failure, and skips the thread fetch when the list failed.
- When its requests fail, the dashboard keeps connections "unknown" and offers Retry, instead of a "Not connected" alarm.
- Cross-host links in the app shell, Help, Settings, Profile and the 404 page are plain anchors, so nothing is prefetched.
- The Facebook Page picker reads JSON safely, checks `ok` first and shows a readable error. A failed refresh after a successful connect no longer shows as a failure.

**Group 6. Owner console (M21, M22, M23, M8 admin half, same-file lows).** 23 files, +599 / -95.

- Changed:
  - `src/lib/security/headers.ts`, `app/login/page.tsx`, `src/components/auth/login-screen.tsx`, `src/components/admin/admin-shell.tsx`, `src/components/command-palette-items.ts`, `src/components/admin/admin-security-screen.tsx` and `src/components/admin/operations/operation-actions.tsx`, each with its test;
  - `src/lib/admin/workspace-service.ts`, `src/lib/admin/operations/service.ts`, `src/lib/admin/deletion/impact.ts` and `src/lib/admin/system/usage-reconciliation.ts`, each with its test;
  - `app/api/auth/logout/route.ts`.
- In production, `form-action` is `'self' https://app.linkar.in https://admin.linkar.in`. The two hosts are written into `headers.ts`, and a test keeps them equal to `site-routing.ts`. They are not imported from there because `next.config.ts` loads `headers.ts` in the runtime container, which does not copy `site-routing.ts`.
- Owner-console sign-in:
  - signing out on the admin host returns to `/login?next=%2Fadmin`;
  - on the admin host, `/login` defaults `next` to `/admin` when it is missing or not an `/admin` path;
  - there, "Create an account" and "Forgot your password" are plain anchors.
- "Back to workspace" in the admin shell is a plain anchor. The palette marks "Back to workspace" and "Owner console" as external.
- The security screen lets the owner pick which verified factor to use at AAL1. It uses an auth-js `data:` QR code as it is.
- Contact export downloads the response as a blob through `adminCommandResponse`.
- Bulk admin writes, all with `{ maxWait: 5_000, timeout: 15_000 }` and the same audit payloads:
  - pause-all is one `UPDATE ... RETURNING`;
  - resume is one `UPDATE ... FROM unnest(...)`;
  - broadcast `retry_failed` is one `updateManyAndReturn`.
- `previewWorkspace` gets a 30 s transaction timeout and usage reconciliation 60 s. What they count or delete is unchanged.

### What remains for the owner

Before shipping:

1. **Run the read-only check from section 9 first.** After Group 1, a stored regex keyword never matches if it is longer than 100 characters or uses lookarounds, backreferences or `\p{...}`. Find automations with regex-mode keywords, more than 50 keywords, or keywords over 100 characters, and test their patterns before deploying. Automations over the caps keep running, but must fit when next saved.
2. **Review and commit.** All six groups sit uncommitted in the working tree on `main`. Review the diff, then commit, on a branch if preferred. The account-restriction branch `ban-risk-fixes` shares no files with these groups, but merge its M19 server half in `app/api/broadcasts/route.ts` after Group 3.
3. **Migrations.** The two new index migrations run through `prisma migrate deploy` in the normal release flow. Each one builds its index CONCURRENTLY, in a single statement.

Right after deploying:

4. **Point Dokploy's service healthcheck at `/api/health/live`** for linkar-web, and at `/live` for the worker. Until then, Dokploy's own check still reads the dependencies from `/api/health`, so a database or Redis outage can still replace the only web task.
5. **Run the signed-in checks in section 9:**
   - the console check for cross-host prefetch errors;
   - admin sign-out and sign-in, in Chrome and Safari;
   - a backup authenticator at AAL1;
   - contact export, and pause-all on a test workspace.

Not done in this round (sections 6, 8 and 9):

6. **Account-restriction branch.** Everything listed in section 6:
   - M13 producer and send-limiter timeouts, M14, M15, M19, M20, and M24 to M27;
   - the M9 retry classification for P2024 and P2028;
   - the listed lows.
7. **Owner decisions from section 8:**
   - the async data-deletion purge (H2);
   - M10: the session pooler or co-location, and the proxy access check on prefetches;
   - M11 retention and M9 pool sizing;
   - the Razorpay body cap (M4);
   - consolidating the three Prisma clients (`db-queries-6`);
   - the billing and sign-in lows.
8. **Infrastructure from section 9:**
   - Cloudflare cache and rate rules on `/_next/image*`, and rate rules on `/r/*`, `/api/t/*` and auth POSTs;
   - a second web replica, a persistent image cache volume, and the worker stop grace period;
   - `statement_timeout`, and Valkey `maxmemory` with `noeviction`;
   - external monitoring of `/api/health/live` and `/api/health`.

Small things noticed during the final checks, left as they are:

- The Redis clients in `src/lib` have no `error` listener. While Valkey is down, ioredis prints `[ioredis] Unhandled error event` on every reconnect attempt (seen from the health client in the Group 2 check). It is log noise, not a crash; a no-op listener would quiet it.
- The full vitest run prints jsdom's "Not implemented: navigation" to stderr once. Every test passes.
- esbuild flags `dist/worker.js` at 2.0 MB. It is a size warning only.
- A scratch Redis server from the inspection still listens on port 16697 (pid 16168, started from the session scratchpad). It holds no repo data and can be stopped.
