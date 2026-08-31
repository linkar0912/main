import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), role: vi.fn(), connections: vi.fn(), entitlements: vi.fn(), avatar: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.session }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getMemberRole: mocks.role, listConnections: mocks.connections }) }));
vi.mock("@/src/lib/entitlements/service", () => ({ getEntitlementService: () => ({ getEffectiveEntitlements: mocks.entitlements }) }));
vi.mock("@/src/lib/meta/profile-picture", () => ({ loadProfilePictureUrl: mocks.avatar }));
const { GET } = await import("./route");
describe("workspace bootstrap plan", () => { beforeEach(() => { mocks.session.mockResolvedValue({ userId: "u1", email: "owner@acme.test", workspaceId: "w1" }); mocks.role.mockResolvedValue("OWNER"); mocks.connections.mockResolvedValue([]); mocks.entitlements.mockResolvedValue({ planKey: "growth", planName: "Growth" }); }); it("returns the persisted effective plan instead of a hard-coded free label", async () => { const response = await GET(new Request("https://app.linkar.in/api/workspace/bootstrap")); expect(await response.json()).toMatchObject({ data: { plan: "growth", planName: "Growth" } }); }); });
