# Linkar owner console operations

The owner console is served only from `https://admin.linkar.in/admin`. Access is granted by exact Supabase Auth UUIDs in `PLATFORM_OWNER_USER_IDS`; email addresses are never authorization inputs. Sign in on the admin host, enroll a TOTP factor under **Security**, and reach AAL2 before opening operational pages. Admin sessions remain host-scoped and are not shared with the customer app.

Use **System** for bounded web, PostgreSQL, Valkey, worker, queue, configuration-presence, throughput, and reconciliation status. Queue pause/resume and reconciliation commands require an operator reason and are written to the immutable audit trail. A paused queue stops new work from being claimed; resume it after the incident. Retry only known failed job IDs. The UI never exposes URLs, credentials, tokens, payloads, or stack traces.

Use **Audit** to filter privileged events and export the fixed safe CSV projection. Export itself requires a reason and is audited. CSV cells that could be interpreted as spreadsheet formulas are neutralized.

Production must set `APP_URL=https://app.linkar.in`, `NEXT_PUBLIC_APP_URL=https://app.linkar.in`, `ADMIN_URL=https://admin.linkar.in`, and `PUBLIC_SITE_URL=https://linkar.in`. OAuth callbacks belong to `app.linkar.in`; marketing and legal pages remain canonical on `linkar.in`. DNS, deployments, database administration, and secret rotation remain in Cloudflare, Coolify, and Supabase—not inside Linkar.

Billing is ready only when the web deployment contains all nine Razorpay variables (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and the six monthly/annual plan IDs), `APP_URL` is the canonical app origin, and `WORKER_HEALTH_URL` points to the worker heartbeat endpoint. Store every value directly in Coolify; never paste values into logs, commits, tickets, or audit reasons. Configure Razorpay to send subscription events to `https://app.linkar.in/api/razorpay/webhook`, redeploy both web and worker after changing environment values, and run `pnpm preflight:billing` inside the configured release. The preflight reports missing variable names and safe plan IDs, but never prints secrets.

For an incident: pause the affected queue, record the incident reason, inspect safe failure codes and worker health, fix the external cause, run the relevant reconciliation, retry only selected failures, then resume. Rotate provider/Supabase secrets in deployment storage and redeploy both web and worker; never paste secrets into the audit reason.
