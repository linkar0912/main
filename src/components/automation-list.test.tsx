// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationList } from "./automation-list";
import type { AutomationRecord } from "@/src/lib/repository";

function v1Automation(overrides: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "automation_v1",
    workspaceId: "workspace_1",
    name: "Legacy DM automation",
    status: "ACTIVE",
    version: 1,
    definition: {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [] },
      actions: [{ type: "send_text", text: "Thanks!" }],
    },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  } as AutomationRecord;
}

function v2Automation(overrides: Partial<AutomationRecord> = {}): AutomationRecord {
  return {
    id: "automation_v2",
    workspaceId: "workspace_1",
    name: "Follow-gated Reel automation",
    status: "ACTIVE",
    version: 2,
    definition: {
      version: 2,
      trigger: { type: "comment", source: "next_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: ["guide"] },
      publicReplies: ["Check your DMs!"],
      openingMessage: { text: "Thanks for your comment", optInButtonLabel: "Get the guide" },
      followGate: { required: true, notFollowingMessage: "Follow us first", recheckButtonLabel: "I've followed" },
      delivery: { text: "Here is your guide", url: "https://example.com/guide" },
    },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  } as AutomationRecord;
}

describe("AutomationList activity link", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render an Activity link for a version-1 automation", () => {
    render(
      <AutomationList
        automations={[v1Automation()]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.queryByLabelText(/view activity for/i)).toBeNull();
  });

  it("renders an Activity link for a version-2 (follow-gated) automation", () => {
    render(
      <AutomationList
        automations={[v2Automation()]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.getByLabelText(/view activity for/i)).toBeTruthy();
  });
});
