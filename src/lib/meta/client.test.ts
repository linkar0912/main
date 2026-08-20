import { describe, expect, it, vi } from "vitest";
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

  it("subscribes the professional account to comment and message webhooks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.subscribeToWebhooks({ igUserId: "ig_1", accessToken: "secret" })).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("/v25.0/ig_1/subscribed_apps");
    expect(String(url)).toContain("subscribed_fields=comments%2Cmessages");
    expect(init).toMatchObject({ method: "POST", headers: { authorization: "Bearer secret" } });
  });

  it("loads the connected professional account username", async () => {
    const client = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ id: "ig_1", username: "creator" }), { status: 200 }),
    });

    await expect(client.getOwnProfile({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual({ id: "ig_1", username: "creator" });
  });

  it("unsubscribes the professional account from webhooks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.unsubscribeFromWebhooks({ igUserId: "ig_1", accessToken: "secret" })).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });
});
