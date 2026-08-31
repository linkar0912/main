import { NextResponse } from "next/server";
import { validateFlowDefinition } from "@/src/lib/automation/definition";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { resolveInstagramAccountId } from "@/src/lib/automation/account-pin";
import { resolveFacebookPageId } from "@/src/lib/automation/facebook-page-pin";
import { toReadableValidationError } from "@/src/lib/validation-error";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";

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
    let body: { name?: unknown; definition?: unknown; instagramAccountId?: unknown; facebookPageId?: unknown };
    try {
      body = (await request.json()) as { name?: unknown; definition?: unknown; facebookPageId?: unknown };
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (name.length > 120) return NextResponse.json({ error: "Name must be 120 characters or fewer" }, { status: 400 });
    const definition = validateFlowDefinition(body.definition);
    // On create, an explicit instagramAccountId of ""/null is treated the same
    // as omitting the field (i.e. the create route does not allow pinning to
    // nothing; the pin is only applied when the client sends a real value).
    const instagramAccountId = body.instagramAccountId === undefined || body.instagramAccountId === null || body.instagramAccountId === ""
      ? undefined
      : await resolveInstagramAccountId(session.workspaceId, body.instagramAccountId);
    if (instagramAccountId === null) {
      return NextResponse.json({ error: "That Instagram account is not connected to this workspace" }, { status: 400 });
    }
    const facebookPageId = body.facebookPageId === undefined || body.facebookPageId === null || body.facebookPageId === ""
      ? undefined
      : await resolveFacebookPageId(session.workspaceId, body.facebookPageId);
    if (facebookPageId === null) {
      return NextResponse.json({ error: "That Facebook Page is not connected to this workspace" }, { status: 400 });
    }
    if (instagramAccountId && facebookPageId) {
      return NextResponse.json({ error: "An automation pins to either Instagram or a Facebook Page, not both" }, { status: 400 });
    }
    const repository = getRepository();
    await getEntitlementService().assertEntitled(
      session.workspaceId,
      "automations",
      (await repository.listAutomations(session.workspaceId)).length,
    );
    const automation = await repository.createAutomation(session.workspaceId, {
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
