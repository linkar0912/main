# ReplyConnect Valkey service

ReplyConnect uses a dedicated, password-protected Valkey instance for BullMQ.
It is private to ReplyConnect: do not share it with TrackParcel or any other
application, do not assign it a public domain, and do not publish port 6379.

## Runtime contract

- Image: `valkey/valkey:9.1.1-alpine3.24`
- Internal compose hostname: `valkey`
- Application URL: `redis://:<VALKEY_PASSWORD>@valkey:6379/0`
- Application variable: `REDIS_URL`
- Service secret: `VALKEY_PASSWORD`, a unique high-entropy value
- Data volume: `replyconnect-valkey:/data`
- Persistence: append-only file (AOF) with `everysec` fsync
- Network exposure: private only; no `ports:` mapping and no FQDN

In Coolify, use the service's private hostname in `REDIS_URL` instead of the
compose hostname if Coolify gives it a different one. The owner must provide
the final hostname and secret through Coolify; neither belongs in this
repository.

## Routine checks

1. Confirm Valkey is `running` and its health check is healthy in Coolify.
2. Confirm the service has no public port, FQDN, or cross-project attachment.
3. Check `https://<replyconnect-domain>/api/health`; require
   `status: "ok"`, `dependencies.database: "ok"`, and
   `dependencies.redis: "ok"`.
4. Send a controlled Instagram webhook only after the Meta configuration is
   complete, then confirm the worker processes its queued event.

## Backup, upgrade, and rollback

The AOF lives on the named volume. Include that volume in host backups or take
a Coolify-supported volume snapshot before changing the Valkey image. If an
upgrade is unhealthy, roll the Valkey service back to its previous image and
keep the volume intact. Restore from backup only when the platform recovery
procedure requires it. After recovery, verify Valkey health, `/api/health`, and
one controlled worker delivery.
