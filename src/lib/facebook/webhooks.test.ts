import { describe, expect, it } from "vitest";
import { normalizeFacebookWebhook } from "./webhooks";

describe("normalizeFacebookWebhook", () => {
  it("returns an empty list for empty or malformed payloads", () => {
    expect(normalizeFacebookWebhook(null)).toEqual([]);
    expect(normalizeFacebookWebhook({})).toEqual([]);
    expect(normalizeFacebookWebhook({ entry: [{}] })).toEqual([]);
  });

  it("emits a normalized event for a single comment.add on the page feed", () => {
    const events = normalizeFacebookWebhook({
      object: "page",
      entry: [
        {
          id: "page_1",
          time: 1_700_000_000,
          changes: [
            {
              field: "feed",
              value: {
                verb: "add",
                item: "comment",
                comment_id: "comment_1",
                post_id: "post_1",
                message: "Where can I get the guide?",
                from: { id: "user_42", name: "Maya" },
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      pageId: "page_1",
      commentId: "comment_1",
      postId: "post_1",
      text: "Where can I get the guide?",
      senderId: "user_42",
      senderName: "Maya",
      timestamp: 1_700_000_000,
    });
  });

  it("ignores reactions, edits, and other feed actions (v1 only handles add/comment)", () => {
    const events = normalizeFacebookWebhook({
      entry: [
        {
          id: "page_1",
          time: 1_700_000_000,
          changes: [
            { field: "feed", value: { verb: "add", item: "reaction", reaction_type: "like", post_id: "p", comment_id: "c" } },
            { field: "feed", value: { verb: "edited", item: "comment", comment_id: "c", post_id: "p" } },
            { field: "feed", value: { verb: "remove", item: "comment", comment_id: "c", post_id: "p" } },
            { field: "mentions", value: { post_id: "p" } },
          ],
        },
      ],
    });
    expect(events).toEqual([]);
  });

  it("emits one event per add/comment change across multiple entries", () => {
    const events = normalizeFacebookWebhook({
      entry: [
        {
          id: "page_1",
          time: 1,
          changes: [{ field: "feed", value: { verb: "add", item: "comment", comment_id: "c1", post_id: "p1", message: "hi" } }],
        },
        {
          id: "page_2",
          time: 2,
          changes: [
            { field: "feed", value: { verb: "add", item: "comment", comment_id: "c2", post_id: "p2", message: "hey" } },
            { field: "feed", value: { verb: "add", item: "comment", comment_id: "c3", post_id: "p2", message: "again" } },
          ],
        },
      ],
    });
    expect(events.map((e) => e.commentId).sort()).toEqual(["c1", "c2", "c3"]);
  });

  it("produces a stable event id so webhook redeliveries dedupe", () => {
    const payload = {
      entry: [{
        id: "page_1",
        time: 100,
        changes: [{ field: "feed", value: { verb: "add", item: "comment", comment_id: "c1", post_id: "p1", message: "hi" } }],
      }],
    };
    const a = normalizeFacebookWebhook(payload);
    const b = normalizeFacebookWebhook(payload);
    expect(a[0]!.id).toBe(b[0]!.id);
  });
});
