import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { DELETE, PATCH } = await import("./route");

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function seedBroadcast(status: "RUNNING" | "PENDING" | "COMPLETED" = "RUNNING") {
  const broadcast = await repository.createBroadcast("workspace_1", {
    name: "Drop", text: "New stock", segment: "all_contacts", total: 2, status,
  });
  for (const recipient of ["person_1", "person_2"]) {
    await repository.ensureOutboundDelivery({
      deliveryKey: `broadcast:${broadcast.id}:ig_1:${recipient}`,
      workspaceId: "workspace_1",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: recipient,
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "New stock" },
    });
  }
  return broadcast;
}

describe("cancelling a broadcast", () => {
  beforeEach(async () => {
    repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_1", "owner@linkar.in");
    await repository.addMember("workspace_1", "member@linkar.in", "MEMBER", "user_2");
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "workspace_1" });
  });

  it("marks the broadcast and its unsent recipients CANCELLED", async () => {
    const broadcast = await seedBroadcast();

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context(broadcast.id));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ status: "CANCELLED", skipped: 2, cancelledAt: expect.any(String) });
    const delivery = await repository.getOutboundDelivery(`broadcast:${broadcast.id}:ig_1:person_1`);
    expect(delivery?.state).toBe("CANCELLED");
  });

  it("never sends to a cancelled recipient when its queued job still runs", async () => {
    const broadcast = await seedBroadcast("PENDING");
    await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }), context(broadcast.id));

    const prepared = await repository.prepareOutboundDelivery({
      deliveryKey: `broadcast:${broadcast.id}:ig_1:person_2`,
      workspaceId: "workspace_1",
      broadcastId: broadcast.id,
      instagramAccountId: "ig_1",
      recipientId: "person_2",
      kind: "BROADCAST_RECIPIENT",
      payload: { type: "text", text: "New stock" },
      owner: "worker",
      leaseUntil: new Date(Date.now() + 30_000).toISOString(),
      periodStart: `${new Date().toISOString().slice(0, 7)}-01`,
      monthlyLimit: null,
    });

    expect(prepared.status).toBe("TERMINAL");
  });

  it("refuses to cancel a finished broadcast", async () => {
    const broadcast = await seedBroadcast("COMPLETED");
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context(broadcast.id));
    expect(response.status).toBe(409);
  });

  it("rejects an unsupported PATCH body and plain members", async () => {
    const broadcast = await seedBroadcast();
    const badBody = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ status: "RUNNING" }) }), context(broadcast.id));
    expect(badBody.status).toBe(400);

    mocks.getValidatedSession.mockResolvedValue({ userId: "user_2", email: "member@linkar.in", workspaceId: "workspace_1" });
    const forbidden = await DELETE(new Request("http://localhost", { method: "DELETE" }), context(broadcast.id));
    expect(forbidden.status).toBe(403);
    expect((await repository.getBroadcast("workspace_1", broadcast.id))?.status).toBe("RUNNING");
  });

  it("returns 404 for another workspace's broadcast", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context("broadcast_missing"));
    expect(response.status).toBe(404);
  });
});
