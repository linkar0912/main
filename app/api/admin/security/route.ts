import { NextResponse } from "next/server";
import { z } from "zod";

import { appendAdminAuditEvent } from "@/src/lib/admin/audit";
import {
  consumeAdminChallenge,
  createAdminChallenge,
} from "@/src/lib/admin/challenges";
import { getPlatformOwnerIdentity } from "@/src/lib/admin/authorization";
import {
  requireAdminIdentityWrite,
  requireAdminWrite,
  type AdminWriteContext,
} from "@/src/lib/admin/request-guard";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import {
  loadAdminSecurityFactors,
  loadAdminSecurityState,
  type AdminSecurityFactor,
} from "@/src/lib/admin/security";

const FactorId = z.string().trim().min(1).max(200);
const SecurityAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }).strict(),
  z.object({ action: z.literal("verify"), factorId: FactorId, code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ action: z.literal("prepare_unenroll"), factorId: FactorId }).strict(),
  z.object({
    action: z.literal("unenroll"),
    factorId: FactorId,
    confirmation: z.string().min(1).max(300),
    challengeToken: z.string().min(16).max(500),
  }).strict(),
]);

class SecurityRouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

function noStoreJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function audit(
  context: AdminWriteContext,
  phase: "ATTEMPT" | "SUCCESS" | "FAILURE",
  after?: unknown,
  errorCode?: string,
): Promise<void> {
  await appendAdminAuditEvent({
    requestId: context.requestId,
    phase,
    actorUserId: context.owner.userId,
    actorEmail: context.owner.email,
    sessionId: context.owner.sessionId,
    action: context.action,
    targetType: context.targetType,
    targetId: context.targetId,
    reason: context.reason,
    after,
    errorCode,
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    origin: context.origin,
  });
}

async function audited<T>(
  context: AdminWriteContext,
  operation: () => Promise<T>,
  summary: (result: T) => unknown,
): Promise<T> {
  await audit(context, "ATTEMPT");
  try {
    const result = await operation();
    await audit(context, "SUCCESS", summary(result));
    return result;
  } catch (error) {
    const errorCode = error instanceof SecurityRouteError ? error.code : "mfa_operation_failed";
    await audit(context, "FAILURE", undefined, errorCode);
    throw error;
  }
}

function routeError(error: unknown): NextResponse {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return noStoreJson({ error: "invalid_request" }, { status: 422 });
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return noStoreJson({ error: error.code }, { status: error.status });
  }
  return noStoreJson({ error: "security_operation_failed" }, { status: 500 });
}

function removableFactor(factors: AdminSecurityFactor[], factorId: string): AdminSecurityFactor {
  const factor = factors.find((candidate) => candidate.id === factorId && candidate.status === "verified");
  if (!factor) throw new SecurityRouteError(404, "factor_not_found");
  if (factors.filter((candidate) => candidate.status === "verified").length < 2) {
    throw new SecurityRouteError(409, "last_verified_factor");
  }
  return factor;
}

function confirmationPhrase(factor: AdminSecurityFactor): string {
  return `REMOVE MFA ${factor.friendlyName}`;
}

export async function GET(_request: Request): Promise<NextResponse> {
  try {
    const owner = await getPlatformOwnerIdentity();
    return noStoreJson({ data: await loadAdminSecurityState(owner.aal) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = SecurityAction.parse(await request.json());

    if (input.action === "enroll") {
      const identity = await getPlatformOwnerIdentity();
      const context = await requireAdminIdentityWrite(request, {
        action: "security.factor.enroll",
        targetType: "owner",
        targetId: identity.userId,
      });
      const supabase = await createSupabaseServerClient();
      const data = await audited(context, async () => {
        const result = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Linkar Operator",
          issuer: "Linkar",
        });
        if (result.error || !result.data || result.data.type !== "totp") {
          throw new SecurityRouteError(502, "mfa_provider_error");
        }
        return result.data;
      }, (result) => ({ factorId: result.id, status: "unverified" }));

      return noStoreJson({
        data: {
          factorId: data.id,
          qrCode: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        },
      });
    }

    if (input.action === "verify") {
      const identity = await getPlatformOwnerIdentity();
      const context = await requireAdminIdentityWrite(request, {
        action: "security.factor.verify",
        targetType: "mfa_factor",
        targetId: input.factorId,
      });
      const supabase = await createSupabaseServerClient();
      await audited(context, async () => {
        const result = await supabase.auth.mfa.challengeAndVerify({
          factorId: input.factorId,
          code: input.code,
        });
        if (result.error || !result.data) throw new SecurityRouteError(422, "invalid_mfa_code");
        return { verified: true };
      }, (result) => ({ factorId: input.factorId, ...result }));

      return noStoreJson({ data: { verified: true, redirectTo: "/admin" } });
    }

    if (input.action === "prepare_unenroll") {
      const context = await requireAdminWrite(request, {
        action: "security.factor.prepare_unenroll",
        targetType: "mfa_factor",
        targetId: input.factorId,
      });
      const { factors } = await loadAdminSecurityFactors();
      const factor = removableFactor(factors, input.factorId);
      const confirmation = confirmationPhrase(factor);
      const challenge = await audited(context, () => createAdminChallenge({
        userId: context.owner.userId,
        sessionId: context.owner.sessionId,
        action: "security.factor.unenroll",
        targetType: "mfa_factor",
        targetId: factor.id,
        expectedVersion: factor.updatedAt,
        confirmation,
      }), () => ({ factorId: factor.id, challengeCreated: true }));

      return noStoreJson({ data: { ...challenge, confirmationPhrase: confirmation } });
    }

    const context = await requireAdminWrite(request, {
      action: "security.factor.unenroll",
      targetType: "mfa_factor",
      targetId: input.factorId,
    });
    const { supabase, factors } = await loadAdminSecurityFactors();
    const factor = removableFactor(factors, input.factorId);
    await audited(context, async () => {
      await consumeAdminChallenge({
        userId: context.owner.userId,
        sessionId: context.owner.sessionId,
        action: "security.factor.unenroll",
        targetType: "mfa_factor",
        targetId: factor.id,
        expectedVersion: factor.updatedAt,
        confirmation: input.confirmation,
        token: input.challengeToken,
      });
      const result = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (result.error || !result.data) throw new SecurityRouteError(502, "mfa_provider_error");
      return { factorId: factor.id, removed: true };
    }, (result) => result);

    return noStoreJson({ data: { removed: true } });
  } catch (error) {
    return routeError(error);
  }
}
