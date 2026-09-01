import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";

export const runtime = "nodejs";

function csvCell(value: string | undefined): string {
  const safe = value ?? "";
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// GET /api/contacts/export - CSV of the complete workspace contact registry.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await getEntitlementService().assertEntitled(session.workspaceId, "exports", 0);
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }

  const rows = await getRepository().listContactsByLeadStatus(session.workspaceId, { limit: 10_000 });
  const header = [
    "contact_id",
    "email",
    "instagram_account_id",
    "instagram_user_id",
    "lead_status",
    "score",
    "tags",
    "assignee",
    "opted_out",
    "last_seen_at",
    "created_at",
  ];
  const lines = [header.join(",")];
  for (const contact of rows) {
    lines.push([
      csvCell(contact.id),
      csvCell(contact.email),
      csvCell(contact.instagramAccountId),
      csvCell(contact.igScopedUserId),
      csvCell(contact.leadStatus),
      String(contact.score),
      csvCell(contact.tags.join(";")),
      csvCell(contact.assigneeUserId),
      String(Boolean(contact.suppressedAt)),
      csvCell(contact.lastSeenAt),
      csvCell(contact.createdAt),
    ].join(","));
  }

  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="linkar-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
