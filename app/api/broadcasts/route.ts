import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { requireManager } from "@/src/lib/auth/require-role";
import { enqueueBroadcastSends, isQueueConfigured, type BroadcastSendJob } from "@/src/lib/queue";
import { isQuietNow, msUntilQuietEnd } from "@/src/lib/messaging-window";
import { z } from "zod";
import { deliveryKeys } from "@/src/lib/automation/outbound-delivery";
import { createId } from "@/src/lib/id";
import { EntitlementError, getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { toReadableValidationError } from "@/src/lib/validation-error";
import { logger } from "@/src/lib/logger";

export const runtime = "nodejs";

const MAX_BROADCAST_RECIPIENTS = 500;

/** WorkspaceUsagePeriod.periodStart for the current UTC month. */
function currentPeriodStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Same shape the inbox reply route accepts; a malformed key is ignored, as there.
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("idempotency-key")?.trim();
  return raw && IDEMPOTENCY_KEY_PATTERN.test(raw) ? raw : null;
}

/**
 * The broadcast id a retried send resolves to: a UUID-shaped sha256 of the
 * workspace and the client's key, so the same key in the same workspace
 * always names the same broadcast and two workspaces never collide.
 */
function idempotentBroadcastId(workspaceId: string, key: string): string {
  const hex = createHash("sha256").update(`${workspaceId}:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `broadcast_${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "P2002" || code === "23505";
}

const broadcastSchema = z.object({
  name: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(1_000),
  // inactive_7d / inactive_30d are intentionally NOT creatable: they select
  // contacts whose last inbound message is 7+ or 30+ days old, which is exactly
  // the set Meta's 24-hour messaging window forbids DMing. Every recipient would
  // be skipped as WINDOW_CLOSED, so the segment could only ever send zero
  // messages while looking like a working feature. Historical rows keep their
  // stored value for display.
  segment: z.enum(["all_contacts", "captured_email"]),
  // Optional ISO timestamp. When in the future, jobs are enqueued with a matching
  // BullMQ delay instead of fanning out immediately (quiet hours still apply).
  scheduleStart: z.string().datetime({ offset: true }).optional(),
});

// GET /api/broadcasts - recent blasts with progress.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const broadcasts = await getRepository().listBroadcasts(session.workspaceId, 20);
  return NextResponse.json({ data: broadcasts });
}

// POST /api/broadcasts - compose + fan out a DM blast (staggered ~1/second).
export async function POST(request: Request) {
  // A blast DMs a whole segment from the workspace's account: manager-only.
  const guard = await requireManager(request);
  if (!guard.ok) return guard.error;
  const { session } = guard;

  let input: z.infer<typeof broadcastSchema>;
  try {
    input = broadcastSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: toReadableValidationError(error, "Invalid broadcast") }, { status: 400 });
  }

  const repository = getRepository();
  // A retry of a send whose answer was lost (or came back as a partial 502)
  // carries the same key. It gets the broadcast the first attempt made, and
  // nothing is reserved, created or queued a second time. Known gap: if the
  // first attempt died after createBroadcast but before anything was queued
  // (a restart mid-deploy), the row stays RUNNING with nothing to send and
  // nothing sweeps it, so this replays it as still sending. That never sends
  // twice; cancelling the row lets the screen start a fresh one.
  const idempotencyKey = readIdempotencyKey(request);
  const broadcastId = idempotencyKey ? idempotentBroadcastId(session.workspaceId, idempotencyKey) : undefined;
  if (broadcastId) {
    const existing = await repository.getBroadcast(session.workspaceId, broadcastId);
    if (existing) return NextResponse.json({ data: existing, replayed: true }, { status: 200 });
  }

  let monthlyLimit: number | null;
  try {
    const entitlements = getEntitlementService();
    // Feature flag (and a zero limit) first; the monthly count itself is
    // enforced below by the atomic reservation, not by counting rows.
    await entitlements.assertEntitled(session.workspaceId, "broadcasts", 0);
    monthlyLimit = (await entitlements.getEffectiveEntitlements(session.workspaceId)).monthlyBroadcastLimit;
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }
  const { recipients, totalEligible } = await repository.listBroadcastRecipients(
    session.workspaceId,
    input.segment,
    MAX_BROADCAST_RECIPIENTS,
  );
  // People outside the 24-hour window are not counted at all; this reports
  // the per-broadcast cap so the UI can say who was left out.
  const audience = {
    eligible: totalEligible,
    queued: recipients.length,
    truncated: totalEligible > recipients.length,
  };

  // Delivery needs the queue. Checked before the broadcast row is created, because a
  // row created here with total > 0 can never reach COMPLETED without workers and
  // would sit in the UI as permanently in-progress.
  if (recipients.length > 0 && !isQueueConfigured()) {
    return NextResponse.json(
      { error: "Broadcasting requires the queue (REDIS_URL) to be configured." },
      { status: 503 },
    );
  }

  // A future scheduleStart turns the blast into delayed jobs; quiet hours stack on top.
  const scheduledFor = input.scheduleStart ? new Date(input.scheduleStart) : null;
  const scheduledHoldMs = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
  const isScheduled = scheduledHoldMs > 60_000;

  // Check-and-count in one statement: two concurrent creates can no longer
  // both read "limit - 1 used" and both go out.
  const periodStart = currentPeriodStart();
  const reservation = await repository.reserveMonthlyBroadcast(session.workspaceId, periodStart, monthlyLimit);
  if (!reservation.reserved) {
    // A same-key attempt running alongside this one may have taken the last
    // slot with this very broadcast; that is a replay, not a limit.
    if (broadcastId) {
      const existing = await repository.getBroadcast(session.workspaceId, broadcastId);
      if (existing) return NextResponse.json({ data: existing, replayed: true }, { status: 200 });
    }
    return entitlementErrorResponse(new EntitlementError(
      "limit_reached",
      "broadcasts",
      reservation.used,
      monthlyLimit ?? undefined,
    ))!;
  }

  let broadcast;
  try {
    broadcast = await repository.createBroadcast(session.workspaceId, {
      ...(broadcastId ? { id: broadcastId } : {}),
      name: input.name,
      text: input.text,
      segment: input.segment,
      total: recipients.length,
      status: recipients.length === 0 ? undefined : isScheduled ? "PENDING" : undefined,
    });
  } catch (error) {
    await repository.releaseMonthlyBroadcast(session.workspaceId, periodStart).catch(() => undefined);
    // Two attempts with the same key both got past the lookup: the other one
    // created the broadcast and is the one that queues it. Delivery keys and
    // job ids come from broadcast.id, so even an overlap cannot send twice.
    if (broadcastId && isUniqueViolation(error)) {
      const existing = await repository.getBroadcast(session.workspaceId, broadcastId);
      if (existing) return NextResponse.json({ data: existing, replayed: true }, { status: 200 });
    }
    throw error;
  }

  if (recipients.length === 0) {
    return NextResponse.json({ data: broadcast, audience }, { status: 201 });
  }

  // One batched insert and one read for up to 500 people; one statement per
  // person fired about 500 at once and starved the shared database pool.
  let deliveries;
  try {
    deliveries = await repository.ensureOutboundDeliveries(recipients.map((recipient) => ({
      deliveryKey: deliveryKeys.broadcastRecipient(
        broadcast.id,
        recipient.instagramAccountId,
        recipient.igScopedUserId,
      ),
      workspaceId: session.workspaceId,
      broadcastId: broadcast.id,
      instagramAccountId: recipient.instagramAccountId,
      recipientId: recipient.igScopedUserId,
      kind: "BROADCAST_RECIPIENT" as const,
      payload: { type: "text", text: input.text },
    })));
  } catch (error) {
    // Nothing is queued yet. Close the broadcast (and any delivery rows that
    // were stored) so it never sits in the list as running, and give the
    // month's broadcast back, as when the row itself could not be created.
    const closed = await repository.cancelBroadcast(session.workspaceId, broadcast.id).catch(() => null);
    // Count the cancelled deliveries as skipped, so a same-key retry whose
    // answer this was replays a broadcast that reached nobody. Only after a
    // close that worked: on a running row with no deliveries stored, the
    // recount would mark it finished with nobody to send to.
    if (closed?.status === "cancelled") {
      await repository.reconcileBroadcastCounters(session.workspaceId, broadcast.id).catch(() => undefined);
    }
    await repository.releaseMonthlyBroadcast(session.workspaceId, periodStart).catch(() => undefined);
    logger.error("Broadcast deliveries could not be stored", {
      workspaceId: session.workspaceId,
      broadcastId: broadcast.id,
      error: error instanceof Error ? error.message : String(error),
    });
    // queued: 0 tells the screen nobody can get this broadcast, so its next
    // try starts a fresh one instead of replaying this closed one.
    return NextResponse.json(
      { error: "Could not start this broadcast, so nobody was messaged. Try again in a moment.", queued: 0 },
      { status: 500 },
    );
  }

  const messagingWindow = await repository.getMessagingWindow(session.workspaceId).catch(() => null);
  const now = new Date();
  const effectiveSendAt = scheduledFor && scheduledFor > now ? scheduledFor : now;
  const quietHoldMs = messagingWindow && isQuietNow(effectiveSendAt, messagingWindow)
    ? msUntilQuietEnd(effectiveSendAt, messagingWindow)
    : 0;

  const jobs: BroadcastSendJob[] = recipients.map((recipient, index) => ({
    deliveryKey: deliveries[index].deliveryKey,
    broadcastId: broadcast.id,
    workspaceId: session.workspaceId,
    igAccountId: recipient.instagramAccountId,
    igScopedUserId: recipient.igScopedUserId,
  }));

  const enqueueResult = await enqueueBroadcastSends(jobs, quietHoldMs + scheduledHoldMs);
  if (enqueueResult.rejected.length > 0 && enqueueResult.accepted.length === 0) {
    // Nothing was queued (usually the queue did not answer), so nobody can
    // get this broadcast and a new try cannot message anyone twice. Close it
    // and give the month's broadcast back. Marking everyone failed instead
    // would leave a finished broadcast that a same-key retry replays as sent.
    const closed = await repository.cancelBroadcast(session.workspaceId, broadcast.id).catch(() => null);
    if (closed?.status === "cancelled") {
      // As above: a same-key retry then replays a broadcast that reached nobody.
      await repository.reconcileBroadcastCounters(session.workspaceId, broadcast.id).catch(() => undefined);
      const reconciled = await repository.getBroadcast(session.workspaceId, broadcast.id).catch(() => null);
      await repository.releaseMonthlyBroadcast(session.workspaceId, periodStart).catch(() => undefined);
      logger.warn("Broadcast could not be queued for anyone", {
        workspaceId: session.workspaceId,
        broadcastId: broadcast.id,
        people: jobs.length,
      });
      return NextResponse.json(
        { error: "The send queue did not answer, so nobody was messaged. Try again in a minute.", data: reconciled ?? closed.broadcast, queued: 0 },
        { status: 503 },
      );
    }
    // Could not close it: fall through and record everyone as failed.
  }
  if (enqueueResult.rejected.length > 0) {
    const deliveryKeyByRecipient = new Map(jobs.map((job) => [
      `${job.igAccountId}:${job.igScopedUserId}`,
      job.deliveryKey,
    ]));
    for (const recipient of enqueueResult.rejected) {
      const deliveryKey = deliveryKeyByRecipient.get(
        `${recipient.igAccountId}:${recipient.igScopedUserId}`,
      );
      if (!deliveryKey) continue;
      const owner = createId("broadcast_enqueue_failure");
      const claim = await repository.claimOutboundDelivery(
        deliveryKey,
        owner,
        new Date(Date.now() + 30_000).toISOString(),
      );
      if (claim.claimed) {
        await repository.failOutboundDelivery(
          deliveryKey,
          owner,
          "Broadcast recipient could not be queued",
          false,
          "PROVIDER_REJECTED",
        );
      }
    }
    await repository.reconcileBroadcastCounters(session.workspaceId, broadcast.id);
    return NextResponse.json(
      { error: "Some people could not be queued. Delivery is partial - check the queue.", data: broadcast, audience },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: broadcast, audience }, { status: 201 });
}
