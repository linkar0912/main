import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  onboarding: vi.fn(),
  connections: vi.fn(),
  pages: vi.fn(),
  entitlements: vi.fn(),
  listMedia: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ metaTokenEncryptionKey: "k".repeat(64), metaApiVersion: "v25.0" }) }));
vi.mock("@/src/lib/security/secrets", () => ({ unsealSecret: () => "token" }));
vi.mock("@/src/lib/meta/client", () => ({ MetaClient: class { listMedia = mocks.listMedia; } }));
vi.mock("@/src/lib/entitlements/service", () => ({ getEntitlementService: () => ({ getEffectiveEntitlements: mocks.entitlements }) }));
vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({ getWorkspaceOnboarding: mocks.onboarding, listConnections: mocks.connections, listFacebookPages: mocks.pages }),
}));

const { GET } = await import("./route");

const request = () => new Request("http://localhost/api/onboarding/plan");

describe("GET /api/onboarding/plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ userId: "u1", email: "a@b.test", workspaceId: "w1" });
    mocks.onboarding.mockResolvedValue({ workspaceId: "w1", answers: { name: "Priya", goals: ["sell"], dailyVolume: "10_50", replyMode: "myself" }, step: 8, existingWorkspace: false, createdAt: "", updatedAt: "" });
    mocks.connections.mockResolvedValue([]);
    mocks.pages.mockResolvedValue([]);
    mocks.entitlements.mockResolvedValue({ planKey: "free" });
  });

  it("requires a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
  });

  it("builds the plan from the saved answers alone when nothing is connected", async () => {
    const { data } = await (await GET(request())).json();
    expect(data.name).toBe("Priya");
    expect(data.timeBack).toMatchObject({ perDay: 30, kind: "time" });
    expect(data.posts).toBeNull();
    expect(data.recommendations).toHaveLength(3);
    expect(data.planFit).toMatchObject({ key: expect.any(String) });
    expect(mocks.listMedia).not.toHaveBeenCalled();
  });

  it("adds real post numbers from the connected Instagram account", async () => {
    mocks.connections.mockResolvedValue([{ igUserId: "ig_1", username: "studio.priya", status: "CONNECTED", accessTokenEncrypted: "sealed" }]);
    mocks.listMedia.mockResolvedValue({ data: [{ commentsCount: 220 }, { commentsCount: 30 }] });
    const { data } = await (await GET(request())).json();
    expect(data.posts).toEqual({ username: "studio.priya", posts: 2, comments: 250, busiest: 220, over: { threshold: 200, count: 1 } });
  });

  it("leaves the post block out when Meta fails instead of showing made-up numbers", async () => {
    mocks.connections.mockResolvedValue([{ igUserId: "ig_1", username: "studio.priya", status: "CONNECTED", accessTokenEncrypted: "sealed" }]);
    mocks.listMedia.mockRejectedValue(new Error("Meta is down"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).data.posts).toBeNull();
  });
});
