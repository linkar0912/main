import { describe, expect, it } from "vitest";
import { getSeoPages, seoPagePath, seoPages } from "@/src/content/seo";
import { ANALYTICS_PAGE_PATHS, SEO_CATALOGUE_PATHS, isAnalyticsPage, redactAnalyticsPath } from "./analytics-path";

const SEO_HUBS = ["/features", "/solutions", "/templates"];
const SEO_GUIDES = seoPages.map(seoPagePath);

describe("redactAnalyticsPath", () => {
  it("leaves static marketing and app routes alone", () => {
    for (const path of ["/", "/pricing", "/dashboard", "/settings", "/privacy"]) {
      expect(redactAnalyticsPath(path)).toBe(path);
    }
  });

  it("hides the deletion status lookup token", () => {
    expect(redactAnalyticsPath("/data-deletion/status/abc123XYZ"))
      .toBe("/data-deletion/status/:code");
  });

  it("hides admin user and workspace identifiers", () => {
    expect(redactAnalyticsPath("/admin/users/usr_9f2")).toBe("/admin/users/:userId");
    expect(redactAnalyticsPath("/admin/workspaces/ws_41")).toBe("/admin/workspaces/:workspaceId");
  });

  it("hides an automation id while keeping the sub-route", () => {
    expect(redactAnalyticsPath("/automations/auto_77/edit")).toBe("/automations/:id/edit");
    expect(redactAnalyticsPath("/automations/auto_77/activity")).toBe("/automations/:id/activity");
    expect(redactAnalyticsPath("/automations/auto_77")).toBe("/automations/:id");
  });

  it("keeps the static siblings of the automation id route", () => {
    for (const path of ["/automations", "/automations/new", "/automations/broadcasts", "/automations/sequences"]) {
      expect(redactAnalyticsPath(path)).toBe(path);
    }
  });

  it("leaves every SEO catalogue hub and guide unchanged", () => {
    for (const path of [...SEO_HUBS, ...SEO_GUIDES]) {
      expect(redactAnalyticsPath(path)).toBe(path);
      expect(redactAnalyticsPath(`${path}?utm_source=instagram#faq`)).toBe(path);
    }
  });

  it("drops the query string and hash, which can carry tokens of their own", () => {
    expect(redactAnalyticsPath("/reset-password?token=secret")).toBe("/reset-password");
    expect(redactAnalyticsPath("/login#access_token=secret")).toBe("/login");
  });
});

describe("isAnalyticsPage", () => {
  it("covers the public website, sign-in and sign-up", () => {
    for (const path of ["/", "/pricing", "/login", "/signup", "/cookies", "/privacy", "/support", "/data-deletion", "/pricing/", "/login?next=/dashboard"]) {
      expect(isAnalyticsPage(path)).toBe(true);
    }
  });

  it("covers the SEO catalogue hubs and every guide", () => {
    for (const collection of ["features", "solutions", "templates"] as const) {
      expect(getSeoPages(collection).length, collection).toBeGreaterThan(0);
    }
    for (const path of [...SEO_HUBS, ...SEO_GUIDES]) {
      expect(isAnalyticsPage(path), path).toBe(true);
      expect(isAnalyticsPage(`${path}/`), `${path}/`).toBe(true);
      expect(isAnalyticsPage(`${path}?utm_source=instagram`), `${path}?utm_source=instagram`).toBe(true);
    }
  });

  it("lists exactly the catalogue: the three hubs and each guide once", () => {
    // Fails when a guide is added, renamed or removed in src/content/seo
    // without the matching change to SEO_CATALOGUE in analytics-path.ts.
    expect([...SEO_CATALOGUE_PATHS].sort()).toEqual([...SEO_HUBS, ...SEO_GUIDES].sort());
    expect(new Set(ANALYTICS_PAGE_PATHS).size).toBe(ANALYTICS_PAGE_PATHS.length);
  });

  it("leaves out the recipe downloads, unknown slugs and nested catalogue paths", () => {
    for (const page of getSeoPages("templates")) {
      expect(isAnalyticsPage(`${seoPagePath(page)}/recipe`), `${seoPagePath(page)}/recipe`).toBe(false);
    }
    for (const path of [
      "/features/not-a-guide",
      "/solutions/not-a-guide",
      "/templates/not-a-guide",
      "/templates/not-a-guide/recipe",
      "/features/instagram-comment-to-dm/extra",
      "/features/content-creators",
      "/solutions/instagram-comment-to-dm",
      "/Features/instagram-comment-to-dm",
      "/feature",
      "/templates-old",
    ]) {
      expect(isAnalyticsPage(path), path).toBe(false);
    }
  });

  it("never covers the app, the owner console, or pages with a secret in the address", () => {
    for (const path of [
      "/dashboard",
      "/automations/auto_1",
      "/settings",
      "/help",
      "/onboarding",
      "/admin",
      "/admin/users/u_1",
      "/reset-password",
      "/auth/confirm",
      "/data-deletion/status/abc123",
      "/dev-preview/workspace/dashboard",
      "/pricing/extra",
      "",
      null,
    ]) {
      expect(isAnalyticsPage(path)).toBe(false);
    }
  });
});
