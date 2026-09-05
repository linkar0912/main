# Premium Invite Codes Design

## Goal

Let a workspace owner redeem a secure invite code for 30 days of the highest Linkar plan while preserving any existing paid subscription and automatically returning to the underlying plan after the promotion expires.

## Product rules

- The promotional plan is Agency, Linkar's highest current plan.
- A grant lasts exactly 30 days from successful redemption.
- Only a workspace owner may redeem a code.
- Codes are single-use by default. Admins may create a limited batch by generating separate codes rather than sharing one reusable secret.
- A workspace may have only one active promotional grant at a time.
- Redeeming a code never cancels, modifies, or replaces a Razorpay subscription.
- When the grant expires, effective access falls back to the workspace's paid or free base entitlement without a scheduled cleanup job.
- Usage already consumed in the current month is retained.

## Data model

`PremiumInviteCode` stores an opaque code hash, optional admin label, target plan, duration in days, expiry, revocation time, creator, and creation time. The plaintext code is returned only once at creation. Codes are generated with sufficient random entropy and stored as SHA-256 hashes; normalization is applied before hashing.

`PremiumInviteRedemption` stores the code, workspace, redeeming user, target plan, start, and expiry. A unique code relation enforces single use in the database. Workspace and expiry indexes support active-grant lookup. Foreign keys use restrictive deletion for plans/codes and cascade with the workspace where appropriate.

Redemption runs in a short serializable transaction: locate the unexpired, unrevoked code by hash; reject an existing redemption; reject an already-active workspace grant; create the redemption; return the effective expiry. No provider network call occurs inside the transaction.

## Entitlement resolution

The entitlement repository will load the base workspace entitlement and the newest unexpired promotional redemption. The service will overlay the promotional plan only while the grant is active. Base overrides do not increase or reduce the temporary Agency grant. Billing views will report both the effective plan and an optional promotion expiry while retaining the existing subscription details.

All capability checks and delivery reservations use this same effective entitlement path, so the upgrade applies consistently to automations, channels, team seats, broadcasts, links, exports, and monthly delivery limits.

## Workspace UI

Billing settings will include a compact “Have an invite code?” form for owners. It accepts a normalized code, submits once, and shows a fixed success or error popup. A successful response refreshes plan and usage details and shows “Agency access until [date].” Non-owners can see active promotional access but cannot redeem codes.

Messages distinguish invalid, expired, already used, already redeemed, and active-promotion cases without leaking whether a guessed code ever existed beyond the submitted result.

## Admin UI

The operator Plans area will include an Invite codes section where an admin can create a 30-day Agency code, copy its plaintext value once, list code status without revealing secrets, and revoke an unused code. Creation and revocation require an operator reason and write an admin audit event.

## Security and abuse controls

- Codes use cryptographically secure random bytes and are never stored or logged in plaintext.
- Redemption is owner-authenticated and rate-limited by user and workspace.
- API responses use private/no-store headers.
- Database uniqueness is the final defense against concurrent double redemption.
- Audit and redemption records contain identifiers and outcomes, never plaintext codes.

## Testing and QA

Tests will cover generation, normalization, hashing, one-time redemption, concurrent attempts, expiry, revocation, owner authorization, rate limiting, entitlement overlay, paid-plan fallback, billing presentation, admin create/revoke behavior, and light/dark responsive UI. Migration SQL will be checked for keys, constraints, foreign-key indexes, and query indexes.

## Non-goals

Codes do not provide cash value, extend Razorpay billing periods, stack durations, or allow members to change workspace billing.
