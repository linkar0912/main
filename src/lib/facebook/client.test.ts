import { afterEach, describe, expect, it, vi } from "vitest";
import { FacebookClient, FacebookApiError } from "./client";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("FacebookClient", () => {
  it("posts a comment reply to the /{comment-id}/comments endpoint", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => {
      return jsonResponse(200, { id: "fb_reply_99" });
    });
    const client = new FacebookClient({
      apiVersion: "v25.0",
      baseUrl: "https://graph.facebook.com",
      fetcher: fetchMock as unknown as typeof fetch,
    });
    const result = await client.postCommentReply(
      { pageId: "page_1", accessToken: "tok" },
      "comment_42",
      "Thanks for commenting!",
    );
    expect(result.id).toBe("fb_reply_99");
    const [urlArg, initArg] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(urlArg.toString()).toBe("https://graph.facebook.com/v25.0/comment_42/comments");
    const body = JSON.parse(String(initArg?.body));
    expect(body).toEqual({ message: "Thanks for commenting!" });
  });

  it("throws FacebookApiError with a non-retryable classification on 400", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { error: { message: "Invalid OAuth", code: 190, fbtrace_id: "abc" } }),
    ) as typeof fetch;
    const client = new FacebookClient({ apiVersion: "v25.0", baseUrl: "https://graph.facebook.com" });
    await expect(
      client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m"),
    ).rejects.toMatchObject({
      name: "FacebookApiError",
      message: "Invalid OAuth",
      status: 400,
      retryable: false,
    });
  });

  it("throws FacebookApiError with a retryable classification on 5xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(503, { error: { message: "Service unavailable" } }),
    ) as typeof fetch;
    const client = new FacebookClient({ apiVersion: "v25.0", baseUrl: "https://graph.facebook.com" });
    await expect(
      client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m"),
    ).rejects.toBeInstanceOf(FacebookApiError);
    try {
      await client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m");
    } catch (err) {
      expect((err as FacebookApiError).retryable).toBe(true);
    }
  });
});
