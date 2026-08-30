import { NextResponse } from "next/server";
import { getRepository } from "@/src/lib/repository-provider";
import { getValidatedSession } from "@/src/lib/auth/session";
import { parseSequenceInput } from "@/src/lib/automation/sequence";
import { toReadableValidationError } from "@/src/lib/validation-error";

export const runtime = "nodejs";

// GET /api/sequences - every sequence plus live enrollment counts.
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const repository = getRepository();
  const [sequences, counts] = await Promise.all([
    repository.listSequences(session.workspaceId),
    repository.countEnrollmentsBySequence(session.workspaceId),
  ]);
  const countBySequence = new Map(counts.map((entry) => [entry.sequenceId, entry.count]));
  return NextResponse.json({
    data: sequences.map((sequence) => ({ ...sequence, enrolledCount: countBySequence.get(sequence.id) ?? 0 })),
  });
}

// POST /api/sequences - create a sequence.
export async function POST(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const input = parseSequenceInput(await request.json());
    const repository = getRepository();
    if (input.sourceAutomationId) {
      const source = await repository.getAutomation(session.workspaceId, input.sourceAutomationId);
      if (!source) return NextResponse.json({ error: "Source automation not found" }, { status: 400 });
    }
    const record = await repository.createSequence(session.workspaceId, input);
    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: toReadableValidationError(error, "Invalid sequence") }, { status: 400 });
  }
}
