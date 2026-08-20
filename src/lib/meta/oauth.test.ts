import { describe, expect, it } from "vitest";
import { buildInstagramAuthorizeUrl } from "./oauth";

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
});
