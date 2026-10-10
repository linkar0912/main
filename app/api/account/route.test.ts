import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/auth/session")>();
  return { ...actual, getValidatedSession: mocks.getValidatedSession };
});

vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser, signOut: mocks.signOut } }),
}));

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET, POST } = await import("./route");
const { assertApplicationAccess } = await import("@/src/lib/auth/session");

describe("GET /api/account", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset();
    mocks.getUser.mockReset();
  });

  it("returns the signed-in member's real workspace role", async () => {
    await repository.ensureWorkspace("workspace_1", "owner@example.com");
    await repository.addMember("workspace_1", "member@example.com", "MEMBER");
    mocks.getValidatedSession.mockResolvedValue({
      userId: "user_1",
      email: "member@example.com",
      workspaceId: "workspace_1",
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "member@example.com", created_at: "2026-08-20T00:00:00.000Z", email_confirmed_at: null } },
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/account"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      email: "member@example.com",
      role: "MEMBER",
      plan: "free",
      planName: "Free",
    });
  });

  it("returns 404 when the session is valid but Supabase has no matching user", async () => {
    mocks.getValidatedSession.mockResolvedValue({
      userId: "missing_user",
      email: "missing@example.com",
      workspaceId: "workspace_1",
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "not found" } });

    const response = await GET(new Request("http://localhost/api/account"));

    expect(response.status).toBe(404);
  });
});

describe("POST /api/account logout-all", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@example.com", workspaceId: "workspace_1" });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
  });

  it("also rejects access tokens that were issued before the sign-out", async () => {
    await repository.ensureWorkspace("workspace_1", "owner@example.com", "user_1");
    const issuedBefore = Math.floor(Date.now() / 1_000) - 60;
    expect(await assertApplicationAccess("user_1", "owner@example.com", issuedBefore, repository)).not.toBeNull();

    const form = new URLSearchParams({ action: "logout-all" });
    const response = await POST(new Request("http://localhost/api/account", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    }));

    expect(response.headers.get("location")).toContain("/login?loggedOut=all");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    // A JWT another device obtained a minute ago no longer passes the gate...
    expect(await assertApplicationAccess("user_1", "owner@example.com", issuedBefore, repository)).toBeNull();
    // ...while a fresh sign-in afterwards does.
    const issuedAfter = Math.floor(Date.now() / 1_000) + 1;
    expect(await assertApplicationAccess("user_1", "owner@example.com", issuedAfter, repository)).not.toBeNull();
  });

  it("refuses a cross-site form post", async () => {
    const response = await POST(new Request("http://localhost/api/account", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
      body: "action=logout-all",
    }));
    expect(response.status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
