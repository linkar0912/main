import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), role: vi.fn(), connections: vi.fn(), entitlements: vi.fn(), avatar: vi.fn(), peekAvatar: vi.fn(), workspaceOnboarding: vi.fn(), memberOnboarding: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getMemberRole: mocks.role, listConnections: mocks.connections, getWorkspaceOnboarding: mocks.workspaceOnboarding, getMemberOnboarding: mocks.memberOnboarding }) }));
vi.mock("@/src/lib/entitlements/service", () => ({ getEntitlementService: () => ({ getEffectiveEntitlements: mocks.entitlements }) }));
vi.mock("@/src/lib/meta/profile-picture", () => ({ loadProfilePictureUrl: mocks.avatar, peekProfilePictureUrl: mocks.peekAvatar }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ supportEmail: "help@linkar.in", platformOwnerUserIds: [], databaseUrl: "postgres://x" }) }));
vi.mock("@/src/lib/health", () => ({ getRuntimeMode: () => "configured" }));
const { GET } = await import("./route");
describe("workspace bootstrap plan", () => { beforeEach(() => { mocks.session.mockResolvedValue({ userId: "u1", email: "owner@acme.test", workspaceId: "w1" }); mocks.role.mockResolvedValue("OWNER"); mocks.connections.mockResolvedValue([]); mocks.entitlements.mockResolvedValue({ planKey: "growth", planName: "Growth" }); mocks.workspaceOnboarding.mockResolvedValue(null); mocks.memberOnboarding.mockResolvedValue(null); }); it("returns the persisted effective plan instead of a hard-coded free label", async () => { const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap")); expect(await response.json()).toMatchObject({ data: { plan: "growth", planName: "Growth" } }); });

  // /help and Home both used to pay a request-time server render or an
  // /api/health probe for these two fields. They ride the shell payload now, so
  // they must actually be on it.
  it("carries the runtime support email and deployment mode so /help and Home need no extra request", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"));
    expect(await response.json()).toMatchObject({ data: { supportEmail: "help@linkar.in", mode: "configured" } });
  });

  it("sends a new workspace owner into onboarding through the shell payload", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"));
    expect(await response.json()).toMatchObject({ data: { onboarding: { required: true, flow: "owner", invite: false } } });
  });

  it("never forces a workspace that existed before onboarding shipped, and invites it instead", async () => {
    mocks.workspaceOnboarding.mockResolvedValue({ workspaceId: "w1", answers: {}, step: 1, existingWorkspace: true, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" });
    const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"));
    expect(await response.json()).toMatchObject({ data: { onboarding: { required: false, invite: true } } });
  });

  it("carries the saved goals and name once onboarding is finished", async () => {
    mocks.workspaceOnboarding.mockResolvedValue({ workspaceId: "w1", answers: { name: "Priya", goals: ["sell", "faq"] }, step: 9, completedAt: "2026-10-12T00:00:00.000Z", existingWorkspace: false, createdAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-12T00:00:00.000Z" });
    const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"));
    expect(await response.json()).toMatchObject({ data: { onboarding: { required: false, planCard: true, goals: ["sell", "faq"], displayName: "Priya" } } });
  });

  it("does not redirect anyone when onboarding cannot be read", async () => {
    mocks.workspaceOnboarding.mockRejectedValue(new Error("relation does not exist"));
    const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.onboarding).toBeNull();
  });

  it("carries the owner's plan picked on /pricing, so the shell can hand over to checkout", async () => {
    const issued = Math.floor(Date.now() / 1000);
    const request = () => new Request("https://app.linkar.in/api/workspace/bootstrap", { headers: { cookie: `linkar_plan_intent=growth.annual.${issued}` } });
    expect((await (await GET(request())).json()).data.planIntent).toEqual({ plan: "growth", interval: "ANNUAL" });

    mocks.role.mockResolvedValue("ADMIN");
    expect((await (await GET(request())).json()).data.planIntent).toBeNull();
  });

  it("has no plan intent without a valid, unexpired cookie", async () => {
    expect((await (await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"))).json()).data.planIntent).toBeNull();
    const stale = new Request("https://app.linkar.in/api/workspace/bootstrap", { headers: { cookie: `linkar_plan_intent=growth.annual.${Math.floor(Date.now() / 1000) - 25 * 3600}` } });
    expect((await (await GET(stale)).json()).data.planIntent).toBeNull();
  });
});
