# Production Readiness and Test-Account Cleanup Design

## Goal

Restore missing production configuration, document the recent Instagram delivery outcome accurately, and remove synthetic test identities without risking genuine accounts.

## Confirmed Production State

The deployed release is `69bf181ec627d5777fa849388c94c7784b1c9630`. The public health endpoint reports configured mode with healthy database and Redis dependencies. The operator System console reports:

- Razorpay billing: missing;
- billing webhook failures: zero;
- worker: degraded because the worker heartbeat endpoint is not configured;
- stuck deliveries: zero;
- webhook queue failures: zero;
- subscription drift: zero.

The billing UI disables plan changes because `billingConfigured` requires both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the running web process. The full production preflight additionally requires the webhook secret and six Razorpay Plan IDs.

Two Instagram campaign actions at approximately 16:00–16:01 IST were recorded as non-retryable `PROVIDER_REJECTED`. More than twenty actions in the same workspace succeeded immediately afterward. This supports an isolated Meta rejection of those actions or recipients, not a Linkar database, queue, webhook, or general provider outage. The raw provider reason is intentionally unavailable in the cross-tenant admin detail and must not be guessed.

## Razorpay Recovery

The production deployment must contain:

- `RAZORPAY_KEY_ID` using a live key;
- `RAZORPAY_KEY_SECRET`;
- `RAZORPAY_WEBHOOK_SECRET`;
- monthly and annual Razorpay Plan IDs for Creator, Growth, and Agency;
- `APP_URL=https://app.linkar.in`.

Values are entered only in Coolify/deployment secret storage and are never copied into git, chat, logs, screenshots, or audit reasons. Both web and any process that consumes billing configuration are redeployed. `pnpm preflight:billing` runs inside the configured release environment; the System console must then show Razorpay Ready. A low-risk owner-controlled live checkout verifies subscription creation, callback signature verification, signed webhook receipt, entitlement activation, and UI refresh.

## Worker Heartbeat Recovery

Identify the worker heartbeat URL/config contract from the existing health service, add the missing deployment value to the web runtime, and confirm that the worker endpoint returns its expected authenticated/safe status. The operator console must change from Degraded to Healthy without altering queue state.

## Failure Follow-Up

Do not retry the two non-retryable deliveries. Confirm the workspace-facing failure panel presents the sanitized Meta explanation if available. If future provider rejections repeat across different recipients or all sends begin failing, capture the Meta error code at the provider-client boundary and open a new incident. No code change is justified by the two isolated failures alone.

## Synthetic-Account Rule

Only identities whose normalized email matches one of these exact expressions are synthetic:

```text
^owner-[0-9]+@example\.com$
^member-[0-9]+@example\.com$
^signout-[0-9]+@example\.com$
```

Every other email address is genuine for this cleanup and must be preserved, including other `example.com` addresses. The platform-owner allowlist remains an unconditional exclusion.

## Deletion Procedure

1. Produce a read-only inventory of every matching Supabase identity, Linkar user, membership, owned workspace, and dependent-row count.
2. Store the inventory digest and exact IDs in an operator-readable audit artifact without credentials or content payloads.
3. Reject any candidate whose current email no longer matches, whose identity is allowlisted, or whose impact changed after preview.
4. Submit deletion jobs through the existing permanent-deletion service rather than issuing direct SQL deletes.
5. Process owned workspaces before member-only identities where required by ownership constraints. Enable Auth-user removal only after the person has no remaining workspace membership.
6. At the irreversible boundary, recompute the candidate set and digest. Any difference stops the run and requires a new preview.
7. Verify that no matching identities remain, genuine sampled accounts still resolve, queues are healthy, and failed deletion jobs are zero.

Because production deletion is irreversible, the final submission requires an action-time confirmation after the exact count and impact preview are shown.

## Automation Support

The current console is optimized for one deletion at a time. If the inventory contains more candidates than can be safely processed individually, add a bounded operator-only bulk cleanup command that accepts no arbitrary regex. It hard-codes the three approved patterns, previews exact IDs and impact, uses the existing deletion job service, requires AAL2 and an operator reason, and preserves the same single-use challenge and audit guarantees. It never performs direct cascading SQL deletion.

## Verification

- production billing preflight passes without printing secrets;
- System reports Razorpay and worker healthy;
- a controlled live billing flow activates the correct entitlement;
- no retry is offered for the two non-retryable Meta rejections;
- cleanup inventory tests prove near-miss addresses are preserved;
- deletion preview/digest, stale-preview rejection, owner ordering, allowlist exclusion, and idempotent resume are tested;
- post-run search returns zero approved-pattern accounts and unchanged genuine-account counts.

