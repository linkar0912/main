import { describe, expect, it } from "vitest";
import type { MemberOnboardingRecord, WorkspaceOnboardingRecord } from "@/src/lib/repository";
import { OnboardingAnswersSchema, readStoredAnswers } from "./answers-schema";
import { deriveOnboardingSummary } from "./status";

const stamp = "2026-10-12T00:00:00.000Z";
const workspace = (patch: Partial<WorkspaceOnboardingRecord> = {}): WorkspaceOnboardingRecord => ({
  workspaceId: "w1", answers: {}, step: 1, existingWorkspace: false, createdAt: stamp, updatedAt: stamp, ...patch,
});
const member = (patch: Partial<MemberOnboardingRecord> = {}): MemberOnboardingRecord => ({
  workspaceId: "w1", email: "a@b.c", step: 1, existingMember: false, createdAt: stamp, updatedAt: stamp, ...patch,
});

describe("deriveOnboardingSummary", () => {
  it("sends a brand-new owner into onboarding", () => {
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: null, member: null })).toMatchObject({ required: true, flow: "owner", invite: false });
  });

  it("keeps an owner who is half way through in the flow", () => {
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: workspace({ step: 4 }), member: null }).required).toBe(true);
  });

  it("invites, never forces, a workspace that predates onboarding", () => {
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: workspace({ existingWorkspace: true }), member: null })).toMatchObject({ required: false, invite: true });
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: workspace({ existingWorkspace: true, inviteDismissedAt: stamp }), member: null }).invite).toBe(false);
  });

  it("releases a skipped owner and offers the invitation again", () => {
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: workspace({ skippedAt: stamp }), member: null })).toMatchObject({ required: false, invite: true, planCard: false });
  });

  it("shows the plan card after finishing until it is dismissed", () => {
    const done = workspace({ completedAt: stamp, answers: { goals: ["sell"], name: "Priya" } });
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: done, member: null })).toMatchObject({ required: false, planCard: true, goals: ["sell"], displayName: "Priya" });
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: { ...done, planDismissedAt: stamp }, member: null }).planCard).toBe(false);
  });

  it("gives invited team members the short flow on their own record", () => {
    expect(deriveOnboardingSummary({ role: "MEMBER", workspace: workspace({ completedAt: stamp }), member: null })).toMatchObject({ required: true, flow: "member", planCard: false });
    expect(deriveOnboardingSummary({ role: "ADMIN", workspace: null, member: member({ completedAt: stamp, displayName: "Arjun" }) })).toMatchObject({ required: false, flow: "member", displayName: "Arjun" });
    expect(deriveOnboardingSummary({ role: "MEMBER", workspace: null, member: member({ existingMember: true }) }).required).toBe(false);
  });

  it("prefers the person's own name over the owner's workspace answer", () => {
    expect(deriveOnboardingSummary({ role: "OWNER", workspace: workspace({ answers: { name: "Old" } }), member: member({ displayName: "New" }) }).displayName).toBe("New");
  });
});

describe("answers schema", () => {
  it("rejects choices outside the enums and unknown fields", () => {
    expect(OnboardingAnswersSchema.safeParse({ accountType: "pirate" }).success).toBe(false);
    expect(OnboardingAnswersSchema.safeParse({ goals: ["sell", "hack"] }).success).toBe(false);
    expect(OnboardingAnswersSchema.safeParse({ admin: true }).success).toBe(false);
  });

  it("caps and tidies free text", () => {
    expect(OnboardingAnswersSchema.safeParse({ name: "x".repeat(41) }).success).toBe(false);
    expect(OnboardingAnswersSchema.parse({ name: "  Priya   S  " }).name).toBe("Priya S");
    expect(OnboardingAnswersSchema.safeParse({ nicheOther: "y".repeat(61) }).success).toBe(false);
  });

  it("de-duplicates multi-select answers", () => {
    expect(OnboardingAnswersSchema.parse({ goals: ["sell", "sell", "faq"] }).goals).toEqual(["sell", "faq"]);
  });

  it("reads stored answers defensively, keeping only valid fields", () => {
    expect(readStoredAnswers({ accountType: "brand", goals: ["sell", "nope"], niches: ["food"], extra: 1 })).toEqual({ accountType: "brand", niches: ["food"] });
    expect(readStoredAnswers(null)).toEqual({});
    expect(readStoredAnswers([1, 2])).toEqual({});
  });
});
