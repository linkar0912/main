import { describe, expect, it } from "vitest";
import type { AutomationRecord } from "@/src/lib/repository";
import { suggestKeywords } from "./route";

function automation(keywords: string[]): AutomationRecord {
  return {
    id: "automation_1",
    workspaceId: "workspace_a",
    provider: "INSTAGRAM",
    name: "Flow",
    status: "ACTIVE",
    version: 1,
    priority: 0,
    definition: {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords },
      conditions: [],
      actions: [{ type: "send_text", text: "Hi" }],
    },
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(1).toISOString(),
  };
}

describe("keyword suggestions", () => {
  it("ranks keywords already working in the workspace first", async () => {
    const suggestions = await suggestKeywords(
      async () => [automation(["kurti"], ), automation(["kurti", "saree"])],
      "workspace_a",
    );

    expect(suggestions[0]).toBe("kurti");
    expect(suggestions).toContain("price");
    // Curated staples always backfill the list.
    expect(suggestions.length).toBeGreaterThanOrEqual(6);
  });

  it("learns from comment-campaign (v2) trigger keywords too", async () => {
    const campaign = {
      ...automation([]),
      id: "automation_2",
      definition: {
        version: 2,
        trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: ["lehenga"] },
      },
    } as unknown as AutomationRecord;

    const suggestions = await suggestKeywords(async () => [campaign], "workspace_a");

    expect(suggestions[0]).toBe("lehenga");
  });

  it("falls back to curated staples when the workspace has nothing yet", async () => {
    const suggestions = await suggestKeywords(async () => [], "workspace_a");
    expect(suggestions[0]).toBe("price");
  });

  it("ignores stopword and tiny keywords from existing flows", async () => {
    const suggestions = await suggestKeywords(
      async () => [automation(["hi", "ok", "the"])],
      "workspace_a",
    );
    expect(suggestions).not.toContain("hi");
    expect(suggestions).not.toContain("the");
  });
});
