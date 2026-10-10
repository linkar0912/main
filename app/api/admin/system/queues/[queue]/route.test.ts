import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), execute: vi.fn(), list: vi.fn(), audit: vi.fn() })); vi.mock("server-only", () => ({})); vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.read, requireAdminWrite: mocks.write })); vi.mock("@/src/lib/admin/system/commands", () => ({ executeQueueCommand: mocks.execute, listQueueFailedJobs: mocks.list })); vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit })); const { GET, PATCH } = await import("./route"); const guard = { owner: { userId: "owner", email: "owner@linkar.in", sessionId: "s", aal: "aal2" }, action: "system.queue.pause", targetType: "queue", targetId: "webhooks", reason: "Provider maintenance", idempotencyKey: "admin-queue-0001", requestId: "r", origin: "https://app.linkar.in", ipHash: "h", userAgent: "test" };
describe("queue command route", () => { it("passes only an allowlisted queue command through the audited boundary", async () => { mocks.write.mockResolvedValue(guard); mocks.execute.mockResolvedValue({ paused: true }); mocks.audit.mockResolvedValue(undefined); const response = await PATCH(new Request("https://app.linkar.in/api/admin/system/queues/webhooks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pause" }) }), { params: Promise.resolve({ queue: "webhooks" }) }); expect(response.status).toBe(200); expect(mocks.execute).toHaveBeenCalledWith("webhooks", { action: "pause" }); }); });
describe("failed job listing", () => {
  it("returns safe failed-job summaries behind the owner read guard", async () => {
    mocks.read.mockResolvedValue(guard.owner);
    mocks.list.mockResolvedValue([{ id: "j1", name: "instagram-event", failedAt: "2026-09-05T06:00:00.000Z", attemptsMade: 3, code: "PROVIDER_REJECTED" }]);
    const response = await GET(new Request("https://app.linkar.in/api/admin/system/queues/webhooks"), { params: Promise.resolve({ queue: "webhooks" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ data: [{ id: "j1", name: "instagram-event", failedAt: "2026-09-05T06:00:00.000Z", attemptsMade: 3, code: "PROVIDER_REJECTED" }] });
    expect(mocks.list).toHaveBeenCalledWith("webhooks");
  });
  it("maps structured failures to their status", async () => {
    mocks.read.mockResolvedValue(guard.owner);
    mocks.list.mockRejectedValue(Object.assign(new Error("unknown_queue"), { status: 404, code: "unknown_queue" }));
    const response = await GET(new Request("https://app.linkar.in/api/admin/system/queues/x"), { params: Promise.resolve({ queue: "x" }) });
    expect(response.status).toBe(404);
  });
});
