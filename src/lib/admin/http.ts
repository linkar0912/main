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
    workspaceId: context.workspaceId,
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
  options: { before?: unknown; summarize?: (result: T) => unknown; allowReplay?: boolean } = {},
): Promise<T> {
  if (options.allowReplay) await appendAdminAuditEvent(auditInput(context, "ATTEMPT", { before: options.before }), { allowReplay: true });
  else await appendAdminAuditEvent(auditInput(context, "ATTEMPT", { before: options.before }));
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
      errorCode: typeof error === "object" && error !== null && "code" in error
        && typeof error.code === "string" && /^[a-zA-Z][a-zA-Z0-9_]{1,79}$/.test(error.code)
        ? error.code : "operation_failed",
    }));
    throw error;
  }
}
