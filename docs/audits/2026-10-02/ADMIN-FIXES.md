# Linkar admin audit and fixes  -  2026-10-02

This is the remediation record for the admin-focused request. The earlier REPORT.md is a historical, broader application audit; this change does not claim every finding in that report has been resolved.

## Confirmed issues fixed

| Area | Previous failure | Change |
| --- | --- | --- |
| Plan creation | Strict plan validation rejected the extra `key`, so every create failed. | Validate the values separately from the normalized key. |
| Plan editing | Serialized timestamps were spread into the PATCH body and rejected by strict validation. | Explicitly select editable fields. |
| Plan editor freshness | Refreshed plan versions retained old editor values. | Remount each editor when its version changes. |
| User access | Auth unban left the Linkar user suspended. | Restore both layers of access, retaining the old-session revocation cutoff. |
| Maintenance jobs | BullMQ rejected colon-containing custom IDs. | Use valid deterministic IDs. |
| Deletion jobs | Queue creation and lookup used invalid custom IDs. | Hash target job IDs and use the same ID for lookup and enqueue. |
| Broadcast recovery | Recipient jobs also used IDs rejected by BullMQ. | Hash the broadcast/account/recipient tuple, preserving deduplication and account separation. |
| Maintenance retry | Retained failed jobs prevented another reconciliation run. | Retry the existing failed job. |
| Operation filters | Clearing a field omitted it from the update, restoring its previous value. | Send explicit empty filter values for removal. |
| Filter freshness | Forms retained stale fields after URL changes. | Reset filter state when server filter values change. |
| Inspection | Previously inspected details could survive a new request. | Clear details before loading; retain abort protection. |
| Integration search | Lists silently stopped at 100 accounts. | Add signed cursor pagination across both providers and show the count for the current page. |
| Integration expiry | Expiry filtering happened after fetching only the first 101 rows per provider. | Apply expiry predicates in the database before pagination. |
| Integration query validation | Invalid URL status/provider/expiry values could reach Prisma. | Share strict query validation between the page and API. |
| Pagination errors | Invalid signed cursors surfaced as generic server errors. | Return a structured 422 invalid-cursor error from admin APIs. |
| Premium entitlements | Admin effective limits ignored active premium invite redemptions. | Show the actual effective plan and limits, with expiry and an explanation of base-plan edits. |
| Workspace editor state | Plan/override draft state could outlive its workspace or entitlement version. | Key the detail editor by workspace and record versions. |
| Missing workspace | Entitlement lookup could fail before the missing workspace became a 404. | Check workspace existence first; allow controls to render when its entitlement is missing. |
| Dates | Server and browser locale/time-zone differences caused hydration failures. | Use consistent, explicitly labeled UTC timestamps throughout admin views. |
| Snapshot age | A frozen initial clock never aged the health snapshot or incident durations. | Advance the clock while keeping initial server/client rendering deterministic. |
| Outage reporting | Unknown queues could appear Running; missing operational data looked like no incidents; configured but failed Redis looked healthy for rate limits. | Show unknown state and unavailable counts; include failed probes/data loading in overall health. |
| Dialog keyboard behavior | Focus escaped dialogs; Escape could close an underlying drawer. | Share a stacked dialog focus trap, topmost Escape handling, scroll lock, and focus restoration. |
| In-flight integration actions | Cancel/close could dismiss a command still running. | Disable dismissal while busy and protect the parent drawer during confirmation. |
| Mobile navigation | Focus restoration ran before the menu button stopped being inert. | Restore focus after the drawer state commits. |
| Mobile layout | Intrinsic table width expanded admin pages; absolute screen-reader labels also enlarged the document. | Constrain admin page width and position the table scroll container. |
| Navigation | The deletion console had no sidebar entry. | Add the Deletions section. |
| Failure confidentiality | Raw queue/provider/database exception text could enter audit records, command errors, or queue failure labels. | Keep structured codes and safe generic fallbacks rather than exception prose. |
| Audit correlation | Reusing a key across owners/actions/targets could suppress unrelated audit phases. | Include owner, session, action, and target in the request-ID hash. This is correlation protection, not a new universal mutation replay guarantee. |
| Auth/outage distinction | Infrastructure errors were swallowed and redirected like denied access. | Redirect only typed authorization failures; surface infrastructure errors through an error boundary. |
| Error recovery | Error pages used reset without refetching failed server data. | Use the current Next.js `retry()` API and add an admin fallback. |
| Framework | Next.js 16.3.1 had reported security advisories. | Upgrade Next.js and its ESLint config to patched 16.3.6; the lockfile also resolves patched sharp. |
| Runbook | Documentation claimed admin sessions were always host-scoped. | Describe shared parent-domain cookie handoff and the independent owner/AAL2 authorization checks. |

## Complete line review follow-up

The subsequent full admin file review and additional repairs are recorded in [ADMIN-LINE-REVIEW.md](ADMIN-LINE-REVIEW.md), with a hashed coverage manifest. Its validation results supersede the earlier pass below.

## Validation

Final results: **300 test files and 1,585 tests passed**; production web/worker build, TypeScript, ESLint, branding, customer-copy, and deployment-hygiene checks passed. A final targeted run passed all 12 cursor/guard tests. Validation logs and browser evidence are under `admin-evidence/`. New regression coverage exercises plan service validation, plan request fields, access restoration, actual installed BullMQ option validation without Redis, expiry predicates/pagination, error-code confidentiality, scoped audit correlation, outage/auth distinction, filters, dialog focus/Escape, and snapshot aging.

Chrome verification used temporary local fixtures and intercepted local admin detail requests. Desktop nested operation/integration dialogs and 390px mobile navigation passed. Operations, Integrations, and System pages fit the mobile viewport; no browser page errors remained. The fixture route was removed before the final production build. No production authorization bypass was added.

## Remaining verification and broader work

- Live owner login/TOTP, real database/Redis commands, provider repair/token refresh, Auth delivery, and irreversible deletion were not executed against remote services. The existing end-to-end setup writes to configured Auth/database infrastructure; it was deliberately not used for this local audit. Those flows still need staging verification with an owner AAL2 session.
- This work is local and has not been deployed.
- The dependency audit now has no critical advisories. Eight advisory entries remain in Prisma configuration tooling (`deepmerge-ts`) and ESLint tooling (`js-yaml`, two `brace-expansion` versions). These are recorded in `admin-evidence/dependency-audit.json`; this change does not claim a clean dependency audit or force a transitive major-version override.
- The earlier broad audit includes customer-facing and infrastructure findings outside this admin request. Consult REPORT.md for that separate backlog.

The Next.js patch selection follows the [maintainer security advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) and the installed version's documentation. Applicability varies by deployment and usage; no exploit against Linkar was attempted or claimed.
