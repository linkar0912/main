import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getSessionFromRequest } from "@/src/lib/auth/session";
import { enqueueBroadcastSends, isQueueConfigured, type BroadcastSendJob } from "@/src/lib/queue";
import { isQuietNow, msUntilQuietEnd } from "@/src/lib/messaging-window";
import { z } from "zod";

export const runtime = "nodejs";

const MAX_BROADCAST_RECIPIENTS = 500;

const broadcastSchema = z.object({
  name: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(1_000),
  segment: z.enum(["all_contacts", "captured_email"]),
});

// GET /api/broadcasts — recent blasts with progress.
export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const broadcasts = await getRepository().listBroadcasts(session.workspaceId, 20);
  return NextResponse.json({ data: broadcasts });
}

// POST /api/broadcasts — compose + fan out a DM blast (staggered ~1/second).
export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let input: z.infer<typeof broadcastSchema>;
  try {
    input = broadcastSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid broadcast" }, { status: 400 });
  }

  const repository = getRepository();
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

  const broadcast = await repository.createBroadcast(session.workspaceId, {
    name: input.name,
    text: input.text,
    segment: input.segment,
    total: recipients.length,
  });

  if (recipients.length === 0) {
    return NextResponse.json({ data: broadcast }, { status: 201 });
  }

  const messagingWindow = await repository.getMessagingWindow(session.workspaceId).catch(() => null);
  const now = new Date();
  const quietHoldMs = messagingWindow && isQuietNow(now, messagingWindow)
    ? msUntilQuietEnd(now, messagingWindow)
    : 0;

  const jobs: BroadcastSendJob[] = recipients.map((recipient) => ({
    broadcastId: broadcast.id,
    workspaceId: session.workspaceId,
    broadcastName: broadcast.name,
    text: input.text,
    igAccountId: recipient.instagramAccountId,
    igScopedUserId: recipient.igScopedUserId,
  }));

  const enqueued = await enqueueBroadcastSends(jobs, quietHoldMs).catch(() => 0);
  if (enqueued < jobs.length) {
    // The queue was reachable a moment ago but some jobs did not land. Account for the
    // shortfall so the broadcast can still finalize instead of hanging at RUNNING.
    await repository.incrementBroadcastCounters(broadcast.id, { failed: jobs.length - enqueued });
    await repository.finalizeBroadcastIfDone(session.workspaceId, broadcast.id);
    return NextResponse.json(
      { error: "Some recipients could not be queued. Delivery is partial — check the queue.", data: broadcast },
      { status: 502 },
    );
  }

  return NextResponse.json({ data: broadcast }, { status: 201 });
}