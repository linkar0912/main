import { describe, expect, it } from "vitest";
import { redactAnalyticsPath } from "./analytics-path";

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
