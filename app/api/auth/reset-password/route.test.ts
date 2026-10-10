import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { createRecoveryProof, RECOVERY_PROOF_COOKIE } from "@/src/lib/auth/recovery-proof";

const SECRET = "test-secret-at-least-32-characters";
const mocks = vi.hoisted(() => ({ getClaims: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }));
let repository = createMemoryRepository();

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ appUrl: "http://localhost:3000", authSessionSecret: SECRET }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: mocks.getClaims, updateUser: mocks.updateUser, signOut: mocks.signOut },
  }),
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { POST } = await import("./route");

function resetRequest(proof?: string, password = "a-brand-new-passphrase"): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/reset-password", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(proof ? { cookie: `${RECOVERY_PROOF_COOKIE}=${proof}` } : {}),
    },
    body: new URLSearchParams({ password }).toString(),
  });
}

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "user_1", email: "a@example.com" } } });
    mocks.updateUser.mockReset().mockResolvedValue({ error: null });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("refuses an ordinary signed-in session with no recovery proof", async () => {
    const response = await POST(resetRequest());
    expect(response.headers.get("location")).toBe("http://localhost:3000/reset-password?error=invalid");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a recovery proof issued to a different user", async () => {
    const response = await POST(resetRequest(createRecoveryProof("user_2", SECRET)));
    expect(response.headers.get("location")).toContain("error=invalid");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("changes the password, revokes every session and clears the proof", async () => {
    await repository.ensureWorkspace("workspace_1", "a@example.com", "user_1");
    const response = await POST(resetRequest(createRecoveryProof("user_1", SECRET)));

    expect(response.headers.get("location")).toBe("http://localhost:3000/login?reset=1");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "a-brand-new-passphrase" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect((await repository.getPlatformUserControlState("user_1")).sessionInvalidBefore).not.toBeNull();
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${RECOVERY_PROOF_COOKIE}=;.*Max-Age=0`, "i"));
  });

  it.each([
    ["same_password", "same"],
    ["weak_password", "weak"],
  ])("maps Supabase's %s to a specific message instead of 'link invalid'", async (code, error) => {
    mocks.updateUser.mockResolvedValue({ error: { code, message: code } });
    const response = await POST(resetRequest(createRecoveryProof("user_1", SECRET)));
    expect(response.headers.get("location")).toBe(`http://localhost:3000/reset-password?error=${error}`);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
