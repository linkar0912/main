# Production Monitoring and Alerts Design

## Outcome

Linkar detects actionable application failures, keeps a durable incident history in the platform-owner console, sends deduplicated owner email alerts and recovery notices, and independently probes the public production health endpoint. Razorpay readiness is included in the same operational posture without exposing credentials.

## Architecture

The worker runs a bounded system snapshot every five minutes. A pure evaluator turns that snapshot into stable incident candidates. A database-backed reconciler opens, refreshes, escalates, and resolves incidents transactionally. Only lifecycle changes send email: a new incident, a severity escalation, or recovery. The Admin System page reads the same incident ledger and renders it above the detailed probes and queue controls.

A scheduled GitHub Actions workflow separately probes `https://app.linkar.in/api/health`. This catches complete application or host failure, when the in-process monitor cannot execute. Failed workflow runs provide an external operational signal; Hostinger disk/resource alerts are configured during production recovery when console access is available.

## Incident Rules

- Critical: web, database, Redis, or worker unavailable; Razorpay production configuration incomplete; failed Razorpay webhook processing; a queue backlog of at least 500, oldest waiting job at least 30 minutes, or 25 failed jobs; at least 25 expired delivery claims.
- Warning: a degraded probe; an unexpectedly paused queue; a queue backlog of at least 100, oldest waiting job at least 10 minutes, or any failed job; any expired delivery claim; failed deletion work; a snapshot older than 60 seconds.
- Informational states are displayed in detailed probes but do not open incidents.

Each incident stores a safe fingerprint, source, title, bounded detail, severity, status, timestamps, occurrence count, and notification timestamps. It never stores secrets, URLs with credentials, raw webhook payloads, job payloads, authorization headers, or stack traces. A unique nullable active key permits only one active lifecycle for a fingerprint while retaining resolved history.

## Alert Delivery

`PLATFORM_ALERT_EMAILS` is a comma-separated, server-only recipient list. `EMAIL_FROM` is the verified sender. `EMAIL_API_KEY` is used with the Resend HTTPS API. Missing mail configuration does not break processing: the incident remains visible in Admin, delivery is reported as unavailable, and a later monitor run may retry.

## Admin Experience

The System page begins with one operational summary and a compact incident table. Rows expose severity text, affected service, concise description, duration, last seen, and state. Active severity is not communicated by color alone. The existing Volt tokens provide ink surfaces, magenta interaction, honey warnings, danger failures, and the dark-mode-safe leaf tone for healthy/recovered states. Probe and queue detail remains below, with less repetitive card chrome.

## Razorpay Readiness

The system snapshot reports only whether all nine required Razorpay values are present. Failed billing webhook counts and stale subscription/provider state become incidents. Activation remains server-authoritative: migrations first, live plan IDs and webhook secret second, test-mode end-to-end verification third, and a real ₹199 charge only after immediate user confirmation.

## Production Recovery

The current outage is a Coolify host disk exhaustion, not an application regression. Recovery inspects disk usage before cleanup, removes only unused image layers, build cache, and stopped containers, preserves Docker volumes, restarts Coolify, applies migrations, deploys the verified commit, and validates web plus worker health. Production operations wait for Hostinger hPanel or VPS console access.

## Verification

Unit tests cover incident evaluation, persistence lifecycle, dedupe, recovery, email failure isolation, environment parsing, and redaction. Component tests cover readable statuses, incident history, dark-mode-safe semantic classes, and existing queue commands. Final checks run Prisma validation/generation, focused tests, the full test suite, lint, typecheck, production build, Playwright desktop/mobile visual checks, and the billing preflight with production-shaped non-secret fixtures.
