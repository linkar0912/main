import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { LEAD_STATUSES, type LeadStatus } from "@/src/lib/repository";

export const runtime = "nodejs";

const TAG_PATTERN = /^[a-z0-9_-]{1,24}$/;
const MAX_TIMELINE_ENTRIES = 50;
const MAX_NOTES_LENGTH = 4_000;
const MAX_ASSIGNEE_LENGTH = 64;
const MAX_TAGS = 20;

function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

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
        leadStatus: contact.leadStatus,
        assigneeUserId: contact.assigneeUserId,
        notes: contact.notes,
        sourceAutomationId: contact.sourceAutomationId,
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
  const payload = (body ?? {}) as {
    tags?: unknown;
    leadStatus?: unknown;
    assigneeUserId?: unknown;
    notes?: unknown;
    sourceAutomationId?: unknown;
  };

  // At least one updatable field must be present so we never silently no-op.
  if (
    payload.tags === undefined
    && payload.leadStatus === undefined
    && payload.assigneeUserId === undefined
    && payload.notes === undefined
    && payload.sourceAutomationId === undefined
  ) {
    return NextResponse.json(
      { error: "Provide tags, leadStatus, assigneeUserId, notes, or sourceAutomationId." },
      { status: 400 },
    );
  }

  let tags: string[] | undefined;
  if (payload.tags !== undefined) {
    if (!Array.isArray(payload.tags)) {
      return NextResponse.json({ error: "tags must be an array of strings" }, { status: 400 });
    }
    tags = [];
    for (const tag of payload.tags.slice(0, MAX_TAGS)) {
      if (typeof tag !== "string" || !TAG_PATTERN.test(tag.trim().toLowerCase())) {
        return NextResponse.json(
          { error: `Tag "${String(tag)}" is invalid - use lowercase letters, numbers, dashes (max 24 chars).` },
          { status: 400 },
        );
      }
      tags.push(tag.trim().toLowerCase());
    }
  }

  let leadStatus: LeadStatus | undefined;
  if (payload.leadStatus !== undefined) {
    if (payload.leadStatus === null) {
      return NextResponse.json(
        { error: "leadStatus cannot be null - use a valid value or omit the field." },
        { status: 400 },
      );
    }
    if (!isLeadStatus(payload.leadStatus)) {
      return NextResponse.json(
        { error: `leadStatus must be one of: ${LEAD_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    leadStatus = payload.leadStatus;
  }

  let assigneeUserId: string | null | undefined;
  if (payload.assigneeUserId !== undefined) {
    if (payload.assigneeUserId === null) {
      assigneeUserId = null;
    } else if (typeof payload.assigneeUserId !== "string") {
      return NextResponse.json({ error: "assigneeUserId must be a string or null." }, { status: 400 });
    } else {
      const trimmed = payload.assigneeUserId.trim();
      if (!trimmed) assigneeUserId = null;
      else if (trimmed.length > MAX_ASSIGNEE_LENGTH) {
        return NextResponse.json(
          { error: `assigneeUserId must be ${MAX_ASSIGNEE_LENGTH} characters or fewer.` },
          { status: 400 },
        );
      } else assigneeUserId = trimmed;
    }
  }

  let notes: string | null | undefined;
  if (payload.notes !== undefined) {
    if (payload.notes === null) {
      notes = null;
    } else if (typeof payload.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string or null." }, { status: 400 });
    } else {
      const trimmed = payload.notes.trim();
      notes = trimmed ? trimmed.slice(0, MAX_NOTES_LENGTH) : null;
    }
  }

  let sourceAutomationId: string | null | undefined;
  if (payload.sourceAutomationId !== undefined) {
    if (payload.sourceAutomationId === null) {
      sourceAutomationId = null;
    } else if (typeof payload.sourceAutomationId !== "string" || !payload.sourceAutomationId.trim()) {
      return NextResponse.json(
        { error: "sourceAutomationId must be a non-empty string or null." },
        { status: 400 },
      );
    } else {
      sourceAutomationId = payload.sourceAutomationId.trim();
    }
  }

  const repository = getRepository();
  const contact = await repository.getContactById(session.workspaceId, id);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  let tagRecord = contact;
  if (tags !== undefined) {
    const updated = await repository.setContactTags(
      session.workspaceId,
      contact.instagramAccountId,
      contact.igScopedUserId,
      tags,
    );
    if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    tagRecord = updated;
  }

  const profile = await repository.updateContactProfile(session.workspaceId, id, {
    ...(leadStatus !== undefined ? { leadStatus } : {}),
    ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(sourceAutomationId !== undefined ? { sourceAutomationId } : {}),
  });
  if (!profile) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  return NextResponse.json({
    data: {
      id: profile.id,
      tags: tagRecord.tags,
      score: profile.score,
      leadStatus: profile.leadStatus,
      assigneeUserId: profile.assigneeUserId,
      notes: profile.notes,
      sourceAutomationId: profile.sourceAutomationId,
    },
  });
}
