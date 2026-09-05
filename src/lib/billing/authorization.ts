import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

import { clientAddress } from "@/src/lib/auth/client-address";
import { getValidatedSession, type AppSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { getRepository } from "@/src/lib/repository-provider";
import type { MemberRole } from "@/src/lib/repository";
import type { BillingMutationContext } from "./service";

type BillingGuardSuccess = {
  ok: true;
  session: AppSession;
  role: MemberRole;
  auditContext?: BillingMutationContext;
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
  const suppliedOrigin = request.headers.get("origin")?.trim();
  if (!suppliedOrigin) {
    return { ok: false, error: NextResponse.json({ error: "origin_required" }, { status: 403 }) };
  }
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(suppliedOrigin).origin;
  } catch {
    return { ok: false, error: NextResponse.json({ error: "origin_mismatch" }, { status: 403 }) };
  }
  if (normalizedOrigin !== new URL(request.url).origin) {
    return { ok: false, error: NextResponse.json({ error: "origin_mismatch" }, { status: 403 }) };
  }
  const env = getServerEnv();
  const address = clientAddress(request, env.trustedProxyHops);
  const ipHash = createHmac("sha256", env.authSessionSecret)
    .update(`billing-client-address\0${address}`)
    .digest("hex");
  return {
    ...guard,
    auditContext: {
      requestId: createId("billing_req"),
      userId: guard.session.userId,
      email: guard.session.email,
      workspaceId: guard.session.workspaceId,
      ipHash,
      userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 1_000),
      origin: normalizedOrigin,
    },
  };
}
