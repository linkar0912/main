# Razorpay Subscriptions Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user explicitly requested inline execution without subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure workspace-scoped Razorpay subscriptions that activate Linkar's Creator, Growth, and Agency entitlements from verified webhooks.

**Architecture:** A server-authoritative catalog maps Linkar tiers and intervals to environment-specific Razorpay Plan IDs. Focused billing services create subscriptions, verify Checkout and webhook signatures, normalize provider lifecycle events, and transactionally update the existing workspace entitlement; the settings UI only renders state and initiates owner-authorized actions.

**Tech Stack:** Next.js 16.3 Route Handlers, React 19, TypeScript, Prisma 6/PostgreSQL with RLS, Supabase sessions, Razorpay Subscriptions REST API and Checkout.js, Vitest/Testing Library, Coolify/Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-04-razorpay-subscriptions-billing-design.md`

## Global Constraints

- Do not use subagents.
- Read the checked-in Next.js 16.3 documentation under `node_modules/next/dist/docs/` before changing Route Handlers or environment access.
- Prices are inclusive of applicable GST: Creator ₹199/₹1,990, Growth ₹499/₹4,990, Agency ₹999/₹9,990 for monthly/annual billing.
- Only a workspace `OWNER` may mutate billing; authenticated workspace members may read billing state.
- A Checkout callback never grants paid entitlement; only a valid, relevant Razorpay webhook can do so.
- Use exact raw request bytes for webhook verification and `x-razorpay-event-id` for idempotency.
- Never persist raw webhook payloads or log secrets, signatures, authorization headers, or payment instrument data.
- Never keep a database transaction open while calling Razorpay.
- Test and live Razorpay Plan IDs and webhook secrets remain separate environment configuration.
- New Postgres tables must enable RLS and expose no browser-facing policies.

---

### Task 1: Read Framework Guidance and Add the Trusted Billing Catalog

**Files:**
- Create: `src/lib/billing/types.ts`
- Create: `src/lib/billing/catalog.ts`
- Create: `src/lib/billing/catalog.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`

**Interfaces:**
- Produces: `BillingInterval`, `BillingPlanKey`, `BillingCatalogPlan`, `BILLING_PLANS`, `getBillingPlan(key)`, `resolveRazorpayPlanId(key, interval, env)`.
- Produces: `ServerEnv.razorpay` with optional `keyId`, `keySecret`, `webhookSecret`, and six optional provider Plan IDs.

- [ ] **Step 1: Read the relevant Next.js 16.3 guides completely**

Run:

```bash
sed -n '1,240p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
sed -n '1,320p' node_modules/next/dist/docs/01-app/01-getting-started/07-environment-variables.md
sed -n '1,480p' node_modules/next/dist/docs/01-app/03-building-your-application/10-backend-for-frontend.md
sed -n '481,980p' node_modules/next/dist/docs/01-app/03-building-your-application/10-backend-for-frontend.md
sed -n '1,360p' node_modules/next/dist/docs/01-app/03-building-your-application/11-data-security.md
sed -n '361,760p' node_modules/next/dist/docs/01-app/03-building-your-application/11-data-security.md
```

Expected: the route-handler, raw-body, server-only, and runtime environment guidance is read before implementation.

- [ ] **Step 2: Write failing catalog and environment tests**

Add assertions equivalent to:

```ts
expect(BILLING_PLANS.creator).toMatchObject({ monthlyPaise: 19_900, annualPaise: 199_000, monthlyDeliveryLimit: 5_000 });
expect(BILLING_PLANS.growth).toMatchObject({ monthlyPaise: 49_900, annualPaise: 499_000, monthlyDeliveryLimit: 25_000 });
expect(BILLING_PLANS.agency).toMatchObject({ monthlyPaise: 99_900, annualPaise: 999_000, monthlyDeliveryLimit: 50_000 });
expect(getBillingPlan("unknown")).toBeNull();
expect(resolveRazorpayPlanId("creator", "MONTHLY", configuredEnv)).toBe("plan_creator_monthly");
expect(() => resolveRazorpayPlanId("creator", "MONTHLY", emptyEnv)).toThrow("razorpay_plan_not_configured");
```

In `src/lib/env.test.ts`, stub all three Razorpay credentials plus six plan IDs and assert they are returned only inside `getServerEnv().razorpay`. Also assert a partial production configuration throws `RAZORPAY billing configuration must be complete in production`.

- [ ] **Step 3: Run the focused tests and verify RED**

Run: `pnpm vitest run src/lib/billing/catalog.test.ts src/lib/env.test.ts`

Expected: FAIL because the billing modules and Razorpay environment shape do not exist.

- [ ] **Step 4: Implement catalog types and exact launch values**

Define:

```ts
export type BillingInterval = "MONTHLY" | "ANNUAL";
export type BillingPlanKey = "creator" | "growth" | "agency";

export type BillingCatalogPlan = {
  key: BillingPlanKey;
  name: string;
  monthlyPaise: number;
  annualPaise: number;
  memberLimit: number;
  automationLimit: number;
  instagramConnectionLimit: number;
  facebookConnectionLimit: number;
  sequenceLimit: number;
  monthlyBroadcastLimit: number;
  monthlyDeliveryLimit: number;
  features: readonly string[];
};
```

Use exact plan values from the spec. `getBillingPlan` accepts `unknown` and returns `BillingCatalogPlan | null`. `resolveRazorpayPlanId` selects only one of the six trusted IDs from `ServerEnv.razorpay.planIds` and throws the stable code `razorpay_plan_not_configured` when missing.

- [ ] **Step 5: Add fail-fast environment parsing and examples**

Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and the six Plan ID variables to both example env files with empty values. Production accepts either no Razorpay values (billing unavailable) or a complete set; it rejects partial configuration. Never use a `NEXT_PUBLIC_` secret.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm vitest run src/lib/billing/catalog.test.ts src/lib/env.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the catalog boundary**

```bash
git add src/lib/billing/types.ts src/lib/billing/catalog.ts src/lib/billing/catalog.test.ts src/lib/env.ts src/lib/env.test.ts .env.example .env.production.example
git commit -m "feat: add trusted Linkar billing catalog"
```

### Task 2: Add Billing Persistence and Paid Entitlement Definitions

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260904190000_razorpay_billing/migration.sql`
- Modify: `prisma/seed.ts`
- Create: `src/lib/billing/schema.test.ts`

**Interfaces:**
- Produces Prisma models `BillingSubscription`, `BillingCheckoutAttempt`, `BillingWebhookEvent` and enums `BillingInterval`, `BillingSubscriptionStatus`, `BillingCheckoutState`, `BillingWebhookState`.
- Produces stable `PlanDefinition` IDs `plan_creator`, `plan_growth`, and `plan_agency` alongside the existing `plan_free`.

- [ ] **Step 1: Write a failing schema contract test**

Read `prisma/schema.prisma` and the new migration as text, then assert:

```ts
expect(schema).toContain("model BillingSubscription");
expect(schema).toContain("workspaceId String @unique");
expect(migration).toContain('ALTER TABLE "BillingSubscription" ENABLE ROW LEVEL SECURITY');
expect(migration).toContain("'plan_creator', 'creator', 'Creator'");
expect(migration).toContain("'plan_growth', 'growth', 'Growth'");
expect(migration).toContain("'plan_agency', 'agency', 'Agency'");
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `pnpm vitest run src/lib/billing/schema.test.ts`

Expected: FAIL because the models and migration do not exist.

- [ ] **Step 3: Add Prisma enums, relations, and indexed models**

Use a canonical one-subscription-per-workspace model. Required uniqueness/indexes are:

```prisma
model BillingSubscription {
  id                     String                    @id
  workspaceId            String                    @unique
  planId                 String
  interval               BillingInterval
  providerSubscriptionId String?                   @unique
  providerCustomerId     String?
  providerPlanId         String
  status                 BillingSubscriptionStatus @default(CREATED)
  providerStatus         String
  checkoutVerifiedAt     DateTime?
  currentPeriodStart     DateTime?
  currentPeriodEnd       DateTime?
  cancelAtPeriodEnd      Boolean                   @default(false)
  pendingPlanId          String?
  pendingInterval        BillingInterval?
  lastProviderEventAt    DateTime?
  lastProviderEventId    String?
  createdAt              DateTime                  @default(now())
  updatedAt              DateTime                  @updatedAt
  workspace              Workspace                 @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  plan                   PlanDefinition            @relation(fields: [planId], references: [id])

  @@index([status, currentPeriodEnd])
  @@index([planId])
}
```

Add focused checkout-attempt and webhook-event models with the fields from the spec. Index checkout attempts on `[workspaceId, state, expiresAt]` and webhook events on `[entityId, providerCreatedAt]` plus `[state, receivedAt]`.

- [ ] **Step 4: Write migration SQL with constraints, indexes, RLS, and plan upserts**

The migration must add nonnegative limit checks and upsert these definitions:

```sql
('plan_free', 'free', 'Free', 1, 5, 1, 1, 0, 0, 1000, false, false, false, false, true, false),
('plan_creator', 'creator', 'Creator', 2, 20, 2, 2, 10, 0, 5000, true, false, true, true, true, false),
('plan_growth', 'growth', 'Growth', 5, 50, 5, 5, 25, 10, 25000, true, true, true, true, true, true),
('plan_agency', 'agency', 'Agency', 10, 100, 10, 10, 50, 25, 50000, true, true, true, true, true, true)
```

Use `INSERT ... ON CONFLICT ("key") DO UPDATE` so existing Free workspaces keep their entitlement relation while receiving the new generous limits. Enable RLS on all three billing tables and create no policies.

- [ ] **Step 5: Update the development seed to upsert all plan definitions**

Extract the same exact feature values into `prisma/seed.ts`, upsert plans before the demo workspace, and upsert `WorkspaceEntitlement` for the demo workspace without overwriting an explicitly selected paid plan.

- [ ] **Step 6: Validate schema and verify GREEN**

Run:

```bash
pnpm prisma validate
pnpm prisma generate
pnpm vitest run src/lib/billing/schema.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit billing persistence**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/lib/billing/schema.test.ts
git commit -m "feat: persist Razorpay billing state"
```

### Task 3: Implement Cryptographic Verification and the Razorpay Client

**Files:**
- Create: `src/lib/billing/signatures.ts`
- Create: `src/lib/billing/signatures.test.ts`
- Create: `src/lib/billing/razorpay-client.ts`
- Create: `src/lib/billing/razorpay-client.test.ts`

**Interfaces:**
- Produces: `verifyCheckoutSignature({ paymentId, subscriptionId, signature, secret }): boolean`.
- Produces: `verifyWebhookSignature({ rawBody, signature, secret }): boolean`.
- Produces: `RazorpayClient` with `createSubscription`, `updateSubscription`, and `cancelSubscription`.
- Produces: `RazorpayError` with safe `code`, `status`, and `retryable` fields.

- [ ] **Step 1: Write failing signature tests**

Use Node `createHmac` in the test only to create known valid signatures. Assert valid signatures pass, one-character mutations fail, malformed hex fails without throwing, and Checkout uses exactly `paymentId|subscriptionId`.

- [ ] **Step 2: Run signature tests and verify RED**

Run: `pnpm vitest run src/lib/billing/signatures.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement constant-time verification**

Hash with `createHmac("sha256", secret)`, validate that the received signature is exactly 64 lowercase/uppercase hex characters, convert both values to `Buffer`, compare equal lengths, and call `timingSafeEqual`. Accept the webhook body as `Buffer`, never parsed JSON or reconstructed text.

- [ ] **Step 4: Verify signature tests GREEN**

Run: `pnpm vitest run src/lib/billing/signatures.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing Razorpay client tests**

Mock `fetch` and assert:

```ts
expect(fetch).toHaveBeenCalledWith("https://api.razorpay.com/v1/subscriptions", expect.objectContaining({
  method: "POST",
  headers: expect.objectContaining({ authorization: `Basic ${expectedBasicAuth}` }),
  body: JSON.stringify({ plan_id: "plan_creator_monthly", total_count: 120, customer_notify: 1, notes: { workspace_id: "ws_1", attempt_id: "attempt_1" } }),
}));
```

Also assert non-2xx responses expose only `razorpay_request_failed`, HTTP status, and retryability; the provider body and credentials must not appear in the thrown message.

- [ ] **Step 6: Implement the server-only client**

Add `import "server-only"`; inject `fetch` and timeout for tests; use an `AbortController`; set JSON and Basic authorization headers; parse only the fields Linkar consumes. Use:

```ts
type CreateSubscriptionInput = {
  planId: string;
  totalCount: number;
  workspaceId: string;
  attemptId: string;
};
```

`updateSubscription` sends `{ plan_id, schedule_change_at: "cycle_end", customer_notify: 1 }`. `cancelSubscription` sends `{ cancel_at_cycle_end: 1 }`.

- [ ] **Step 7: Run the billing security/client tests**

Run: `pnpm vitest run src/lib/billing/signatures.test.ts src/lib/billing/razorpay-client.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the provider boundary**

```bash
git add src/lib/billing/signatures.ts src/lib/billing/signatures.test.ts src/lib/billing/razorpay-client.ts src/lib/billing/razorpay-client.test.ts
git commit -m "feat: add secure Razorpay provider client"
```

### Task 4: Build the Billing Repository and Checkout Service

**Files:**
- Create: `src/lib/billing/repository.ts`
- Create: `src/lib/billing/repository.test.ts`
- Create: `src/lib/billing/service.ts`
- Create: `src/lib/billing/service.test.ts`
- Create: `src/lib/billing/authorization.ts`
- Create: `src/lib/billing/authorization.test.ts`

**Interfaces:**
- Produces: `BillingRepository` and `createPrismaBillingRepository(client)`.
- Produces: `requireBillingReader(request)` and `requireBillingOwner(request)`.
- Produces: `createBillingService({ repository, provider, env, now })` with `getBillingView`, `createCheckout`, `verifyCheckout`, `schedulePlanChange`, and `cancelAtCycleEnd`.

- [ ] **Step 1: Write failing authorization tests**

Mock `getValidatedSession` and `getRepository().getMemberRole`. Assert unauthenticated returns 401, a member can read, only `OWNER` can mutate, and `ADMIN` receives 403 for mutation.

- [ ] **Step 2: Run authorization tests and verify RED**

Run: `pnpm vitest run src/lib/billing/authorization.test.ts`

Expected: FAIL because billing guards do not exist.

- [ ] **Step 3: Implement focused read/owner guards**

Return discriminated unions containing `session`, `role`, or a `NextResponse`. Do not duplicate session parsing inside individual routes.

- [ ] **Step 4: Write failing repository/service tests**

Cover:

- billing view joins entitlement, current usage, and canonical subscription;
- first checkout creates an attempt, calls Razorpay outside the repository transaction, and persists the provider subscription ID;
- a repeated checkout within the expiry window reuses the `READY` attempt;
- a concurrent request that finds `CREATING` returns `{ status: "processing" }` and does not call Razorpay;
- a provider failure marks the attempt `FAILED` with only a sanitized code;
- a valid Checkout signature sets `checkoutVerifiedAt` but never calls the entitlement update method;
- change-plan and cancellation call the provider then record only pending state until a webhook arrives;
- checkout creation, plan changes, and cancellation append sanitized `AdminAuditEvent` records through an injected audit function.

- [ ] **Step 5: Run service tests and verify RED**

Run: `pnpm vitest run src/lib/billing/repository.test.ts src/lib/billing/service.test.ts`

Expected: FAIL because repository and service do not exist.

- [ ] **Step 6: Implement repository transactions and checkout orchestration**

Use Prisma Serializable transactions for attempt claiming. The claim operation returns one of:

```ts
type CheckoutClaim =
  | { kind: "create"; attemptId: string }
  | { kind: "reuse"; attemptId: string; subscriptionId: string }
  | { kind: "processing"; attemptId: string };
```

Expire stale attempts before claiming. Do not call `RazorpayClient` inside a Prisma transaction. Store 120 cycles for monthly and 10 cycles for annual subscriptions. Put only workspace and attempt IDs in provider notes.

- [ ] **Step 7: Implement billing view and owner mutations**

`getBillingView` returns the trusted public catalog, effective entitlement, current month `deliveriesReserved`, subscription dates/status, owner capability, and `billingConfigured`. It never returns provider secrets or private Plan IDs.

`schedulePlanChange` validates that the subscription is active, resolves the trusted target Plan ID, requests a cycle-end update, then records `pendingPlanId` and `pendingInterval`. `cancelAtCycleEnd` requests provider cancellation and records `cancelAtPeriodEnd=true`.

Use the existing `appendAdminAuditEvent` redaction path for owner mutations. Generate a request ID per mutation, use the authenticated user as actor, set `targetType` to `billing_subscription`, and include only plan keys, intervals, normalized states, and provider entity IDs in before/after values.

- [ ] **Step 8: Verify repository/service tests GREEN**

Run: `pnpm vitest run src/lib/billing/authorization.test.ts src/lib/billing/repository.test.ts src/lib/billing/service.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the billing domain service**

```bash
git add src/lib/billing/authorization.ts src/lib/billing/authorization.test.ts src/lib/billing/repository.ts src/lib/billing/repository.test.ts src/lib/billing/service.ts src/lib/billing/service.test.ts
git commit -m "feat: orchestrate workspace subscriptions"
```

### Task 5: Add Checkout, Change-Plan, and Cancellation Route Handlers

**Files:**
- Create: `app/api/billing/route.ts`
- Create: `app/api/billing/route.test.ts`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/checkout/route.test.ts`
- Create: `app/api/billing/checkout/verify/route.ts`
- Create: `app/api/billing/checkout/verify/route.test.ts`
- Create: `app/api/billing/change-plan/route.ts`
- Create: `app/api/billing/change-plan/route.test.ts`
- Create: `app/api/billing/cancel/route.ts`
- Create: `app/api/billing/cancel/route.test.ts`
- Create: `src/lib/billing/http.ts`

**Interfaces:**
- Consumes the billing guards and service from Task 4.
- Produces stable JSON success/error envelopes for the billing UI.

- [ ] **Step 1: Write failing route tests**

Mock the guards and service. Assert:

- all routes export `runtime = "nodejs"`;
- GET returns the billing view for authenticated members;
- checkout accepts only `{ plan: "creator" | "growth" | "agency", interval: "MONTHLY" | "ANNUAL" }`;
- checkout rejects unknown keys, extra provider IDs, or amounts with 422;
- verification accepts exactly `razorpay_payment_id`, `razorpay_subscription_id`, and `razorpay_signature`;
- owner mutations return 403 for non-owners;
- provider conflicts map to 409 and unavailable configuration maps to 503;
- responses never contain `keySecret`, `webhookSecret`, or private provider error bodies.

- [ ] **Step 2: Run route tests and verify RED**

Run: `pnpm vitest run app/api/billing/**/*.test.ts app/api/billing/route.test.ts`

Expected: FAIL because the handlers do not exist.

- [ ] **Step 3: Implement strict request schemas and error mapping**

Use strict Zod schemas:

```ts
const CheckoutSchema = z.object({
  plan: z.enum(["creator", "growth", "agency"]),
  interval: z.enum(["MONTHLY", "ANNUAL"]),
}).strict();
```

Return stable errors such as `invalid_request`, `billing_not_configured`, `subscription_conflict`, `provider_unavailable`, and `invalid_checkout_signature`. Do not serialize thrown errors.

- [ ] **Step 4: Implement all five Node runtime handlers**

Instantiate the production repository/provider/service through a small singleton getter in `src/lib/billing/service.ts`. Parse JSON with `.catch(() => null)`, apply the guard before service calls, and return cache-control `private, no-store` for billing state.

- [ ] **Step 5: Verify route tests GREEN**

Run: `pnpm vitest run app/api/billing/**/*.test.ts app/api/billing/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit owner billing APIs**

```bash
git add app/api/billing src/lib/billing/http.ts src/lib/billing/service.ts
git commit -m "feat: expose owner billing APIs"
```

### Task 6: Process Razorpay Webhooks and Apply Entitlements

**Files:**
- Create: `src/lib/billing/webhook.ts`
- Create: `src/lib/billing/webhook.test.ts`
- Create: `app/api/razorpay/webhook/route.ts`
- Create: `app/api/razorpay/webhook/route.test.ts`
- Modify: `src/lib/entitlements/service.ts`
- Modify: `src/lib/entitlements/service.test.ts`

**Interfaces:**
- Produces: `normalizeRazorpaySubscriptionEvent(payload)`.
- Produces: `processRazorpayWebhook({ eventId, rawBody, signature })`.
- Adds `invalidateWorkspace(workspaceId)` to the entitlement service so a webhook transition is visible immediately.

- [ ] **Step 1: Write failing webhook normalization and lifecycle tests**

Use minimal representative payload fixtures for `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.paused`, `subscription.cancelled`, `subscription.completed`, and `subscription.expired`.

Assert:

- authenticated records state without granting paid access;
- activated/charged map the provider Plan ID back to the trusted Linkar plan and update entitlement atomically;
- terminal states downgrade to `plan_free` only when `currentPeriodEnd <= now`;
- pending/paused retain paid access only through the paid-through timestamp;
- duplicate event IDs return `duplicate` without side effects;
- older events and lower lexical event IDs at equal timestamps return `stale`;
- unknown event types return `ignored` with HTTP success;
- raw payloads are never passed to the event persistence method.

- [ ] **Step 2: Run webhook tests and verify RED**

Run: `pnpm vitest run src/lib/billing/webhook.test.ts app/api/razorpay/webhook/route.test.ts`

Expected: FAIL because webhook processing does not exist.

- [ ] **Step 3: Implement strict event normalization**

Parse JSON only after signature verification. Extract only event ID/header, event name, provider timestamp, subscription ID, provider Plan ID, provider status, customer ID, current start/end, paid count, and remaining count. Reject malformed relevant events with `invalid_webhook_payload` and do not persist the body.

- [ ] **Step 4: Implement idempotent transactional application**

In a Serializable transaction:

1. insert `BillingWebhookEvent` as `RECEIVED`, returning duplicate when the unique event ID already exists;
2. load the canonical subscription by provider subscription ID or reconcile it through the checkout attempt ID in provider notes;
3. compare `(providerCreatedAt, eventId)` with the last applied tuple;
4. update subscription and `WorkspaceEntitlement` together when the lifecycle rule requires it;
5. mark the event `PROCESSED` or `IGNORED` and append a sanitized audit event.

After commit, call `getEntitlementService().invalidateWorkspace(workspaceId)`.

- [ ] **Step 5: Implement the raw-body webhook route**

The route must do this ordering:

```ts
const rawBody = Buffer.from(await request.arrayBuffer());
const signature = request.headers.get("x-razorpay-signature") ?? "";
const eventId = request.headers.get("x-razorpay-event-id") ?? "";
```

Reject missing IDs/signatures with 400, invalid signatures with 401, relevant malformed payloads with 400, and accepted/duplicate/ignored events with 200 so Razorpay does not retry harmless events.

- [ ] **Step 6: Add entitlement cache invalidation**

Expose `invalidateWorkspace(workspaceId: string): void` from `createEntitlementService`, deleting only that workspace's cache entry. Add a test that a second read after invalidation observes the repository's new plan.

- [ ] **Step 7: Verify webhook and entitlement tests GREEN**

Run:

```bash
pnpm vitest run src/lib/billing/webhook.test.ts app/api/razorpay/webhook/route.test.ts src/lib/entitlements/service.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit webhook-authoritative entitlements**

```bash
git add src/lib/billing/webhook.ts src/lib/billing/webhook.test.ts app/api/razorpay/webhook src/lib/entitlements/service.ts src/lib/entitlements/service.test.ts
git commit -m "feat: activate plans from Razorpay webhooks"
```

### Task 7: Add the Billing Settings Experience and Razorpay Checkout

**Files:**
- Create: `src/components/billing-settings.tsx`
- Create: `src/components/billing-settings.test.tsx`
- Create: `src/lib/client/razorpay-checkout.ts`
- Create: `src/lib/client/razorpay-checkout.test.ts`
- Modify: `src/components/settings-screen.tsx`
- Modify: `src/components/settings-screen.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes `GET /api/billing` and owner mutation routes.
- Produces `BillingSettings`, a focused component mounted by the existing settings screen.
- Produces `openRazorpaySubscriptionCheckout(options)` that lazily loads the official Checkout script once.

- [ ] **Step 1: Write failing Checkout-loader tests**

In jsdom, assert the loader adds exactly one `https://checkout.razorpay.com/v1/checkout.js` script, resolves concurrent callers from the same promise, opens Checkout with `key`, `subscription_id`, `name: "Linkar"`, and passes the successful response to the verifier callback. Assert script errors reject as `checkout_unavailable`.

- [ ] **Step 2: Run loader tests and verify RED**

Run: `pnpm vitest run src/lib/client/razorpay-checkout.test.ts`

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement the isolated Checkout adapter**

Define the narrow browser global instead of importing a broad third-party SDK type. Set `modal.ondismiss` to return a dismissed outcome, and never send a secret, amount, or provider Plan ID from browser-owned state.

- [ ] **Step 4: Write failing billing component tests**

Assert the component:

- displays ₹0, ₹199, ₹499, and ₹999 in monthly mode;
- displays ₹1,990, ₹4,990, and ₹9,990 in annual mode with `2 months free`;
- shows the exact delivery, automation, connection, and seat limits;
- disables financial actions for non-owners and explains why;
- shows current usage and renewal/paid-through date;
- opens Checkout from a successful checkout response;
- posts the Checkout result to `/api/billing/checkout/verify`;
- polls `/api/billing` only while activation is processing and stops on unmount;
- renders provider failure, scheduled cancellation, and unsupported plan-change messages;
- confirms cancellation in Linkar's UI before calling the cancellation endpoint.

- [ ] **Step 5: Run component tests and verify RED**

Run: `pnpm vitest run src/components/billing-settings.test.tsx src/components/settings-screen.test.tsx`

Expected: FAIL because the Billing section does not exist.

- [ ] **Step 6: Implement `BillingSettings` and mount it in Settings**

Add a `CreditCard` settings navigation item and extend the section union with `"billing"`. Keep all billing fetch/action state inside `BillingSettings` so the already-large settings screen does not absorb provider logic. Use accessible buttons, status regions, a fieldset for billing interval, and semantic plan headings.

- [ ] **Step 7: Add responsive styles using existing design tokens**

Create billing-prefixed classes only. At desktop widths use a four-card grid; collapse to two and then one column at existing breakpoints. Preserve focus-visible styles, minimum touch targets, and readable status contrast.

- [ ] **Step 8: Verify UI tests GREEN**

Run: `pnpm vitest run src/lib/client/razorpay-checkout.test.ts src/components/billing-settings.test.tsx src/components/settings-screen.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit the billing experience**

```bash
git add src/components/billing-settings.tsx src/components/billing-settings.test.tsx src/lib/client/razorpay-checkout.ts src/lib/client/razorpay-checkout.test.ts src/components/settings-screen.tsx src/components/settings-screen.test.tsx app/globals.css
git commit -m "feat: add workspace billing settings"
```

### Task 8: Configure Razorpay Plans, Webhooks, and Deployment Documentation

**Files:**
- Modify: `docker-compose.production.yml`
- Modify: `ops/COOLIFY_DEPLOYMENT.md`
- Modify: `README.md`
- Create: `scripts/verify-billing-config.mjs`
- Create: `scripts/verify-billing-config.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm preflight:billing` for non-secret configuration validation.
- Produces a documented mapping from the six Linkar catalog entries to test/live Razorpay Plan IDs.

- [ ] **Step 1: Write the failing preflight test**

Pass a complete fake environment and assert exit 0. Remove each required variable in turn and assert a named failure. Assert no command output contains the fake key secret or webhook secret.

- [ ] **Step 2: Run the preflight test and verify RED**

Run: `pnpm vitest run scripts/verify-billing-config.test.ts`

Expected: FAIL because the preflight script does not exist.

- [ ] **Step 3: Implement configuration preflight and compose passthrough**

The script checks credential completeness, six non-empty Plan IDs beginning with `plan_`, HTTPS `APP_URL` in production, and exact `https://app.linkar.in/api/razorpay/webhook` derivation. It prints only variable names and safe IDs, never secret values. Add `preflight:billing` to package scripts and pass the ten billing variables into the web container without defaults.

- [ ] **Step 4: Document operator steps exactly**

Document:

- six test and six live Razorpay Plans with INR paise amounts `19900`, `199000`, `49900`, `499000`, `99900`, `999000`;
- period `monthly` or `yearly`, interval `1`;
- webhook URL `https://app.linkar.in/api/razorpay/webhook`;
- subscribed events: authenticated, activated, charged, pending, halted, paused, resumed, cancelled, completed, and expired subscription events;
- secret entry in Coolify, migration deployment, rollback behavior, and a controlled live purchase checklist.

- [ ] **Step 5: Create test-mode and live-mode Plans in Razorpay Dashboard**

Before each final `Create Plan` action, verify the name, amount, currency, period, and interval on screen. Record only the resulting `plan_...` IDs in the appropriate secure deployment configuration; never copy the API secret into the repository or conversation.

- [ ] **Step 6: Configure the live webhook**

Generate a high-entropy webhook secret outside the repository, save it directly in Razorpay and Coolify, select the documented events, and leave the final save enabled only after the deployed endpoint exists.

- [ ] **Step 7: Verify configuration tests GREEN**

Run:

```bash
pnpm vitest run scripts/verify-billing-config.test.ts
pnpm preflight:billing
pnpm check:compose
```

Expected: tests pass; preflight reports either a complete safe mapping or a precise list of still-unset variable names; compose validation exits 0.

- [ ] **Step 8: Commit deployment support**

```bash
git add docker-compose.production.yml ops/COOLIFY_DEPLOYMENT.md README.md scripts/verify-billing-config.mjs scripts/verify-billing-config.test.ts package.json
git commit -m "docs: add Razorpay billing operations"
```

### Task 9: Full Verification, Deployment, and Controlled Live Validation

**Files:**
- Modify only files required by failures directly caused by Tasks 1-8.

**Interfaces:**
- Consumes the complete implementation.
- Produces fresh evidence for merge and deployment readiness.

- [ ] **Step 1: Run all focused billing tests**

Run:

```bash
pnpm vitest run src/lib/billing src/lib/client/razorpay-checkout.test.ts src/components/billing-settings.test.tsx app/api/billing app/api/razorpay/webhook/route.test.ts scripts/verify-billing-config.test.ts
```

Expected: 0 failed tests.

- [ ] **Step 2: Run repository-wide static and unit verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all commands exit 0 with zero failures.

- [ ] **Step 3: Validate migration and production packaging**

Run:

```bash
pnpm prisma validate
pnpm prisma generate
pnpm check:compose
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 4: Review the complete diff for security and scope**

Run:

```bash
git status --short
git diff --check HEAD~8..HEAD
git diff --stat HEAD~8..HEAD
rg -n 'rzp_(test|live)_[A-Za-z0-9]+|RAZORPAY_KEY_SECRET=.+|RAZORPAY_WEBHOOK_SECRET=.+' --glob '!node_modules' --glob '!.git' .
```

Expected: only intended files changed, no whitespace errors, and the secret scan returns no committed values.

- [ ] **Step 5: Deploy the migration and application**

Use the repository's documented Coolify flow: set secure environment variables, run `pnpm db:migrate:deploy`, deploy the web/worker image, and verify `https://app.linkar.in/api/health` before enabling the webhook.

- [ ] **Step 6: Exercise Razorpay test mode end to end**

Create one test subscription, complete Checkout with Razorpay test credentials, confirm the callback remains `processing`, deliver the signed webhook, and verify exactly one billing event, one entitlement transition, correct renewal date, duplicate-event safety, scheduled cancellation, and Free fallback after a terminal paid-through state.

- [ ] **Step 7: Perform one controlled live subscription**

Use an owner-controlled Linkar workspace and the cheapest paid tier. This step is a real financial transaction and requires the user's explicit confirmation immediately before opening and completing live Checkout. Verify Razorpay, database state, audit entry, entitlement, and UI, then schedule cancellation if the user does not want the subscription retained.

- [ ] **Step 8: Commit any verification-only fixes**

```bash
git add -u
git commit -m "fix: complete Razorpay billing verification"
```

Skip this commit when verification required no fixes.
