# Workspace Performance Architecture Design

## Goal

Make signed-in navigation feel immediate by stopping hidden settings sections and slow health probes from blocking the information a person is currently trying to see.

## Confirmed Problems

- Settings starts connection, connection-health, Facebook-health, team, and messaging requests on mount even when those sections are not open.
- the connections view waits for five promises together, so one slow health endpoint delays already-available Instagram and Facebook account lists.
- Billing owns a separate uncached request and repeats it after mutations and while awaiting activation.
- several screens independently fetch the same workspace, connection, and insights facts.
- route-level loading files prevent a blank route but do not make resolved shell data available sooner.

## Architecture

### Shell bootstrap

Keep `/api/workspace/bootstrap` as the small shared identity payload. The root signed-in shell starts it once and exposes its resolved promise/value through the existing client cache and context. Page components consume the shared value and never refetch it merely to render role, plan, avatar, or mode.

### Section-scoped loading

Settings loads only the active section:

- Connections: account lists first, health details second.
- Delivery: messaging configuration on entry.
- Billing: billing summary/catalog on entry.
- Team: members and invitations on entry.
- Policies: no data request.

Changing sections starts the relevant request immediately. Successfully resolved data stays cached for the session. Mutation paths invalidate only their affected cache key.

### Progressive connections data

Instagram and Facebook account lists resolve independently from provider health. Connected-account cards render as soon as list data is available. Each card owns a small health placeholder until its health response arrives. A failed health probe displays “Status unavailable” without replacing a genuine connected account with an error or empty state.

### Shared resource cache

Extend the focused `workspace-data` client module into typed resources for bootstrap, account profile, Instagram accounts, Facebook Pages, team summary, messaging settings, billing view, and compact insights overview. Each resource provides:

- request deduplication;
- a resolved session value;
- explicit targeted invalidation;
- abort-aware callers without cancelling another consumer’s shared request;
- no caching of failures;
- a small freshness window for focus/reconnect refreshes.

This remains a lightweight internal cache; no new client data framework is introduced.

### Server query boundaries

Profile slow endpoints before changing queries. Route timing is recorded at the repository boundary in structured logs without user payloads. Queries are then reduced only where evidence shows duplicated authentication, serial database work, or unbounded relations. Provider health checks remain separate from database-backed list reads.

### Loading experience

The shell and current page heading render immediately. Each independent content region has a shape-matched skeleton. Already resolved content does not disappear during background refresh. Navigation does not show full-page loading for data that can stream or resolve inside a stable page shell.

## Error Handling

Each resource reports its own failure and retry action. A connection-health error cannot fail the connections list; a billing error cannot hide Settings navigation; and a background refresh failure preserves the last confirmed value with a non-blocking stale-state notice.

## Performance Targets

Measured on production-like data and a warm signed-in session:

- sidebar identity paints from the shared bootstrap with no duplicate request;
- Settings → Policies performs no settings data requests;
- Settings → Team does not wait for Meta health;
- Instagram/Facebook account names appear without waiting for health endpoints;
- Billing issues at most one initial request per session and one refresh per successful mutation;
- no page initiates inactive-section requests;
- loading-to-content transitions avoid layout shift.

## Testing and Measurement

- cache tests for deduplication, freshness, targeted invalidation, and failed-request recovery;
- Settings tests asserting requests by active section and progressive connection rendering;
- Billing tests for cached first paint and mutation invalidation;
- profile/dashboard tests asserting reuse of shared resources;
- route timing instrumentation tests with sensitive-value redaction;
- Playwright request-count assertions during navigation;
- production comparison of endpoint latency and request counts before and after rollout.

## Rollout

Introduce resource keys and section-scoped fetches incrementally. Preserve existing response contracts. Enable timing logs before query optimization, compare measurements, and remove instrumentation that is too noisy after targets are verified.

