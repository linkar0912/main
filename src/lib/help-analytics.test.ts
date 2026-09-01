import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

describe("help analytics repository", () => {
  it("stores normalized no-result searches inside one workspace", async () => {
    const repository = createMemoryRepository();

    await repository.recordHelpSearch("workspace_a", {
      query: "  WebHook   Signature  ",
      resultCount: 0,
      createdAt: "2026-09-01T06:00:00.000Z",
    });
    await repository.recordHelpSearch("workspace_b", {
      query: "billing",
      resultCount: 0,
      createdAt: "2026-09-01T06:01:00.000Z",
    });

    await expect(repository.listHelpSearches("workspace_a", 10)).resolves.toEqual([
      {
        id: expect.any(String),
        workspaceId: "workspace_a",
        query: "webhook signature",
        resultCount: 0,
        createdAt: "2026-09-01T06:00:00.000Z",
      },
    ]);
  });

  it("stores article feedback without cross-workspace leakage", async () => {
    const repository = createMemoryRepository();

    await repository.recordHelpFeedback("workspace_a", {
      articleKey: "troubleshooting:token-expired",
      helpful: false,
      createdAt: "2026-09-01T06:02:00.000Z",
    });

    await expect(repository.listHelpFeedback("workspace_a", 10)).resolves.toMatchObject([
      { workspaceId: "workspace_a", articleKey: "troubleshooting:token-expired", helpful: false },
    ]);
    await expect(repository.listHelpFeedback("workspace_b", 10)).resolves.toEqual([]);
  });
});
