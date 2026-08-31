# Linkar Platform Owner Admin Console Design

## Goal

Build a private operator console at `https://admin.linkar.in/admin` that gives the Linkar platform owner direct, write-capable control over every Linkar workspace, user, plan, entitlement, automation surface, delivery, integration, operational queue, and audit event.

The console is an internal Linkar control plane. It is not an expanded customer workspace-admin screen, and no `OWNER`, `ADMIN`, or `MEMBER` workspace role can grant access to it.

## Approved Product Decisions

- The console is exclusively for the owner of Linkar.
- Admin actions target resources directly through platform-admin APIs. The console does not impersonate customer sessions and has no read-only “view as” mode.
- The owner has full write access, including account, workspace, plan, automation, integration, and operational controls.
- Reversible suspension is the normal destructive path.
- Permanent deletion exists, but requires an MFA-authenticated owner session, a reason, an impact preview, typed confirmation, and an immutable audit trail.
- Plan, quota, usage-limit, and feature-entitlement management are included even though payment collection and invoicing are not.
- The console uses Linkar’s existing application layout, tokens, typography, dark mode, responsive behavior, and accessibility conventions.

## Scope Boundary

“Complete control” means complete control over Linkar application identities, tenants, data, entitlements, automations, messaging operations, integrations, queues, and application health.

The console does not expose or edit raw environment secrets, provider access tokens, encryption keys, database credentials, Cloudflare credentials, or Coolify credentials. It reports whether required configuration is present and healthy without revealing values. Infrastructure deployment, DNS, firewall, database-console, and source-control operations remain in their purpose-built systems so a compromised application session cannot seize the infrastructure that hosts the application.

## Architecture

The owner console is a separate route family and authorization boundary inside the existing Next.js application:

- Page routes live under `/admin` and render an `AdminShell` that shares Linkar’s visual primitives without sharing customer workspace navigation.
- JSON APIs live under `/api/admin` and are the only browser-callable interface for platform mutations.
- `getPlatformOwnerIdentity()` verifies the Supabase JWT and compares its `sub` claim against the server-only `PLATFORM_OWNER_USER_IDS` allowlist. `getPlatformOwnerSession()` builds on it, verifies the user has not been suspended, and requires an `aal2` Supabase MFA session.
- Every admin route calls the owner guard independently. Proxy routing is an optimistic navigation gate, never the authorization source of truth.
- The existing service-role Supabase client remains server-only and is used for Auth user administration. The browser never receives the service-role key.
- Prisma remains the application-data access layer. Admin-specific repository modules provide explicit cross-workspace queries instead of weakening tenant filters in the existing workspace repository.
- Redis stores short-lived confirmation challenges and mutation rate-limit state. Durable business and audit state stays in Postgres.

The separation prevents a workspace-role bug from becoming platform-admin access and keeps privileged cross-tenant methods visibly different from normal tenant-scoped methods.

## Owner Authentication and Authorization

### Identity allowlist

Production requires `PLATFORM_OWNER_USER_IDS`, a comma-separated list of valid Supabase user UUIDs. The server fails closed when this variable is missing or malformed. Email addresses and `user_metadata` are not authorization inputs because email can change and user metadata is user-editable.

`getPlatformOwnerIdentity()` returns the verified owner identity at either `aal1` or `aal2`. `getPlatformOwnerSession()` returns the same shape only at `aal2`:

- `userId`: the verified Supabase `sub` claim.
- `email`: the current verified account email for display and audit context.
- `sessionId`: the JWT `session_id` claim.
- `aal`: the current authenticator assurance level.

The guards return `401` for no valid session, `403` for a valid non-owner session, and `428` when the owner must finish MFA before continuing. UI routes route non-owners to `/dashboard` with no admin data; API routes return JSON errors.

### MFA requirement

The whole console requires Supabase Auth `aal2`, not only the delete button. If the configured owner has no verified TOTP factor, `/admin/security` becomes the only accessible admin page and uses the `aal1` owner-identity guard to guide enrollment. After TOTP challenge verification upgrades the session to `aal2`, the full console opens.

High-risk actions additionally require a short-lived confirmation challenge bound to the current `userId`, `sessionId`, action, target, and expected resource version. The challenge expires after ten minutes and can be consumed once.

### Request protection

Every write endpoint requires:

- A verified platform-owner session.
- `aal2` authentication.
- A same-origin `Origin` header matching `APP_URL`.
- JSON content type, except explicit export downloads.
- Zod validation with unknown fields rejected.
- A caller-generated idempotency key for retryable writes.
- A non-empty operator reason for account, workspace, plan, integration, queue, and destructive mutations.

## Data Model

All new public-schema tables are enabled for RLS with no `anon` or `authenticated` policies. They are reached only through the existing server-side Prisma connection. Every foreign-key column and every admin list/filter path receives an appropriate index.

### Workspace identity and lifecycle

`WorkspaceMember` gains a nullable `userId` containing the Supabase user UUID. Existing members are backfilled by matching normalized email through the server-side Supabase Admin API. New invitations bind `userId` at acceptance. The current email remains denormalized for display and invitation compatibility.

`Workspace` gains:

- `status`: `ACTIVE`, `SUSPENDED`, or `DELETION_PENDING`.
- `suspendedAt`, `suspendedReason`, and `suspendedByUserId`.
- `deletionScheduledAt`.

Suspended workspaces cannot use customer APIs, receive new webhook work, enqueue sends, or run scheduled automation jobs. Their records remain available to the owner console and can be restored.

### User control

`PlatformUserControl` is keyed by Supabase `userId` and stores:

- `status`: `ACTIVE` or `SUSPENDED`.
- `suspendedAt`, `suspendedReason`, and `suspendedByUserId`.
- `sessionInvalidBefore`, used by `getValidatedSession()` to reject application sessions issued before an owner-triggered revoke action.
- `updatedAt`.

This provides reversible Linkar-level account suspension. Supabase Auth hard deletion is reserved for completed permanent-deletion jobs because Supabase Auth soft deletion is not reversible.

### Plans and entitlements

`PlanDefinition` stores owner-editable plan templates:

- Stable `key`, display `name`, and `isActive`.
- Limits for workspace members, automations, Instagram connections, Facebook Pages, sequences, monthly broadcasts, and monthly outbound deliveries.
- Feature switches for sequences, broadcasts, tracked links, team access, Facebook support, and exports.
- `createdAt` and `updatedAt`.

`WorkspaceEntitlement` is a one-to-one workspace record containing:

- `planId`.
- Optional typed JSON overrides for individual limits and feature switches.
- `version` for optimistic concurrency.
- `updatedByUserId` and `updatedAt`.

Plan changes never delete resources that exceed a new limit. Existing resources remain readable and pausable; creation and activation operations are blocked until usage is within the effective entitlement.

`WorkspaceUsagePeriod` provides atomic monthly reservation counters keyed by `(workspaceId, periodStart)`. Delivery runners reserve capacity before provider calls, preserving the existing durable-delivery ownership rules. A failed known-not-sent attempt releases its reservation; ambiguous or successful provider outcomes keep it consumed.

### Admin audit events

`AdminAuditEvent` is append-only and contains:

- `id`, `requestId`, and `phase` (`ATTEMPT`, `SUCCESS`, or `FAILURE`).
- `actorUserId`, owner email snapshot, and session ID.
- `action`, `targetType`, `targetId`, and optional `workspaceId`.
- Operator `reason`.
- Redacted `before` and `after` JSON snapshots.
- Optional `errorCode`.
- Salted IP hash, truncated user agent, and `createdAt`.

`(requestId, phase)` is unique. A database trigger rejects UPDATE and DELETE against audit rows. Audit snapshots never contain access tokens, secrets, raw cookies, passwords, OTPs, or full provider webhook payloads.

Database-only mutations write `ATTEMPT`, the business change, and `SUCCESS` in a short transaction. External Auth or provider operations write `ATTEMPT` before the call, then append `SUCCESS` or `FAILURE` afterward.

### Permanent deletion jobs

`AdminDeletionJob` records a user or workspace deletion request, impact counts, a one-way hash of the typed confirmation, requesting owner, state, failure information, timestamps, and cancellation state.

Deletion is a background job so an interrupted browser request cannot leave the UI claiming success after a partial cascade. The worker:

1. Revalidates the durable authorization record, target identity, and expected resource version captured when the one-time confirmation challenge was consumed.
2. Pauses target automation and future queue work.
3. Deletes or anonymizes Linkar application data in dependency order.
4. Deletes the Supabase Auth user only when the user has no remaining workspace membership and the job explicitly targets the account.
5. Appends a terminal audit event.

Failed jobs remain visible with the completed step and retry safely from the next idempotent step.

## Central Entitlement Enforcement

The plan editor is not cosmetic. A shared `EntitlementService` resolves plan defaults plus workspace overrides and is called from every relevant customer and admin write path.

It enforces:

- Team-member and invitation creation.
- Automation creation and activation.
- Instagram and Facebook connection creation.
- Sequence creation and activation.
- Broadcast creation and send.
- Tracked-link creation and export access.
- Monthly outbound delivery reservations.

The app shell and `/api/account` display the effective plan key from `WorkspaceEntitlement`, replacing the current hard-coded `free` value.

## Information Architecture

### Global routes

- `/admin` — operational overview.
- `/admin/workspaces` — all workspaces with search, status, plan, usage, and health filters.
- `/admin/workspaces/[workspaceId]` — one workspace command surface.
- `/admin/users` — Supabase users joined with Linkar memberships and account controls.
- `/admin/users/[userId]` — one user’s identity, membership, session, and audit history.
- `/admin/plans` — plan templates, quotas, feature switches, and workspace overrides.
- `/admin/operations` — cross-workspace automations, sequences, broadcasts, contacts, tracked links, deliveries, and webhook events.
- `/admin/integrations` — Instagram and Facebook connection health and controls.
- `/admin/system` — application health, worker and queue controls, data-deletion requests, and configuration presence.
- `/admin/audit` — append-only operator history.
- `/admin/security` — owner MFA enrollment and factor management.

### Workspace detail

The workspace detail screen uses local sections:

- Overview: status, usage, health, recent failures, and owner identity.
- Members: add, remove, transfer ownership, and change role.
- Plan & limits: assign plan, set overrides, and inspect effective usage.
- Connections: health checks, webhook subscription state, expiry, refresh, and disconnect.
- Automations: edit, activate, pause, duplicate, restore versions, and inspect activity.
- Operations: sequences, broadcasts, contacts, links, deliveries, and webhook events.
- Audit: owner actions affecting only that workspace.
- Danger zone: suspend, restore, schedule deletion, cancel deletion, and permanently delete.

## Capabilities

### Overview

The overview shows total active and suspended workspaces, active users, connected channels, automations by status, delivery outcomes, queue depth, failed jobs, webhook backlog, deletion jobs, and dependency health. A live “operator tape” lists recent failures and admin changes in chronological order.

### Workspaces

The owner can create a workspace, rename it, change its slug, suspend or restore it, transfer ownership, manage members, assign a plan, override limits, pause every automation, export workspace data, and schedule or execute permanent deletion.

### Users

The owner can invite or create users, change email, confirm email when justified, send password-reset links, add or remove workspace membership, change workspace roles, suspend or restore Linkar access, revoke Linkar sessions, ban or unban the Supabase Auth account, and schedule permanent deletion.

Allowlisted platform-owner accounts cannot be suspended, banned, removed, or deleted through the console. Changing the platform-owner allowlist remains a server deployment operation, preventing the console from locking out its only recovery identity.

User changes use Supabase Admin APIs only on the server. Access-token expiry is handled honestly: a revoked refresh session may leave an already-issued JWT valid until expiry, while Linkar’s `sessionInvalidBefore` blocks that token from application APIs immediately.

### Plans and limits

The owner can create and retire plan templates, change every quota and feature switch, assign a plan to a workspace, add per-workspace overrides, reset an override to the plan default, and inspect current-period usage before saving.

Payment status, invoices, refunds, taxes, and checkout are not fabricated. A future billing integration will write plan assignments through the same entitlement service.

### Operations

The owner can directly edit and control every workspace automation, sequence, broadcast, contact, tracked link, delivery, and webhook event without assuming the customer’s identity.

Operations include activation and pause, version restore, contact suppression and assignment, broadcast cancellation, eligible-delivery retry, pending-delivery cancellation, stale-claim release, and safe webhook reprocessing. Retry controls reuse the durable idempotency keys already present in Linkar; a retry never creates a second provider send for a known-delivered operation.

### Integrations

The owner can run health checks, inspect account or Page identity, token expiry, connection status, required webhook fields, and subscription drift. Write controls include marking expired, refreshing supported long-lived tokens, repairing webhook subscriptions, and disconnecting a connection.

Encrypted access tokens and provider secrets are never rendered, copied, exported, or included in audit snapshots.

### System

The system screen shows application release, database and Redis status, web and worker health, queue counts by state, oldest waiting job, stuck claims, recent failures, webhook throughput, deletion-job status, and presence of required integrations and secrets.

The owner can pause or resume Linkar queues, retry selected failed jobs, release verified stale claims, and run reconciliation tasks. Application deployment, container deletion, DNS, and secret editing stay outside the console.

### Audit

Audit records are searchable by owner, action, target, workspace, request ID, result, and date. Lists use cursor pagination. CSV export includes the same redacted fields visible in the UI.

## UI and Visual Direction

The admin console reuses the Linkar “Volt” system: Bricolage Grotesque for page hierarchy, Manrope for interface text, JetBrains Mono for IDs and operational data, the existing paper/ink surfaces, magenta interaction color, and volt yellow signature.

`AdminShell` preserves the current 252px sidebar, mobile drawer behavior, focus trapping, theme toggle, spacing rhythm, and page width. It replaces customer navigation with Overview, Workspaces, Users, Plans, Operations, Integrations, System, Audit, and Security. A “Back to workspace” action returns to `/dashboard`.

The signature element is a persistent volt-yellow operator rail carrying the label `LINKAR OPERATOR`. It appears in the sidebar and mobile top bar and is the only loud visual distinction. The rest of the console is disciplined and data-dense: compact tables, clear filters, restrained status color, and no decorative dashboard gradients.

Destructive contexts use a fixed danger-zone pattern with target identity, impact summary, reason field, confirmation phrase, and final action label that exactly names the operation. The interface always says which workspace or user will change.

## Data Loading and Pagination

Admin lists use server-filtered cursor pagination, never client-side loading of the entire tenant database. Cursors include all ordering columns, normally `(createdAt, id)`. Search inputs debounce requests and send normalized query values.

Overview queries use aggregate repository methods and bounded time windows. Detail pages load independent panels in parallel so one failed provider health check does not blank workspace membership or plan data.

## Error Handling

- `400`: malformed request or unsupported transition.
- `401`: signed out or invalid JWT.
- `403`: authenticated but not an allowlisted platform owner.
- `409`: stale resource version, duplicate idempotency key, or state transition conflict.
- `422`: valid JSON with invalid field values.
- `428`: MFA or confirmation challenge required.
- `429`: mutation or health-check rate limit reached.
- `503`: database, Redis, Supabase Admin API, or provider dependency unavailable.

Mutation failures keep entered reasons and confirmation context where safe, show a specific recovery action, and never optimistically remove the target from the UI before the server confirms success.

## Security and Privacy

- Authorization uses verified Supabase claims and exact server-side UUID allowlisting.
- `user_metadata` and client-supplied roles never authorize admin access.
- Every privileged route is `nodejs` server runtime and imports no admin code into client bundles.
- Service-role credentials remain server-only.
- New tables are RLS-enabled and default-deny through the Supabase Data API.
- Secrets, tokens, passwords, OTPs, raw cookies, and authorization headers are never logged or returned.
- Provider payload displays are redacted and size-limited.
- Raw IP addresses are not stored; audit events use a salted hash.
- CSV exports escape spreadsheet formulas and require the same owner guard.
- Suspended users and workspaces are checked by API sessions and worker execution paths, not only by UI visibility.

## Accessibility and Responsive Behavior

- Every table has an accessible name, column headers, and a stacked mobile representation.
- Filters, tabs, menus, dialogs, and confirmation flows are fully keyboard operable.
- Drawer focus trapping and Escape behavior match the existing app shell.
- Status never relies on color alone.
- IDs and long provider errors wrap without horizontal page overflow.
- Reduced-motion preferences disable nonessential transitions.
- Loading screens mirror the final admin route structure using the existing skeleton system.

## Testing Strategy

Implementation follows red-green-refactor cycles.

Required automated coverage includes:

- Owner guard rejects unsigned, non-owner, malformed-allowlist, suspended, non-AAL2, and stale-session requests.
- Owner guard accepts only the configured Supabase user ID with a verified `aal2` session.
- Every admin mutation rejects cross-site origins, malformed payloads, missing reasons, reused challenges, and stale versions.
- Workspace and user suspension immediately blocks customer API access and worker dispatch while remaining reversible.
- Plan limits are enforced on each resource creation path and monthly delivery reservation is atomic under concurrency.
- Admin operations preserve workspace scoping and delivery idempotency.
- Audit events redact secrets, record attempts and outcomes, and cannot be updated or deleted.
- Permanent deletion jobs are resumable, cancellable before execution, and cannot delete the configured platform owner.
- Component tests cover admin navigation, search, filtering, responsive tables, loading, errors, destructive confirmations, and focus restoration.
- End-to-end tests prove non-owners cannot access `/admin`, the owner can change a workspace plan, suspend and restore a workspace, retry an eligible failed delivery, and view the matching audit trail.

Final verification includes focused tests, the full Vitest suite, TypeScript, ESLint, Prisma validation, migration review, production build, and browser checks at desktop and mobile widths in light and dark themes.

## Rollout

The console ships in four secured increments behind the same owner guard:

1. Foundation: owner allowlist, MFA gate, admin shell, audit log, cursor primitives, and overview health.
2. Accounts: workspaces, users, lifecycle suspension, plans, entitlements, and usage enforcement.
3. Operations: automations, sequences, broadcasts, contacts, links, deliveries, webhooks, and integrations.
4. System controls: queue operations, reconciliation, deletion jobs, exports, and final cross-module audit coverage.

Each increment is deployable and testable, but `/admin` is not considered complete until all four are integrated.

## Acceptance Criteria

- Only a UUID listed in `PLATFORM_OWNER_USER_IDS` with a valid `aal2` Supabase session can load admin pages or call admin APIs.
- No workspace role grants platform access.
- The owner can find and directly modify every supported Linkar workspace resource without impersonation.
- Workspace and user suspension is reversible and enforced by customer APIs and workers.
- Plans, quotas, feature access, and usage counters are persisted and enforced.
- High-risk actions show impact, require reason and typed confirmation, and create append-only audit events.
- Permanent deletion runs through an observable, retry-safe background job.
- Allowlisted platform-owner identities cannot suspend, ban, remove, or delete themselves through admin mutations.
- Tokens and secrets never appear in admin responses, UI, exports, or audit data.
- Admin screens match the existing Linkar app layout and remain usable on mobile, keyboard-only navigation, light mode, and dark mode.
- System health and queue controls report real application state rather than placeholders.

## Supabase References

- [Server-side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Auth MFA assurance levels](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel)
- [Supabase Auth Admin list users](https://supabase.com/docs/reference/javascript/auth-admin-listusers)
- [Supabase Auth Admin update user](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Supabase Auth Admin delete user](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
- [Supabase user sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
