import { describe, expect, it, vi } from "vitest";
import { MetaApiError, MetaClient, buildDirectMessagePayload, buildPrivateReplyPayload } from "./client";

describe("Meta message payloads", () => {
  it("rejects Meta client versions other than Instagram Login v25.0", () => {
    expect(() => new MetaClient({ apiVersion: "v24.0" })).toThrow(/v25\.0/);
  });

  it("builds a private reply addressed by comment ID", () => {
    expect(buildPrivateReplyPayload("comment_1", "Here is the link")).toEqual({
      recipient: { comment_id: "comment_1" },
      message: { text: "Here is the link" },
    });
  });

  it("adds a quick reply to a private reply addressed by comment ID", () => {
    expect(buildPrivateReplyPayload("comment_1", {
      text: "Reply below so I can check your follow status.",
      quickReply: { title: "Check follow", payload: "signed-opt-in" },
    })).toEqual({
      recipient: { comment_id: "comment_1" },
      message: {
        text: "Reply below so I can check your follow status.",
        quick_replies: [{ content_type: "text", title: "Check follow", payload: "signed-opt-in" }],
      },
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

  it("maps network and provider transient failures to retryable errors", async () => {
    const networkClient = new MetaClient({ apiVersion: "v25.0", fetcher: async () => { throw new TypeError("fetch failed"); } });
    await expect(networkClient.sendPrivateReply({ igUserId: "ig_1", accessToken: "secret" }, "comment_1", "Hello")).rejects.toMatchObject({ retryable: true });

    const graphClient = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ error: { message: "Try again", code: 2, is_transient: true } }), { status: 400 }),
    });
    await expect(graphClient.sendPrivateReply({ igUserId: "ig_1", accessToken: "secret" }, "comment_1", "Hello")).rejects.toMatchObject({ retryable: true, status: 400 });
  });

  it("records whether a Meta HTTP response was received", async () => {
    const networkClient = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => { throw new TypeError("fetch failed"); },
    });
    await expect(networkClient.sendPrivateReply(
      { igUserId: "ig_1", accessToken: "secret" },
      "comment_1",
      "Hello",
    )).rejects.toMatchObject({ status: 0, responseReceived: false });

    const rejectedClient = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ error: { message: "Denied" } }), { status: 400 }),
    });
    await expect(rejectedClient.sendPrivateReply(
      { igUserId: "ig_1", accessToken: "secret" },
      "comment_1",
      "Hello",
    )).rejects.toMatchObject({ status: 400, responseReceived: true });
  });

  it("subscribes the professional account to the campaign webhook fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.subscribeToWebhooks({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual({
      fields: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
      requested: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("/v25.0/ig_1/subscribed_apps");
    expect(String(url)).toContain("subscribed_fields=comments%2Cmessages%2Cmessaging_postbacks%2Cmessaging_optins%2Cmessaging_referral");
    expect(init).toMatchObject({ method: "POST", headers: { authorization: "Bearer secret" } });
  });

  it("falls back to the core webhook fields when Meta rejects Messenger-era names", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "(#100) Invalid parameter", code: 100 } }), { status: 400 }))
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.subscribeToWebhooks({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual({
      fields: ["comments", "messages"],
      requested: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("subscribed_fields=comments%2Cmessages");
  });

  it("never fails the connection over a rejected subscription — it reports the gap instead", async () => {
    const client = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ error: { message: "(#100) Invalid parameter", code: 100 } }), { status: 400 }),
    });

    await expect(client.subscribeToWebhooks({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual({
      fields: [],
      requested: ["comments", "messages", "messaging_postbacks", "messaging_optins", "messaging_referral"],
      error: expect.stringContaining("(#100)"),
    });
  });

  it("reads back the currently subscribed webhook fields for the connected account", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ subscribed_fields: ["comments", "messages"], id: "app_1" }] }),
        { status: 200 },
      ),
    );
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.getSubscribedFields({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual([
      "comments",
      "messages",
    ]);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("/v25.0/ig_1/subscribed_apps");
    expect(init).not.toMatchObject({ method: "POST" });
  });

  it("returns no fields when Meta reports an empty or malformed subscription list", async () => {
    for (const body of ["null", "{}", JSON.stringify({ data: [] }), JSON.stringify({ data: [{ id: "app_1" }] })]) {
      const client = new MetaClient({
        apiVersion: "v25.0",
        fetcher: async () => new Response(body, { status: 200 }),
      });
      await expect(client.getSubscribedFields({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual([]);
    }
  });

  it("bootstraps the canonical professional account through /me", async () => {
    const client = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ user_id: "ig_1", username: "creator" }), { status: 200 }),
    });

    await expect(client.getOwnProfile({ igUserId: "ig_1", accessToken: "secret" })).resolves.toEqual({ id: "ig_1", username: "creator" });
  });

  it("unsubscribes the professional account from webhooks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.unsubscribeFromWebhooks({ igUserId: "ig_1", accessToken: "secret" })).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("posts a public reply to a comment", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "reply_1" }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.replyToComment({ igUserId: "ig_1", accessToken: "access-token" }, "comment_1", "Check your DMs")).resolves.toEqual({ id: "reply_1" });

    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("/v25.0/comment_1/replies");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify({ message: "Check your DMs" }) });
  });

  it("sends a private reply with an opt-in quick reply", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ recipient_id: "commenter_1", message_id: "message_1" }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await client.sendPrivateReply(
      { igUserId: "ig_1", accessToken: "access-token" },
      "comment_1",
      { text: "Reply below so I can check your follow status.", quickReply: { title: "Check follow", payload: "signed-opt-in" } },
    );

    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("/v25.0/ig_1/messages");
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        recipient: { comment_id: "comment_1" },
        message: {
          text: "Reply below so I can check your follow status.",
          quick_replies: [{ content_type: "text", title: "Check follow", payload: "signed-opt-in" }],
        },
      }),
    });
  });

  it("sends a response quick reply to an Instagram-scoped recipient", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ recipient_id: "igsid_1", message_id: "message_1" }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await client.sendQuickReply(
      { igUserId: "ig_1", accessToken: "access-token" },
      "igsid_1",
      "Follow this account, then tap below.",
      { title: "I've followed", payload: "signed-value" },
    );

    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        recipient: { id: "igsid_1" },
        messaging_type: "RESPONSE",
        message: {
          text: "Follow this account, then tap below.",
          quick_replies: [{ content_type: "text", title: "I've followed", payload: "signed-value" }],
        },
      }),
    });
  });

  it("normalizes media pages and sends the cursor only as an after query parameter", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "media_1",
        caption: "A reel",
        media_type: "VIDEO",
        media_product_type: "REELS",
        permalink: "https://www.instagram.com/reel/media_1/",
        media_url: "https://cdn.instagram.com/media_1.mp4",
        thumbnail_url: "https://cdn.instagram.com/media_1.jpg",
        timestamp: "2026-08-21T10:00:00+0000",
      }],
      paging: { cursors: { after: "next-page" } },
    }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.listMedia({ igUserId: "ig_1", accessToken: "access-token" }, "current-page")).resolves.toEqual({
      data: [{
        id: "media_1",
        caption: "A reel",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/media_1/",
        mediaUrl: "https://cdn.instagram.com/media_1.mp4",
        thumbnailUrl: "https://cdn.instagram.com/media_1.jpg",
        timestamp: "2026-08-21T10:00:00+0000",
      }],
      after: "next-page",
    });

    const requestUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/v25.0/ig_1/media");
    expect(requestUrl.searchParams.get("fields")).toBe("id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp");
    expect(requestUrl.searchParams.get("after")).toBe("current-page");
  });

  it("preserves an explicitly supplied empty media cursor", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.listMedia({ igUserId: "ig_1", accessToken: "access-token" }, "")).resolves.toEqual({ data: [] });

    const requestUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(requestUrl.searchParams.has("after")).toBe(true);
    expect(requestUrl.searchParams.get("after")).toBe("");
  });

  it("normalizes one media item", async () => {
    const client = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({
        id: "media_1",
        media_type: "IMAGE",
        permalink: "https://www.instagram.com/p/media_1/",
        timestamp: "2026-08-21T10:00:00+0000",
      }), { status: 200 }),
    });

    await expect(client.getMedia({ igUserId: "ig_1", accessToken: "access-token" }, "media_1")).resolves.toEqual({
      id: "media_1",
      mediaType: "IMAGE",
      permalink: "https://www.instagram.com/p/media_1/",
      timestamp: "2026-08-21T10:00:00+0000",
    });
  });

  it("returns the literal follower status supplied by Meta", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ is_user_follow_business: true }), { status: 200 }));
    const client = new MetaClient({ apiVersion: "v25.0", fetcher });

    await expect(client.getUserFollowStatus({ igUserId: "ig_1", accessToken: "access-token" }, "igsid_1")).resolves.toEqual({ isUserFollowingBusiness: true });

    const requestUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(requestUrl.pathname).toBe("/v25.0/igsid_1");
    expect(requestUrl.searchParams.get("fields")).toBe("is_user_follow_business");
  });

  it("rejects malformed media, public reply, and follower-status responses", async () => {
    const malformedMedia = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ data: [{ id: "media_1", media_type: "VIDEO" }] }), { status: 200 }),
    });
    await expect(malformedMedia.listMedia({ igUserId: "ig_1", accessToken: "access-token" })).rejects.toEqual(
      new MetaApiError("Meta did not return valid media", 502),
    );

    const malformedReply = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({}), { status: 200 }),
    });
    await expect(malformedReply.replyToComment({ igUserId: "ig_1", accessToken: "access-token" }, "comment_1", "Check your DMs")).rejects.toEqual(
      new MetaApiError("Meta did not return comment reply ID", 502),
    );

    const malformedFollowStatus = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response(JSON.stringify({ is_user_follow_business: "true" }), { status: 200 }),
    });
    await expect(malformedFollowStatus.getUserFollowStatus({ igUserId: "ig_1", accessToken: "access-token" }, "igsid_1")).rejects.toEqual(
      new MetaApiError("Meta did not return follower status", 502),
    );
  });

  it("fails closed for null and primitive top-level Meta responses", async () => {
    const nullReply = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response("null", { status: 200 }),
    });
    await expect(nullReply.replyToComment({ igUserId: "ig_1", accessToken: "access-token" }, "comment_1", "Check your DMs")).rejects.toEqual(
      new MetaApiError("Meta did not return comment reply ID", 502),
    );

    const nullPage = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response("null", { status: 200 }),
    });
    await expect(nullPage.listMedia({ igUserId: "ig_1", accessToken: "access-token" })).rejects.toEqual(
      new MetaApiError("Meta did not return valid media", 502),
    );

    const primitiveFollowStatus = new MetaClient({
      apiVersion: "v25.0",
      fetcher: async () => new Response("false", { status: 200 }),
    });
    await expect(primitiveFollowStatus.getUserFollowStatus({ igUserId: "ig_1", accessToken: "access-token" }, "igsid_1")).rejects.toEqual(
      new MetaApiError("Meta did not return follower status", 502),
    );
  });

  it("rejects malformed media paging containers", async () => {
    for (const paging of [null, { cursors: "not-an-object" }]) {
      const client = new MetaClient({
        apiVersion: "v25.0",
        fetcher: async () => new Response(JSON.stringify({ data: [], paging }), { status: 200 }),
      });

      await expect(client.listMedia({ igUserId: "ig_1", accessToken: "access-token" })).rejects.toEqual(
        new MetaApiError("Meta did not return valid media", 502),
      );
    }
  });
});
