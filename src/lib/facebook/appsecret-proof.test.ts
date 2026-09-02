import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { appSecretProof, withAppSecretProof } from "./appsecret-proof";
import { FacebookClient } from "./client";

describe("appSecretProof", () => {
  it("is an HMAC-SHA256 of the access token keyed by the app secret", () => {
    // Meta's documented formula: hash_hmac('sha256', access_token, app_secret).
    const expected = createHmac("sha256", "app-secret").update("user-token").digest("hex");
    expect(appSecretProof("user-token", "app-secret")).toBe(expected);
    expect(appSecretProof("user-token", "app-secret")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keys on the secret, so a different app secret yields a different proof", () => {
    expect(appSecretProof("t", "secret-a")).not.toBe(appSecretProof("t", "secret-b"));
  });
});

describe("withAppSecretProof", () => {
  it("leaves the URL untouched when no app secret is configured", () => {
    const url = withAppSecretProof(new URL("https://graph.facebook.com/v25.0/me"), "token", undefined);
    expect(url.searchParams.has("appsecret_proof")).toBe(false);
  });

  it("appends the proof when the app secret is configured", () => {
    const url = withAppSecretProof(new URL("https://graph.facebook.com/v25.0/me"), "token", "app-secret");
    expect(url.searchParams.get("appsecret_proof")).toBe(appSecretProof("token", "app-secret"));
  });
});

describe("FacebookClient request signing", () => {
  it("signs every Graph call with appsecret_proof for the token it authenticates as", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "comment_reply_1" }), { status: 200 }),
    );
    const client = new FacebookClient({
      apiVersion: "v25.0",
      fetcher: fetcher as unknown as typeof fetch,
      appSecret: "app-secret",
    });

    await client.postCommentReply({ pageId: "page_1", accessToken: "page-token" }, "comment_1", "hi");

    const calledUrl = fetcher.mock.calls[0][0] as URL;
    // Proof is over the *page* token actually used to authenticate the call.
    expect(calledUrl.searchParams.get("appsecret_proof")).toBe(appSecretProof("page-token", "app-secret"));
  });

  it("omits the proof when no app secret is configured (demo mode)", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "x" }), { status: 200 }),
    );
    const client = new FacebookClient({ apiVersion: "v25.0", fetcher: fetcher as unknown as typeof fetch });

    await client.postCommentReply({ pageId: "page_1", accessToken: "page-token" }, "comment_1", "hi");

    expect((fetcher.mock.calls[0][0] as URL).searchParams.has("appsecret_proof")).toBe(false);
  });
});
