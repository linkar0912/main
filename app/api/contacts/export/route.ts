import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";

export const runtime = "nodejs";

function csvCell(value: string | undefined): string {
  const safe = value ?? "";
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// GET /api/contacts/export - CSV of every captured lead for spreadsheets/CRMs.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getRepository().listCapturedContacts(session.workspaceId, 10_000);
  const header = ["email", "instagram_account_id", "captured_at"];
  const lines = [header.join(",")];
  for (const contact of rows) {
    lines.push([csvCell(contact.email), csvCell(contact.instagramAccountId), csvCell(contact.capturedAt)].join(","));
  }

  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="linkar-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}