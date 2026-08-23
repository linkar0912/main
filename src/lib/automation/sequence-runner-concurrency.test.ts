import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret } from "../security/secrets";
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
});
