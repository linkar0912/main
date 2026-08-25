import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { simulateDefinition, validateFlowSemantics } from "@/src/lib/automation/simulator";

export const runtime = "nodejs";

const EVENT_TYPES = [
  "comment.created",
  "message.received",
  "quick_reply.received",
  "postback.received",
  "optin.received",
  "referral.received",
  "story_mention.received",
] as const;

// POST /api/automations/simulate - dry-runs a draft definition against a sample
// event and reports semantic issues. Never touches Meta APIs or storage.
export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { definition, event } = (body ?? {}) as {
    definition?: unknown;
    event?: { type?: unknown; text?: unknown; senderUsername?: unknown; mediaId?: unknown; commentId?: unknown };
  };

  let parsed;
  try {
    parsed = validateFlowDefinition(definition);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid automation definition" },
      { status: 400 },
    );
  }

  const eventType = EVENT_TYPES.includes(event?.type as never) ? (event?.type as string) : "message.received";
  const sampleEvent = {
    type: eventType,
    text: typeof event?.text === "string" ? event.text.slice(0, 500) : "",
    ...(typeof event?.senderUsername === "string" && event.senderUsername ? { senderUsername: event.senderUsername.slice(0, 60) } : {}),
    ...(typeof event?.mediaId === "string" && event.mediaId ? { mediaId: event.mediaId.slice(0, 60) } : {}),
    ...(eventType === "comment.created" ? { commentId: typeof event?.commentId === "string" ? event.commentId : "simulate_comment", recipientId: undefined } : {}),
  };

  const result = simulateDefinition(parsed, sampleEvent as never);
  return NextResponse.json({
    data: {
      result,
      issues: validateFlowSemantics(parsed),
      simulatedEvent: sampleEvent,
    },
  });
}
