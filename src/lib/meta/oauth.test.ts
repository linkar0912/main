import { describe, expect, it, vi } from "vitest";
import { buildInstagramAuthorizeUrl, exchangeInstagramCode } from "./oauth";

describe("buildInstagramAuthorizeUrl", () => {
  it("builds a Business Login for Instagram URL with requested scopes", () => {
    const url = new URL(
      buildInstagramAuthorizeUrl("state_123", {
        metaAppId: "app_123",
        metaRedirectUri: "https://app.example.com/callback",
        metaScopes: ["instagram_business_basic", "instagram_business_manage_comments"],
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("app_123");
    expect(url.searchParams.get("state")).toBe("state_123");
    expect(url.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_manage_comments",
    );
  });

  it("rejects when Meta app credentials are not configured", () => {
    expect(() =>
      buildInstagramAuthorizeUrl("state_123", {
        metaRedirectUri: "https://app.example.com/callback",
        metaScopes: [],
      }),
    ).toThrow("Meta app is not configured");
  });

  it("rejects the connection when long-lived token exchange fails", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "short-token", user_id: "ig_123" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error_message: "exchange failed" }), { status: 500 }));

    await expect(exchangeInstagramCode("oauth-code", {
      metaAppId: "app_123",
      metaAppSecret: "app-secret",
      metaRedirectUri: "https://reply.example.com/api/meta/oauth/callback",
      metaApiVersion: "v25.0",
      metaScopes: [],
    }, fetcher)).rejects.toThrow("exchange failed");
  });
});
