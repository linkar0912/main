import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import type { AutomationRepository, MemberRole } from "@/src/lib/repository";

const state = vi.hoisted(() => ({
  session: { userId: "u1", email: "priya.shah@studio.test", workspaceId: "w1" } as { userId: string; email: string; workspaceId: string } | null,
  role: "OWNER" as MemberRole | null,
  repository: null as unknown as AutomationRepository,
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: async () => state.session }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => new Proxy(state.repository, {
    get(target, key) {
      if (key === "getMemberRole") return async () => state.role;
      return Reflect.get(target, key);
    },
  }),
}));

const { GET, PUT } = await import("./route");

function put(body: unknown): Request {
  return new Request("http://localhost/api/onboarding", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function view(response: Response) {
  return (await response.json()).data;
}

describe("/api/onboarding", () => {
  beforeEach(() => {
    state.session = { userId: "u1", email: "priya.shah@studio.test", workspaceId: "w1" };
    state.role = "OWNER";
    state.repository = createMemoryRepository();
  });

  it("requires a session", async () => {
    state.session = null;
    expect((await GET(new Request("http://localhost/api/onboarding"))).status).toBe(401);
    expect((await PUT(put({ step: 2 }))).status).toBe(401);
  });

  it("starts an owner at step one with a name guessed from the email", async () => {
    const data = await view(await GET(new Request("http://localhost/api/onboarding")));
    expect(data).toMatchObject({ flow: "owner", step: 1, answers: {}, suggestedName: "Priya", canConnect: true, completedAt: null });
  });

  it("saves answers per step and resumes where the owner left off", async () => {
    await PUT(put({ step: 3, answers: { name: "Priya", accountType: "brand" } }));
    await PUT(put({ step: 4, answers: { niches: ["fashion", "beauty"] } }));
    const data = await view(await GET(new Request("http://localhost/api/onboarding")));
    expect(data.step).toBe(4);
    expect(data.answers).toEqual({ name: "Priya", accountType: "brand", niches: ["fashion", "beauty"] });
    // The name is also the person's own display name.
    expect((await state.repository.getMemberOnboarding("w1", "priya.shah@studio.test"))?.displayName).toBe("Priya");
  });

  it("rejects values outside the enums and unknown fields", async () => {
    expect((await PUT(put({ answers: { accountType: "pirate" } }))).status).toBe(400);
    expect((await PUT(put({ answers: { goals: ["sell"], admin: true } }))).status).toBe(400);
    expect((await PUT(put({ step: 42 }))).status).toBe(400);
    expect((await PUT(put({ action: "delete-everything" }))).status).toBe(400);
    expect(await state.repository.getWorkspaceOnboarding("w1")).toBeNull();
  });

  it("marks a skip as skipped, not completed, and a finish as completed", async () => {
    let data = await view(await PUT(put({ action: "skip" })));
    expect(data.skippedAt).toEqual(expect.any(String));
    expect(data.completedAt).toBeNull();
    data = await view(await PUT(put({ action: "complete" })));
    expect(data).toMatchObject({ completedAt: expect.any(String), skippedAt: null, step: 9 });
  });

  it("lets the owner dismiss the Home cards for good", async () => {
    await PUT(put({ action: "dismiss-invite" }));
    await PUT(put({ action: "dismiss-plan" }));
    const record = await state.repository.getWorkspaceOnboarding("w1");
    expect(record?.inviteDismissedAt).toEqual(expect.any(String));
    expect(record?.planDismissedAt).toEqual(expect.any(String));
  });

  it("gives a team member the short flow and keeps them out of the workspace answers", async () => {
    state.role = "MEMBER";
    state.session = { userId: "u2", email: "arjun@studio.test", workspaceId: "w1" };
    let data = await view(await GET(new Request("http://localhost/api/onboarding")));
    expect(data).toMatchObject({ flow: "member", step: 1, canConnect: false });
    data = await view(await PUT(put({ step: 2, answers: { name: "Arjun", focus: "inbox" } })));
    expect(data.member).toEqual({ name: "Arjun", focus: "inbox" });
    expect((await PUT(put({ answers: { accountType: "brand" } }))).status).toBe(400);
    expect((await PUT(put({ step: 5 }))).status).toBe(400);
    expect((await PUT(put({ action: "dismiss-plan" }))).status).toBe(403);
    expect(await state.repository.getWorkspaceOnboarding("w1")).toBeNull();
    data = await view(await PUT(put({ action: "complete" })));
    expect(data.completedAt).toEqual(expect.any(String));
  });
});
