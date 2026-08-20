import { describe, expect, it } from "vitest";
import { normalizeWebhook } from "./webhooks";

describe("normalizeWebhook", () => {
  it("normalizes a comment webhook", () => {
    const events = normalizeWebhook({
      object: "instagram",
      entry: [
        {
          id: "ig_business_1",
          time: 1710000000,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_1",
                text: "GUIDE please",
                media: { id: "media_1" },
                from: { id: "person_1", username: "creator" },
              },
            },
          ],
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "comment_1",
        accountId: "ig_business_1",
        type: "comment.created",
        text: "GUIDE please",
        commentId: "comment_1",
        mediaId: "media_1",
        recipientId: "person_1",
        timestamp: 1710000000,
      },
    ]);
  });

  it("normalizes an inbound message and skips unsupported changes", () => {
    const events = normalizeWebhook({
      object: "instagram",
      entry: [
        {
          id: "ig_business_1",
          time: 1710000001,
          changes: [{ field: "mentions", value: { id: "mention_1" } }],
          messaging: [
            {
              sender: { id: "person_1" },
              recipient: { id: "ig_business_1" },
              timestamp: 1710000002,
              message: { mid: "mid_1", text: "PRICE" },
            },
          ],
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "mid_1",
        accountId: "ig_business_1",
        type: "message.received",
        text: "PRICE",
        recipientId: "person_1",
        timestamp: 1710000002,
      },
    ]);
  });
});
