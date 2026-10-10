import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { readRecoveryProof, RECOVERY_PROOF_COOKIE } from "@/src/lib/auth/recovery-proof";
import { hashToken } from "@/src/lib/auth/tokens";

const SECRET = "test-secret-at-least-32-characters";
const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
let repository = createMemoryRepository();

vi.mock("@/src/lib/env", () => ({
  getServerEnv: () => ({ appUrl: "http://localhost:3000", adminUrl: "http://localhost:3000", authSessionSecret: SECRET }),
}));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { verifyOtp: mocks.verifyOtp } }),
}));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { POST } = await import("./route");

function confirmRequest(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/auth/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("POST /api/auth/confirm", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.verifyOtp.mockReset().mockResolvedValue({
      data: { user: { id: "user_1", email: "new@example.com", user_metadata: {} } },
      error: null,
    });
  });

  it("issues a user-bound recovery proof for a verified recovery link", async () => {
    const response = await POST(confirmRequest({ token_hash: "hash", type: "recovery" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/reset-password");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    const value = new RegExp(`${RECOVERY_PROOF_COOKIE}=([^;]+)`).exec(cookie)?.[1];
    expect(readRecoveryProof(value, SECRET)).toBe("user_1");
  });

  it("provisions the workspace only once the signup email is verified", async () => {
    expect(await repository.findWorkspaceIdByMemberEmail("new@example.com")).toBeNull();

    const response = await POST(confirmRequest({ token_hash: "hash", type: "signup", next: "/automations" }));

    expect(response.headers.get("location")).toBe("http://localhost:3000/automations");
    expect(await repository.findWorkspaceIdByMemberEmail("new@example.com")).not.toBeNull();
  });

  it("accepts the pending invitation carried in user metadata after verification", async () => {
    await repository.ensureWorkspace("workspace_team", "owner@example.com", "owner_1");
    const invitation = await repository.createInvitation({
      workspaceId: "workspace_team",
      email: "new@example.com",
      role: "MEMBER",
      tokenHash: hashToken("raw-invite"),
      invitedByUserId: "owner_1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: "user_1", email: "new@example.com", user_metadata: { pending_invite: "raw-invite" } } },
      error: null,
    });

    await POST(confirmRequest({ token_hash: "hash", type: "signup" }));

    expect(await repository.findWorkspaceIdByMemberEmail("new@example.com")).toBe("workspace_team");
    expect((await repository.findInvitationByTokenHash(invitation.tokenHash))?.acceptedAt).toBeTruthy();
  });

  it("sends a failed signup confirmation back to login with next and invite", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const response = await POST(confirmRequest({ token_hash: "hash", type: "signup", next: "/automations", invite: "raw" }));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?verify=invalid&next=%2Fautomations&invite=raw");
  });

  it("never verifies a token from a cross-site post", async () => {
    const response = await POST(confirmRequest({ token_hash: "hash", type: "signup" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects an unknown token type without calling Supabase", async () => {
    const response = await POST(confirmRequest({ token_hash: "hash", type: "bogus" }));
    expect(response.headers.get("location")).toContain("/login?verify=invalid");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
});
