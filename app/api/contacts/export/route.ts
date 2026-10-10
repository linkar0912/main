import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { requireManager } from "@/src/lib/auth/require-role";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { entitlementErrorResponse } from "@/src/lib/entitlements/http";
import { getServerEnv } from "@/src/lib/env";
import { instagramIdentityKey, resolveInstagramUsernames } from "@/src/lib/meta/username-resolver";
import { csvCell } from "@/src/lib/format/csv";

export const runtime = "nodejs";

// GET /api/contacts/export - CSV of the complete workspace contact registry.
export async function GET(request: Request) {
  const guard = await requireManager(request);
  if (!guard.ok) return guard.error;
  const { session } = guard;

  try {
    await getEntitlementService().assertEntitled(session.workspaceId, "exports", 0);
  } catch (error) {
    return entitlementErrorResponse(error)
      ?? NextResponse.json({ error: "entitlement_check_failed" }, { status: 500 });
  }

  const repository = getRepository();
  const [rows, events, members] = await Promise.all([
    repository.listContactsByLeadStatus(session.workspaceId, { limit: 10_000 }),
    repository.listRecentWebhookEvents(session.workspaceId, 500),
    repository.listMembers(session.workspaceId),
  ]);
  // Handles we already know (recent events + lookup cache) - no Meta calls, so
  // a 10k-row export stays fast. Unknown handles are left blank.
  const usernames = await resolveInstagramUsernames({ identities: rows, events, apiVersion: getServerEnv().metaApiVersion });
  const memberEmails = new Map(members.filter((member) => member.userId).map((member) => [member.userId!, member.email]));
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
    // Appended so existing imports that rely on column order keep working.
    "instagram_username",
    "assignee_email",
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
      csvCell(usernames.get(instagramIdentityKey(contact))),
      csvCell(contact.assigneeUserId ? memberEmails.get(contact.assigneeUserId) : undefined),
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
