import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), role: vi.fn(), connections: vi.fn(), entitlements: vi.fn(), avatar: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getMemberRole: mocks.role, listConnections: mocks.connections }) }));
vi.mock("@/src/lib/entitlements/service", () => ({ getEntitlementService: () => ({ getEffectiveEntitlements: mocks.entitlements }) }));
vi.mock("@/src/lib/meta/profile-picture", () => ({ loadProfilePictureUrl: mocks.avatar }));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ supportEmail: "help@linkar.in", platformOwnerUserIds: [], databaseUrl: "postgres://x" }) }));
vi.mock("@/src/lib/health", () => ({ getRuntimeMode: () => "configured" }));
const { GET } = await import("./route");
describe("workspace bootstrap plan", () => { beforeEach(() => { mocks.session.mockResolvedValue({ userId: "u1", email: "owner@acme.test", workspaceId: "w1" }); mocks.role.mockResolvedValue("OWNER"); mocks.connections.mockResolvedValue([]); mocks.entitlements.mockResolvedValue({ planKey: "growth", planName: "Growth" }); }); it("returns the persisted effective plan instead of a hard-coded free label", async () => { const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap")); expect(await response.json()).toMatchObject({ data: { plan: "growth", planName: "Growth" } }); });

  // /help and Home both used to pay a request-time server render or an
  // /api/health probe for these two fields. They ride the shell payload now, so
  // they must actually be on it.
  it("carries the runtime support email and deployment mode so /help and Home need no extra request", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap"));
    expect(await response.json()).toMatchObject({ data: { supportEmail: "help@linkar.in", mode: "configured" } });
  });
});
