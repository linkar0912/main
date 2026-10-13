import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/src/lib/auth/require-role";
import type { AppSession } from "@/src/lib/auth/session";
import { friendlyFirstName } from "@/src/lib/display-name";
import { getRepository } from "@/src/lib/repository-provider";
import type { MemberRole } from "@/src/lib/repository";
import {
  MEMBER_FOCUSES,
  MEMBER_STEP_COUNT,
  OWNER_STEP_COUNT,
  type MemberFocus,
  type OnboardingAnswers,
} from "@/src/lib/onboarding/answers";
import { MemberAnswersSchema, OnboardingAnswersSchema, readStoredAnswers } from "@/src/lib/onboarding/answers-schema";
import { ONBOARDING_ACTIONS, type OnboardingView } from "@/src/lib/onboarding/view";

export const runtime = "nodejs";

const ALL_ROLES: readonly MemberRole[] = ["OWNER", "ADMIN", "MEMBER"];

const PutBody = z.object({
  step: z.number().int().min(1).max(OWNER_STEP_COUNT).optional(),
  answers: z.record(z.string(), z.unknown()).optional(),
  action: z.enum(ONBOARDING_ACTIONS).optional(),
}).strict();

function isFocus(value: unknown): value is MemberFocus {
  return typeof value === "string" && (MEMBER_FOCUSES as readonly string[]).includes(value);
}

/** Merge a validated partial into stored answers; an emptied text field is removed. */
function mergeAnswers(stored: OnboardingAnswers, patch: OnboardingAnswers): OnboardingAnswers {
  const merged: Record<string, unknown> = { ...stored, ...patch };
  for (const key of ["name", "nicheOther"] as const) {
    if (merged[key] === "") delete merged[key];
  }
  return merged as OnboardingAnswers;
}

async function loadView(session: AppSession, role: MemberRole): Promise<OnboardingView> {
  const repository = getRepository();
  const [workspace, member, instagram, facebook] = await Promise.all([
    repository.getWorkspaceOnboarding(session.workspaceId),
    repository.getMemberOnboarding(session.workspaceId, session.email),
    repository.listConnections(session.workspaceId).catch(() => []),
    repository.listFacebookPages(session.workspaceId).catch(() => []),
  ]);
  const owner = role === "OWNER";
  const progress = owner ? workspace : member;
  return {
    flow: owner ? "owner" : "member",
    step: Math.min(progress?.step ?? 1, owner ? OWNER_STEP_COUNT : MEMBER_STEP_COUNT),
    answers: owner ? readStoredAnswers(workspace?.answers) : {},
    member: {
      ...(member?.displayName ? { name: member.displayName } : {}),
      ...(isFocus(member?.focus) ? { focus: member.focus } : {}),
    },
    completedAt: progress?.completedAt ?? null,
    skippedAt: progress?.skippedAt ?? null,
    suggestedName: friendlyFirstName(session.email),
    canConnect: role === "OWNER" || role === "ADMIN",
    connections: {
      instagram: instagram.map((connection) => ({ username: connection.username, status: connection.status })),
      facebook: facebook.map((page) => ({ pageId: page.pageId, pageName: page.pageName, status: page.status })),
    },
  };
}

// GET /api/onboarding - the caller's onboarding: owner answers for the
// workspace, or the short member flow, plus connected accounts for step 7.
export async function GET(request: Request) {
  const guard = await requireRole(request, ALL_ROLES);
  if (!guard.ok) return guard.error;
  return NextResponse.json({ data: await loadView(guard.session, guard.role) });
}

// PUT /api/onboarding - save answers for one step (merged into what is
// stored), move the resume point, or finish / skip / dismiss. Every choice is
// validated against the enums in src/lib/onboarding/answers.ts.
export async function PUT(request: Request) {
  const guard = await requireRole(request, ALL_ROLES);
  if (!guard.ok) return guard.error;
  const { session, role } = guard;

  const body = PutBody.safeParse(await request.json().catch(() => undefined));
  if (!body.success) return NextResponse.json({ error: "invalid_onboarding" }, { status: 400 });
  const { step, answers, action } = body.data;
  const repository = getRepository();
  const now = new Date().toISOString();

  if (role === "OWNER") {
    const patch = answers ? OnboardingAnswersSchema.safeParse(answers) : null;
    if (patch && !patch.success) return NextResponse.json({ error: "invalid_onboarding" }, { status: 400 });
    const current = await repository.getWorkspaceOnboarding(session.workspaceId);
    const merged = patch ? mergeAnswers(readStoredAnswers(current?.answers), patch.data) : undefined;
    await repository.saveWorkspaceOnboarding(session.workspaceId, {
      ...(merged ? { answers: merged } : {}),
      ...(step !== undefined ? { step } : {}),
      ...(action === "complete" ? { completedAt: now, skippedAt: null, step: OWNER_STEP_COUNT } : {}),
      ...(action === "skip" && !current?.completedAt ? { skippedAt: now } : {}),
      ...(action === "dismiss-invite" ? { inviteDismissedAt: now } : {}),
      ...(action === "dismiss-plan" ? { planDismissedAt: now } : {}),
    });
    // The name is the person's own, so it also lives on their member row
    // where the greeting reads it for owners and members alike.
    if (patch?.data.name !== undefined || action === "complete") {
      await repository.saveMemberOnboarding(session.workspaceId, session.email, {
        ...(patch?.data.name !== undefined ? { displayName: patch.data.name || null } : {}),
        ...(action === "complete" ? { completedAt: now } : {}),
      });
    }
  } else {
    if (action === "dismiss-invite" || action === "dismiss-plan") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (step !== undefined && step > MEMBER_STEP_COUNT) return NextResponse.json({ error: "invalid_onboarding" }, { status: 400 });
    const patch = answers ? MemberAnswersSchema.safeParse(answers) : null;
    if (patch && !patch.success) return NextResponse.json({ error: "invalid_onboarding" }, { status: 400 });
    const current = await repository.getMemberOnboarding(session.workspaceId, session.email);
    await repository.saveMemberOnboarding(session.workspaceId, session.email, {
      ...(patch?.data.name !== undefined ? { displayName: patch.data.name || null } : {}),
      ...(patch?.data.focus !== undefined ? { focus: patch.data.focus } : {}),
      ...(step !== undefined ? { step } : {}),
      ...(action === "complete" ? { completedAt: now, skippedAt: null, step: MEMBER_STEP_COUNT } : {}),
      ...(action === "skip" && !current?.completedAt ? { skippedAt: now } : {}),
    });
  }

  return NextResponse.json({ data: await loadView(session, role) });
}
