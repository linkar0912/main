import { describe, expect, it } from "vitest";
import { sharedAuthCookieDomain, supabaseAuthCookieOptions } from "./cookie-domain";

describe("supabaseAuthCookieOptions", () => {
  it("keeps session cookies away from page scripts and https-only in production", () => {
    expect(supabaseAuthCookieOptions({
      appUrl: "https://app.linkar.in",
      adminUrl: "https://admin.linkar.in",
      publicSiteUrl: "https://linkar.in",
    })).toEqual({ domain: "linkar.in", path: "/", httpOnly: true, secure: true, sameSite: "lax" });
  });

  it("stays usable over plain http on localhost", () => {
    expect(supabaseAuthCookieOptions({
      appUrl: "http://localhost:3000",
      adminUrl: "http://localhost:3000",
      publicSiteUrl: "http://localhost:3000",
    })).toEqual({ path: "/", httpOnly: true, secure: false, sameSite: "lax" });
  });
});

describe("sharedAuthCookieDomain", () => {
  it("shares auth cookies across the production app and admin hosts", () => {
    expect(sharedAuthCookieDomain({
      appUrl: "https://app.linkar.in",
      adminUrl: "https://admin.linkar.in",
      publicSiteUrl: "https://linkar.in",
    })).toBe("linkar.in");
  });

  it("keeps local cookies host-only", () => {
    expect(sharedAuthCookieDomain({
      appUrl: "http://localhost:3000",
      adminUrl: "http://localhost:3000",
      publicSiteUrl: "http://localhost:3000",
    })).toBeUndefined();
  });

  it("does not share cookies across unrelated hosts", () => {
    expect(sharedAuthCookieDomain({
      appUrl: "https://app.example.com",
      adminUrl: "https://admin.other.example",
      publicSiteUrl: "https://example.com",
    })).toBeUndefined();
  });
});
