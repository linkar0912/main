import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { appendAdminAuditEvent } from "./audit";
import type { AdminWriteContext } from "./request-guard";

export function adminJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function adminRouteError(error: unknown, fallback = "admin_operation_failed"): NextResponse {
  if (
    typeof error === "object" && error !== null &&
    "status" in error && typeof error.status === "number" &&
    "code" in error && typeof error.code === "string"
  ) {
    return adminJson({ error: error.code }, { status: error.status });
  }
  if (error instanceof SyntaxError || error instanceof ZodError) {
    return adminJson({ error: "invalid_request" }, { status: 422 });
  }
  return adminJson({ error: fallback }, { status: 500 });
}

function auditInput(context: AdminWriteContext, phase: "ATTEMPT" | "SUCCESS" | "FAILURE", data: {
  before?: unknown;
  after?: unknown;
  errorCode?: string;
}) {
  return {
    requestId: context.requestId,
    phase,
    actorUserId: context.owner.userId,
    actorEmail: context.owner.email,
    sessionId: context.owner.sessionId,
    action: context.action,
    targetType: context.targetType,
    targetId: context.targetId,
    reason: context.reason,
    before: data.before,
    after: data.after,
    errorCode: data.errorCode,
    ipHash: context.ipHash,
    userAgent: context.userAgent,
    origin: context.origin,
  };
}

export async function runAuditedAdminMutation<T>(
  context: AdminWriteContext,
  operation: () => Promise<T>,
  options: { before?: unknown; summarize?: (result: T) => unknown } = {},
): Promise<T> {
  await appendAdminAuditEvent(auditInput(context, "ATTEMPT", { before: options.before }));
  try {
    const result = await operation();
    await appendAdminAuditEvent(auditInput(context, "SUCCESS", {
      before: options.before,
      after: options.summarize?.(result) ?? result,
    }));
    return result;
  } catch (error) {
    await appendAdminAuditEvent(auditInput(context, "FAILURE", {
      before: options.before,
      errorCode: error instanceof Error ? error.message.slice(0, 200) : "operation_failed",
    }));
    throw error;
  }
}
