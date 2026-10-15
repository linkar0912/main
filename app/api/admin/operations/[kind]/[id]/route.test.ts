import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), get: vi.fn(), execute: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminRead: mocks.read, requireAdminWrite: mocks.write }));
vi.mock("@/src/lib/admin/operations/repository", () => ({ getAdminOperationsRepository: () => ({ get: mocks.get }) }));
vi.mock("@/src/lib/admin/operations/service", async () => { const { z } = await import("zod"); return { AdminOperationCommandSchema: z.object({ action: z.string(), version: z.number(), input: z.record(z.string(), z.unknown()).default({}) }).strict(), executeAdminOperation: mocks.execute }; });
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.audit }));
const { PATCH } = await import("./route");
const guard = { owner: { userId: "owner", email: "owner@linkar.in", sessionId: "s", aal: "aal2" }, action: "operation.contact.retry", targetType: "contact", targetId: "c1", reason: "Recovery", idempotencyKey: "admin-operation-1", requestId: "r", origin: "https://app.linkar.in", ipHash: "h", userAgent: "test" };
describe("operation command route", () => { beforeEach(() => { mocks.write.mockReset().mockResolvedValue(guard); mocks.execute.mockReset().mockResolvedValue({ id: "a1", action: "pause" }); mocks.audit.mockReset().mockResolvedValue(undefined); }); it("executes inside ATTEMPT/SUCCESS audit phases", async () => { const response = await PATCH(new Request("https://app.linkar.in/api/admin/operations/automation/a1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pause", version: 2 }) }), { params: Promise.resolve({ kind: "automation", id: "a1" }) }); expect(response.status).toBe(200); expect(mocks.execute).toHaveBeenCalledWith("automation", "a1", { action: "pause", version: 2, input: {} }, "owner"); expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "SUCCESS"]); }); it("does not expose failures or skip failure auditing", async () => { mocks.execute.mockRejectedValue({ status: 400, code: "action_not_allowed" }); const response = await PATCH(new Request("https://app.linkar.in/api/admin/operations/contact/c1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "retry", version: 1 }) }), { params: Promise.resolve({ kind: "contact", id: "c1" }) }); expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "action_not_allowed" }); expect(mocks.audit.mock.calls.map(([event]) => event.phase)).toEqual(["ATTEMPT", "FAILURE"]); });
  it("sends an operator sentence written for display as a clean 422, and never an error's own message", async () => {
    const sentence = "actions 1 url: Short links from bit.ly are not allowed. Paste the full link instead, because short links can make messages look like spam.";
    mocks.execute.mockRejectedValueOnce(Object.assign(new Error("internal detail"), { status: 422, code: "invalid_definition", publicMessage: sentence }));
    const response = await PATCH(new Request("https://app.linkar.in/api/admin/operations/automation/a1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "activate", version: 2 }) }), { params: Promise.resolve({ kind: "automation", id: "a1" }) });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_definition", message: sentence });
    expect(mocks.audit.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "FAILURE", errorCode: "invalid_definition" });

    mocks.execute.mockRejectedValueOnce(Object.assign(new Error("redis://user:secret@host"), { status: 409, code: "stale_version" }));
    const quiet = await PATCH(new Request("https://app.linkar.in/api/admin/operations/automation/a1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "activate", version: 2 }) }), { params: Promise.resolve({ kind: "automation", id: "a1" }) });
    expect(await quiet.json()).toEqual({ error: "stale_version" });
  });
});
