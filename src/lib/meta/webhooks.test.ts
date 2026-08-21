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

  it("normalizes Instagram Login comments carried directly on the entry", () => {
    expect(normalizeWebhook({
      object: "instagram",
      entry: [{
        id: "ig_business_1",
        time: 1710000000,
        field: "comments",
        value: { id: "comment_direct", text: "guide", media: { id: "media_1" }, from: { id: "person_1" } },
      }],
    })).toEqual([{
      id: "comment_direct",
      accountId: "ig_business_1",
      type: "comment.created",
      text: "guide",
      commentId: "comment_direct",
      mediaId: "media_1",
      recipientId: "person_1",
      timestamp: 1710000000,
    }]);
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
    expect(events[0]).not.toHaveProperty("interactionPayload");
  });

  it("normalizes inbound interaction records while preserving opaque payloads", () => {
    expect(normalizeWebhook({
      object: "instagram",
      entry: [{
        id: "ig_business_1",
        time: 1710000000,
        messaging: [
          {
            sender: { id: "igsid_1" },
            recipient: { id: "ig_business_1" },
            timestamp: 1710000001,
            message: {
              mid: "quick_reply_1",
              text: "Yes, send it",
              quick_reply: { payload: "signed-value" },
            },
          },
          {
            sender: { id: "igsid_2" },
            recipient: { id: "ig_business_1" },
            timestamp: 1710000002,
            postback: { mid: "postback_1", title: "Check again", payload: "recheck-value" },
          },
          {
            sender: { id: "igsid_3" },
            recipient: { id: "ig_business_1" },
            timestamp: 1710000003,
            optin: { ref: "optin-value" },
          },
          {
            sender: { id: "igsid_4" },
            recipient: { id: "ig_business_1" },
            timestamp: 1710000004,
            referral: { ref: "referral-value" },
          },
        ],
      }],
    })).toEqual([
      {
        id: "quick_reply_1",
        accountId: "ig_business_1",
        type: "quick_reply.received",
        text: "Yes, send it",
        interactionPayload: "signed-value",
        recipientId: "igsid_1",
        timestamp: 1710000001,
      },
      {
        id: "postback_1",
        accountId: "ig_business_1",
        type: "postback.received",
        text: "recheck-value",
        interactionPayload: "recheck-value",
        recipientId: "igsid_2",
        timestamp: 1710000002,
      },
      {
        id: "ig_business_1:optin:1710000003",
        accountId: "ig_business_1",
        type: "optin.received",
        text: "optin-value",
        interactionPayload: "optin-value",
        recipientId: "igsid_3",
        timestamp: 1710000003,
      },
      {
        id: "ig_business_1:referral:1710000004",
        accountId: "ig_business_1",
        type: "referral.received",
        text: "referral-value",
        interactionPayload: "referral-value",
        recipientId: "igsid_4",
        timestamp: 1710000004,
      },
    ]);
  });

  it("ignores outbound echoes and self messages", () => {
    expect(normalizeWebhook({
      object: "instagram",
      entry: [{
        id: "ig_business_1",
        time: 1710000000,
        messaging: [
          { sender: { id: "ig_business_1" }, recipient: { id: "person_1" }, message: { mid: "outbound", text: "sent by business", quick_reply: { payload: "signed-value" }, is_echo: true } },
          { sender: { id: "ig_business_1" }, recipient: { id: "ig_business_1" }, message: { mid: "self", text: "self", is_self: true } },
          { sender: { id: "person_1" }, recipient: { id: "ig_business_1" }, message: { mid: "inbound", text: "price" } },
        ],
      }],
    })).toEqual([{
      id: "inbound",
      accountId: "ig_business_1",
      type: "message.received",
      text: "price",
      recipientId: "person_1",
      timestamp: 1710000000,
    }]);
  });
});
