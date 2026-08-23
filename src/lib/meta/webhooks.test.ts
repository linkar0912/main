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
        id: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        accountId: "ig_business_1",
        type: "optin.received",
        text: "optin-value",
        interactionPayload: "optin-value",
        recipientId: "igsid_3",
        timestamp: 1710000003,
      },
      {
        id: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        accountId: "ig_business_1",
        type: "referral.received",
        text: "referral-value",
        interactionPayload: "referral-value",
        recipientId: "igsid_4",
        timestamp: 1710000004,
      },
    ]);
  });

  it("creates unique but retry-stable IDs for same-timestamp opt-in and referral interactions", () => {
    const payload = {
      object: "instagram",
      entry: [{
        id: "ig_business_1",
        time: 1710000000,
        messaging: [
          { sender: { id: "igsid_1" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, optin: { ref: "signed-a" } },
          { sender: { id: "igsid_2" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, optin: { ref: "signed-b" } },
          { sender: { id: "igsid_3" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, referral: { ref: "signed-c" } },
        ],
      }],
    };

    const firstDelivery = normalizeWebhook(payload);
    const retry = normalizeWebhook(payload);

    expect(firstDelivery.map((event) => event.id)).toEqual([
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    ]);
    expect(new Set(firstDelivery.map((event) => event.id)).size).toBe(3);
    expect(retry.map((event) => event.id)).toEqual(firstDelivery.map((event) => event.id));
  });

  it("creates unique retry-stable IDs for identifier-less messages and postbacks", () => {
    const payload = {
      object: "instagram",
      entry: [{
        id: "ig_business_1",
        time: 1710000000,
        messaging: [
          { sender: { id: "igsid_1" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, message: { text: "first" } },
          { sender: { id: "igsid_2" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, message: { text: "second" } },
          { sender: { id: "igsid_3" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, postback: { title: "First", payload: "first-action" } },
          { sender: { id: "igsid_4" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, postback: { title: "Second", payload: "second-action" } },
        ],
      }],
    };

    const firstDelivery = normalizeWebhook(payload);
    const retry = normalizeWebhook(payload);

    expect(firstDelivery.map((event) => event.id)).toEqual([
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    ]);
    expect(new Set(firstDelivery.map((event) => event.id)).size).toBe(4);
    expect(retry.map((event) => event.id)).toEqual(firstDelivery.map((event) => event.id));
  });

  it("classifies quick replies only when their payload is a string and preserves empty payloads", () => {
    const events = normalizeWebhook({
      object: "instagram",
      entry: [{
        id: "ig_business_1",
        time: 1710000000,
        messaging: [
          { sender: { id: "igsid_1" }, recipient: { id: "ig_business_1" }, timestamp: 1710000001, message: { mid: "empty", text: "empty", quick_reply: { payload: "" } } },
          { sender: { id: "igsid_2" }, recipient: { id: "ig_business_1" }, timestamp: 1710000002, message: { mid: "missing", text: "missing", quick_reply: {} } },
          { sender: { id: "igsid_3" }, recipient: { id: "ig_business_1" }, timestamp: 1710000003, message: { mid: "malformed", text: "malformed", quick_reply: { payload: 42 } } },
        ],
      }],
    });

    expect(events.map((event) => event.type)).toEqual([
      "quick_reply.received",
      "message.received",
      "message.received",
    ]);
    expect(events[0]).toMatchObject({
      id: "empty",
      text: "empty",
      interactionPayload: "",
      recipientId: "igsid_1",
    });
    expect(events[0]).toHaveProperty("interactionPayload", "");
    expect(events[1]).not.toHaveProperty("interactionPayload");
    expect(events[2]).not.toHaveProperty("interactionPayload");
  });

  it("ignores comments authored by the connected business account itself", () => {
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
                id: "comment_self",
                text: "Check your DMs for the guide",
                media: { id: "media_1" },
                from: { id: "ig_business_1", username: "business" },
              },
            },
            {
              field: "comments",
              value: {
                id: "comment_other",
                text: "guide please",
                media: { id: "media_1" },
                from: { id: "person_1", username: "customer" },
              },
            },
          ],
        },
      ],
    });

    expect(events).toEqual([
      {
        id: "comment_other",
        accountId: "ig_business_1",
        type: "comment.created",
        text: "guide please",
        commentId: "comment_other",
        mediaId: "media_1",
        recipientId: "person_1",
        timestamp: 1710000000,
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
