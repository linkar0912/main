# Netcup Dokploy Migration Design

## Goal

Move TrackParcel and Linkar from the Hostinger Coolify server to the Netcup
server managed by Dokploy without interrupting public web traffic or losing
durable application state.

## Current production baseline

- TrackParcel serves `trackparcel.in`, `www.trackparcel.in`, and
  `admin.trackparcel.in` from commit
  `9f18e2b16b54054dd1e992362e9352ad5fac4e73`.
- Linkar serves `linkar.in`, `www.linkar.in`, `app.linkar.in`, and
  `admin.linkar.in` from commit
  `793528df68ea9d7b376b948754f2c062a25c6c63`.
- Both applications use Supabase for durable database/authentication state.
- Each application has a private Valkey instance. TrackParcel uses it for
  cache and abuse controls; Linkar uses it for BullMQ job state.
- Linkar has one web process, one worker, one migration job, and one private
  Valkey process. Its worker must not be active independently on two queues at
  the same time.

## Target architecture

The Netcup Debian 13 host runs the official single-server Dokploy
installation. Dokploy's Traefik proxy owns public ports 80 and 443. TrackParcel
and Linkar run on separate private networks and expose only their web services
to Traefik. Supabase and other managed third-party dependencies remain in
place; this is an application-host migration, not a Supabase migration.

The currently-live immutable application images are copied from Hostinger for
the first Netcup release. This makes the migration independent of a fresh
source build and guarantees release parity. Repository-backed Dokploy release
configuration is established after parity is verified.

## Security

- Establish key-based SSH before changing SSH authentication.
- Keep SSH available throughout migration and do not disable password access
  until key login has been tested in a second session.
- Permit public HTTP/HTTPS for Traefik. Keep Dokploy port 3000 restricted
  during setup, then expose its UI through an authenticated HTTPS hostname or
  an administrator-only path.
- Do not expose Valkey, workers, migration jobs, or databases publicly.
- Store copied production variables in Dokploy only and never commit them.
- Rotate the Netcup and Hostinger root passwords, Cloudflare migration tokens,
  and exposed R2 credentials after acceptance.

## Migration sequence

1. Capture immutable production baselines: commits, image IDs, health JSON,
   active containers, volume mounts, and Cloudflare DNS records.
2. Configure SSH keys, swap, firewall controls, security updates, time sync,
   and Docker prerequisites on Netcup.
3. Install the stable official Dokploy release and create the owner account.
4. Export Coolify production variables through its authenticated API without
   logging values.
5. Back up active Hostinger volumes. Copy TrackParcel's Valkey snapshot for
   parity. Capture Linkar's Valkey snapshot, but do not activate a second
   independent Linkar worker during parallel validation.
6. Transfer the exact live images and deploy parallel TrackParcel and Linkar
   stacks under temporary routes. Linkar's worker remains disabled initially.
7. Verify container health, Supabase access, Valkey access, release SHA,
   representative pages, admin surfaces, static assets, tracking APIs, and
   webhook challenge endpoints.
8. Cut over TrackParcel hostnames through Cloudflare while Hostinger remains
   online. Verify externally and retain immediate DNS rollback values.
9. Quiesce the old Linkar worker, take a final Valkey snapshot, restore it on
   Netcup, start the new worker, then switch Linkar hostnames. Website traffic
   remains served throughout the worker handoff.
10. Monitor errors, queue depth, dependency health, release identity, and
    external availability. Roll back DNS and the Linkar worker if acceptance
    checks fail.
11. Retain Hostinger unchanged for a rollback window. Decommission only after
    explicit owner confirmation.

## Failure and rollback rules

- No DNS record changes until the matching Netcup service passes internal and
  direct-origin checks.
- A failed Netcup deployment never triggers a Hostinger stop.
- TrackParcel rollback is a Cloudflare route reversal.
- Linkar rollback is: stop the Netcup worker, restore the old route, start the
  Hostinger worker, and reconcile jobs created during the handoff window.
- Database migrations are not applied merely to perform the host move. The
  migration job may run only after confirming there are no new migrations
  beyond the currently-live release.
- Hostinger volumes and containers are not deleted as part of migration.

## Acceptance criteria

- All seven public hostnames return expected HTTPS responses through
  Cloudflare from the Netcup origin.
- `/api/health` reports healthy database and Redis dependencies for both
  applications and the expected release SHAs.
- TrackParcel tracking and administrator authentication work.
- Linkar login, administrator surfaces, OAuth callback routing, Razorpay and
  Meta webhook endpoints, and worker health work.
- Linkar has exactly one active production worker after cutover.
- Direct access does not expose Valkey, workers, Supabase credentials, or the
  Dokploy management interface.
- Reboot persistence and automatic container restart are verified on Netcup
  before Hostinger is considered removable.

