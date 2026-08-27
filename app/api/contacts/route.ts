import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";

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
  const [count, contacts] = await Promise.all([
    repository.countCapturedContacts(session.workspaceId),
    repository.listCapturedContacts(session.workspaceId, limit),
  ]);
  return NextResponse.json({ data: { count, contacts } });
}