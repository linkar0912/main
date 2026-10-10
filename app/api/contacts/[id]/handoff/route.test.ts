import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { POST, DELETE } = await import("./route");

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/contacts/[id]/handoff", () => {
  let contactId = "";

  beforeEach(async () => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    contactId = (await repository.touchContact("workspace_1", "ig_1", "sender_1", "2026-09-01T06:00:00.000Z")).record.id;
    await repository.createParticipant({
      workspaceId: "workspace_1",
      automationId: "automation_1",
      instagramAccountId: "ig_1",
      sourceCommentId: "comment_1",
      sourceMediaId: "media_1",
      sourceMediaSnapshot: { id: "media_1", mediaType: "VIDEO", permalink: "https://www.instagram.com/reel/media_1", timestamp: "2026-09-01T05:00:00.000Z" },
      igScopedUserId: "sender_1",
    });
  });

  it("pauses automations on handoff and resumes them on DELETE", async () => {
    const handoff = await POST(new Request("https://app.linkar.in", {
      method: "POST",
      body: JSON.stringify({ reason: "Asked for a refund", pauseAutomations: true }),
    }), context(contactId));
    expect((await handoff.json()).data.pausedCount).toBe(1);
    expect(await repository.hasPausedParticipant("workspace_1", "ig_1", "sender_1")).toBe(true);

    const resume = await DELETE(new Request("https://app.linkar.in", { method: "DELETE" }), context(contactId));
    expect(resume.status).toBe(200);
    expect((await resume.json()).data.resumedCount).toBe(1);
    expect(await repository.hasPausedParticipant("workspace_1", "ig_1", "sender_1")).toBe(false);
  });

  it("keeps the existing assignee and notes when a handoff omits them", async () => {
    await repository.ensureWorkspace("workspace_1", "owner@linkar.in");
    await repository.addMember("workspace_1", "agent@linkar.in", "MEMBER", "user_agent");
    await repository.updateContactProfile("workspace_1", contactId, { assigneeUserId: "user_agent", notes: "VIP, ships to Pune" });

    const handoff = await POST(new Request("https://app.linkar.in", {
      method: "POST",
      body: JSON.stringify({ reason: "Asked for a refund" }),
    }), context(contactId));

    expect(handoff.status).toBe(200);
    const contact = await repository.getContactById("workspace_1", contactId);
    expect(contact).toMatchObject({ assigneeUserId: "user_agent", notes: "VIP, ships to Pune" });
  });

  it("clears the assignee and notes only when they are explicitly null", async () => {
    await repository.updateContactProfile("workspace_1", contactId, { assigneeUserId: "user_agent", notes: "Old note" });

    await POST(new Request("https://app.linkar.in", {
      method: "POST",
      body: JSON.stringify({ reason: "Escalated", assigneeUserId: null, notes: null }),
    }), context(contactId));

    const contact = await repository.getContactById("workspace_1", contactId);
    expect(contact?.assigneeUserId).toBeUndefined();
    expect(contact?.notes).toBeUndefined();
  });

  it("rejects resuming a contact from another workspace", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_2", workspaceId: "workspace_2" });
    const response = await DELETE(new Request("https://app.linkar.in", { method: "DELETE" }), context(contactId));
    expect(response.status).toBe(404);
  });
});
