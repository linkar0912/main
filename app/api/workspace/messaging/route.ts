import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/src/lib/repository-provider";
import { getSessionFromRequest } from "@/src/lib/auth/session";

export const runtime = "nodejs";

const windowSchema = z.object({
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  timezone: z.string().trim().min(1).max(64),
});

// GET /api/workspace/messaging — quiet-hours window (null when disabled).
export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const messagingWindow = await getRepository().getMessagingWindow(session.workspaceId);
  return NextResponse.json({ data: messagingWindow });
}

// PATCH /api/workspace/messaging — set or clear the window (body null clears).
export async function PATCH(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const repository = getRepository();
  const raw = await request.json().catch(() => undefined);
  if (raw === null) {
    await repository.setMessagingWindow(session.workspaceId, null);
    return NextResponse.json({ data: null });
  }

  try {
    const messagingWindow = windowSchema.parse(raw);
    if (messagingWindow.startHour === messagingWindow.endHour) {
      return NextResponse.json({ error: "Start and end hours cannot be identical" }, { status: 400 });
    }
    // Validate the timezone by round-tripping through Intl.
    new Intl.DateTimeFormat("en-US", { timeZone: messagingWindow.timezone });
    await repository.setMessagingWindow(session.workspaceId, messagingWindow);
    return NextResponse.json({ data: messagingWindow });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid window" }, { status: 400 });
  }
}