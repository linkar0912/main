import { describe, expect, it } from "vitest";
import { isAnalyticsPage, redactAnalyticsPath } from "./analytics-path";

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
