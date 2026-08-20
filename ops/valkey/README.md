# ReplyConnect Valkey service

ReplyConnect uses a dedicated, password-protected Valkey instance for BullMQ.
It is private to ReplyConnect: do not share it with TrackParcel or any other
application, do not assign it a public domain, and do not publish port 6379.
It must share the ReplyConnect-only `replyconnect-private` Coolify network with
`replyconnect-web`, `replyconnect-worker`, and `replyconnect-postgres`.

## Runtime contract

- Image: `valkey/valkey:9.1.1-alpine3.24`
- Internal compose hostname: `valkey`
- Stable Coolify private alias: `replyconnect-valkey`
- Coolify application URL: `redis://:<VALKEY_PASSWORD>@replyconnect-valkey:6379/0`
- Application variable: `REDIS_URL`
- Service secret: `VALKEY_PASSWORD`, a unique high-entropy value
- Data volume: `replyconnect-valkey:/data`
- Persistence: append-only file (AOF) with `everysec` fsync
- Network exposure: private only; no `ports:` mapping and no FQDN

In Coolify, use the stable `replyconnect-valkey` alias in `REDIS_URL`, never a
TrackParcel alias or hostname. The owner must provide the final password through
Coolify; it does not belong in this repository. Keep Valkey on
`replyconnect-private` only, with no published port or FQDN.

## Routine checks

1. Confirm Valkey is `running` and its health check is healthy in Coolify.
2. Confirm the service has no public port, FQDN, cross-project attachment, or
   TrackParcel alias, and shares only `replyconnect-private` with the three
   other ReplyConnect production services.
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
