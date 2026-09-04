import { NextResponse } from "next/server";

import { getValidatedSession, type AppSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import type { MemberRole } from "@/src/lib/repository";

type BillingGuardSuccess = {
  ok: true;
  session: AppSession;
  role: MemberRole;
};

type BillingGuardFailure = {
  ok: false;
  error: NextResponse;
};

export type BillingGuard = BillingGuardSuccess | BillingGuardFailure;

export async function requireBillingReader(request: Request): Promise<BillingGuard> {
  const session = await getValidatedSession(request);
  if (!session) {
    return { ok: false, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const role = await getRepository().getMemberRole(session.workspaceId, session.email);
  if (!role) {
    return { ok: false, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, session, role };
}

export async function requireBillingOwner(request: Request): Promise<BillingGuard> {
  const guard = await requireBillingReader(request);
  if (!guard.ok) return guard;
  if (guard.role !== "OWNER") {
    return { ok: false, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return guard;
}
