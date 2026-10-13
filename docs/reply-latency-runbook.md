# Reply latency runbook

How fast a comment or DM gets its automated reply, where that time goes, and
how to measure it. Goal: webhook -> Meta accepting the reply in p50 <= 2 s,
p90 <= 3.5 s.

## Where the time goes

The worker and web run in Germany; Postgres is Supabase in Singapore
(~150-250 ms per network round trip). Queueing, Redis and our own code take
milliseconds. Reply latency is therefore almost exactly

    serial database round trips before the Meta call x network round trip + Meta's own time

Two things multiplied that count:

1. **Prisma's `pgbouncer=true` mode costs ~5.5 network round trips per
   statement.** On the transaction pooler (`:6543?pgbouncer=true`) Prisma
   sends every query as `BEGIN`, `DEALLOCATE ALL`, prepare, execute, `COMMIT`.
   A single `findUnique` is ~0.9 s from Germany. Without `pgbouncer=true`
   (session pooler or direct connection) a statement is one round trip once
   its prepared statement is cached on the connection (two the first time).
2. **The realtime path was long and serial.** Before 2026-10-13 a comment ->
   private reply ran: workspace lookup, then the gatekeeping reads, then the
   campaign participant lookup, then the execution claim, then the ledger
   read, then a 6-statement interactive transaction plus a usage statement to
   claim the ledger row - ~14 statements one after another before Meta was
   called. Campaign sends also paid a 4-statement dispatch claim.

Measured on a local Postgres behind a proxy adding a fixed round trip, with
the real Prisma repository and runner (round trips before the first Meta send /
until the job finished):

| Event | pgbouncer=true before | after | session/direct before | after |
|---|---|---|---|---|
| Comment -> classic private reply | 45.5 / 57 | 17 / 28 | 14.5 / 22 | **3.5** / 8 |
| DM keyword -> reply | 45.4 / 56 | 17 / 28 | 14.3 / 22 | **3.5** / 8 |
| Comment -> campaign public reply + opening DM | 68 / 96 | 22 / 46 | 20 / 33 | **4.7** / 15 |

At ~165 ms per round trip, "45.5" is ~7.5 s before the send - the ~8 s seen in
production. The code changes alone bring it to ~3 s; the session connection
below brings it to ~0.6 s plus Meta.

## What the worker does now (2026-10-13)

- The workspace lookup and every gatekeeping read (workspace status, active
  automations, contact, human-takeover pause, the comment's campaign
  participant) run in one parallel round. The reads use the workspace this
  account belonged to last time and are thrown away and redone if the fresh
  lookup disagrees - nothing is cached, so suspensions, pauses, opt-outs and
  edited automations apply to the very next event.
- The plan's monthly limit is fetched in that same round (the 30-second cache
  is usually cold at Linkar's volume), and concurrent callers share one read.
- `prepareOutboundDelivery` is one SQL statement: create-or-claim the ledger
  row and reserve the monthly usage slot, with the same exclusivity (claims
  only PENDING / retryable FAILED rows; usage counted only for the claimed
  row; limit enforced atomically).
- Campaign dispatch claims insert first (one statement); the unique index on
  `dispatchOwner` refuses reused tokens.
- The classic path reads the ledger alongside the execution claim; a DM's
  contact touch runs alongside the reply when nothing reads its result (the
  job still fails, and retries without re-sending, if the touch fails).
- `completeOutboundDelivery` is one raw UPDATE and participant transitions
  one UPDATE ... RETURNING, so a flow's next message waits less.

`src/lib/automation/conformance/latency.test.ts` fails CI if any of these
paths gains a serial round trip or a Graph lookup before replying.

## Recommended infrastructure changes

1. **Worker database connection (biggest lever, env only).** Point the worker
   container's `DATABASE_URL` at Supabase's *session* pooler - the same host
   on port `5432`, the URL `DIRECT_URL` already uses - **without**
   `pgbouncer=true`, with `connection_limit=8`. Session mode pins a server
   connection per client connection, so Prisma's prepared-statement cache is
   safe and a statement costs one round trip instead of ~5.5. Keep the web
   app on the transaction pooler. Check the project's pooler size allows the
   worker's 8 connections next to migrations. Expected: comment -> reply
   ~3.5 round trips x ~165 ms + Meta ≈ 1.0-1.3 s p50; first statements on a
   fresh connection cost two round trips, so p90 ≈ 2-2.5 s.
2. **Co-locate the server and the database** (move the server to
   `ap-southeast-1`, or the database to Frankfurt). Round trips drop to
   ~1-2 ms and reply latency becomes Meta's own time (~0.3-0.8 s). See
   [performance runbook](performance-runbook.md#region-co-location-the-single-biggest-infrastructure-lever).

## Measuring in production

Each realtime job logs one line, `"message":"Realtime automation timing"`,
with durations and counts only (no ids, text or tokens):

- `firstReplyMs` - webhook arrival -> Meta accepted the first message
- `receivedToEnqueuedMs`, `queueWaitMs`, `preProviderMs`, `providerMs`, `totalMs`
- `databaseMs` (wall time with a query in flight), `databaseCalls`,
  `databaseRounds` (serial database rounds)

Percentiles per channel and event type:

```sh
docker logs <worker-container> --since 24h 2>&1 | node scripts/reply-latency.mjs
```

From the database (read-only; `WebhookEvent.receivedAt` is the webhook's
arrival time from this release on - older rows were stamped later, by the
worker):

```sql
SELECT e."eventType",
       count(*) AS replies,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.ms)) AS p50_ms,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY r.ms)) AS p90_ms
FROM "WebhookEvent" e
CROSS JOIN LATERAL (
  SELECT EXTRACT(EPOCH FROM (min(d."sentAt") - e."receivedAt")) * 1000 AS ms
  FROM "OutboundDelivery" d
  WHERE d."workspaceId" = e."workspaceId"
    AND d.kind IN ('CLASSIC_ACTION', 'CAMPAIGN_ACTION', 'EMAIL_CAPTURE')
    AND d."createdAt" BETWEEN e."receivedAt" AND e."receivedAt" + interval '2 minutes'
    AND d."sentAt" IS NOT NULL
    AND (
      d."deliveryKey" LIKE '%:event:' || e."providerEventId" || ':%'
      OR d."participantId" IN (
        SELECT p.id FROM "AutomationParticipant" p
        WHERE p."workspaceId" = e."workspaceId" AND p."sourceCommentId" = e."providerEventId"
      )
    )
) r
WHERE e."receivedAt" > now() - interval '7 days'
  AND r.ms IS NOT NULL
GROUP BY e."eventType";
```
