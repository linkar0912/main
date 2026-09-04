import { describe, expect, it } from "vitest";
import { sharedAuthCookieDomain } from "./cookie-domain";

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
