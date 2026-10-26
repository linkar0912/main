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
    [{ origin: "https://app.linkar.in", "content-type": "application/json-injected" }, 415, "json_required"],
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

it("scopes audit correlation to the action, target, owner, and session", async () => {
  const headers = { origin: "https://app.linkar.in", "content-type": "application/json", "x-admin-reason": "Review access", "idempotency-key": "same-key-for-test-0001" };
  const options = { action: "workspace.suspend", targetType: "workspace", targetId: "w1" };
  // This test is outside the describe's beforeEach, so set its fixtures explicitly.
  mocks.getServerEnv.mockReturnValue({ appUrl: "https://app.linkar.in", authSessionSecret: "test-only", trustedProxyHops: 0 });
  mocks.getPlatformOwnerSession.mockResolvedValue(OWNER);
  const first = await requireAdminWrite(writeRequest(headers), options);
  const replay = await requireAdminWrite(writeRequest(headers), options);
  const other = await requireAdminWrite(writeRequest(headers), { ...options, targetId: "w2" });
  const otherWorkspace = await requireAdminWrite(writeRequest(headers), { ...options, workspaceId: "w2" });
  expect(otherWorkspace.requestId).not.toBe(first.requestId);
  expect(replay.requestId).toBe(first.requestId); expect(other.requestId).not.toBe(first.requestId);
});

it("decodes percent-encoded reasons and rejects malformed encodings", async () => {
  mocks.getServerEnv.mockReturnValue({ appUrl: "https://app.linkar.in", authSessionSecret: "test-only", trustedProxyHops: 0 });
  mocks.getPlatformOwnerSession.mockResolvedValue(OWNER);
  const options = { action: "workspace.suspend", targetType: "workspace", targetId: "w1" };
  const base = { origin: "https://app.linkar.in", "content-type": "application/json", "idempotency-key": "unicode-reason-key-0001" };
  const reason = "Customer’s ₹999 refund → ग्राहक अनुरोध";
  const decoded = await requireAdminWrite(writeRequest({ ...base, "x-admin-reason": encodeURIComponent(reason) }), options);
  expect(decoded.reason).toBe(reason);
  await expect(requireAdminWrite(writeRequest({ ...base, "x-admin-reason": "bad %E0%A4 encoding" }), options)).rejects.toMatchObject({ status: 422, code: "reason_required" });
});

const { runWithAdminKeyPrincipal } = await import("./mcp/principal");
const { requireAdminSessionRead, requireAdminSessionWrite } = await import("./request-guard");

describe("admin request guard inside an MCP key principal", () => {
  const keyOwner = { ...OWNER, sessionId: "mcp_key:mcpkey_1" };
  const principal = (scope: "READ" | "WRITE") => ({ keyId: "mcpkey_1", label: "Laptop", scope, expiresAt: "2026-11-24T00:00:00.000Z", owner: keyOwner });
  const options = { action: "workspace.suspend", targetType: "workspace", targetId: "w1" };
  const mcpHeaders = { "content-type": "application/json", "x-admin-reason": "Investigate abuse", "idempotency-key": "mcp-call-key-000001", "user-agent": "claude-code/2.1" };

  beforeEach(() => {
    mocks.getServerEnv.mockReturnValue({ appUrl: "https://app.linkar.in", adminUrl: "https://admin.linkar.in", authSessionSecret: "test-only", trustedProxyHops: 0 });
    mocks.getPlatformOwnerSession.mockReset().mockResolvedValue(keyOwner);
    mocks.getPlatformOwnerIdentity.mockReset().mockResolvedValue(keyOwner);
  });

  it("accepts a write key without a browser Origin and records the MCP origin", async () => {
    const result = await runWithAdminKeyPrincipal(principal("WRITE"), () => requireAdminWrite(writeRequest(mcpHeaders), options));
    expect(result).toMatchObject({ owner: keyOwner, origin: "mcp", reason: "Investigate abuse", userAgent: "claude-code/2.1" });
  });

  it("still requires JSON, a reason and an idempotency key from a write key", async () => {
    await expect(runWithAdminKeyPrincipal(principal("WRITE"), () => requireAdminWrite(writeRequest({ ...mcpHeaders, "content-type": "text/plain" }), options))).rejects.toMatchObject({ status: 415, code: "json_required" });
    await expect(runWithAdminKeyPrincipal(principal("WRITE"), () => requireAdminWrite(writeRequest({ ...mcpHeaders, "x-admin-reason": "" }), options))).rejects.toMatchObject({ status: 422, code: "reason_required" });
    await expect(runWithAdminKeyPrincipal(principal("WRITE"), () => requireAdminWrite(writeRequest({ ...mcpHeaders, "idempotency-key": "short" }), options))).rejects.toMatchObject({ status: 422, code: "invalid_idempotency_key" });
  });

  it("refuses every write from a read-only key", async () => {
    await expect(runWithAdminKeyPrincipal(principal("READ"), () => requireAdminWrite(writeRequest(mcpHeaders), options))).rejects.toMatchObject({ status: 403, code: "mcp_key_read_only" });
    await expect(runWithAdminKeyPrincipal(principal("READ"), () => requireAdminIdentityWrite(writeRequest(mcpHeaders), options))).rejects.toMatchObject({ status: 403, code: "mcp_key_read_only" });
  });

  it("lets a read-only key read", async () => {
    await expect(runWithAdminKeyPrincipal(principal("READ"), () => requireAdminRead(new Request("https://admin.linkar.in/api/admin/overview")))).resolves.toEqual(keyOwner);
  });

  it("keeps the session-only guards closed to every key", async () => {
    await expect(runWithAdminKeyPrincipal(principal("WRITE"), () => requireAdminSessionRead(new Request("https://admin.linkar.in/api/admin/mcp-keys")))).rejects.toMatchObject({ status: 403, code: "mcp_key_not_allowed" });
    await expect(runWithAdminKeyPrincipal(principal("WRITE"), () => requireAdminSessionWrite(writeRequest(mcpHeaders), options))).rejects.toMatchObject({ status: 403, code: "mcp_key_not_allowed" });
  });

  it("opens the session-only guards to a browser session", async () => {
    mocks.getPlatformOwnerSession.mockResolvedValue(OWNER);
    await expect(requireAdminSessionRead(new Request("https://admin.linkar.in/api/admin/mcp-keys"))).resolves.toEqual(OWNER);
    await expect(requireAdminSessionWrite(writeRequest({ ...mcpHeaders, origin: "https://admin.linkar.in" }), options)).resolves.toMatchObject({ owner: OWNER, origin: "https://admin.linkar.in" });
  });
});
