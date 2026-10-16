import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { resolveInstagramAccountId } from "@/src/lib/automation/account-pin";
import { resolveFacebookPageId } from "@/src/lib/automation/facebook-page-pin";
import { isValidationError, toReadableValidationError } from "@/src/lib/validation-error";
import { logger } from "@/src/lib/logger";
import { EntitlementError, getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { parseAutomationTarget } from "@/src/lib/automation/channel-target";
import { deriveAutomationSurface, validateDefinitionForTarget } from "@/src/lib/automation/channels/registry";

export const runtime = "nodejs";

// Same shape the inbox reply route accepts; a malformed key is ignored, as there.
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("idempotency-key")?.trim();
  return raw && IDEMPOTENCY_KEY_PATTERN.test(raw) ? raw : null;
}

/**
 * The automation id a retried create resolves to: a UUID-shaped sha256 of
 * the workspace and the builder's key, so a save whose answer was lost finds
 * the automation it made instead of making a second one.
 */
function idempotentAutomationId(workspaceId: string, key: string): string {
  const hex = createHash("sha256").update(`${workspaceId}:${key}`).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `automation_${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "P2002" || code === "23505";
}

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: await getRepository().listAutomations(session.workspaceId) });
}

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let body: { provider?: unknown; name?: unknown; status?: unknown; definition?: unknown; priority?: unknown; instagramAccountId?: unknown; facebookPageId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
    const priority = body.priority === undefined ? 0 : body.priority;
    if (typeof priority !== "number" || !Number.isInteger(priority) || priority < -100 || priority > 100) {
      return NextResponse.json({ error: "Priority must be a whole number from -100 to 100" }, { status: 400 });
    }
    if (body.status !== undefined && body.status !== "DRAFT" && body.status !== "ACTIVE") {
      return NextResponse.json({ error: "Status must be DRAFT or ACTIVE" }, { status: 400 });
    }
    const status = body.status === "ACTIVE" ? "ACTIVE" : "DRAFT";
    let target;
    try {
      target = parseAutomationTarget(body, { requirePin: true });
    } catch {
      return NextResponse.json({ error: "invalid_channel_target" }, { status: 400 });
    }
    if (!target) return NextResponse.json({ error: "invalid_channel_target" }, { status: 400 });
    const definition = validateFlowDefinition(body.definition);
    const channelIssues = validateDefinitionForTarget(definition, {
      provider: target.provider,
      surface: target.provider === "FACEBOOK" ? "COMMENT" : deriveAutomationSurface(definition),
    });
    if (channelIssues.length > 0) {
      return NextResponse.json({ error: "invalid_channel_definition", issues: channelIssues }, { status: 400 });
    }
    const instagramAccountId = target.provider === "INSTAGRAM"
      ? await resolveInstagramAccountId(session.workspaceId, target.instagramAccountId)
      : undefined;
    if (!instagramAccountId && target.provider === "INSTAGRAM") {
      return NextResponse.json({ error: "That Instagram account is not connected to this workspace" }, { status: 400 });
    }
    const facebookPageId = target.provider === "FACEBOOK"
      ? await resolveFacebookPageId(session.workspaceId, target.facebookPageId)
      : undefined;
    if (!facebookPageId && target.provider === "FACEBOOK") {
      return NextResponse.json({ error: "That Facebook Page is not connected to this workspace" }, { status: 400 });
    }
    const repository = getRepository();
    // Checked before the plan count: the first attempt's automation already
    // counts, so a workspace at its limit would otherwise be refused its own retry.
    const idempotencyKey = readIdempotencyKey(request);
    const automationId = idempotencyKey ? idempotentAutomationId(session.workspaceId, idempotencyKey) : undefined;
    if (automationId) {
      const existing = await repository.getAutomation(session.workspaceId, automationId);
      if (existing) return NextResponse.json({ data: existing, replayed: true }, { status: 200 });
    }
    try {
      await getEntitlementService().assertEntitled(
        session.workspaceId,
        "automations",
        (await repository.listAutomations(session.workspaceId)).length,
      );
    } catch (error) {
      // A same-key attempt running alongside this one may have just filled
      // the last slot with this very automation; that is a replay, not a limit.
      if (automationId && error instanceof EntitlementError && error.code === "limit_reached") {
        const existing = await repository.getAutomation(session.workspaceId, automationId);
        if (existing) return NextResponse.json({ data: existing, replayed: true }, { status: 200 });
      }
      throw error;
    }
    let automation;
    try {
      automation = await repository.createAutomation(session.workspaceId, {
        ...(automationId ? { id: automationId } : {}),
        provider: target.provider,
        name,
        definition,
        priority,
        status,
        ...(status === "ACTIVE" ? { activatedAt: new Date().toISOString() } : {}),
        ...(instagramAccountId ? { instagramAccountId } : {}),
        ...(facebookPageId ? { facebookPageId } : {}),
      });
    } catch (error) {
      // Two attempts with the same key both got past the lookup; the other one won.
      if (automationId && isUniqueViolation(error)) {
        const existing = await repository.getAutomation(session.workspaceId, automationId);
        if (existing) return NextResponse.json({ data: existing, replayed: true }, { status: 200 });
      }
      throw error;
    }
    return NextResponse.json({ data: automation }, { status: 201 });
  } catch (error) {
    const entitlementResponse = entitlementErrorResponse(error);
    if (entitlementResponse) return entitlementResponse;
    if (isValidationError(error)) {
      return NextResponse.json({ error: toReadableValidationError(error, "Invalid automation") }, { status: 400 });
    }
    // Repository/driver failures are not the caller's fault and their messages
    // carry query internals: log the detail, answer with a generic 500.
    logger.error("Could not create automation", {
      workspaceId: session.workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Could not save this automation. Try again in a moment." }, { status: 500 });
  }
}
