# Linkar audit  -  2 October 2026

Audited commit: `82a35e6421f7527fc09b3729a2c5d4270dff9464`.

The audit found **16 actionable findings**, including one grouped dependency finding covering **12 advisory records**. Passing tests do not establish that the application is ready for production: real library validation, browser security policy, billing lifecycle checks, and outbound-request protections have gaps.

This was a repository audit with isolated local runtime checks. No production database migrations, account creation, payment, messages to customers, deletion, deployment, or application fixes were performed. Only this report and its evidence were added. The findings below distinguish reproduced behavior, code-path findings, and conditional dependency alerts. This audit does not claim to prove the absence of other bugs or to validate live service configuration.

## Verification completed

| Check | Result |
|---|---|
| `pnpm test` | 292 files; 1,561 tests passed |
| `pnpm lint` | Passed, exit 0 |
| `pnpm typecheck` | Passed, exit 0 |
| `pnpm build` | Next.js production build and worker bundle passed |
| Branding, customer copy, deployment hygiene scripts | All passed |
| Temporary targeted audit harness | 13 cases passed, reproducing the faulty behaviors described below |
| Isolated browser checks | Public pages, missing page gates, demo access, and Checkout CSP checked with headless installed Chrome |
| Runtime analytics check | Restarted the same build with a synthetic GA ID; compared static and dynamic pages |
| `pnpm audit --json` | Failed with 3 critical, 7 high, 2 moderate advisory records |
| Full authenticated Playwright suite | Not run: setup deploys migrations and creates/confirms a user against configured external services |

Node: 24.14.1. pnpm: 11.19.0. Next.js: 16.3.1. The framework Proxy and environment-variable guides were read from the installed package. The available `agent-browser` CLI was absent; installed Chrome was controlled through the repository's Playwright library. No browser downloads were needed.

## Findings

P1 means address before the next production release. P2 means a functional or reliability issue to schedule promptly. Dependency severity is shown separately from application exposure.

### F01  -  P1  -  Dependencies include critical security advisories

**Evidence:** `pnpm audit --json` reported 12 records. Next.js 16.3.1 falls in the affected ranges of three critical advisories. The lockfile also resolves sharp 0.35.3, deepmerge-ts 7.1.5, and affected development dependencies.

| Package / installed version | Advisory | Severity | Reported patched version |
|---|---|---|---|
| next 16.3.1 | [Windows-hosted RCE](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) | Critical | 16.3.3 |
| next 16.3.1 | [AVIF optimization RCE](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4) | Critical | 16.3.3 |
| next 16.3.1 | [next/og ImageResponse RCE](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) | Critical | 16.3.6 |
| sharp 0.35.3 | [libheif vulnerabilities](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) | High | 0.35.4 |
| deepmerge-ts 7.1.5, through Prisma | [Stack exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | High | 8.0.0 |
| js-yaml 4.3.1, development dependency | [Merge-source CPU denial of service](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | High | 4.3.2 |
| brace-expansion 1.1.18 and 5.0.9, development dependencies | [Expansion CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), two version records | Moderate | 1.1.21 / 5.0.12 |
| brace-expansion 1.1.18 and 5.0.9 | [Nested-group stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), two records | High | 1.1.20 / 5.0.11 |
| brace-expansion 1.1.18 and 5.0.9 | [Comma-parser stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), two records | High | 1.1.19 / 5.0.10 |

**Exposure limits:** The Docker deployment is Linux, so the Windows-specific RCE does not apply to that documented deployment. No application `next/og` or `ImageResponse` usage was found. The AVIF advisory requires affected image processing; exploitability through Linkar's actual image sources was not established and no exploit payload was sent. Development parser advisories do not prove a public application attack path. These qualifications do not remove the need to patch the resolved dependencies.

**Fix:** Upgrade Next.js and its matching ESLint package to a release addressing all three advisories, at least 16.3.6 according to the fetched notices. Update the remaining dependency chains, then rerun the audit and application checks. Verify major transitive upgrades with their parent package instead of blindly forcing an incompatible override.

**Files:** [package.json](</Users/tejastelkar/Desktop/Software Projects/linkar/package.json:43>) and [pnpm-lock.yaml](</Users/tejastelkar/Desktop/Software Projects/linkar/pnpm-lock.yaml>).

### F02  -  P1  -  BullMQ rejects broadcast, deletion, and maintenance job IDs

**Files:** [src/lib/queue.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/queue.ts:175>), [src/lib/queue.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/queue.ts:188>), [src/lib/queue.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/queue.ts:461>).

The code supplies `admin-maintenance:usage_reconciliation`, `admin-deletion:<id>`, and `broadcast:<broadcastId>:<accountId>:<recipientId>` as job IDs. Installed BullMQ 6.1.2 rejects these with `Custom Id cannot contain :`. Its compatibility exception allows exactly three colon-separated parts; these IDs have two or four parts.

**Reproduced:** Called the real installed Job validator for all three formats; all threw. Broadcast fan-out therefore rejects every recipient, new permanent deletion jobs cannot enqueue, and admin maintenance commands fail. Deletion creation may already have persisted its job before enqueueing fails. Existing queue tests mock BullMQ and therefore never exercise this validation.

**Fix:** Hash the stable identity or use a colon-free encoding for every custom job ID. Update both creation and lookup paths. Add verification against real BullMQ validation or isolated Redis.

### F03  -  P1  -  CSP blocks Razorpay Checkout

**Files:** [next.config.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/next.config.ts:16>) and [src/lib/client/razorpay-checkout.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/client/razorpay-checkout.ts:30>).

Checkout dynamically loads `https://checkout.razorpay.com/v1/checkout.js`. `script-src` permits only self, inline scripts, and Google Tag Manager. The default policy also gives checkout frames no Razorpay allowance.

**Browser reproduction:** Loading the same script on the production-built pricing page triggered a CSP violation and its error event. No real payment was attempted. The script cannot load, so the customer cannot complete the normal upgrade flow.

**Fix:** Add the narrowly required Razorpay script, frame, connection, and other resource origins, then verify the complete checkout modal against the production CSP. Allowing only the script is insufficient if later resources remain blocked.

### F04  -  P1  -  Second-based Instagram timestamps become 1970 dates

**Files:** [src/lib/meta/webhooks.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/meta/webhooks.ts:120>) and [src/lib/automation/runner.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/runner.ts:225>).

The Instagram normalizer copies `entry.time` / numeric `created_time` unchanged. Downstream code interprets `NormalizedEvent.timestamp` as JavaScript milliseconds. Second-based values are already present in the repository's webhook fixtures. Facebook's normalizer has a seconds-to-milliseconds conversion, but Instagram's does not.

**Reproduced:** Passed a comment payload with `entry.time = Math.floor(Date.now() / 1000)` through normalization and the real classic runner. Its date became 1970; the fresh comment was rejected by the seven-day private-reply guard and no provider send occurred. Schedule matching and date calculations are also affected for such payloads.

**Fix:** Normalize time units at ingestion and test the normalizer-to-runner path with both seconds and milliseconds. Meta's current payload documentation was rate-limited during this audit, so the precise live payload variant still needs confirmation; the handling defect for the accepted second-based payload is reproduced.

### F05  -  P1  -  Conversion callbacks follow unvalidated redirects into private networks

**File:** [app/r/[slug]/route.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/app/r/[slug]/route.ts:105>).

The short-link conversion callback validates its first URL, then uses `fetch` with the default redirect behavior. A public endpoint can return a 307/308 redirect to loopback, an internal service, or a metadata address; fetch follows without calling the safety validator on the new destination.

**Reproduced:** A controlled local fixture representing the approved initial endpoint returned a 307 to a loopback endpoint. The real route callback reached that endpoint; preflight DNS validation ran only once. The initial public endpoint was simulated with a transport/DNS fixture; no external or production service was targeted.

**Fix:** Disable automatic redirects and either reject redirects or validate every redirect target using the same bound-address transport. The lead-webhook sender already uses manual redirects, but it still has F06.

### F06  -  P1  -  DNS validation is separate from the actual connection

**Files:** [src/lib/security/outbound-url.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/security/outbound-url.ts:118>) and [src/lib/automation/lead-delivery.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/lead-delivery.ts:36>); also [app/r/[slug]/route.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/app/r/[slug]/route.ts:105>).

`resolveSafeOutboundTarget` looks up and approves IP addresses but returns the original hostname URL. The subsequent fetch resolves the hostname again. There is no dispatcher or lookup binding the connection to the addresses that were validated.

**Reproduced:** The preflight DNS fixture returned a public IP; the later transport lookup returned loopback. A real local HTTP server received the lead webhook and the delivery was marked SENT. This is a controlled reproduction of the DNS rebinding gap, not a live attack.

**Fix:** Connect only to a validated resolved address through a transport with a bound lookup, while preserving Host and TLS server name. Revalidate and bind every redirect hop. Include a test that changes DNS between validation and connection.

### F07  -  P1  -  Logout-all and password recovery do not immediately revoke Linkar access

**Files:** [app/api/account/route.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/app/api/account/route.ts:105>), [app/api/auth/reset-password/route.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/app/api/auth/reset-password/route.ts:28>), and [src/lib/auth/session.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/auth/session.ts:86>).

Both actions call Supabase global sign-out, but application authorization verifies JWT claims locally and only checks Linkar's existing `sessionInvalidBefore` cutoff. Neither action advances that cutoff or validates that the token's Supabase session still exists.

[Supabase documents](https://supabase.com/docs/reference/javascript/auth-signout) that sign-out revokes refresh tokens while existing access tokens remain valid until expiry. Thus an existing valid cookie/token can continue accessing guarded Linkar endpoints after the user selects logout-all or resets a compromised password, until token expiry. The admin session-revocation action already writes a cutoff, demonstrating that the app has a mechanism for immediate denial.

**Evidence level:** Code-path review plus current official Supabase behavior; no live account session was revoked during the audit.

**Fix:** Advance the application revocation cutoff for these actions or validate server-side session liveness for sensitive operations. Handle sign-out failures instead of always reporting success. Verify with two sessions and an existing unexpired access token.

### F08  -  P1  -  Checkout can create a second active subscription

**Files:** [src/lib/billing/service.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/billing/service.ts:135>), [src/lib/billing/repository.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/billing/repository.ts:84>), and [src/lib/billing/webhook.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/billing/webhook.ts:213>).

Checkout claims only compare unfinished CREATING/READY attempts. There is no server-side guard against an already ACTIVE subscription. Once an earlier attempt is VERIFIED or expires, a new checkout can create another provider subscription. The webhook repository stores one subscription per workspace and overwrites its provider ID, so another live subscription can become unmanageable through this UI.

**Reproduced:** Supplied an ACTIVE existing subscription to the service's repository fixture. Calling createCheckout still invoked provider.createSubscription, without querying the active subscription. The real claim repository also lacks this check. This was a simulated provider call; no money moved.

**Fix:** Atomically reject new subscription creation while a workspace has a live subscription or unresolved authorization. Use the plan-change flow for existing subscribers. Prevent stale/other subscription events from replacing the canonical workspace subscription.

### F09  -  P1  -  Paid-through entitlements have no time-based expiry

**Files:** [src/lib/billing/webhook.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/billing/webhook.ts:145>) and [src/lib/entitlements/repository.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/entitlements/repository.ts:46>).

When cancellation, halt, or pause arrives before `currentPeriodEnd`, the webhook deliberately preserves the current paid plan. Entitlement reads subsequently consult the stored plan and premium invite expiry, but not subscription status or paid-period end. No billing expiry scheduler was found.

**Consequence:** If no later provider event performs a downgrade, a cancelled or halted workspace retains paid features after its paid-through date. Passage of time alone cannot expire the grant.

**Reproduced:** With the stored Creator entitlement and a cancelled subscription whose period ended before the audit date, the entitlement repository returned Creator and never read the subscription.

**Fix:** Model a billing grant's expiry and resolve it during entitlement reads or a reliable reconciliation job. Preserve distinct owner overrides and premium-invite grants. Test time moving past the paid-period end without another webhook.

### F10  -  P2  -  Scheduled sends ignore a teammate's automation pause

**Files:** [src/lib/automation/followup-runner.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/followup-runner.ts:87>), [src/lib/automation/sequence-runner.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/sequence-runner.ts:86>), and [src/lib/automation/broadcast-runner.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/broadcast-runner.ts:80>).

The realtime runner respects `automationsPausedUntil` and paused campaign participants. Follow-ups, sequence steps, and broadcasts check suppression/windows but not those pauses.

**Reproduced:** Set a contact's manual pause 12 hours into the future. Both the real follow-up runner and sequence sweep still called sendDirectMessage. Broadcast has the same omission by code review. A teammate replying in the inbox can therefore be interrupted by previously scheduled automation.

**Fix:** Apply the contact and handoff guards consistently immediately before scheduled sends. Define whether a paused delivery is deferred or suppressed, and verify resume behavior.

### F11  -  P1  -  Delayed inbound messages reopen the manual reply window

**Files:** [src/lib/automation/runner.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/runner.ts:970>) and [app/api/inbox/[contactId]/route.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/app/api/inbox/[contactId]/route.ts:130>).

The runner persists a webhook's `receivedAt` as the processing time rather than the original event timestamp. The manual inbox send endpoint then uses this field to decide whether the 24-hour reply window remains open.

**Reproduced:** Processing a 48-hour-old DM recorded it as received now. The manual send guard therefore treats this delayed first delivery as fresh even though the user's last interaction was outside the window. Inbox ordering also represents processing time rather than the actual conversation time.

**Fix:** Preserve original provider event time separately from ingestion and processing time. Use the original eligible inbound interaction time for reply-window checks, and keep timestamps monotonic when events arrive out of order.

### F12  -  P2  -  Three workspace pages bypass the page session gate

**File:** [src/lib/site-routing.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/site-routing.ts:21>).

`/contacts`, `/insights`, and `/quick-automation` appear in Proxy's matcher but are missing from both the protected-path and app-host path lists. Proxy exits before authentication for these routes.

**Browser reproduction:** An unauthenticated visitor received HTTP 200 and remained on all three pages with the application shell and Unauthorized/load errors. `/dashboard` instead redirected to login. These routes also miss the intended marketing-to-app canonicalization.

**Limit:** Their API handlers still require sessions. This is a page-access and navigation failure; the audit did not demonstrate disclosure of tenant records through these pages.

**Fix:** Keep a single authoritative inventory of app paths used by host routing and the optimistic page gate. Test anonymous navigation to every workspace route.

### F13  -  P2  -  Concurrent contact touches can move timestamps backwards

**File:** [src/lib/prisma.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/prisma.ts:2129>).

The max/min timestamp calculation uses a previously read contact snapshot and writes absolute values. Concurrent events can both read the same old snapshot; the earlier event can commit last and overwrite a newer `lastSeenAt`.

**Reproduced:** Used two identical old snapshots, wrote a 02:00 event and then a 01:00 event through the real Prisma repository implementation. The final stored timestamp was 01:00. The fixture simulated database persistence; no real database write was performed.

**Fix:** Use an atomic database greatest/least update, row locking, or optimistic concurrency with retry. Also preserve the incoming event timestamp after a create-unique collision instead of returning an unchanged existing row.

### F14  -  P2  -  The documented database-free demo cannot open the dashboard

**Files:** [README.md](</Users/tejastelkar/Desktop/Software Projects/linkar/README.md:34>), [proxy.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/proxy.ts:32>), and [app/api/workspace/bootstrap/route.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/app/api/workspace/bootstrap/route.ts>).

The README advertises a dashboard backed by sample data without database or worker configuration. Repository selection does create sample data, but Proxy still requires a Supabase session and bootstrap requires getValidatedSession. There is no demo session path.

**Runtime reproduction:** With database and Redis disabled and no session, dashboard navigation went to login; workspace bootstrap returned 401. Without Supabase configuration, the same path cannot establish the required session. This prevents the documented minimal demo workflow from reaching its sample dashboard.

**Fix:** Either provide an explicitly local-only demo identity/access path, guarded against public production deployment, or correct the setup instructions and product promises to require configured authentication.

### F15  -  P2  -  Runtime GA configuration is absent on statically rendered pages

**Files:** [app/layout.tsx](</Users/tejastelkar/Desktop/Software Projects/linkar/app/layout.tsx:19>), [src/lib/env.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/env.ts:346>), and [Dockerfile](</Users/tejastelkar/Desktop/Software Projects/linkar/Dockerfile:18>).

The root layout reads `GA_MEASUREMENT_ID` from the server environment. Reading a server environment variable does not opt a page into dynamic rendering. Home and pricing are prerendered at build time, whereas login is dynamic. The deployment build supplies no runtime GA ID.

**Runtime reproduction:** Restarted the same production build with a synthetic GA ID. Login included that ID and the gtag loader; homepage and pricing included neither. The comment claiming per-request runtime behavior is inaccurate for these static pages.

**Fix:** Resolve runtime analytics configuration through a dynamic boundary or configuration endpoint, or intentionally supply the ID at build time. Verify the actual deployed home/pricing HTML as well as a dynamic page.

### F16  -  P2  -  Win-back segments select recipients who are guaranteed to fail the send guard

**Files:** [src/lib/prisma.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/prisma.ts:3154>) and [src/lib/automation/broadcast-runner.ts](</Users/tejastelkar/Desktop/Software Projects/linkar/src/lib/automation/broadcast-runner.ts:80>).

`inactive_7d` and `inactive_30d` select contacts whose lastSeenAt is older than seven or thirty days. The runner refuses anyone whose lastSeenAt is older than 24 hours. Unless a new eligible inbound interaction arrives between selection and execution, these advertised win-back broadcasts cannot deliver.

**Evidence:** The existing broadcast test itself verifies WINDOW_CLOSED for an inactive-seven-day recipient. The contradiction remains in the product even after F02 is fixed; currently the queue-ID failure occurs first.

**Fix:** Remove or clearly disable unsupported cold win-back segments. Base deliverable audiences on eligible recent inbound interactions and show eligibility before queueing. Keep the messaging-window protection.

## Recommended order

1. Patch vulnerable dependencies and fix F02–F04: these include security alerts and ordinary flows that are blocked outright.
2. Close both outbound-request bypasses and immediate session revocation gaps (F05–F07).
3. Fix subscription creation and expiry (F08–F09), then verify a complete test-mode billing lifecycle with the production CSP.
4. Repair delayed-send pause/window handling (F10–F11) and timestamp concurrency (F13).
5. Repair page gates, local demo, analytics configuration, and impossible broadcast audiences (F12, F14–F16).

## Coverage limits and evidence

The current Supabase Data API/RLS settings, deployed migrations, live Meta permissions/webhook payloads, Razorpay configuration, Valkey state, worker health, real email delivery, and production UI were not independently validated. The full e2e setup can mutate a configured database and authentication project, so it was not run against those services. No authorization to claim that all external integrations are healthy follows from the passing local checks.

The 13-case audit harness intentionally asserted the observed defective behaviors. It is **evidence, not a regression suite**; its passing result means the bugs were reproduced. It was removed from the active test directory and preserved as plain text below. Some cases use mocked repository/provider state; both outbound-request cases use real local HTTP servers with controlled DNS fixtures.

- [docs/audits/2026-10-02/evidence/unit-tests.txt](</Users/tejastelkar/Desktop/Software Projects/linkar/docs/audits/2026-10-02/evidence/unit-tests.txt>)
- [docs/audits/2026-10-02/evidence/targeted-reproductions.txt](</Users/tejastelkar/Desktop/Software Projects/linkar/docs/audits/2026-10-02/evidence/targeted-reproductions.txt>)
- [docs/audits/2026-10-02/evidence/reproduction-source.ts.txt](</Users/tejastelkar/Desktop/Software Projects/linkar/docs/audits/2026-10-02/evidence/reproduction-source.ts.txt>)
- [docs/audits/2026-10-02/evidence/dependency-audit.json](</Users/tejastelkar/Desktop/Software Projects/linkar/docs/audits/2026-10-02/evidence/dependency-audit.json>)
- [docs/audits/2026-10-02/evidence/runtime-checks.md](</Users/tejastelkar/Desktop/Software Projects/linkar/docs/audits/2026-10-02/evidence/runtime-checks.md>)
