import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { workspaceExportCsv } = await import("./workspace-service");

describe("workspaceExportCsv", () => {
  it("formula-escapes cells and excludes secret-bearing fields by construction", () => {
    const csv = workspaceExportCsv({
      id: "w1", name: "=IMPORTXML()", slug: "safe", status: "ACTIVE",
      createdAt: new Date("2026-08-31T10:00:00.000Z"), updatedAt: new Date("2026-08-31T10:00:00.000Z"),
      members: [{ userId: "u1", email: "+danger@example.com", role: "OWNER" }],
      automations: [], contacts: [],
    });
    expect(csv).toContain("'=IMPORTXML()");
    expect(csv).toContain("'+danger@example.com");
    expect(csv).not.toMatch(/token|password|secret/i);
  });
});
