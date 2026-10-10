// @vitest-environment node
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { clearAutomationsCache, useAutomations } from "./automation-list";
import type { AutomationRecord } from "@/src/lib/repository";

function automation(id: string, workspaceId: string): AutomationRecord {
  return {
    id,
    workspaceId,
    name: `Automation for ${workspaceId}`,
    status: "ACTIVE",
    version: 1,
    definition: {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hi" }],
    },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  } as AutomationRecord;
}

function Probe({ initialData }: { initialData?: AutomationRecord[] }) {
  const { automations } = useAutomations(initialData);
  return createElement("ul", null, automations.map((item) => createElement("li", { key: item.id }, item.name)));
}

describe("useAutomations during server rendering", () => {
  afterEach(() => clearAutomationsCache());

  it("never leaks one request's seeded rows into a later render without initialData", () => {
    // Request A (workspace A) renders with server data.
    const first = renderToString(createElement(Probe, { initialData: [automation("a1", "workspace_a")] }));
    expect(first).toContain("Automation for workspace_a");

    // Request B (another workspace) renders without initial data - e.g. its
    // server list query failed. It must not see workspace A's rows.
    const second = renderToString(createElement(Probe));
    expect(second).not.toContain("workspace_a");
    expect(second).toBe("<ul></ul>");
  });
});
