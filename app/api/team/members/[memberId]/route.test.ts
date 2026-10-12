import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  repository: null as ReturnType<typeof createMemoryRepository> | null,
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => mocks.repository }));

const { PATCH } = await import("./route");

async function seedTeam() {
  const repository = createMemoryRepository();
  await repository.addMember("w1", "owner@linkar.in", "OWNER", "u_owner");
  await repository.addMember("w1", "admin@linkar.in", "ADMIN", "u_admin");
  await repository.addMember("w1", "member@linkar.in", "MEMBER", "u_member");
  await repository.addMember("w2", "elsewhere@linkar.in", "MEMBER", "u_elsewhere");
  mocks.repository = repository;
  const byEmail = async (workspaceId: string, email: string) => (await repository.listMembers(workspaceId)).find((member) => member.email === email)!;
  return { repository, byEmail };
}

function as(userId: string, email: string) {
  mocks.getValidatedSession.mockResolvedValue({ userId, email, workspaceId: "w1" });
}

function patch(memberId: string, body: unknown) {
  return PATCH(new Request(`https://app.linkar.in/api/team/members/${memberId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ memberId }) });
}

describe("PATCH /api/team/members/:memberId", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset();
    mocks.repository = null;
  });

  it("lets the owner promote a member to admin and back", async () => {
    const { repository, byEmail } = await seedTeam();
    as("u_owner", "owner@linkar.in");
    const member = await byEmail("w1", "member@linkar.in");

    const promoted = await patch(member.id, { role: "ADMIN" });
    expect(promoted.status).toBe(200);
    await expect(promoted.json()).resolves.toEqual({ member: { id: member.id, email: "member@linkar.in", role: "ADMIN" } });
    expect(await repository.getMemberRole("w1", "member@linkar.in")).toBe("ADMIN");

    expect((await patch(member.id, { role: "MEMBER" })).status).toBe(200);
    expect(await repository.getMemberRole("w1", "member@linkar.in")).toBe("MEMBER");
  });

  it("lets an admin change another member, as they can already invite admins", async () => {
    const { repository, byEmail } = await seedTeam();
    as("u_admin", "admin@linkar.in");
    const member = await byEmail("w1", "member@linkar.in");
    expect((await patch(member.id, { role: "ADMIN" })).status).toBe(200);
    expect(await repository.getMemberRole("w1", "member@linkar.in")).toBe("ADMIN");
  });

  it("refuses members, who cannot manage the team", async () => {
    const { repository, byEmail } = await seedTeam();
    as("u_member", "member@linkar.in");
    const admin = await byEmail("w1", "admin@linkar.in");
    const response = await patch(admin.id, { role: "MEMBER" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(await repository.getMemberRole("w1", "admin@linkar.in")).toBe("ADMIN");
  });

  it("never changes the owner, so the workspace never loses its last owner", async () => {
    const { repository, byEmail } = await seedTeam();
    as("u_admin", "admin@linkar.in");
    const owner = await byEmail("w1", "owner@linkar.in");
    const response = await patch(owner.id, { role: "MEMBER" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "cannot_change_owner" });
    expect(await repository.getMemberRole("w1", "owner@linkar.in")).toBe("OWNER");
    // The repository refuses it on its own too.
    expect(await repository.updateMemberRole("w1", "owner@linkar.in", "ADMIN")).toBe(false);
    expect(await repository.getMemberRole("w1", "owner@linkar.in")).toBe("OWNER");
  });

  it("does not let anyone change their own role", async () => {
    const { repository, byEmail } = await seedTeam();
    as("u_admin", "ADMIN@linkar.in");
    const self = await byEmail("w1", "admin@linkar.in");
    const response = await patch(self.id, { role: "MEMBER" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "cannot_change_own_role" });
    expect(await repository.getMemberRole("w1", "admin@linkar.in")).toBe("ADMIN");
  });

  it("only offers Admin and Member", async () => {
    const { byEmail } = await seedTeam();
    as("u_owner", "owner@linkar.in");
    const member = await byEmail("w1", "member@linkar.in");
    for (const body of [{ role: "OWNER" }, { role: "admin" }, {}, { role: "ADMIN", email: "x@y.z" }]) {
      const response = await patch(member.id, body);
      expect(response.status).toBe(400);
    }
  });

  it("scopes the member to the caller's workspace", async () => {
    const { repository, byEmail } = await seedTeam();
    as("u_owner", "owner@linkar.in");
    const foreign = await byEmail("w2", "elsewhere@linkar.in");
    const response = await patch(foreign.id, { role: "ADMIN" });
    expect(response.status).toBe(404);
    expect(await repository.getMemberRole("w2", "elsewhere@linkar.in")).toBe("MEMBER");
    expect((await patch("member_missing", { role: "ADMIN" })).status).toBe(404);
  });

  it("needs a session", async () => {
    await seedTeam();
    mocks.getValidatedSession.mockResolvedValue(null);
    expect((await patch("anything", { role: "ADMIN" })).status).toBe(401);
  });
});
