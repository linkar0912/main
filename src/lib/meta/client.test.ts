import { describe, expect, it } from "vitest";
import { MetaClient, buildDirectMessagePayload, buildPrivateReplyPayload } from "./client";

describe("Meta message payloads", () => {
  it("builds a private reply addressed by comment ID", () => {
    expect(buildPrivateReplyPayload("comment_1", "Here is the link")).toEqual({
      recipient: { comment_id: "comment_1" },
      message: { text: "Here is the link" },
    });
  });

  it("builds a button message for a direct-message recipient", () => {
    expect(
      buildDirectMessagePayload("person_1", {
        type: "button",
        text: "Choose a plan",
        buttonLabel: "View plans",
        url: "https://example.com/plans",
      }),
    ).toEqual({
      recipient: { id: "person_1" },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: "Choose a plan",
            buttons: [{ type: "web_url", url: "https://example.com/plans", title: "View plans" }],
          },
        },
      },
    });
  });

  it("maps a provider 429 response to a retryable error", async () => {
    const client = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () =>
        new Response(JSON.stringify({ error: { message: "Rate limited", code: 4 } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(
      client.sendPrivateReply(
        { igUserId: "ig_1", accessToken: "secret" },
        "comment_1",
        "Hello",
      ),
    ).rejects.toMatchObject({ retryable: true, status: 429 });
  });
});
