import { describe, expect, it } from "vitest";
import { isProtectedAppPath, resolveHostRedirect, resolveRequestHostname } from "./site-routing";

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
    expect(isProtectedAppPath("/login")).toBe(false);
    expect(isProtectedAppPath("/privacy")).toBe(false);
    expect(isProtectedAppPath("/")).toBe(false);
  });
});
