# Linkar Valkey service

Linkar uses a dedicated, password-protected Valkey instance for BullMQ.
It is private to Linkar: do not share it with TrackParcel or any other
application, do not assign it a public domain, and do not publish port 6379.
It must share only Linkar's private Dokploy application network with the web
application and worker.

## Runtime contract

- Image: `valkey/valkey:9.1.1-alpine3.24`
- Internal compose hostname: `valkey`
- Stable private hostname: `valkey`
- Application URL: `redis://:<VALKEY_PASSWORD>@valkey:6379/0`
- Application variable: `REDIS_URL`
- Service secret: `VALKEY_PASSWORD`, a unique high-entropy value
- Data volume: `linkar-valkey:/data`
- Persistence: append-only file (AOF) with `everysec` fsync
- Network exposure: private only; no `ports:` mapping and no FQDN

Use the stable `valkey` hostname in `REDIS_URL`, never a hostname from another
application. The owner must provide the final password through Dokploy; it does
not belong in this repository. Keep Valkey on Linkar's private network only,
with no published port or FQDN.

## Routine checks

1. Confirm Valkey is running and healthy in Dokploy.
2. Confirm the service has no public port, FQDN, cross-project attachment, or
   cross-application alias, and shares only Linkar's private application
   network.
3. Check `https://app.linkar.in/api/health`; require
   `status: "ok"`, `dependencies.database: "ok"`, and
   `dependencies.redis: "ok"`.
4. Send a controlled Instagram webhook only after the Meta configuration is
   complete, then confirm the worker processes its queued event.

## Backup, upgrade, and rollback

The AOF lives on the named volume. Include that volume in host backups or take
a verified volume snapshot before changing the Valkey image. If an
upgrade is unhealthy, roll the Valkey service back to its previous image and
keep the volume intact. Restore from backup only when the platform recovery
procedure requires it. After recovery, verify Valkey health, `/api/health`, and
one controlled worker delivery.
