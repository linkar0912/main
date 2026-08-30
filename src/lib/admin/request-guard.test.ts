import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "owner@linkar.in",
  sessionId: "session-1",
  aal: "aal2" as const,
};

const mocks = vi.hoisted(() => ({
  getPlatformOwnerIdentity: vi.fn(),
  getPlatformOwnerSession: vi.fn(),
  getServerEnv: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./authorization", () => ({
  getPlatformOwnerIdentity: mocks.getPlatformOwnerIdentity,
  getPlatformOwnerSession: mocks.getPlatformOwnerSession,
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: mocks.getServerEnv }));

const { requireAdminIdentityWrite, requireAdminRead, requireAdminWrite } = await import("./request-guard");

function writeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://app.linkar.in/api/admin/workspaces/w1", {
    method: "POST",
    headers,
    body: headers["content-type"] === "application/json" ? "{}" : undefined,
  });
}

describe("admin request guard", () => {
  beforeEach(() => {
    mocks.getPlatformOwnerIdentity.mockReset();
    mocks.getPlatformOwnerIdentity.mockResolvedValue({ ...OWNER, aal: "aal1" });
    mocks.getPlatformOwnerSession.mockReset();
    mocks.getPlatformOwnerSession.mockResolvedValue(OWNER);
    mocks.getServerEnv.mockReset();
    mocks.getServerEnv.mockReturnValue({
      appUrl: "https://app.linkar.in",
      authSessionSecret: "test-secret-that-is-at-least-32-characters",
      trustedProxyHops: 1,
    });
  });

  it("returns only the verified owner from the read guard", async () => {
    await expect(requireAdminRead(new Request("https://app.linkar.in/api/admin/overview"))).resolves.toEqual(OWNER);
  });

  it.each([
    [{ "content-type": "application/json" }, 403, "origin_required"],
    [{ origin: "https://evil.test", "content-type": "application/json" }, 403, "origin_mismatch"],
    [{ origin: "https://app.linkar.in", "content-type": "text/plain" }, 415, "json_required"],
  ])("rejects unsafe write transport %#", async (headers, status, code) => {
    await expect(
      requireAdminWrite(writeRequest(headers), {
        action: "workspace.suspend",
        targetType: "workspace",
        targetId: "w1",
      }),
    ).rejects.toMatchObject({ status, code });
  });

  it("requires a reason and idempotency key", async () => {
    const request = writeRequest({
      origin: "https://app.linkar.in",
      "content-type": "application/json",
    });

    await expect(
      requireAdminWrite(request, {
        action: "workspace.suspend",
        targetType: "workspace",
        targetId: "w1",
      }),
    ).rejects.toMatchObject({ status: 422, code: "reason_required" });
  });

  it("returns bounded audit context without retaining the client address", async () => {
    const request = writeRequest({
      origin: "https://app.linkar.in",
      "content-type": "application/json",
      "x-admin-reason": "Investigate repeated abuse reports",
      "idempotency-key": "550e8400-e29b-41d4-a716-446655440000",
      "x-forwarded-for": "203.0.113.7, 10.0.0.2",
      "user-agent": "Linkar Operator Browser",
    });

    const result = await requireAdminWrite(request, {
      action: "workspace.suspend",
      targetType: "workspace",
      targetId: "w1",
    });

    expect(result).toMatchObject({
      owner: OWNER,
      reason: "Investigate repeated abuse reports",
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      origin: "https://app.linkar.in",
      userAgent: "Linkar Operator Browser",
    });
    expect(result.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.ipHash).not.toContain("203.0.113.7");
    expect(result.requestId).toMatch(/^admin_req_[0-9a-f]{64}$/);
  });

  it("permits the allowlisted AAL1 identity only through the enrollment write guard", async () => {
    const request = writeRequest({
      origin: "https://app.linkar.in",
      "content-type": "application/json",
      "x-admin-reason": "Enroll owner MFA",
      "idempotency-key": "security-enrollment-0001",
    });

    const result = await requireAdminIdentityWrite(request, {
      action: "security.factor.enroll",
      targetType: "owner",
      targetId: OWNER.userId,
    });

    expect(result.owner.aal).toBe("aal1");
    expect(mocks.getPlatformOwnerSession).not.toHaveBeenCalled();
  });
});
