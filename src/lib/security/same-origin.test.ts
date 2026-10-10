import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "https://app.linkar.in",
    adminUrl: "https://admin.linkar.in",
    publicSiteUrl: "https://linkar.in",
  }),
}));

const { isCrossSiteRequest, rejectCrossSiteRequest } = await import("./same-origin");

function post(headers: Record<string, string>, url = "https://app.linkar.in/api/auth/login"): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isCrossSiteRequest", () => {
  it("allows same-origin browser posts", () => {
    expect(isCrossSiteRequest(post({ "sec-fetch-site": "same-origin", origin: "https://app.linkar.in" }))).toBe(false);
  });

  it("rejects a cross-site form post (login CSRF)", () => {
    expect(isCrossSiteRequest(post({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe(true);
  });

  it("rejects a foreign Origin from a browser that does not send Sec-Fetch-Site", () => {
    expect(isCrossSiteRequest(post({ origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSiteRequest(post({ origin: "null" }))).toBe(true);
  });

  it("accepts a sibling Linkar host but not an arbitrary same-site one", () => {
    expect(isCrossSiteRequest(post({ "sec-fetch-site": "same-site", origin: "https://admin.linkar.in" }))).toBe(false);
    expect(isCrossSiteRequest(post({ "sec-fetch-site": "same-site", origin: "https://user-content.linkar.in" }))).toBe(true);
  });

  it("accepts the public host forwarded by a reverse proxy", () => {
    const request = post(
      { origin: "https://preview.example.dev", "x-forwarded-host": "preview.example.dev" },
      "http://0.0.0.0:3000/api/auth/login",
    );
    expect(isCrossSiteRequest(request)).toBe(false);
  });

  it("lets header-less non-browser clients through (they carry no victim cookies)", () => {
    expect(isCrossSiteRequest(post({}))).toBe(false);
  });

  it("returns a 403 response from the route helper", () => {
    expect(rejectCrossSiteRequest(post({ "sec-fetch-site": "cross-site" }))?.status).toBe(403);
    expect(rejectCrossSiteRequest(post({ "sec-fetch-site": "same-origin" }))).toBeNull();
  });
});
