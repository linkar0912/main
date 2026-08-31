import { describe, expect, it } from "vitest";
import { applicationOriginForPath, isProtectedAppPath, resolveHostRedirect, resolveRequestHostname } from "./site-routing";

describe("site host routing", () => {
  it("moves app paths from the marketing host to the app host", () => {
    expect(resolveHostRedirect("linkar.in", "/login")).toEqual({
      target: "app",
      pathname: "/login",
    });
    expect(resolveHostRedirect("linkar.in", "/dashboard/activity")).toEqual({
      target: "app",
      pathname: "/dashboard/activity",
    });
    expect(resolveHostRedirect("linkar.in", "/auth/confirm")).toEqual({
      target: "app",
      pathname: "/auth/confirm",
    });
    expect(resolveHostRedirect("linkar.in", "/admin/workspaces")).toEqual({
      target: "admin",
      pathname: "/admin/workspaces",
    });
  });

  it("keeps owner surfaces on the dedicated admin host", () => {
    expect(resolveHostRedirect("app.linkar.in", "/admin")).toEqual({ target: "admin", pathname: "/admin" });
    expect(resolveHostRedirect("app.linkar.in", "/api/admin/system")).toEqual({ target: "admin", pathname: "/api/admin/system" });
    expect(resolveHostRedirect("admin.linkar.in", "/")).toEqual({ target: "admin", pathname: "/admin" });
    expect(resolveHostRedirect("admin.linkar.in", "/admin/audit")).toBeNull();
    expect(resolveHostRedirect("admin.linkar.in", "/login")).toBeNull();
    expect(resolveHostRedirect("admin.linkar.in", "/dashboard")).toEqual({ target: "app", pathname: "/dashboard" });
  });

  it("moves marketing and legal paths from the app host to the marketing host", () => {
    expect(resolveHostRedirect("app.linkar.in", "/")).toEqual({
      target: "app",
      pathname: "/dashboard",
    });
    expect(resolveHostRedirect("app.linkar.in", "/privacy")).toEqual({
      target: "marketing",
      pathname: "/privacy",
    });
    expect(resolveHostRedirect("app.linkar.in", "/data-deletion/status/code-123")).toEqual({
      target: "marketing",
      pathname: "/data-deletion/status/code-123",
    });
  });

  it("leaves canonical and unknown hosts alone", () => {
    expect(resolveHostRedirect("linkar.in", "/")).toBeNull();
    expect(resolveHostRedirect("app.linkar.in", "/dashboard")).toBeNull();
    expect(resolveHostRedirect("localhost", "/login")).toBeNull();
  });

  it("uses the reverse proxy host when Next's request URL is internal", () => {
    expect(
      resolveRequestHostname(
        new Headers({ "x-forwarded-host": "app.linkar.in", host: "127.0.0.1:3000" }),
        "127.0.0.1",
      ),
    ).toBe("app.linkar.in");
    expect(resolveRequestHostname(new Headers({ host: "linkar.in:443" }), "127.0.0.1")).toBe("linkar.in:443");
  });

  it("identifies only authenticated workspace pages as protected", () => {
    expect(isProtectedAppPath("/dashboard")).toBe(true);
    expect(isProtectedAppPath("/automations/new")).toBe(true);
    expect(isProtectedAppPath("/help")).toBe(true);
    expect(isProtectedAppPath("/admin/security")).toBe(true);
    expect(isProtectedAppPath("/login")).toBe(false);
    expect(isProtectedAppPath("/privacy")).toBe(false);
    expect(isProtectedAppPath("/")).toBe(false);
  });

  it("selects the admin origin for owner navigation and the app origin otherwise", () => {
    const origins = { appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in" };
    expect(applicationOriginForPath("/admin/security", origins)).toBe("https://admin.linkar.in");
    expect(applicationOriginForPath("/dashboard", origins)).toBe("https://app.linkar.in");
  });
});
