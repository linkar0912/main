import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { deliveryKeys, executeOutboundDelivery } from "./outbound-delivery";
import { processBroadcastSend } from "./broadcast-runner";
import { withBroadcastOptOutLine } from "./broadcast-opt-out";
import {
  contactAutomationsPaused,
  MANUAL_REPLY_PAUSE_MS,
  normalizeManualReplyEchoes,
  processManualReplyEcho,
  type ManualReplyEcho,
} from "./manual-reply";
import { processNormalizedEvent } from "./runner";

vi.mock("../repository-provider", () => ({ getRepository: vi.fn() }));

const ACCOUNT = "ig_business";
const PERSON = "igsid_person";
const NOW = Date.parse("2026-09-27T10:00:00.000Z");

async function harness() {
  const repository = createMemoryRepository();
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: ACCOUNT,
    username: "creator",
    accessTokenEncrypted: sealSecret("token", "c".repeat(64)),
    status: "CONNECTED",
  });
  await repository.touchContact("workspace_a", ACCOUNT, PERSON, new Date(NOW - 60_000).toISOString());
  return repository;
}

const echo = (messageId: string): ManualReplyEcho => ({ messageId, accountId: ACCOUNT, recipientId: PERSON, timestamp: NOW });

async function recordAutomatedSend(repository: Awaited<ReturnType<typeof harness>>, messageId: string, kind: "CLASSIC_ACTION" | "MANUAL_INBOX" = "CLASSIC_ACTION") {
  await executeOutboundDelivery({
    deliveryKey: `test:${messageId}`,
    workspaceId: "workspace_a",
    instagramAccountId: ACCOUNT,
    recipientId: PERSON,
    kind,
    payload: { text: "hello" },
    claimLeaseMs: 30_000,
    repository,
    entitlementService: { getMonthlyDeliveryLimit: async () => null },
  }, async () => ({ message_id: messageId }));
}

/**
 * A broadcast ledger row for PERSON that holds the text as composed. The row
 * is created first, so the caller decides how the send settles.
 */
async function recordBroadcastRow(repository: Awaited<ReturnType<typeof harness>>, text: string) {
  const broadcast = await repository.createBroadcast("workspace_a", { name: "News", text, segment: "all_contacts", total: 1 });
  const deliveryKey = deliveryKeys.broadcastRecipient(broadcast.id, ACCOUNT, PERSON);
  await repository.ensureOutboundDelivery({
    deliveryKey,
    workspaceId: "workspace_a",
    broadcastId: broadcast.id,
    instagramAccountId: ACCOUNT,
    recipientId: PERSON,
    kind: "BROADCAST_RECIPIENT",
    payload: { type: "text", text },
  });
  return { broadcast, deliveryKey };
}

describe("manual reply echoes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("extracts only the account's own outgoing messages from a webhook", () => {
    const echoes = normalizeManualReplyEchoes({
      object: "instagram",
      entry: [{
        id: ACCOUNT,
        time: NOW,
        messaging: [
          { sender: { id: ACCOUNT }, recipient: { id: PERSON }, timestamp: NOW, message: { mid: "m_out", text: "hey", is_echo: true } },
          { sender: { id: PERSON }, recipient: { id: ACCOUNT }, timestamp: NOW, message: { mid: "m_in", text: "hi" } },
          { sender: { id: ACCOUNT }, recipient: { id: PERSON }, timestamp: NOW, message: { mid: "m_gone", is_echo: true, is_deleted: true } },
        ],
      }],
    });
    expect(echoes).toEqual([{ messageId: "m_out", accountId: ACCOUNT, recipientId: PERSON, timestamp: NOW, text: "hey" }]);
  });

  it("pauses automations for the person when a teammate replied by hand", async () => {
    const repository = await harness();

    expect(await processManualReplyEcho(echo("m_human"), repository)).toBe("paused");

    const contact = await repository.getContact("workspace_a", ACCOUNT, PERSON);
    expect(contact?.automationsPausedUntil).toBe(new Date(NOW + MANUAL_REPLY_PAUSE_MS).toISOString());
    expect(contactAutomationsPaused(contact, NOW + 1_000)).toBe(true);
    expect(contactAutomationsPaused(contact, NOW + MANUAL_REPLY_PAUSE_MS + 1)).toBe(false);
  });

  it("recognises Linkar's own automated sends and leaves automations running", async () => {
    const repository = await harness();
    await recordAutomatedSend(repository, "m_bot");

    expect(await processManualReplyEcho(echo("m_bot"), repository)).toBe("automated");
    expect((await repository.getContact("workspace_a", ACCOUNT, PERSON))?.automationsPausedUntil).toBeUndefined();
  });

  it("still recognises an automated send whose echo id differs, by its exact text", async () => {
    const repository = await harness();
    await recordAutomatedSend(repository, "m_api_id");

    expect(await processManualReplyEcho({ ...echo("m_echo_id"), text: "hello" }, repository)).toBe("automated");
    expect(await processManualReplyEcho({ ...echo("m_other"), text: "Something a person typed" }, repository)).toBe("paused");
  });

  it("recognises a broadcast echo carrying the opt-out line when the ledger has no message id", async () => {
    const repository = await harness();
    // A send that timed out after Meta accepted it: the row is UNKNOWN with no
    // message id, so neither the id lookup nor the in-flight check covers it.
    const { deliveryKey } = await recordBroadcastRow(repository, "Big news!");
    await repository.claimOutboundDelivery(deliveryKey, "worker_1", new Date(NOW + 30_000).toISOString());
    await repository.markOutboundDeliveryUnknown(deliveryKey, "worker_1", "Request timed out");
    expect(await repository.getOutboundDelivery(deliveryKey)).toMatchObject({ state: "UNKNOWN" });
    expect(await repository.hasInFlightAutomatedDelivery("workspace_a", ACCOUNT, new Date(NOW - 120_000).toISOString())).toBe(false);

    const sentText = withBroadcastOptOutLine("Big news!");
    expect(sentText).not.toBe("Big news!");
    expect(await processManualReplyEcho({ ...echo("m_broadcast"), text: sentText }, repository)).toBe("automated");
    expect((await repository.getContact("workspace_a", ACCOUNT, PERSON))?.automationsPausedUntil).toBeUndefined();
  });

  it("recognises the exact text a broadcast sent when Meta returned no message id", async () => {
    const repository = await harness();
    await repository.recordWebhookEvent("workspace_a", {
      providerEventId: "inbound_1",
      eventType: "message.received",
      receivedAt: new Date(NOW - 60_000).toISOString(),
      payload: { accountId: ACCOUNT, recipientId: PERSON, text: "hi" },
    });
    const { broadcast, deliveryKey } = await recordBroadcastRow(repository, "Big news!");
    const sendDirectMessage = vi.fn().mockResolvedValue({});

    await processBroadcastSend(
      { deliveryKey, broadcastId: broadcast.id, workspaceId: "workspace_a", igAccountId: ACCOUNT, igScopedUserId: PERSON },
      repository,
      { client: { sendDirectMessage }, tokenEncryptionKey: "c".repeat(64) },
    );

    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
    expect((await repository.getOutboundDelivery(deliveryKey))?.providerMessageId).toBeUndefined();
    const sent = sendDirectMessage.mock.calls[0][2] as { text: string };
    expect(await processManualReplyEcho({ ...echo("m_echo_only"), text: sent.text }, repository)).toBe("automated");
    expect((await repository.getContact("workspace_a", ACCOUNT, PERSON))?.automationsPausedUntil).toBeUndefined();
  });

  it("still pauses for a teammate's own words sent after a broadcast", async () => {
    const repository = await harness();
    await recordBroadcastRow(repository, "Big news!");

    expect(await processManualReplyEcho({ ...echo("m_typed"), text: "Big news! Call me when you can" }, repository)).toBe("paused");
  });

  it("treats a reply sent from the Linkar inbox as a human reply", async () => {
    const repository = await harness();
    await recordAutomatedSend(repository, "m_inbox", "MANUAL_INBOX");

    expect(await processManualReplyEcho(echo("m_inbox"), repository)).toBe("paused");
  });

  it("does not guess while an automated send to the account is still settling", async () => {
    const repository = await harness();
    vi.spyOn(repository, "hasInFlightAutomatedDelivery").mockResolvedValue(true);

    expect(await processManualReplyEcho(echo("m_unknown"), repository)).toBe("undecided");
    expect((await repository.getContact("workspace_a", ACCOUNT, PERSON))?.automationsPausedUntil).toBeUndefined();
  });

  it("never shortens an existing pause", async () => {
    const repository = await harness();
    const later = new Date(NOW + 2 * MANUAL_REPLY_PAUSE_MS).toISOString();
    await repository.pauseContactAutomations("workspace_a", ACCOUNT, PERSON, later, "handoff");

    await processManualReplyEcho(echo("m_human"), repository);

    expect((await repository.getContact("workspace_a", ACCOUNT, PERSON))?.automationsPausedUntil).toBe(later);
  });

  it("keeps the runner silent for a paused person until they are resumed", async () => {
    const repository = await harness();
    await repository.createAutomation("workspace_a", {
      name: "Hello",
      status: "ACTIVE",
      instagramAccountId: ACCOUNT,
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["price"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Prices are on the site" }],
      },
    });
    await processManualReplyEcho(echo("m_human"), repository);
    const sendDirectMessage = vi.fn().mockResolvedValue({ message_id: "bot_1" });
    const client = { sendDirectMessage } as never;
    const event = { id: "in_1", accountId: ACCOUNT, type: "message.received" as const, text: "price?", recipientId: PERSON, timestamp: NOW + 60_000 };

    const paused = await processNormalizedEvent(event, repository, { client, tokenEncryptionKey: "c".repeat(64) });
    expect(paused).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendDirectMessage).not.toHaveBeenCalled();

    const contact = await repository.getContact("workspace_a", ACCOUNT, PERSON);
    expect(await repository.resumeContactAutomations("workspace_a", contact!.id)).toBe(true);
    expect(contactAutomationsPaused(await repository.getContact("workspace_a", ACCOUNT, PERSON), NOW + 60_000)).toBe(false);

    const resumed = await processNormalizedEvent({ ...event, id: "in_2" }, repository, { client, tokenEncryptionKey: "c".repeat(64) });
    expect(resumed).toMatchObject({ sent: 1 });
    expect(sendDirectMessage).toHaveBeenCalledTimes(1);
  });
});
