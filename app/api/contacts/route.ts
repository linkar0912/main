import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { LEAD_STATUSES, type LeadStatus } from "@/src/lib/repository";

export const runtime = "nodejs";

// Emails captured by DM email-capture flows, newest first. Session-guarded so the
// audience list is only ever visible inside the workspace.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;
  const repository = getRepository();
  if (url.searchParams.get("scope") === "all") {
    const leadStatusParam = url.searchParams.get("leadStatus");
    if (leadStatusParam && !(LEAD_STATUSES as readonly string[]).includes(leadStatusParam)) {
      return NextResponse.json({ error: "Invalid lead status" }, { status: 400 });
    }
    const leadStatus = leadStatusParam as LeadStatus | null;
    const [counts, contacts] = await Promise.all([
      repository.countContactsByLeadStatus(session.workspaceId),
      repository.listContactsByLeadStatus(session.workspaceId, {
        ...(leadStatus ? { leadStatus } : {}),
        limit,
      }),
    ]);
    return NextResponse.json({
      data: {
        count: Object.values(counts).reduce((sum, value) => sum + value, 0),
        counts,
        contacts: contacts.map((contact) => ({
          id: contact.id,
          instagramAccountId: contact.instagramAccountId,
          igScopedUserId: contact.igScopedUserId,
          email: contact.email,
          state: contact.state,
          tags: contact.tags,
          score: contact.score,
          leadStatus: contact.leadStatus,
          assigneeUserId: contact.assigneeUserId,
          sourceAutomationId: contact.sourceAutomationId,
          suppressedAt: contact.suppressedAt,
          lastSeenAt: contact.lastSeenAt,
          createdAt: contact.createdAt,
        })),
      },
    });
  }
  const [count, contacts] = await Promise.all([
    repository.countCapturedContacts(session.workspaceId),
    repository.listCapturedContacts(session.workspaceId, limit),
  ]);
  return NextResponse.json({ data: { count, contacts } });
}
