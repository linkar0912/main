import { describe, expect, it, vi } from "vitest";
import { processDueSequences } from "./sequence-runner";
import { processBroadcastSend } from "./broadcast-runner";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { sequencePatchSchema } from "./sequence";

const TOKEN_KEY = "a".repeat(64);

const captureFlow = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["guide"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Here comes the guide!" }],
  emailCapture: { promptText: "Email?", confirmationText: "You are in!" },
} as const;

async function seed() {
  const repository = createMemoryRepository([
    {
      id: "automation_1",
      workspaceId: "workspace_a",
      name: "Capture",
      status: "ACTIVE",
      version: 1,
      priority: 0,
      definition: captureFlow as unknown as Parameters<never>[0],
      createdAt: new Date(1).toISOString(),
      updatedAt: new Date(1).toISOString(),
    },
  ]);
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
  return repository;
}

function dmClient() {
  return { sendDirectMessage: vi.fn<(c: unknown, r: string, m: { type: "text"; text: string }) => Promise<{ message_id: string }>>().mockResolvedValue({ message_id: "m1" }) };
}

describe("sequences repository + scheduler", () => {
  it("accepts an explicit null source and removes the stored source", async () => {
    expect(sequencePatchSchema.parse({ sourceAutomationId: null })).toEqual({ sourceAutomationId: null });
    const repository = await seed();
    const sequence = await repository.createSequence("workspace_a", {
      name: "Unlinkable",
      status: "DRAFT",
      sourceAutomationId: "automation_1",
      steps: [{ id: "s1", delayHours: 0, text: "Hello" }],
    });

    await repository.updateSequence("workspace_a", sequence.id, { sourceAutomationId: null });

    const updated = await repository.getSequence("workspace_a", sequence.id);
    expect(updated?.id).toBe(sequence.id);
    expect(updated?.sourceAutomationId).toBeUndefined();
  });

  it("rejects sequence enrollment when either referenced record belongs to another workspace", async () => {
    const repository = await seed();
    await repository.touchContact("workspace_b", "ig_2", "lead_2", new Date().toISOString());
    const contactA = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;
    const contactB = (await repository.getContact("workspace_b", "ig_2", "lead_2"))!;
    const sequenceA = await repository.createSequence("workspace_a", {
      name: "A", status: "ACTIVE", steps: [{ id: "a", delayHours: 0, text: "A" }],
    });
    const sequenceB = await repository.createSequence("workspace_b", {
      name: "B", status: "ACTIVE", steps: [{ id: "b", delayHours: 0, text: "B" }],
    });

    await expect(repository.enrollContactInSequence("workspace_a", sequenceB.id, contactA.id, 0, new Date().toISOString()))
      .resolves.toEqual({ created: false });
    await expect(repository.enrollContactInSequence("workspace_a", sequenceA.id, contactB.id, 0, new Date().toISOString()))
      .resolves.toEqual({ created: false });
  });

  it("enrolls once per contact, delivers due steps, advances then completes", async () => {
    const repository = await seed();
    const contact = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;

    const sequence = await repository.createSequence("workspace_a", {
      name: "Nurture",
      status: "ACTIVE",
      sourceAutomationId: "automation_1",
      steps: [
        { id: "s1", delayHours: 0, text: "Day zero tip" },
        { id: "s2", delayHours: 48, text: "Two days later" },
      ],
    });

    const sources = await repository.listActiveSequencesForSource("workspace_a", "automation_1");
    expect(sources.map((item) => item.id)).toEqual([sequence.id]);

    const firstEnroll = await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, new Date().toISOString());
    const duplicateEnroll = await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, new Date().toISOString());
    expect(firstEnroll.created).toBe(true);
    expect(duplicateEnroll.created).toBe(false);

    const client = dmClient();
    const firstPass = await processDueSequenceSends(repository, client);
    expect(firstPass).toMatchObject({ sent: 1, failed: 0, cancelled: 0 });
    expect(client.sendDirectMessage.mock.calls[0][2].text).toBe("Day zero tip");

    // Step two is 48h out - nothing due right now.
    const idlePass = await processDueSequenceSends(repository, client);
    expect(idlePass.sent).toBe(0);

    // Jump past step two's 48-hour delay. The step is now due, but the contact
    // last messaged 49h ago, so Meta's 24-hour messaging window has closed:
    // delivering here would be an unsolicited automated DM. The enrollment is
    // cancelled instead of sent.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 49 * 3_600_000));
    try {
      const closedPass = await processDueSequenceSends(repository, client);
      expect(closedPass).toMatchObject({ sent: 0, cancelled: 1 });
      expect(client.sendDirectMessage.mock.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }

    // countEnrollmentsBySequence excludes CANCELLED, so the window-closed
    // enrollment drops out of the active count rather than lingering as due
    // work that would re-attempt a policy-violating DM on every sweep.
    const counts = await repository.countEnrollmentsBySequence("workspace_a");
    expect(counts.find((entry) => entry.sequenceId === sequence.id)?.count ?? 0).toBe(0);
  });

  it("delivers a due step when the contact re-opened the 24-hour messaging window", async () => {
    const repository = await seed();
    const contact = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;
    const sequence = await repository.createSequence("workspace_a", {
      name: "Nurture",
      status: "ACTIVE",
      steps: [
        { id: "s1", delayHours: 0, text: "Day zero tip" },
        { id: "s2", delayHours: 48, text: "Two days later" },
      ],
    });
    await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, new Date().toISOString());

    const client = dmClient();
    expect(await processDueSequenceSends(repository, client)).toMatchObject({ sent: 1 });

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 49 * 3_600_000));
    try {
      // The person messaged the account again, which re-opens the window - the
      // queued step is now deliverable and must not be cancelled.
      await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
      const finalPass = await processDueSequenceSends(repository, client);
      expect(finalPass).toMatchObject({ sent: 1, cancelled: 0 });
      expect(client.sendDirectMessage.mock.calls[1][2].text).toBe("Two days later");
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses keep steps undelivered until reactivated", async () => {
    const repository = await seed();
    const contact = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;
    const sequence = await repository.createSequence("workspace_a", {
      name: "Paused drip",
      status: "PAUSED",
      steps: [{ id: "s1", delayHours: 0, text: "Hello" }],
    });
    await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, new Date().toISOString());

    const client = dmClient();
    const result = await processDueSequenceSends(repository, client);
    expect(result.processed).toBe(0);
    void contact;
  });

  it("cancels enrollments when the contact opts out (STOP)", async () => {
    const repository = await seed();
    const contact = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;
    const sequence = await repository.createSequence("workspace_a", {
      name: "Drip",
      status: "ACTIVE",
      steps: [{ id: "s1", delayHours: 0, text: "Hello" }],
    });
    await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, new Date().toISOString());

    await repository.suppressContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());

    const client = dmClient();
    const result = await processDueSequenceSends(repository, client);
    expect(result.processed).toBe(0);
    const counts = await repository.countEnrollmentsBySequence("workspace_a");
    expect(counts.find((entry) => entry.sequenceId === sequence.id)?.count ?? 0).toBe(0);
  });

  it("skips the sweep entirely without Meta credentials", async () => {
    const repository = await seed();
    const contact = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;
    const sequence = await repository.createSequence("workspace_a", {
      name: "Drip",
      status: "ACTIVE",
      steps: [{ id: "s1", delayHours: 0, text: "Hello" }],
    });
    await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, new Date().toISOString());

    const result = await processDueSequenceSends(repository, undefined);
    expect(result.processed).toBe(0);
  });
});

describe("broadcasts", () => {
  it("completes instantly when a segment has no recipients", async () => {
    const repository = await seed();
    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "Empty blast", text: "Hi", segment: "captured_email", total: 0,
    });
    expect(broadcast.status).toBe("COMPLETED");
  });

  it("delivers DMs, skips suppressed contacts, and finalizes completion", async () => {
    const repository = await seed();
    const contactA = (await repository.getContact("workspace_a", "ig_1", "lead_1"))!;

    // Second lead, later suppressed.
    await repository.touchContact("workspace_a", "ig_1", "lead_2", new Date().toISOString());
    await repository.suppressContact("workspace_a", "ig_1", "lead_2", new Date().toISOString());

    const recipients = await repository.listBroadcastRecipients("workspace_a", "all_contacts", 100);
    expect(recipients.map((r) => r.igScopedUserId)).toEqual(["lead_1"]);

    const broadcast = await repository.createBroadcast("workspace_a", {
      name: "Blast", text: "Big news!", segment: "all_contacts", total: 2,
    });

    const client = dmClient();
    for (const recipient of [{ ig: "lead_1" }, { ig: "lead_2" }]) {
      const deliveryKey = `broadcast:${broadcast.id}:ig_1:${recipient.ig}`;
      await repository.ensureOutboundDelivery({
        deliveryKey,
        workspaceId: "workspace_a",
        broadcastId: broadcast.id,
        instagramAccountId: "ig_1",
        recipientId: recipient.ig,
        kind: "BROADCAST_RECIPIENT",
        payload: { type: "text", text: "Big news!" },
      });
      await processBroadcastSend(
        { deliveryKey, broadcastId: broadcast.id, workspaceId: "workspace_a", igAccountId: "ig_1", igScopedUserId: recipient.ig },
        repository,
        { client, tokenEncryptionKey: TOKEN_KEY },
      );
    }

    const finished = await repository.getBroadcast("workspace_a", broadcast.id);
    expect(finished?.status).toBe("COMPLETED");
    expect(finished?.sent).toBe(1);
    expect(finished?.skipped).toBe(1);
    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(client.sendDirectMessage.mock.calls[0][1]).toBe(contactA.igScopedUserId);
  });
});

// Scheduler helper bound to the memory repository shape used above.
function processDueSequenceSends(repository: Awaited<ReturnType<typeof seed>>, client?: ReturnType<typeof dmClient>) {
  return processDueSequences(repository, {
    ...(client ? { client: client as never } : {}),
    tokenEncryptionKey: TOKEN_KEY,
  });
}
