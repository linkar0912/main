import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getServerEnv: vi.fn(),
  getPlatformUserControlState: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getPlatformUserControlState: mocks.getPlatformUserControlState }),
}));

const {
  PlatformOwnerAuthError,
  authorizePlatformOwner,
  getPlatformOwnerIdentity,
  getPlatformOwnerSession,
} = await import("./authorization");

const ownerClaims = {
  sub: OWNER_ID,
  email: "owner@linkar.in",
  session_id: "session-1",
  aal: "aal2",
  user_metadata: { admin: false },
  iat: Math.floor(Date.parse("2026-08-31T10:01:00.000Z") / 1000),
};

describe("authorizePlatformOwner", () => {
  it.each([
    [{}, 401, "unauthorized"],
    [{ ...ownerClaims, sub: "33333333-3333-4333-8333-333333333333" }, 403, "forbidden"],
    [{ ...ownerClaims, aal: "aal1" }, 428, "mfa_required"],
  ])("rejects invalid owner claims %#", (claims, status, code) => {
    expect(() => authorizePlatformOwner(claims, [OWNER_ID], true)).toThrow(
      expect.objectContaining({ status, code }),
    );
  });

  it("returns only verified owner identity fields", () => {
    expect(authorizePlatformOwner(ownerClaims, [OWNER_ID], true)).toEqual({
      userId: OWNER_ID,
      email: "owner@linkar.in",
      sessionId: "session-1",
      aal: "aal2",
    });
  });

  it("allows an allowlisted AAL1 identity when MFA is not required", () => {
    expect(authorizePlatformOwner({ ...ownerClaims, aal: "aal1" }, [OWNER_ID], false)).toEqual({
      userId: OWNER_ID,
      email: "owner@linkar.in",
      sessionId: "session-1",
      aal: "aal1",
    });
  });

  it("rejects a matching UUID when required identity fields are missing", () => {
    expect(() => authorizePlatformOwner({ sub: OWNER_ID, aal: "aal2" }, [OWNER_ID], true)).toThrow(
      expect.objectContaining({ status: 401, code: "unauthorized" }),
    );
  });
});

describe("owner authorization DAL", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset();
    mocks.getServerEnv.mockReset();
    mocks.getServerEnv.mockReturnValue({ platformOwnerUserIds: [OWNER_ID] });
    mocks.getPlatformUserControlState.mockReset().mockResolvedValue({ status: "ACTIVE", sessionInvalidBefore: null });
  });

  it("uses verified Supabase claims for an AAL1 owner identity", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { ...ownerClaims, aal: "aal1" } }, error: null });

    await expect(getPlatformOwnerIdentity()).resolves.toMatchObject({ userId: OWNER_ID, aal: "aal1" });
  });

  it("requires AAL2 for a full owner session", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { ...ownerClaims, aal: "aal1" } }, error: null });

    await expect(getPlatformOwnerSession()).rejects.toEqual(
      new PlatformOwnerAuthError(428, "mfa_required"),
    );
  });

  it("returns an unauthorized error when claim verification fails", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: { message: "invalid jwt" } });

    await expect(getPlatformOwnerIdentity()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("rejects a suspended allowlisted owner", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: ownerClaims }, error: null });
    mocks.getPlatformUserControlState.mockResolvedValue({ status: "SUSPENDED", sessionInvalidBefore: null });

    await expect(getPlatformOwnerSession()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("rejects an allowlisted owner session issued before invalidation", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: ownerClaims }, error: null });
    mocks.getPlatformUserControlState.mockResolvedValue({
      status: "ACTIVE",
      sessionInvalidBefore: "2026-08-31T10:02:00.000Z",
    });

    await expect(getPlatformOwnerSession()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
});
