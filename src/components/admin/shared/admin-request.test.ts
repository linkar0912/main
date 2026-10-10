import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminCommandError, adminCommand, adminErrorMessage, adminQuery, humanizeAdminCode } from "./admin-request";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("admin request transport", () => {
  it("sends the trimmed reason, a valid idempotency key, and returns the data member", async () => {
    const fetchMock = stubFetch(Response.json({ data: { id: "p1" } }));
    await expect(adminCommand("/api/admin/plans", { body: { key: "growth" }, reason: "  raise limit  " })).resolves.toEqual({ id: "p1" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(decodeURIComponent(init.headers["x-admin-reason"])).toBe("raise limit");
    // The server accepts 16-128 characters from this set only.
    expect(init.headers["idempotency-key"]).toMatch(/^[A-Za-z0-9._:-]{16,128}$/);
    expect(init.body).toBe(JSON.stringify({ key: "growth" }));
  });

  it("reports the structured server code", async () => {
    stubFetch(Response.json({ error: "stale_version" }, { status: 409 }));
    const failure = await adminCommand("/api/admin/plans/p1", { method: "PATCH", reason: "edit plan" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AdminCommandError);
    expect((failure as AdminCommandError).status).toBe(409);
    expect(adminErrorMessage(failure)).toBe("Stale version");
  });

  it("falls back to a safe code when an outage returns a non-JSON page", async () => {
    // A proxy error page used to surface as "Unexpected token '<'" in the console UI.
    stubFetch(new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    const failure = await adminCommand("/api/admin/system", { reason: "reconcile", fallback: "system_command_failed" }).catch((error: unknown) => error);
    expect(adminErrorMessage(failure)).toBe("System command failed");
  });

  it("does not expose browser network error text but says the request did not arrive", () => {
    const message = adminErrorMessage(new TypeError("Failed to fetch"), "Operation failed");
    expect(message).not.toContain("Failed to fetch");
    expect(message).toMatch(/^Operation failed: the request did not reach Linkar/);
  });

  it("percent-encodes reasons that are not ISO-8859-1 so fetch can send them", async () => {
    const fetchMock = stubFetch(Response.json({ data: {} }));
    const reason = "Customer’s ₹999 refund → ग्राहक अनुरोध";
    await adminCommand("/api/admin/plans", { reason });
    const header = fetchMock.mock.calls[0][1].headers["x-admin-reason"] as string;
    // Header values must be Latin-1; real fetch rejects with a TypeError otherwise.
    expect(/^[\x20-\x7e]+$/.test(header)).toBe(true);
    expect(() => new Headers({ "x-admin-reason": header })).not.toThrow();
    expect(decodeURIComponent(header)).toBe(reason);
  });

  it("treats a successful read without data as unavailable", async () => {
    stubFetch(Response.json({}));
    await expect(adminQuery("/api/admin/operations/delivery/d1", { fallback: "operation_unavailable" })).rejects.toMatchObject({ code: "operation_unavailable" });
  });

  it("humanizes codes", () => {
    expect(humanizeAdminCode("reason_required")).toBe("Reason required");
    expect(humanizeAdminCode("")).toBe("");
  });
});
