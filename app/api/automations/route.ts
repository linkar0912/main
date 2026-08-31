import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { resolveInstagramAccountId } from "@/src/lib/automation/account-pin";
import { resolveFacebookPageId } from "@/src/lib/automation/facebook-page-pin";
import { toReadableValidationError } from "@/src/lib/validation-error";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { parseAutomationTarget } from "@/src/lib/automation/channel-target";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ data: await getRepository().listAutomations(session.workspaceId) });
}

export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let body: { provider?: unknown; name?: unknown; definition?: unknown; instagramAccountId?: unknown; facebookPageId?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
    const target = parseAutomationTarget(body, { requirePin: true });
    if (!target) return NextResponse.json({ error: "invalid_channel_target" }, { status: 400 });
    const definition = validateFlowDefinition(body.definition);
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
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "automations",
      (await repository.listAutomations(session.workspaceId)).length,
    );
    const automation = await repository.createAutomation(session.workspaceId, {
      provider: target.provider,
      name,
      definition,
      ...(instagramAccountId ? { instagramAccountId } : {}),
      ...(facebookPageId ? { facebookPageId } : {}),
    });
    return NextResponse.json({ data: automation }, { status: 201 });
  } catch (error) {
    const entitlementResponse = entitlementErrorResponse(error);
    if (entitlementResponse) return entitlementResponse;
    return NextResponse.json({ error: toReadableValidationError(error, "Invalid automation") }, { status: 400 });
  }
}
