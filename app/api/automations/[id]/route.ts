import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { resolveInstagramAccountId } from "@/src/lib/automation/account-pin";
import { resolveFacebookPageId } from "@/src/lib/automation/facebook-page-pin";
import type { UpdateAutomationInput } from "@/src/lib/repository";
import { toReadableValidationError } from "@/src/lib/validation-error";
import { parseAutomationTarget } from "@/src/lib/automation/channel-target";
import { deriveAutomationSurface, validateDefinitionForTarget } from "@/src/lib/automation/channels/registry";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const record = await getRepository().getAutomation(session.workspaceId, id);
  if (!record) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  return NextResponse.json({ data: record });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let body: { provider?: unknown; name?: unknown; status?: unknown; definition?: unknown; priority?: unknown; instagramAccountId?: unknown; facebookPageId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const patch: UpdateAutomationInput = {};
  const repository = getRepository();
  const current = await repository.getAutomation(session.workspaceId, id);
  if (!current) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  let parsedTarget;
  try {
    parsedTarget = parseAutomationTarget(body, { requirePin: false });
  } catch {
    return NextResponse.json({ error: "invalid_channel_target" }, { status: 400 });
  }

  const instagramAccountId = parsedTarget?.provider === "INSTAGRAM"
    ? await resolveInstagramAccountId(session.workspaceId, parsedTarget.instagramAccountId)
    : undefined;
  // resolveInstagramAccountId collapses the caller-supplied value into three
  // buckets: undefined (untouched, do not write), null (unpin), or a real
  // connected igUserId. A null result with a non-null/non-empty input means
  // the caller asked to pin something that is not a CONNECTED connection of
  // this workspace, which is the only user-facing error case worth
  // distinguishing from a no-op unpin.
  if (parsedTarget?.provider === "INSTAGRAM" && !instagramAccountId) {
    return NextResponse.json({ error: "That Instagram account is not connected to this workspace" }, { status: 400 });
  }
  if (instagramAccountId !== undefined) patch.instagramAccountId = instagramAccountId;

  const facebookPageId = parsedTarget?.provider === "FACEBOOK"
    ? await resolveFacebookPageId(session.workspaceId, parsedTarget.facebookPageId)
    : undefined;
  if (parsedTarget?.provider === "FACEBOOK" && !facebookPageId) {
    return NextResponse.json({ error: "That Facebook Page is not connected to this workspace" }, { status: 400 });
  }
  if (facebookPageId !== undefined) patch.facebookPageId = facebookPageId;

  if (parsedTarget) {
    patch.provider = parsedTarget.provider;
    if (parsedTarget.provider === "INSTAGRAM") {
      patch.instagramAccountId = instagramAccountId;
      patch.facebookPageId = null;
    } else {
      patch.facebookPageId = facebookPageId;
      patch.instagramAccountId = null;
    }
  }

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
    patch.name = name;
  }
  if (body.status === "DRAFT" || body.status === "ACTIVE" || body.status === "PAUSED") patch.status = body.status;
  if (body.priority !== undefined) {
    if (typeof body.priority !== "number" || !Number.isInteger(body.priority) || body.priority < -100 || body.priority > 100) {
      return NextResponse.json({ error: "Priority must be a whole number from -100 to 100" }, { status: 400 });
    }
    patch.priority = body.priority;
  }
  if (body.definition !== undefined) {
    try {
      patch.definition = validateFlowDefinition(body.definition);
    } catch (error) {
      return NextResponse.json({ error: toReadableValidationError(error, "Invalid definition") }, { status: 400 });
    }
  }

  if (parsedTarget || patch.definition) {
    const resultingDefinition = patch.definition ?? current.definition;
    const resultingProvider = parsedTarget?.provider ?? current.provider;
    const channelIssues = validateDefinitionForTarget(resultingDefinition, {
      provider: resultingProvider,
      surface: resultingProvider === "FACEBOOK" ? "COMMENT" : deriveAutomationSurface(resultingDefinition),
    });
    if (channelIssues.length > 0) {
      return NextResponse.json({ error: "invalid_channel_definition", issues: channelIssues }, { status: 400 });
    }
  }

  if (body.status === "ACTIVE" && current.status !== "ACTIVE") {
    patch.status = "ACTIVE";
    patch.activatedAt = new Date().toISOString();
    const definition = patch.definition ?? current.definition;
    if (definition.version === 2 && definition.trigger.source === "next_media") patch.boundMediaId = null;
  } else if (patch.definition) {
    // The automation was already ACTIVE (or is staying ACTIVE via this same PATCH) and its
    // definition is being edited. If the resulting definition uses next_media, re-arm the
    // binding: clear any stale boundMediaId from a prior trigger-source config and refresh
    // activatedAt so the next-media resolver (publishedAt > activatedAt) doesn't bind to an
    // already-published post. Without this, switching trigger sources while ACTIVE leaves
    // stale state that silently breaks binding (see task 8 edit-while-active follow-up).
    const resultingStatus = patch.status ?? current.status;
    if (
      resultingStatus === "ACTIVE"
      && patch.definition.version === 2
      && patch.definition.trigger.source === "next_media"
    ) {
      patch.boundMediaId = null;
      patch.activatedAt = new Date().toISOString();
    }
  }

  const automation = await repository.updateAutomation(session.workspaceId, id, patch);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  // Snapshot the previous state into the version history whenever the definition
  // or name changed. The PATCH itself only stores the latest, so we capture the
  // pre-update row first. Metadata-only edits (status / pin) skip the snapshot.
  if (patch.definition !== undefined || patch.name !== undefined) {
    await repository.snapshotAutomation(session.workspaceId, id, session.userId);
  }
  return NextResponse.json({ data: automation });
}

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const deleted = await getRepository().deleteAutomation(session.workspaceId, id);
  if (!deleted) return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  return NextResponse.json({ data: { deleted: true } });
}
