import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/auth/session")>();
  return { ...actual, getValidatedSession: mocks.getValidatedSession };
});

vi.mock("@/src/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET } = await import("./route");

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
