# Admin line review  -  2026-10-02

Every file was read in full under `app/admin`, `app/api/admin`, `src/components/admin`, and `src/lib/admin`, including existing tests. The initial inventory contained 187 files / 8,463 lines. After repairs and regression tests, the inventory contains **192 files / 8,964 lines**. The coverage manifest records each final path, line count, and SHA-256: [line-review-coverage.json](admin-evidence/line-review-coverage.json).

Commands were also traced into shared Supabase clients, queue producers, provider event persistence, repository delivery transitions, and broadcast reconciliation. This is an admin audit, not a claim that every line of the entire Linkar application has been audited or that static review proves the absence of defects.

The previous [ADMIN-FIXES.md](ADMIN-FIXES.md) records the first remediation pass. The second pass found and fixed the following additional failures.

| Area | Confirmed failure | Repair |
| --- | --- | --- |
| Deletion cancellation | A cancellation arriving just before the irreversible write could be ignored. | Atomic conditional boundary checks both cancellation and irreversibility; cancel without running destructive stages. |
| Deletion protection | Protected-user and ownership checks could become stale before destructive stages. | Recheck protected identities and ownership at the boundary; revalidate synthetic inventory. |
| Deletion ordering | Queued work was removed before suspension blocked new dispatch. | Suspend first, then remove queued work. |
| Deletion queue failure | Durable jobs could remain queued when no worker job was accepted. | Persist an expected-version failure and return a recoverable queue error. |
| Deletion cancellation recovery | Cancelling a retained failed worker job could leave the cancellation unprocessed. | Enqueue the cancellation; permit cancelling failed jobs before the boundary; retain both Cancel and Retry controls. |
| Deletion replay | Reusing a key with a different actor or Auth deletion scope could reuse an incompatible job. | Bind replay to target, impact, actor, and destructive scope. |
| Deletion errors | Raw exception messages could become durable error codes. | Persist only known internal codes; cancellation does not show a failed stage. |
| Delivery retries | Stale records could enqueue before optimistic concurrency was checked. | Check versions and reserve the ledger with a conditional transition before enqueueing. |
| Broadcast retries | Failed recipients lost retry eligibility when some or all queue submissions failed. | Compensate rejected recipients only when their reserved state/version still matches; report partial acceptance. |
| Retained queue jobs | Reusing original delivery/event job IDs could suppress an operator retry. | Add retry-specific job IDs while retaining original delivery/provider identities. |
| Worker concurrency | Worker claim/success/failure/unknown changes left admin versions stale. | Increment delivery versions on worker transitions. |
| Cancelled broadcasts | Worker reconciliation resurrected cancelled broadcasts; cancelled recipients remained pending in counters. | Preserve cancellation with conditional updates; count cancelled recipients as skipped. |
| Domain types | Shared delivery and broadcast types omitted states already written by admin commands. | Include CANCELLED in the domain types. |
| Expired claims | Releasing an ambiguous provider claim made it sendable again. | Mark UNKNOWN and non-retryable; do not trigger another send. |
| Webhook replay | Historical summaries lost original timestamps, interaction fields, or full message text. | Persist complete replay metadata for new events; preserve original identity/time; refuse incomplete historical payloads. |
| Webhook replay concurrency | Reprocess limits and version checks ran after enqueue. | Reserve the replay count/version first and compensate on queue rejection. |
| Automation activation/editing | Next-media activation or active definition edits could retain a stale media binding. | Clear the binding and refresh activation time when rearming next-media. |
| Contact editing | Arbitrary lead statuses and assignees could reach storage. | Validate statuses/notes and check assignee membership. |
| Operation filters | Statuses outside each resource's state set could reach Prisma; provider filters misclassified unbound automations and non-provider resources. | Validate statuses per kind, use persisted automation provider, and apply relevant provider predicates. |
| Filter recovery | Invalid operation/audit filters could repeatedly fail without a usable recovery link. | Render validation errors with Clear filters; compare date ranges by actual instants. |
| Hidden actions | Restore version, destination updates, and contact export were advertised but hidden. | Provide validated inputs, CSV download, partial-retry feedback, and errors inside confirmation dialogs. |
| User directory | Auth enumeration silently stopped at 10,000 users. | Exhaust provider pagination instead of reporting a partial directory as complete. |
| Missing users/outages | Missing Auth users could receive platform control records; provider outages appeared as missing targets. | Verify existence before access changes; distinguish provider errors from 404s, including deletion previews. |
| Workspace lookup | Search omitted workspace IDs. | Include ID matching. |
| Workspace membership | Role/removal/ownership operations could use stale owner checks. | Conditional role/removal updates, protected-owner checks, and serializable ownership transfer with conflict reporting. |
| Workspace lifecycle | Restore/suspend could overwrite a deletion lock; pausing all automations did not update their versions. | Preserve deletion state in lifecycle predicates and UI; increment automation versions when pausing. |
| Audit correlation | Membership targets in different workspaces could collide; action/target were changed after request hashing. | Bind workspace scope and final action/target before creating the audit request ID. |
| Audit replay | A duplicate ATTEMPT could be swallowed and execute another unaudited mutation. | Reject duplicate mutation attempts; explicitly allow durable, payload-checked deletion replay only. |
| Request validation | JSON-like media types with an injected suffix passed the content-type check. | Match the actual application/json media type. |
| Audit queries/CSV | Invalid phases, ranges, limits, or export fields could reach storage; spreadsheet control prefixes were not escaped consistently. | Strict list/export schemas and formula-safe CSV cells. |
| MFA removal | Concurrent requests could each see two factors and remove the last verified factor. | Serialize per owner with a database advisory lock, re-read factors inside it, and bound network calls/lock waits. |
| Security outage | Infrastructure failures on the security page were redirected as denied access. | Redirect only typed authorization failures. |
| System health | Paused/unconfigured/unavailable queues could contribute to healthy status; worker probes could hang. | Include queue/probe status in health and bound the worker HTTP probe. |
| Incidents | Missing metrics could incorrectly resolve existing incidents; unavailable queue metrics resembled zero backlog. | Preserve incidents whose observations are unavailable and create explicit unavailable-queue incidents. |
| Usage reconciliation | Reservation deletion and counter rebuilding were separate writes vulnerable to concurrent reservations. | Serializable transaction with bounded serialization retries. |
| Incident alerts | One rejected email attempt could stop all remaining notifications; pending processing was unbounded. | Bounded batches and independent settled delivery attempts. |
| Overview/failure labels | Active-user counts included invalid/inactive memberships; raw queue reasons were presented as error codes. | Count distinct active user identities and expose safe structured failure labels. |

## Verification

Final results: **304 test files / 1,612 tests passed**. TypeScript, ESLint, production web/worker build, branding, customer-copy, deployment hygiene, and whitespace checks passed. Command logs are recorded in `admin-evidence/line-review-*.log`. Tests use local fixtures and mocks; no remote deletion, provider sends, database migrations, or Auth account creation was performed. The production web and worker bundles compile. The earlier pass also includes desktop/mobile Chrome evidence in [ADMIN-FIXES.md](ADMIN-FIXES.md).

## Limits and remaining work

- Real owner AAL2 login, TOTP, database/Redis races under load, provider repairs, and irreversible deletions require a controlled staging environment. The normal e2e setup mutates configured remote services and was not run during this audit.
- Historical webhook rows without complete original replay metadata now intentionally return `webhook_payload_incomplete`; lost event data cannot be reconstructed safely.
- Enumerating a large Auth directory remains an expensive operation. Complete results are now returned, but an indexed directory would be needed for efficient search at scale.
- Database reservation and queue submission remain separate systems. A process crash between them still needs operational recovery; these repairs handle reported queue failures and concurrency, not a durable outbox redesign.
- Eight tooling dependency advisory entries from the prior dependency audit remain documented in [ADMIN-FIXES.md](ADMIN-FIXES.md). No forced transitive major upgrade was made.
- Changes remain local and have not been deployed. The broader non-admin backlog in [REPORT.md](REPORT.md) is separate.
