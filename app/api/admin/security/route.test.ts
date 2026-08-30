import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "owner@linkar.in",
  sessionId: "session-1",
  aal: "aal1" as const,
};

const writeContext = {
  owner: OWNER,
  action: "security.factor.enroll",
  targetType: "owner",
  targetId: OWNER.userId,
  reason: "Enroll owner MFA",
  idempotencyKey: "security-enrollment-0001",
  requestId: "admin_req_security_1",
  origin: "https://app.linkar.in",
  ipHash: "ip-hash",
  userAgent: "test-agent",
};

const mocks = vi.hoisted(() => ({
  getPlatformOwnerIdentity: vi.fn(),
  requireAdminIdentityWrite: vi.fn(),
  requireAdminWrite: vi.fn(),
  listFactors: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  unenroll: vi.fn(),
  createAdminChallenge: vi.fn(),
  consumeAdminChallenge: vi.fn(),
  appendAdminAuditEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/authorization", () => ({
  getPlatformOwnerIdentity: mocks.getPlatformOwnerIdentity,
}));
vi.mock("@/src/lib/admin/request-guard", () => ({
  requireAdminIdentityWrite: mocks.requireAdminIdentityWrite,
  requireAdminWrite: mocks.requireAdminWrite,
}));
vi.mock("@/src/lib/admin/challenges", () => ({
  createAdminChallenge: mocks.createAdminChallenge,
  consumeAdminChallenge: mocks.consumeAdminChallenge,
}));
vi.mock("@/src/lib/admin/audit", () => ({
  appendAdminAuditEvent: mocks.appendAdminAuditEvent,
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      mfa: {
        listFactors: mocks.listFactors,
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
        enroll: mocks.enroll,
        challengeAndVerify: mocks.challengeAndVerify,
        unenroll: mocks.unenroll,
      },
    },
  }),
}));

const { GET, POST } = await import("./route");

function request(body: unknown): Request {
  return new Request("https://app.linkar.in/api/admin/security", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const verifiedFactor = {
  id: "factor-verified",
  friendly_name: "Primary",
  factor_type: "totp",
  status: "verified",
  created_at: "2026-08-31T08:00:00.000Z",
  updated_at: "2026-08-31T08:02:00.000Z",
};

describe("/api/admin/security", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getPlatformOwnerIdentity.mockResolvedValue(OWNER);
    mocks.requireAdminIdentityWrite.mockResolvedValue(writeContext);
    mocks.requireAdminWrite.mockResolvedValue({ ...writeContext, owner: { ...OWNER, aal: "aal2" } });
    mocks.listFactors.mockResolvedValue({
      data: { all: [verifiedFactor], totp: [verifiedFactor], phone: [], webauthn: [] },
      error: null,
    });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: ["password"] },
      error: null,
    });
    mocks.appendAdminAuditEvent.mockResolvedValue(undefined);
  });

  it("returns safe AAL and factor fields to an allowlisted AAL1 owner", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/admin/security"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: {
        aal: "aal1",
        nextAal: "aal2",
        factors: [{ id: "factor-verified", friendlyName: "Primary", factorType: "totp", status: "verified" }],
      },
    });
  });

  it("returns a non-disclosing authorization error", async () => {
    mocks.getPlatformOwnerIdentity.mockRejectedValue({ status: 403, code: "forbidden" });

    const response = await GET(new Request("https://app.linkar.in/api/admin/security"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("enrolls TOTP for an AAL1 owner without placing the secret in audit data", async () => {
    mocks.enroll.mockResolvedValue({
      data: {
        id: "factor-new",
        type: "totp",
        friendly_name: "Linkar Operator",
        totp: { qr_code: "<svg>private</svg>", secret: "PRIVATESECRET", uri: "otpauth://private" },
      },
      error: null,
    });

    const response = await POST(request({ action: "enroll" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        factorId: "factor-new",
        qrCode: "<svg>private</svg>",
        secret: "PRIVATESECRET",
        uri: "otpauth://private",
      },
    });
    expect(JSON.stringify(mocks.appendAdminAuditEvent.mock.calls)).not.toContain("PRIVATESECRET");
  });

  it("rejects a verification code that is not exactly six digits", async () => {
    const response = await POST(request({ action: "verify", factorId: "factor-new", code: "12ab" }));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(mocks.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("verifies TOTP without returning Supabase session tokens", async () => {
    mocks.challengeAndVerify.mockResolvedValue({
      data: {
        access_token: "must-not-leak",
        refresh_token: "must-not-leak-either",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: OWNER.userId },
      },
      error: null,
    });

    const response = await POST(request({ action: "verify", factorId: "factor-new", code: "123456" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: { verified: true, redirectTo: "/admin" } });
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  it("refuses to prepare removal of the last verified factor", async () => {
    const response = await POST(request({ action: "prepare_unenroll", factorId: "factor-verified" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "last_verified_factor" });
    expect(mocks.createAdminChallenge).not.toHaveBeenCalled();
  });
});
