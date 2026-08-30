import type { AdminAuditPhase, Prisma } from "@prisma/client";

import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";

const SECRET_KEY = /token|secret|password|cookie|authorization|otp|signedrequest|payload/i;
const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const MAX_STRING_LENGTH = 4_000;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_DEPTH = 6;

export type AdminAuditInput = {
  requestId: string;
  phase: AdminAuditPhase;
  actorUserId: string;
  actorEmail: string;
  sessionId: string;
  action: string;
  targetType: string;
  targetId: string;
  workspaceId?: string;
  reason: string;
  before?: unknown;
  after?: unknown;
  errorCode?: string;
  ipHash: string;
  userAgent: string;
  origin?: string;
};

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value).slice(0, MAX_STRING_LENGTH);
  if (depth >= MAX_OBJECT_DEPTH) return TRUNCATED;
  if (seen.has(value)) return TRUNCATED;

  seen.add(value);
  if (Array.isArray(value)) {
    const redacted = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => redactValue(item, depth + 1, seen));
    seen.delete(value);
    return redacted;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_ARRAY_LENGTH)) {
    redacted[key] = SECRET_KEY.test(key)
      ? REDACTED
      : redactValue(item, depth + 1, seen);
  }
  seen.delete(value);
  return redacted;
}

export function redactAdminAuditValue(value: unknown): unknown {
  return redactValue(value, 0, new WeakSet<object>());
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return redactAdminAuditValue(value) as Prisma.InputJsonValue;
}

export async function appendAdminAuditEvent(input: AdminAuditInput): Promise<void> {
  await prisma.adminAuditEvent.create({
    data: {
      id: createId("audit"),
      requestId: input.requestId,
      phase: input.phase,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      sessionId: input.sessionId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      workspaceId: input.workspaceId,
      reason: input.reason.slice(0, MAX_STRING_LENGTH),
      before: input.before === undefined ? undefined : asInputJson(input.before),
      after: input.after === undefined ? undefined : asInputJson(input.after),
      errorCode: input.errorCode?.slice(0, 200),
      ipHash: input.ipHash.slice(0, 200),
      userAgent: input.userAgent.slice(0, 1_000),
      origin: input.origin?.slice(0, 500),
    },
  });
}
