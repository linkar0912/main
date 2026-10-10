// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("uses the shared automation list skeleton while loading", () => {
    render(<AutomationList automations={[]} loading onStatusChange={async () => {}} />);

    expect(screen.getByLabelText("Loading automations")).toBeTruthy();
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

  it("keeps all management controls in one action group", () => {
    render(
      <AutomationList
        automations={[v2Automation()]}
        loading={false}
        onStatusChange={async () => {}}
        onDuplicate={async () => {}}
        onDelete={async () => {}}
      />,
    );

    const row = screen.getByRole("article");
    const actions = row.querySelector(".automation-actions");
    expect(actions).toBeTruthy();
    expect(actions?.querySelectorAll("a, button")).toHaveLength(6);
  });

  it("shows an actionable error when activation fails", async () => {
    render(
      <AutomationList
        automations={[v1Automation({ status: "PAUSED" })]}
        loading={false}
        onStatusChange={async () => { throw new Error("Instagram must be connected before activation."); }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Activate Legacy DM automation" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Instagram must be connected before activation.");
  });

  it("names image and quick-reply actions instead of falling through to the button label", () => {
    render(
      <AutomationList
        automations={[
          v1Automation({
            id: "automation_image",
            name: "Price list responder",
            definition: {
              version: 1,
              trigger: { type: "message", match: "keyword", keywords: ["price"] },
              conditions: [],
              actions: [{ type: "send_image", imageUrl: "https://cdn.example/prices.jpg" }],
            },
          } as Partial<AutomationRecord>),
          v1Automation({
            id: "automation_chips",
            name: "Interest check",
            definition: {
              version: 1,
              trigger: { type: "message", match: "keyword", keywords: ["offer"] },
              conditions: [],
              actions: [{ type: "quick_replies", text: "Interested?", replies: ["Yes", "Not now"] }],
            },
          } as Partial<AutomationRecord>),
        ]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.getByText(/Send an image/)).toBeTruthy();
    expect(screen.getByText(/Send quick replies/)).toBeTruthy();
    expect(screen.queryByText(/Send a button/)).toBeNull();
  });

  it("shows a Facebook Page pin badge when the automation is pinned to a Page", () => {
    render(
      <AutomationList
        automations={[v1Automation({ id: "automation_fb", name: "Acme comment-reply", facebookPageId: "12345" })]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.getByText(/Pinned to Facebook Page/)).toBeTruthy();
    expect(screen.getByText(/Public comment reply/)).toBeTruthy();
    expect(screen.queryByText("Private reply")).toBeNull();
  });

  it("always identifies the provider, surface, and selected Facebook Page", () => {
    render(
      <AutomationList
        automations={[v1Automation({
          id: "automation_fb_target",
          name: "Page support",
          provider: "FACEBOOK",
          facebookPageId: "12345",
        })]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.getByText("Facebook")).toBeTruthy();
    expect(screen.getByText("Page comments")).toBeTruthy();
    expect(screen.getByText(/Pinned to Facebook Page/)).toBeTruthy();
  });

  it("does not show a Facebook Page pin badge when the automation is unpinned", () => {
    render(
      <AutomationList
        automations={[v1Automation()]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.queryByText(/Pinned to Facebook Page/)).toBeNull();
  });
});

describe("AutomationList delete confirmation", () => {
  afterEach(() => {
    cleanup();
  });

  function renderWithDelete(onDelete: (id: string) => Promise<void> = async () => {}) {
    render(
      <AutomationList
        automations={[v2Automation()]}
        loading={false}
        onStatusChange={async () => {}}
        onDelete={onDelete}
      />,
    );
  }

  it("names the action group for assistive tech", () => {
    renderWithDelete();
    expect(screen.getByRole("group", { name: "Actions for Follow-gated Reel automation" })).toBeTruthy();
  });

  it("asks with an explicit text button and deletes only on the second click", async () => {
    const deleted: string[] = [];
    renderWithDelete(async (id) => { deleted.push(id); });

    fireEvent.click(screen.getByRole("button", { name: "Delete Follow-gated Reel automation" }));
    const confirm = screen.getByRole("button", { name: "Confirm delete Follow-gated Reel automation" });
    expect(confirm.textContent).toBe("Confirm delete?");
    expect(document.activeElement).toBe(confirm);
    expect(deleted).toEqual([]);

    fireEvent.click(confirm);
    await waitFor(() => expect(deleted).toEqual(["automation_v2"]));
  });

  it("backs out of the confirmation on Escape and on blur", () => {
    renderWithDelete();

    fireEvent.click(screen.getByRole("button", { name: "Delete Follow-gated Reel automation" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /confirm delete/i }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: /confirm delete/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete Follow-gated Reel automation" }));
    fireEvent.blur(screen.getByRole("button", { name: /confirm delete/i }));
    expect(screen.queryByRole("button", { name: /confirm delete/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete Follow-gated Reel automation" })).toBeTruthy();
  });
});
