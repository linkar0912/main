# Razorpay Subscriptions Billing Design

**Date:** 2026-09-04

**Status:** Approved in chat for specification

**Owner:** Linkar

## Summary

Linkar will add workspace-scoped paid subscriptions using Razorpay Subscriptions. The implementation will preserve the existing entitlement service as the single authority for product limits, while Razorpay webhooks become the authority for paid subscription state. Checkout callbacks improve the user experience but never grant paid access by themselves.

The launch catalog is deliberately inexpensive and generous:

| Plan | Monthly | Annual | Members | Automations | Instagram | Facebook | Monthly deliveries | Key features |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Free | ₹0 | ₹0 | 1 | 5 | 1 | 1 | 1,000 | Core automations |
| Creator | ₹199 | ₹1,990 | 2 | 20 | 2 | 2 | 5,000 | Sequences and tracked links |
| Growth | ₹499 | ₹4,990 | 5 | 50 | 5 | 5 | 25,000 | Broadcasts and exports |
| Agency | ₹999 | ₹9,990 | 10 | 100 | 10 | 10 | 50,000 | All launch features and 10 seats |

Displayed prices are inclusive of applicable GST. Annual pricing gives two months free compared with monthly billing. Razorpay amounts are always stored and sent in paise.

## Goals

- Let a workspace owner subscribe to Creator, Growth, or Agency monthly or annually.
- Keep Linkar's existing `PlanDefinition` and `WorkspaceEntitlement` system as the enforcement boundary.
- Apply paid entitlements only after a valid, relevant Razorpay webhook.
- Support plan changes, scheduled cancellation, renewal, payment failure, expiry, and re-subscription.
- Make all provider operations idempotent enough for browser retries, webhook retries, and worker restarts.
- Provide a billing page with the current plan, usage, renewal status, available plans, and payment actions.
- Keep secrets server-only and make production configuration auditable.
- Launch first in Razorpay test mode, then repeat the same verified flow in live mode.

## Non-goals

- Usage-based overage billing.
- Per-seat pricing.
- Coupons, founder discounts, trials, or referral credits at initial launch.
- Linkar-generated GST invoices or credit notes.
- Automated refunds or disputes.
- Multiple simultaneous paid subscriptions for one workspace.
- A provider-agnostic billing framework beyond a small internal Razorpay boundary.

## Chosen Approach

### Razorpay Subscriptions

Each paid plan and billing interval maps to a Razorpay Plan. Linkar creates a Razorpay Subscription for the selected provider plan and opens Razorpay Checkout using the returned subscription ID.

This is preferred over hosted Payment Pages because recurring state, renewals, and lifecycle events remain linked to a subscription. It is preferred over one-time Orders plus custom renewal logic because Linkar should not recreate mandate and recurring-payment behavior.

### Server-authoritative catalog

The browser submits only the Linkar plan key and interval. The server resolves the price, features, total billing cycles, and Razorpay plan ID from trusted configuration. Client-provided amounts and provider IDs are rejected and never forwarded.

The catalog lives in a focused server module and is mirrored into `PlanDefinition` seed data for entitlement enforcement. Razorpay test and live plan IDs are supplied through environment variables so test IDs cannot accidentally be used in production.

Required provider-plan variables:

- `RAZORPAY_PLAN_CREATOR_MONTHLY_ID`
- `RAZORPAY_PLAN_CREATOR_ANNUAL_ID`
- `RAZORPAY_PLAN_GROWTH_MONTHLY_ID`
- `RAZORPAY_PLAN_GROWTH_ANNUAL_ID`
- `RAZORPAY_PLAN_AGENCY_MONTHLY_ID`
- `RAZORPAY_PLAN_AGENCY_ANNUAL_ID`

## Architecture

### Components

1. **Billing catalog** — owns plan keys, public prices, intervals, feature summaries, and trusted provider-plan lookup.
2. **Razorpay client** — a server-only HTTP client with Basic authentication, strict timeouts, normalized errors, and no secret logging.
3. **Billing service** — validates workspace ownership, serializes checkout creation, records provider state, verifies signatures, and requests provider mutations.
4. **Webhook processor** — verifies the raw request body, deduplicates events, rejects stale lifecycle transitions, and updates subscription plus entitlement state transactionally.
5. **Billing repository** — isolates Prisma queries and transaction boundaries.
6. **Billing UI** — displays the catalog, current subscription, usage, and action feedback without making entitlement decisions.

### Routes

- `GET /api/billing` returns the current workspace billing view and trusted catalog.
- `POST /api/billing/checkout` creates or reuses a safe pending subscription and returns public Checkout options.
- `POST /api/billing/checkout/verify` verifies `payment_id|subscription_id` using the Razorpay key secret, records the verification result, and returns a processing state. It does not grant entitlements.
- `POST /api/billing/change-plan` schedules a provider-supported plan change at the next billing cycle.
- `POST /api/billing/cancel` schedules cancellation at cycle end by default.
- `POST /api/razorpay/webhook` reads the raw body, verifies the webhook signature, deduplicates the event, and applies lifecycle state.

All workspace billing mutations require an authenticated workspace `OWNER`. Read access follows existing workspace membership rules. The webhook route is unauthenticated at the session layer and authenticated exclusively by its Razorpay signature.

## Data Model

### `BillingSubscription`

One canonical record per workspace:

- workspace ID, unique
- Linkar plan ID
- billing interval (`MONTHLY` or `ANNUAL`)
- provider (`RAZORPAY`)
- Razorpay customer ID, when available
- Razorpay subscription ID, unique when present
- Razorpay plan ID
- normalized status
- provider status
- checkout verification timestamp
- current period start and end
- scheduled cancellation flag
- pending Linkar plan ID and interval for a scheduled change
- last provider event timestamp and event ID
- created and updated timestamps

The one-row-per-workspace invariant prevents concurrent active subscriptions from becoming normal application state. Historical lifecycle evidence remains in webhook events and audit records.

### `BillingCheckoutAttempt`

A checkout attempt provides a stable internal identifier before calling Razorpay:

- attempt ID
- workspace ID
- requested plan and interval
- state (`CREATING`, `READY`, `VERIFIED`, `FAILED`, `EXPIRED`)
- Razorpay subscription ID when created
- expiry timestamp
- sanitized failure code
- created and updated timestamps

Only one non-expired `CREATING` or `READY` attempt is allowed for a workspace by service-level transactional serialization. The attempt ID is included in Razorpay subscription notes so an orphaned remote subscription can be reconciled from a webhook.

### `BillingWebhookEvent`

- Razorpay event ID, unique
- event type
- relevant Razorpay entity ID
- provider creation timestamp
- payload SHA-256 hash
- processing state (`RECEIVED`, `PROCESSED`, `IGNORED`, `FAILED`)
- sanitized error code
- received and processed timestamps

The raw webhook payload is not persisted because it may contain customer information. Operational logs include identifiers and sanitized codes, never signatures, credentials, full payloads, or payment instrument data.

### Relations and indexes

- `Workspace` has one optional canonical billing subscription and many checkout attempts.
- `BillingSubscription` references `PlanDefinition`.
- Foreign-key columns and common lookup combinations receive indexes.
- New billing tables have RLS enabled with no browser-facing policies. Application access is through the server-side Prisma connection only.

## Subscription Lifecycle

Normalized states are `NONE`, `CREATED`, `AUTHENTICATED`, `ACTIVE`, `PENDING`, `HALTED`, `PAUSED`, `CANCELLED`, `COMPLETED`, and `EXPIRED`.

- `subscription.authenticated` records mandate authorization but does not independently grant paid access.
- `subscription.activated` and `subscription.charged` set the paid plan entitlement and billing period.
- `subscription.pending` retains paid access only through the recorded paid-through period.
- `subscription.halted`, `subscription.cancelled`, `subscription.completed`, and `subscription.expired` return the workspace to Free once no paid-through period remains.
- `subscription.paused` retains or removes access according to the provider's recorded paid-through period.
- A successful scheduled plan change updates `WorkspaceEntitlement` when the provider event confirms the new plan, not when the user clicks the button.

If an event's provider timestamp is older than the last applied lifecycle event, it is recorded as ignored. Equal timestamps use the Razorpay event ID as a deterministic tie-breaker. Duplicate event IDs return success without repeating side effects.

Every entitlement transition and owner-initiated billing mutation creates an entry in the existing audit system with sanitized metadata.

## Checkout Flow

1. The owner opens `/settings/billing` and selects a paid plan and interval.
2. The browser calls `POST /api/billing/checkout`.
3. The server validates the session, workspace owner role, catalog selection, environment, and existing subscription state.
4. The server transactionally creates or reuses a current checkout attempt.
5. The Razorpay client creates a Subscription with the trusted plan ID, a bounded total count, customer notification enabled, and internal IDs in notes.
6. The server persists the Razorpay subscription ID before returning Checkout options.
7. Razorpay Checkout collects payment details. Linkar never handles card, UPI, or mandate credentials.
8. The browser sends the Checkout response to the verification route.
9. The server verifies the HMAC signature and shows `Payment received; activating plan` while waiting for the webhook.
10. A signed webhook activates the paid entitlement. The UI refreshes the billing view until the authoritative state appears or offers a retry-safe refresh.

Closing Checkout leaves the reusable attempt in `READY` until it expires. Repeated clicks during that window reuse the same Razorpay subscription instead of creating another mandate.

## Plan Changes and Cancellation

- Upgrades and downgrades are scheduled for the next cycle to avoid custom proration and surprise charges at launch.
- Linkar uses Razorpay's subscription update operation with `schedule_change_at=cycle_end` where the payment method supports it.
- When Razorpay reports that a mandate type cannot update a subscription, the UI explains that the owner must cancel at cycle end and subscribe to the desired plan after expiry. Linkar does not silently create a second mandate.
- Cancellation defaults to cycle end. Access remains paid through the provider-confirmed paid-through date.
- Re-subscription is permitted only when the previous subscription is terminal or no longer paid-through.

## Security and Failure Handling

- `RAZORPAY_KEY_ID` may be exposed to Checkout; `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are server-only.
- Checkout signatures use HMAC-SHA256 over `payment_id|subscription_id` with the key secret and constant-time comparison.
- Webhook signatures use HMAC-SHA256 over the exact raw request bytes with the webhook secret and constant-time comparison.
- Webhooks use `x-razorpay-event-id` for idempotency and reject missing required identifiers.
- Provider calls use short timeouts and normalized retryable/non-retryable errors. Mutating provider calls are not blindly retried.
- Database transactions never remain open during network calls.
- A checkout verification cannot upgrade entitlements, even when valid.
- Missing or malformed provider state fails closed to the existing entitlement.
- Secrets, signatures, authorization headers, and payment payloads are redacted from logs and errors.
- Rate limits apply to owner mutation routes.

## Billing UI

The existing settings area gains a Billing section containing:

- current plan and subscription status
- current monthly delivery usage against the plan limit
- monthly/annual selector with the annual savings stated plainly
- cards for Free, Creator, Growth, and Agency
- owner-only subscribe, change-plan, and cancel controls
- renewal or paid-through date
- pending, payment-failed, scheduled-change, and scheduled-cancellation notices
- a processing state after Checkout until the webhook is reflected
- support guidance when a provider action needs manual recovery

Non-owners may view billing and usage but see that only the workspace owner can make financial changes. The UI uses the existing Linkar visual system and remains usable on mobile.

## Razorpay Configuration

Create six immutable Razorpay Plans in test mode and six equivalent Plans in live mode. Plan names include Linkar, tier, and interval. Amounts are inclusive prices in INR paise; periods are monthly or yearly with interval `1`.

Configure a webhook for `https://app.linkar.in/api/razorpay/webhook` with a new high-entropy secret and the required subscription/payment events. Test and live webhook secrets remain separate.

The existing account API key can be used because Razorpay marks it universal across approved websites, but its secret must be supplied directly to production configuration by the account owner. The implementation never regenerates the key merely to reveal a secret.

## Deployment Sequence

1. Add migrations, seed data, server modules, routes, UI, and tests.
2. Run unit, route, integration, lint, typecheck, build, and production compose checks.
3. Create Razorpay test Plans and configure local/test secrets.
4. Exercise subscription creation, signature verification, webhook activation, duplicate webhook handling, cancellation, and failure behavior in test mode.
5. Create matching live Plans and configure production secrets through the deployment platform.
6. Deploy the database migration before or with compatible application code.
7. Deploy the application and worker.
8. Register the live webhook and perform a low-risk live purchase using an owner-controlled workspace.
9. Verify the provider subscription, Linkar billing row, entitlement, audit event, and UI status.
10. Monitor webhook failures and checkout errors during rollout.

No secret is committed to git or copied into documentation.

## Testing Strategy

### Unit tests

- catalog prices, annual savings, provider-plan resolution, and unknown selections
- Checkout and webhook signature verification, including malformed and timing-safe failure cases
- provider payload normalization and status mapping
- stale-event ordering and duplicate-event behavior
- entitlement decisions for every lifecycle state and paid-through boundary

### Service and route tests

- owner authorization and non-owner rejection
- concurrent/repeated checkout request reuse
- provider failures without open database transactions
- valid callback records verification without granting access
- forged callback and webhook rejection
- webhook activation updates subscription and entitlement atomically
- duplicate and out-of-order webhooks have no repeated side effects
- cancellation and provider-unsupported plan changes return clear states
- secrets and raw payment data do not appear in responses or logs

### UI tests

- exact launch prices and limits
- monthly/annual switching
- owner and non-owner action states
- Checkout success, dismissal, processing, failure, cancellation, and scheduled-change messaging
- responsive keyboard-accessible controls

### Production verification

- migration deploy succeeds
- plan IDs resolve in the correct environment
- health checks remain green
- signed test webhook reaches production without exposing payloads
- one controlled live subscription grants the expected plan exactly once

## Acceptance Criteria

- Linkar's approved Razorpay website remains `https://app.linkar.in`.
- Owners can start monthly and annual subscriptions for all three paid tiers.
- The amount shown in Linkar, Razorpay Checkout, and the provider plan always matches.
- No client request or checkout callback can directly grant paid access.
- A valid activation/charge webhook grants the exact selected entitlement once.
- Duplicate and stale webhook events do not regress state or duplicate audit records.
- Cancellation preserves access through the paid-through period and then returns the workspace to Free.
- Provider and webhook failures are visible, retry-safe, and fail closed.
- Secrets and payment instrument data never enter the repository, browser payloads, database event log, or application logs.
- The full automated verification suite and production build pass before deployment.
