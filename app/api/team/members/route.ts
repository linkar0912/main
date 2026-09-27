import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

// GET /api/team/members - people a contact can be assigned to. Any member can
// read it (assigning is not a manager-only action); only members who have
// signed in have a userId, so pending invitees are left out.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const members = await getRepository().listMembers(session.workspaceId);
  return NextResponse.json({
    data: members
      .filter((member) => member.userId)
      .map(({ userId, email, role }) => ({ userId, email, role })),
  });
}
