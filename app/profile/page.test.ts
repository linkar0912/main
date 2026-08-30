import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getUser: vi.fn(),
  getMemberRole: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getMemberRole: mocks.getMemberRole }),
}));

const ProfilePage = (await import("./page")).default;

beforeEach(() => {
  mocks.getValidatedSession.mockReset();
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: { created_at: "2026-01-01T00:00:00.000Z", email_confirmed_at: "2026-01-02T00:00:00.000Z" } },
  });
  mocks.getMemberRole.mockReset().mockResolvedValue("ADMIN");
  mocks.redirect.mockClear();
});

describe("ProfilePage", () => {
  it("redirects to login when there is no valid session", async () => {
    mocks.getValidatedSession.mockResolvedValue(null);
    await expect(ProfilePage()).rejects.toThrow("REDIRECT:/login?next=%2Fprofile");
    expect(mocks.getMemberRole).not.toHaveBeenCalled();
  });

  it("resolves the session and the Supabase user concurrently rather than sequentially", async () => {
    // A deliberately-not-yet-resolved session promise: if the page awaited
    // getValidatedSession before starting the getUser() call (the old
    // sequential shape), getUser would never be invoked until this resolves.
    let releaseSession!: (session: { userId: string; email: string; workspaceId: string }) => void;
    mocks.getValidatedSession.mockReturnValue(
      new Promise((resolve) => { releaseSession = resolve; }),
    );

    const pagePromise = ProfilePage();
    await Promise.resolve();
    expect(mocks.getUser).toHaveBeenCalledTimes(1);

    releaseSession({ userId: "u_1", email: "member@example.com", workspaceId: "ws_1" });
    await pagePromise;
  });

  it("renders the profile with the resolved role, join date, and verification status", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "u_1", email: "member@example.com", workspaceId: "ws_1" });

    const result = await ProfilePage();

    expect(mocks.getMemberRole).toHaveBeenCalledWith("ws_1", "member@example.com");
    expect(result.props).toEqual({
      email: "member@example.com",
      memberSince: "2026-01-01T00:00:00.000Z",
      emailVerified: true,
      role: "ADMIN",
    });
  });

  it("defaults role to MEMBER when the repository has no role on record", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "u_1", email: "member@example.com", workspaceId: "ws_1" });
    mocks.getMemberRole.mockResolvedValue(null);

    const result = await ProfilePage();

    expect(result.props.role).toBe("MEMBER");
  });

  it("still renders the profile using the session's email when Supabase's getUser call fails", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "u_1", email: "member@example.com", workspaceId: "ws_1" });
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await ProfilePage();

    expect(result.props).toEqual({
      email: "member@example.com",
      memberSince: null,
      emailVerified: false,
      role: "ADMIN",
    });
  });
});
