import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { enqueueBroadcastSends, isQueueConfigured, type BroadcastSendJob } from "@/src/lib/queue";
import { isQuietNow, msUntilQuietEnd } from "@/src/lib/messaging-window";
import { z } from "zod";
import { deliveryKeys } from "@/src/lib/automation/outbound-delivery";
import { createId } from "@/src/lib/id";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse, utcMonthStart } from "@/src/lib/entitlements/http";

export const runtime = "nodejs";

const MAX_BROADCAST_RECIPIENTS = 500;

const broadcastSchema = z.object({
  name: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(1_000),
  segment: z.enum(["all_contacts", "captured_email", "inactive_7d", "inactive_30d"]),
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
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: z.infer<typeof broadcastSchema>;
  try {
    input = broadcastSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid broadcast" }, { status: 400 });
  }

  const repository = getRepository();
  try {
    const broadcastsThisMonth = (await repository.listBroadcasts(session.workspaceId, 10_000))
      .filter((broadcast) => broadcast.createdAt >= utcMonthStart()).length;
    await getEntitlementService().assertEntitled(session.workspaceId, "broadcasts", broadcastsThisMonth);
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }
  const recipients = await repository.listBroadcastRecipients(session.workspaceId, input.segment, MAX_BROADCAST_RECIPIENTS);

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

  const broadcast = await repository.createBroadcast(session.workspaceId, {
    name: input.name,
    text: input.text,
    segment: input.segment,
    total: recipients.length,
    status: recipients.length === 0 ? undefined : isScheduled ? "PENDING" : undefined,
  });

  if (recipients.length === 0) {
    return NextResponse.json({ data: broadcast }, { status: 201 });
  }

  const deliveries = await Promise.all(recipients.map((recipient) =>
    repository.ensureOutboundDelivery({
      deliveryKey: deliveryKeys.broadcastRecipient(
        broadcast.id,
        recipient.instagramAccountId,
        recipient.igScopedUserId,
      ),
      workspaceId: session.workspaceId,
      broadcastId: broadcast.id,
      instagramAccountId: recipient.instagramAccountId,
      recipientId: recipient.igScopedUserId,
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: input.text },
    })));

  const messagingWindow = await repository.getMessagingWindow(session.workspaceId).catch(() => null);
  const now = new Date();
  const quietHoldMs = messagingWindow && isQuietNow(now, messagingWindow)
    ? msUntilQuietEnd(now, messagingWindow)
    : 0;

  const jobs: BroadcastSendJob[] = recipients.map((recipient, index) => ({
    deliveryKey: deliveries[index].deliveryKey,
    broadcastId: broadcast.id,
    workspaceId: session.workspaceId,
    igAccountId: recipient.instagramAccountId,
    igScopedUserId: recipient.igScopedUserId,
  }));

  const enqueueResult = await enqueueBroadcastSends(jobs, quietHoldMs + scheduledHoldMs);
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
      { error: "Some recipients could not be queued. Delivery is partial - check the queue.", data: broadcast },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: broadcast }, { status: 201 });
}
