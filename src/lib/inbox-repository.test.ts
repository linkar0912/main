import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

describe("inbox repository queries", () => {
  it("lists only deliveries for the selected workspace contact", async () => {
    const repository = createMemoryRepository();
    for (const input of [
      { deliveryKey: "wanted", workspaceId: "workspace_1", instagramAccountId: "ig_1", recipientId: "person_1" },
      { deliveryKey: "other-person", workspaceId: "workspace_1", instagramAccountId: "ig_1", recipientId: "person_2" },
      { deliveryKey: "other-workspace", workspaceId: "workspace_2", instagramAccountId: "ig_1", recipientId: "person_1" },
    ]) {
      await repository.ensureOutboundDelivery({
        ...input,
        kind: "MANUAL_INBOX",
        payload: { type: "text", text: input.deliveryKey },
      });
    }

    const result = await repository.listOutboundDeliveriesForRecipient("workspace_1", "ig_1", "person_1", 50);

    expect(result.map((delivery) => delivery.deliveryKey)).toEqual(["wanted"]);
  });
});
