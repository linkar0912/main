import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFacebookAuthorizeUrl,
  exchangeFacebookCode,
  listFacebookPages,
  subscribeFacebookPageToWebhooks,
  FacebookOAuthError,
  FacebookPermissionError,
  getFacebookUserId,
  readFacebookPageWebhookSubscription,
  unsubscribeFacebookPageFromWebhooks,
  validateFacebookPermissions,
} from "./oauth";

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

describe("buildFacebookAuthorizeUrl", () => {
  it("uses the Facebook dialog endpoint and the configured redirect uri", () => {
    const url = new URL(buildFacebookAuthorizeUrl("state-xyz", {
      facebookAppId: "app-1",
      facebookRedirectUri: "https://app.example.com/api/facebook/oauth/callback",
      facebookScopes: ["pages_show_list"],
      facebookApiVersion: "v25.0",
    }));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("app-1");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/facebook/oauth/callback");
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("scope")).toBe("pages_show_list");
  });

  it("throws when facebookAppId is missing", () => {
    expect(() => buildFacebookAuthorizeUrl("s", {
      facebookAppId: "",
      facebookRedirectUri: "https://x",
      facebookScopes: [],
      facebookApiVersion: "v25.0",
    })).toThrow("Facebook app is not configured");
  });
});

describe("exchangeFacebookCode", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("/oauth/access_token") && url.includes("grant_type=fb_exchange_token")) {
        return jsonResponse(200, { access_token: "long-token", expires_in: 5_184_000 });
      }
      // Short-lived exchange
      return jsonResponse(200, { access_token: "short-token" });
    }) as typeof fetch;
  });

  it("upgrades a short-lived token to a long-lived token and returns it", async () => {
    const result = await exchangeFacebookCode("code-1", {
      facebookAppId: "app-1",
      facebookAppSecret: "secret-1",
      facebookRedirectUri: "https://x/cb",
      facebookApiVersion: "v25.0",
      facebookScopes: ["pages_show_list"],
    });
    expect(result.accessToken).toBe("long-token");
    expect(result.expiresIn).toBe(5_184_000);
  });

  it("throws when the short-lived exchange returns no token", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, {})) as typeof fetch;
    await expect(exchangeFacebookCode("c", {
      facebookAppId: "a", facebookAppSecret: "b", facebookRedirectUri: "x", facebookApiVersion: "v25.0", facebookScopes: [],
    })).rejects.toThrow("Meta did not return a Facebook access token");
  });

  it("translates a 400 from Meta into a FacebookOAuthError", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { error: { message: "bad code" } })) as typeof fetch;
    await expect(exchangeFacebookCode("c", {
      facebookAppId: "a", facebookAppSecret: "b", facebookRedirectUri: "x", facebookApiVersion: "v25.0", facebookScopes: [],
    })).rejects.toBeInstanceOf(FacebookOAuthError);
  });
});

describe("listFacebookPages", () => {
  it("normalizes the /me/accounts payload into FacebookPageSummary rows", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, {
      data: [
        { id: "page_1", name: "Acme Co", access_token: "page-tok-1", category: "Retail" },
        { id: "page_2", name: "Acme Studio", access_token: "page-tok-2" },
        { id: "page_3" }, // missing access_token: should be dropped
      ],
    })) as typeof fetch;
    const pages = await listFacebookPages("user-tok", "v25.0");
    expect(pages).toEqual([
      { id: "page_1", name: "Acme Co", accessToken: "page-tok-1", category: "Retail" },
      { id: "page_2", name: "Acme Studio", accessToken: "page-tok-2" },
    ]);
  });

  it("returns an empty list when the data array is missing or empty", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, {})) as typeof fetch;
    expect(await listFacebookPages("u", "v25.0")).toEqual([]);
  });
});

describe("subscribeFacebookPageToWebhooks", () => {
  it("returns { subscribed: true } when Meta confirms the subscription", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { success: true })) as typeof fetch;
    const result = await subscribeFacebookPageToWebhooks("page_1", "tok", "v25.0");
    expect(result.subscribed).toBe(true);
  });

  it("returns { subscribed: false, error } when Meta does not confirm", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { success: false })) as typeof fetch;
    const result = await subscribeFacebookPageToWebhooks("page_1", "tok", "v25.0");
    expect(result.subscribed).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// FacebookPermissionError is exported but not directly used by these helpers;
// ensure the export exists and the message is clear for callers to surface.
describe("FacebookPermissionError", () => {
  it("has a stable, user-readable message", () => {
    const error = new FacebookPermissionError();
    expect(error.message).toMatch(/permissions/i);
  });
});

describe("validateFacebookPermissions", () => {
  it("accepts all required Page permissions", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { data: [
      "pages_show_list", "pages_manage_metadata", "pages_manage_engagement",
      "pages_read_engagement", "pages_read_user_content",
    ].map((permission) => ({ permission, status: "granted" })) })) as typeof fetch;
    await expect(validateFacebookPermissions("user-token", "v25.0", fetcher)).resolves.toBeUndefined();
  });

  it("reports every missing or declined permission", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { data: [
      { permission: "pages_show_list", status: "granted" },
      { permission: "pages_manage_metadata", status: "declined" },
    ] })) as typeof fetch;
    await expect(validateFacebookPermissions("user-token", "v25.0", fetcher)).rejects.toMatchObject({
      name: "FacebookPermissionError",
      missingPermissions: expect.arrayContaining(["pages_manage_metadata", "pages_read_user_content"]),
    });
  });
});

it("reads the app-scoped Facebook user id", async () => {
  const fetcher = vi.fn(async () => jsonResponse(200, { id: "fb_user_1" })) as typeof fetch;
  await expect(getFacebookUserId("user-token", "v25.0", fetcher)).resolves.toBe("fb_user_1");
});

describe("Facebook Page webhook lifecycle", () => {
  it("checks subscribed fields with a read-only GET", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { data: [
      { id: "another_app", subscribed_fields: ["feed"] },
      { id: "app_1", subscribed_fields: ["feed"] },
    ] })) as typeof fetch;
    await expect(readFacebookPageWebhookSubscription("page_1", "token", "v25.0", "app_1", fetcher)).resolves.toEqual(["feed"]);
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.not.objectContaining({ method: "POST" }));
  });

  it("unsubscribes the Page with DELETE", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { success: true })) as typeof fetch;
    await expect(unsubscribeFacebookPageFromWebhooks("page_1", "token", "v25.0", fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: "DELETE" }));
  });
});
