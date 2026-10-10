import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resend: vi.fn() }));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({
    appUrl: "http://localhost:3000",
    redisUrl: undefined,
    trustedProxyHops: 0,
    authSessionSecret: "test-secret-at-least-32-characters",
  }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { resend: mocks.resend } }),
}));

const { POST } = await import("./route");

function resendRequest(fields: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/auth/resend-confirmation", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("POST /api/auth/resend-confirmation", () => {
  beforeEach(() => {
    mocks.resend.mockReset().mockResolvedValue({ error: null });
  });

  it("re-sends the signup confirmation carrying next and invite into the new link", async () => {
    const response = await POST(resendRequest({ email: "new@example.com", next: "/automations", invite: "raw" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login?notice=resent&next=%2Fautomations&invite=raw");
    const call = mocks.resend.mock.calls[0]?.[0];
    expect(call).toMatchObject({ type: "signup", email: "new@example.com" });
    const confirmUrl = new URL(call.options.emailRedirectTo);
    expect(confirmUrl.searchParams.get("next")).toBe("/automations");
    expect(confirmUrl.searchParams.get("invite")).toBe("raw");
  });

  it("answers identically when Supabase fails (no account enumeration)", async () => {
    mocks.resend.mockRejectedValue(new Error("user not found"));
    const response = await POST(resendRequest({ email: "nobody@example.com" }));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?notice=resent&next=%2Fdashboard");
  });

  it("returns to the signup confirmation screen when sent from there", async () => {
    const response = await POST(resendRequest({ email: "new2@example.com", from: "signup" }));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/signup?sent=1&email=new2%40example.com&notice=resent&next=%2Fdashboard",
    );
  });

  it("caps sends per address", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await POST(resendRequest({ email: "busy@example.com" }));
    const response = await POST(resendRequest({ email: "busy@example.com" }));
    expect(response.headers.get("location")).toContain("error=resend-locked");
    expect(mocks.resend).toHaveBeenCalledTimes(3);
  });
});
