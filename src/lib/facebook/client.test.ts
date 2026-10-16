import { afterEach, describe, expect, it, vi } from "vitest";
import { FacebookClient, FacebookApiError, facebookAccountSignal } from "./client";

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
  it("never puts a non-numeric profile id into a Graph path", async () => {
    const fetchMock = vi.fn();
    const client = new FacebookClient({ apiVersion: "v25.0", fetcher: fetchMock as unknown as typeof fetch });
    await expect(client.getProfilePictureUrl({ pageId: "page_1", accessToken: "page-token" }, "me/accounts"))
      .resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads a Facebook profile picture without exposing the Page token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(200, {
      picture: { data: { url: "https://cdn.example/facebook-profile.jpg" } },
    }));
    const client = new FacebookClient({ apiVersion: "v25.0", fetcher: fetchMock as typeof fetch });

    await expect(client.getProfilePictureUrl(
      { pageId: "page_1", accessToken: "page-token" },
      "1234567890",
    )).resolves.toBe("https://cdn.example/facebook-profile.jpg");

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/1234567890");
    expect(requestUrl.searchParams.get("fields")).toBe("picture.type(square).width(96).height(96)");
    expect(requestUrl.searchParams.has("access_token")).toBe(false);
  });

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
    expect(urlArg.toString()).toBe("https://graph.facebook.com/v25.0/comment_42/comments?locale=en_US");
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
      graphCode: 190,
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

  it("aborts provider requests at the configured deadline", async () => {
    const fetcher = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }));
    const client = new FacebookClient({
      apiVersion: "v25.0",
      fetcher,
      requestTimeoutMs: 5,
    });

    await expect(client.postCommentReply(
      { pageId: "page_1", accessToken: "secret" },
      "comment_1",
      "hello",
    )).rejects.toMatchObject({
      name: "FacebookApiError",
      status: 0,
      responseReceived: false,
      retryable: true,
    });
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the Graph subcode and Meta's usage headers on a rejected call", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Calls to this api have exceeded the rate limit.", code: 4, error_subcode: 2446079 },
    }), {
      status: 400,
      headers: {
        "content-type": "application/json",
        "x-app-usage": JSON.stringify({ call_count: 100, total_cputime: 12, total_time: 20 }),
      },
    })) as typeof fetch;
    const client = new FacebookClient({ apiVersion: "v25.0", baseUrl: "https://graph.facebook.com" });

    const error = await client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m").catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ graphCode: 4, subcode: 2446079, retryable: true, usage: { highestPercent: 100, regainAccessMs: 0 } });
    expect(facebookAccountSignal(error)).toBe("rate_limited");
  });

  it("reads the Pages rate limit (code 80001) as retryable and as a request to slow down", async () => {
    // Meta does not always mark it transient, so the code alone has to count.
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "(#80001) There have been too many calls to this Page account. Wait a bit and try again.", code: 80001, type: "OAuthException" },
    }), { status: 400, headers: { "content-type": "application/json" } })) as typeof fetch;
    const client = new FacebookClient({ apiVersion: "v25.0", baseUrl: "https://graph.facebook.com" });

    const error = await client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m").catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ status: 400, graphCode: 80001, responseReceived: true, retryable: true });
    expect(facebookAccountSignal(error)).toBe("rate_limited");
  });

  it.each([1, 2, 4, 17, 32, 341, 613, 80001, 80002, 80006])("marks Graph code %i on HTTP 400 as retryable", async (code) => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { error: { message: "Slow down", code } })) as typeof fetch;
    const client = new FacebookClient({ apiVersion: "v25.0", baseUrl: "https://graph.facebook.com" });

    const error = await client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m").catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ status: 400, graphCode: code, responseReceived: true, retryable: true });
  });

  it.each([10, 100, 190, 200, 368])("leaves Graph code %i on HTTP 400 not retryable", async (code) => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { error: { message: "Rejected", code } })) as typeof fetch;
    const client = new FacebookClient({ apiVersion: "v25.0", baseUrl: "https://graph.facebook.com" });

    const error = await client.postCommentReply({ pageId: "p", accessToken: "t" }, "c", "m").catch((thrown: unknown) => thrown);

    expect(error).toMatchObject({ status: 400, graphCode: code, retryable: false });
  });
});

describe("facebookAccountSignal", () => {
  it.each([
    ["error 368", new FacebookApiError("(#368) The action attempted has been deemed abusive or is otherwise disallowed", 400, true, false, 368)],
    ["#2022 as the subcode", new FacebookApiError("Temporary", 500, true, true, 2, 2022)],
    ["#2022 only in the message, under a permission code", new FacebookApiError("(#2022) This Page has been blocked from sending", 403, true, false, 200)],
  ])("reads %s as a block on the whole Page", (_label, error) => {
    expect(facebookAccountSignal(error)).toBe("account_blocked");
  });

  it("reads Graph throttling codes and HTTP 429 as a request to slow down", () => {
    for (const code of [4, 17, 32, 613, 80001]) {
      expect(facebookAccountSignal(new FacebookApiError("Slow down", 400, true, true, code))).toBe("rate_limited");
    }
    expect(facebookAccountSignal(new FacebookApiError("Too many", 429, true))).toBe("rate_limited");
  });

  it("reads only Facebook's own answers, never a transport failure or another error", () => {
    expect(facebookAccountSignal(new FacebookApiError("Facebook request timed out", 0, false))).toBeNull();
    expect(facebookAccountSignal(new FacebookApiError("Invalid OAuth", 400, true, false, 190))).toBeNull();
    expect(facebookAccountSignal(new Error("(#368) blocked from sending messages"))).toBeNull();
  });
});
