import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

const TAG_PATTERN = /^[a-z0-9_-]{1,24}$/;
const MAX_TIMELINE_ENTRIES = 50;

// GET /api/contacts/[id] - one contact with their interaction timeline.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;

  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const timeline = await repository.getContactTimeline(session.workspaceId, id, MAX_TIMELINE_ENTRIES);
  return NextResponse.json({
    data: {
      contact: {
        id: contact.id,
        instagramAccountId: contact.instagramAccountId,
        igScopedUserId: contact.igScopedUserId,
        email: contact.email,
        state: contact.state,
        tags: contact.tags,
        score: contact.score,
        suppressedAt: contact.suppressedAt,
        lastSeenAt: contact.lastSeenAt,
        createdAt: contact.createdAt,
      },
      timeline,
    },
  });
}

// PATCH /api/contacts/[id] - replace the manual tag set; automatic labels
// ("email_captured", "opted_out", "clicked") are always preserved.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const rawTags = (body as { tags?: unknown })?.tags;
  if (!Array.isArray(rawTags)) {
    return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
  }
  const tags: string[] = [];
  for (const tag of rawTags.slice(0, 20)) {
    if (typeof tag !== "string" || !TAG_PATTERN.test(tag.trim().toLowerCase())) {
      return NextResponse.json(
        { error: `Tag "${String(tag)}" is invalid - use lowercase letters, numbers, dashes (max 24 chars).` },
        { status: 400 },
      );
    }
    tags.push(tag.trim().toLowerCase());
  }

  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const updated = await repository.setContactTags(
    session.workspaceId,
    contact.instagramAccountId,
    contact.igScopedUserId,
    tags,
  );
  if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ data: { id: updated.id, tags: updated.tags, score: updated.score } });
}
