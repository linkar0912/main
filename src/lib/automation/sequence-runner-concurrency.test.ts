import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
import { MetaApiError } from "../meta/client";
import { processDueSequences, type SequenceRunnerClient } from "./sequence-runner";

const TOKEN_KEY = "b".repeat(64);

async function sequenceHarness() {
  const repository = createMemoryRepository();
  await repository.upsertConnection({
    workspaceId: "workspace_a",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
  await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
  const contact = await repository.getContact("workspace_a", "ig_1", "lead_1");
  if (!contact) throw new Error("contact missing");
  const sequence = await repository.createSequence("workspace_a", {
    name: "Nurture",
    status: "ACTIVE",
    steps: [{ id: "step_1", delayHours: 0, text: "Hello once" }],
  });
  await repository.enrollContactInSequence(
    "workspace_a",
    sequence.id,
    contact.id,
    0,
    new Date().toISOString(),
  );
  const client: SequenceRunnerClient = {
    sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "message_1" }),
  };
  const options = { client, tokenEncryptionKey: TOKEN_KEY, claimLeaseMs: 30_000 };
  return { repository, client, options };
}

describe("sequence delivery claims", () => {
  it("allows one provider call across concurrent due sweeps", async () => {
    const { repository, client, options } = await sequenceHarness();

    await Promise.all([
      processDueSequences(repository, options),
      processDueSequences(repository, options),
    ]);

    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
  });

  it("retries enrollment advancement without resending a SENT step", async () => {
    const { repository, client, options } = await sequenceHarness();
    const advance = repository.advanceSequenceEnrollment.bind(repository);
    repository.advanceSequenceEnrollment = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockImplementation(advance);

    await expect(processDueSequences(repository, options)).rejects.toThrow("database unavailable");
    await processDueSequences(repository, options);

    expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
    expect(repository.advanceSequenceEnrollment).toHaveBeenCalledTimes(2);
  });

  it("cancels the enrollment after a terminal provider rejection", async () => {
    const { repository, client, options } = await sequenceHarness();
    vi.mocked(client.sendDirectMessage).mockRejectedValue(new MetaApiError("Meta 400", 400, true));

    const result = await processDueSequences(repository, options);

    expect(result.failed).toBe(1);
    const due = await repository.listDueSequenceSends(
      new Date(Date.now() + 86_400_000).toISOString(),
      10,
    );
    expect(due).toHaveLength(0);
  });

  it("schedules the next step from the due step's nextSendAt, not wall-clock now", async () => {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: sealSecret("access-token", TOKEN_KEY),
      status: "CONNECTED",
    });
    await repository.touchContact("workspace_a", "ig_1", "lead_1", new Date().toISOString());
    const contact = await repository.getContact("workspace_a", "ig_1", "lead_1");
    if (!contact) throw new Error("contact missing");
    const sequence = await repository.createSequence("workspace_a", {
      name: "Nurture",
      status: "ACTIVE",
      steps: [
        { id: "step_1", delayHours: 0, text: "Hello" },
        { id: "step_2", delayHours: 24, text: "Follow up" },
      ],
    });
    const pastDue = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await repository.enrollContactInSequence("workspace_a", sequence.id, contact.id, 0, pastDue);

    const client: SequenceRunnerClient = {
      sendDirectMessage: vi.fn().mockResolvedValue({ message_id: "message_1" }),
    };
    const options = { client, tokenEncryptionKey: TOKEN_KEY, claimLeaseMs: 30_000 };

    const result = await processDueSequences(repository, options);
    expect(result.sent).toBe(1);

    const after = await repository.listDueSequenceSends(new Date(Date.now() + 86_400_000).toISOString(), 10);
    expect(after).toHaveLength(1);
    const nextSendAt = after[0]!.enrollment.nextSendAt;
    expect(nextSendAt).toBeDefined();
    // base (2h ago) + 24h delay = 22h from now, not 24h from now.
    const expected = Date.parse(pastDue) + 24 * 3_600_000;
    expect(Math.abs(Date.parse(nextSendAt!) - expected)).toBeLessThan(5_000);
    expect(Date.parse(nextSendAt!)).toBeLessThan(Date.now() + 24 * 3_600_000);
  });
});
