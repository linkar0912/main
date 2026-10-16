import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), broadcast: vi.fn(), broadcastUpdate: vi.fn(), delivery: vi.fn(), deliveries: vi.fn(), deliveryUpdate: vi.fn(), webhook: vi.fn(), webhookUpdate: vi.fn(), broadcastQueue: vi.fn(), leadQueue: vi.fn(), webhookQueue: vi.fn(), automation: vi.fn(), automationFindFirst: vi.fn(), automationUpdate: vi.fn(), versionAggregate: vi.fn(), versionCreate: vi.fn(), deliveryReserve: vi.fn(), transaction: vi.fn() }));
const client = { automation: { findUnique: mocks.automation, findFirst: mocks.automationFindFirst, updateMany: mocks.automationUpdate }, automationVersion: { aggregate: mocks.versionAggregate, create: mocks.versionCreate }, workspace: { findUnique: mocks.workspace }, broadcast: { findUnique: mocks.broadcast, updateMany: mocks.broadcastUpdate }, outboundDelivery: { findUnique: mocks.delivery, findMany: mocks.deliveries, updateMany: mocks.deliveryUpdate, updateManyAndReturn: mocks.deliveryReserve }, webhookEvent: { findUnique: mocks.webhook, updateMany: mocks.webhookUpdate } };
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: [] }) }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { ...client, $transaction: mocks.transaction } }));
vi.mock("@/src/lib/queue", () => ({ enqueueBroadcastSends: mocks.broadcastQueue, enqueueLeadDelivery: mocks.leadQueue, enqueueWebhookEvents: mocks.webhookQueue, enqueueFacebookEvents: vi.fn() }));
const { executeAdminOperation } = await import("./service");
const delivery = { id: "d1", version: 4, workspaceId: "w1", deliveryKey: "delivery-1", kind: "LEAD_EMAIL", state: "FAILED", retryable: true, providerMessageId: null };
// Stands in for one UPDATE ... RETURNING: every matching row, one version up.
function reserveRows(rows: Array<{ id: string; version: number }>) {
  mocks.deliveryReserve.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => rows.filter((row) => where.id.in.includes(row.id)).map((row) => ({ ...row, version: row.version + 1 })));
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (work: (tx: unknown) => unknown) => work(client));
  mocks.workspace.mockResolvedValue({ status: "ACTIVE", members: [] });
  mocks.delivery.mockResolvedValue(delivery);
  mocks.deliveryUpdate.mockResolvedValue({ count: 1 });
  mocks.broadcastUpdate.mockResolvedValue({ count: 1 });
  mocks.webhookUpdate.mockResolvedValue({ count: 1 });
  mocks.leadQueue.mockResolvedValue(true);
  mocks.webhookQueue.mockResolvedValue(1);
});
it("does not enqueue a retry from an already stale record", async () => {
  await expect(executeAdminOperation("delivery", "d1", { action: "retry", version: 3, input: {} }, "owner")).rejects.toMatchObject({ code: "stale_version" });
  expect(mocks.leadQueue).not.toHaveBeenCalled();
});
it("wins the conditional ledger update before queueing and rejects concurrent state changes", async () => {
  mocks.deliveryUpdate.mockResolvedValue({ count: 0 });
  await expect(executeAdminOperation("delivery", "d1", { action: "retry", version: 4, input: {} }, "owner")).rejects.toMatchObject({ code: "stale_version" });
  expect(mocks.leadQueue).not.toHaveBeenCalled();
});
it("restores retry eligibility when queueing fails without overwriting a worker claim", async () => {
  mocks.leadQueue.mockRejectedValue(new Error("queue unavailable"));
  await expect(executeAdminOperation("delivery", "d1", { action: "retry", version: 4, input: {} }, "owner")).rejects.toMatchObject({ code: "retry_queue_unavailable" });
  expect(mocks.deliveryUpdate).toHaveBeenCalledBefore(mocks.leadQueue);
  expect(mocks.deliveryUpdate.mock.calls[1][0]).toMatchObject({ where: { id: "d1", version: 5, state: "PENDING", providerMessageId: null }, data: { state: "FAILED", retryable: true } });
});
it("does not turn an ambiguous expired provider claim into a sendable delivery", async () => {
  mocks.delivery.mockResolvedValue({ ...delivery, state: "CLAIMED", claimExpiresAt: new Date(0) });
  await executeAdminOperation("delivery", "d1", { action: "release_stale_claim", version: 4, input: {} }, "owner");
  expect(mocks.deliveryUpdate.mock.calls[0][0].data).toMatchObject({ state: "UNKNOWN", resultCode: "AMBIGUOUS", retryable: false });
  expect(mocks.leadQueue).not.toHaveBeenCalled();
});
it("restores only rejected broadcast recipients after a partial enqueue", async () => {
  mocks.broadcast.mockResolvedValue({ id: "b1", workspaceId: "w1", version: 2, status: "COMPLETED", completedAt: new Date(0) });
  const rows = ["a", "b"].map((recipientId) => ({ ...delivery, id: `d-${recipientId}`, broadcastId: "b1", instagramAccountId: "ig", recipientId }));
  mocks.deliveries.mockResolvedValue(rows);
  reserveRows(rows);
  mocks.broadcastQueue.mockResolvedValue({ accepted: [{ igAccountId: "ig", igScopedUserId: "a" }], rejected: [{ igAccountId: "ig", igScopedUserId: "b" }] });
  const result = await executeAdminOperation("broadcast", "b1", { action: "retry_failed", version: 2, input: {} }, "owner");
  expect(result).toMatchObject({ retried: 1, rejected: 1, version: 3 });
  expect(mocks.deliveryReserve).toHaveBeenCalledBefore(mocks.broadcastQueue);
  expect(mocks.deliveryUpdate.mock.calls.filter(([args]) => args.data.state === "FAILED")).toEqual([[expect.objectContaining({ where: expect.objectContaining({ id: "d-b", version: 5 }), data: expect.objectContaining({ state: "FAILED", retryable: true }) })]]);
});
it("reserves 50 failed broadcast sends in one statement inside an explicitly bounded transaction", async () => {
  mocks.broadcast.mockResolvedValue({ id: "b1", workspaceId: "w1", version: 2, status: "COMPLETED", completedAt: new Date(0) });
  const rows = Array.from({ length: 50 }, (_, index) => ({ ...delivery, id: `d-${index}`, deliveryKey: `key-${index}`, broadcastId: "b1", instagramAccountId: "ig", recipientId: `person-${index}` }));
  // One row has no person to send to, so it is never reserved.
  mocks.deliveries.mockResolvedValue([...rows, { ...delivery, id: "d-orphan", broadcastId: "b1", instagramAccountId: "ig", recipientId: null }]);
  reserveRows(rows);
  mocks.broadcastQueue.mockImplementation(async (jobs: Array<{ igAccountId: string; igScopedUserId: string }>) => ({ accepted: jobs, rejected: [] }));
  const result = await executeAdminOperation("broadcast", "b1", { action: "retry_failed", version: 2, input: {} }, "owner");
  expect(result).toEqual({ id: "b1", kind: "broadcast", action: "retry_failed", retried: 50, rejected: 0, version: 3 });
  expect(mocks.deliveryReserve).toHaveBeenCalledTimes(1);
  expect(mocks.deliveryUpdate).not.toHaveBeenCalled();
  const [{ where, data, select }] = mocks.deliveryReserve.mock.calls[0];
  expect(where).toEqual({ id: { in: rows.map((row) => row.id) }, state: "FAILED", retryable: true, providerMessageId: null });
  expect(data).toEqual({ state: "PENDING", retryable: false, version: { increment: 1 } });
  expect(select).toMatchObject({ id: true, deliveryKey: true, workspaceId: true, broadcastId: true, instagramAccountId: true, recipientId: true, version: true });
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5_000, timeout: 15_000 });
  expect(mocks.broadcastQueue).toHaveBeenCalledTimes(1);
  expect(mocks.broadcastQueue.mock.calls[0][0]).toHaveLength(50);
  expect(mocks.broadcastQueue.mock.calls[0][0][0]).toEqual({ deliveryKey: "key-0", broadcastId: "b1", workspaceId: "w1", igAccountId: "ig", igScopedUserId: "person-0" });
});
it("rejects truncated historical webhook summaries before changing their replay count", async () => {
  mocks.webhook.mockResolvedValue({ id: "h1", version: 1, workspaceId: "w1", adminReprocessCount: 0, payload: { accountId: "ig", text: "summary" } });
  await expect(executeAdminOperation("webhook", "h1", { action: "reprocess", version: 1, input: {} }, "owner")).rejects.toMatchObject({ code: "webhook_payload_incomplete" });
  expect(mocks.webhookUpdate).not.toHaveBeenCalled();
  expect(mocks.webhookQueue).not.toHaveBeenCalled();
});
it("preserves an interaction payload and original inbound timestamp on replay", async () => {
  mocks.webhook.mockResolvedValue({ id: "h1", version: 1, workspaceId: "w1", providerEventId: "original", eventType: "postback.received", adminReprocessCount: 0, payload: { accountId: "ig", recipientId: "person", text: "", replayVersion: 1, timestamp: 1234, interactionPayload: "flow:next", storyId: "story" } });
  await executeAdminOperation("webhook", "h1", { action: "reprocess", version: 1, input: {} }, "owner");
  expect(mocks.webhookUpdate).toHaveBeenCalledBefore(mocks.webhookQueue);
  expect(mocks.webhookQueue).toHaveBeenCalledWith([expect.objectContaining({ id: "original", timestamp: 1234, interactionPayload: "flow:next", storyId: "story" })], "webhook-h1-1");
});
it("numbers admin edit snapshots after the highest existing snapshot, not the automation's lock counter", async () => {
  const automation = { id: "a1", workspaceId: "w1", version: 3, provider: "INSTAGRAM", name: "Old", status: "PAUSED", priority: 0, activatedAt: null, boundMediaId: null, instagramAccountId: "ig", facebookPageId: null, archivedAt: null, definition: { version: 1, trigger: { type: "comment", match: "keyword", keywords: ["hi"], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "hello" }] } };
  mocks.automation.mockResolvedValue(automation);
  mocks.automationFindFirst.mockResolvedValue(automation);
  mocks.automationUpdate.mockResolvedValue({ count: 1 });
  mocks.versionAggregate.mockResolvedValue({ _max: { version: 7 } });
  mocks.versionCreate.mockResolvedValue({});
  await executeAdminOperation("automation", "a1", { action: "update", version: 3, input: { name: "New" } }, "owner");
  expect(mocks.versionCreate.mock.calls[0][0].data).toMatchObject({ version: 8, provider: "INSTAGRAM" });
});

const shortLinkAutomation = { id: "a2", workspaceId: "w1", version: 5, provider: "INSTAGRAM", name: "Shop", status: "PAUSED", priority: 0, activatedAt: null, boundMediaId: null, instagramAccountId: "ig", facebookPageId: null, archivedAt: null, definition: { version: 1, trigger: { type: "message", match: "keyword", keywords: ["shop"] }, conditions: [], actions: [{ type: "send_button", text: "Here you go", buttonLabel: "Shop now", url: "https://bit.ly/shop" }] } };
it("refuses to switch on a paused automation holding a short link with a plain 422, not a 500", async () => {
  mocks.automation.mockResolvedValue(shortLinkAutomation);
  mocks.automationUpdate.mockResolvedValue({ count: 1 });
  const failure = await executeAdminOperation("automation", "a2", { action: "activate", version: 5, input: {} }, "owner").catch((error: unknown) => error);
  expect(failure).toMatchObject({ status: 422, code: "invalid_definition" });
  expect((failure as { publicMessage?: string }).publicMessage).toMatch(/^actions 1 url: Short links from bit\.ly are not allowed\. Paste the full link instead/);
  expect(mocks.automationUpdate).not.toHaveBeenCalled();
});
it("still renames a paused automation holding a short link, and refuses a new definition with one", async () => {
  mocks.automation.mockResolvedValue(shortLinkAutomation);
  mocks.automationFindFirst.mockResolvedValue(shortLinkAutomation);
  mocks.automationUpdate.mockResolvedValue({ count: 1 });
  mocks.versionAggregate.mockResolvedValue({ _max: { version: 1 } });
  mocks.versionCreate.mockResolvedValue({});
  await expect(executeAdminOperation("automation", "a2", { action: "update", version: 5, input: { name: "Shop (fixed)" } }, "owner")).resolves.toMatchObject({ version: 6 });
  expect(mocks.automationUpdate.mock.calls[0][0].data).toMatchObject({ name: "Shop (fixed)", definition: shortLinkAutomation.definition });

  mocks.automationUpdate.mockClear();
  await expect(executeAdminOperation("automation", "a2", { action: "update", version: 5, input: { definition: shortLinkAutomation.definition } }, "owner"))
    .rejects.toMatchObject({ status: 422, code: "invalid_definition", publicMessage: expect.stringContaining("bit.ly") });
  expect(mocks.automationUpdate).not.toHaveBeenCalled();
});
