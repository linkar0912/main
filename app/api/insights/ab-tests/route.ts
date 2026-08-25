import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

// GET /api/insights/ab-tests?automationId=<id> - per-variant A/B performance
// for one follow-gated campaign ("A" is the base opening message).
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const automationId = new URL(request.url).searchParams.get("automationId");
  if (!automationId) {
    return NextResponse.json({ error: "automationId is required" }, { status: 400 });
  }
  const repository = getRepository();
  const automation = await repository.getAutomation(session.workspaceId, automationId);
  if (!automation) return NextResponse.json({ error: "Automation not found" }, { status: 404 });

  const variants = await repository.countParticipantsByVariant(session.workspaceId, automationId);
  return NextResponse.json({
    data: variants.map((variant) => ({
      ...variant,
      deliveryRate: variant.participants > 0 ? variant.delivered / variant.participants : null,
      clickRate: variant.delivered > 0 ? variant.clicked / variant.delivered : null,
    })),
  });
}
