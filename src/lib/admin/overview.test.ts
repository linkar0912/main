import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { loadAdminOverview, type AdminOverviewSources } from "./overview";

const NOW = new Date("2026-08-31T10:00:00.000Z");

function sources(overrides: Partial<AdminOverviewSources> = {}): AdminOverviewSources {
  return {
    loadCounts: async () => ({
      workspaces: { active: 2, suspended: 1 },
      users: { active: 4 },
      connections: { instagram: 3, facebook: 2 },
      automations: { active: 7 },
    }),
    loadHealth: async () => ({
      status: "ok",
      release: "e4afaee",
      dependencies: { database: "ok", redis: "ok" },
      integrations: { instagram: "configured", facebook: "configured" },
    }),
    loadQueue: async () => ({ state: "ok", waiting: 2, active: 1, delayed: 3, failed: 4 }),
    loadFailures: async () => Array.from({ length: 14 }, (_, index) => ({
      id: `failure-${index}`,
      workspaceId: "workspace-1",
      automationId: "automation-1",
      reason: `Provider rejected message ${index}`,
      createdAt: new Date(NOW.getTime() - index * 60_000),
    })),
    loadAuditEvents: async () => Array.from({ length: 14 }, (_, index) => ({
      id: `audit-${index}`,
      phase: index % 2 === 0 ? "SUCCESS" : "FAILURE",
      action: "workspace.inspect",
      targetType: "workspace",
      targetId: "workspace-1",
      workspaceId: "workspace-1",
      actorEmail: "owner@linkar.in",
      reason: "Operational review",
      errorCode: index % 2 === 0 ? null : "inspection_failed",
      createdAt: new Date(NOW.getTime() - index * 60_000 - 30_000),
    })),
    ...overrides,
  };
}

describe("loadAdminOverview", () => {
  it("returns bounded operational totals without secret-bearing fields", async () => {
    const dto = await loadAdminOverview(sources());

    expect(dto).toMatchObject({
      workspaces: { active: 2, suspended: 1 },
      users: { active: 4 },
      health: { database: "ok", redis: "ok" },
      queue: { state: "ok", failed: 4 },
    });
    expect(dto.operatorTape).toHaveLength(20);
    expect(dto.operatorTape[0]).toMatchObject({ id: "failure-failure-0", kind: "failure" });
    expect(JSON.stringify(dto)).not.toMatch(/accessToken|refreshToken|password|clientSecret/i);
  });

  it("normalizes long provider errors and reports empty operational history", async () => {
    const dto = await loadAdminOverview(sources({
      loadFailures: async () => [{
        id: "failure-long",
        workspaceId: "workspace-1",
        automationId: "automation-1",
        reason: "x".repeat(2_000),
        createdAt: NOW,
      }],
      loadAuditEvents: async () => [],
    }));

    expect(dto.operatorTape[0].detail).toHaveLength(500);
  });
});
