import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/auth/session")>();
  return { ...actual, getValidatedSession: mocks.getValidatedSession };
});

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET } = await import("./route");

describe("GET /api/account", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset();
  });

  it("returns the signed-in member's real workspace role", async () => {
    const { record: user } = await repository.createUser({
      email: "member@example.com",
      passwordHash: "password-hash",
    });
    await repository.ensureWorkspace("workspace_1", "owner@example.com");
    await repository.addMember("workspace_1", "member@example.com", "MEMBER");
    mocks.getValidatedSession.mockResolvedValue({
      userId: user.id,
      workspaceId: "workspace_1",
    });

    const response = await GET(new Request("http://localhost/api/account"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      email: "member@example.com",
      role: "MEMBER",
    });
  });

  it("returns 404 when a valid session points at a missing user", async () => {
    mocks.getValidatedSession.mockResolvedValue({
      userId: "missing_user",
      workspaceId: "workspace_1",
    });

    const response = await GET(new Request("http://localhost/api/account"));

    expect(response.status).toBe(404);
  });
});
