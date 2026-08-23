import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

function safeError(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, "https://[credentials]@")
    .replace(/(access[_-]?token|api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 500);
}

export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 25);
  const limit = Math.min(100, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 25));
  const records = await getRepository().listOutboundDeliveryProblems(session.workspaceId, limit);
  return NextResponse.json({
    data: records.map((record) => ({
      kind: record.kind,
      state: record.state,
      attemptCount: record.attemptCount,
      ...(record.automationId ? { automationId: record.automationId } : {}),
      ...(record.broadcastId ? { broadcastId: record.broadcastId } : {}),
      ...(record.sequenceEnrollmentId ? { sequenceEnrollmentId: record.sequenceEnrollmentId } : {}),
      ...(safeError(record.lastError) ? { lastError: safeError(record.lastError) } : {}),
      updatedAt: record.updatedAt,
    })),
  });
}
