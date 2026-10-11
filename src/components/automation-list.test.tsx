// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationList, triggerChips } from "./automation-list";
import type { AutomationRecord } from "@/src/lib/repository";
import type { AutomationAttention } from "@/src/lib/automation-attention";

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

function openMenu(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `More actions for ${name}` }));
  return screen.getByRole("menu", { name: `More actions for ${name}` });
}

const expired: AutomationAttention = {
  reason: "reconnect",
  tone: "danger",
  chip: "Expired",
  text: "@studio needs reconnecting. Nothing replies on it until you do.",
  short: "@studio needs reconnecting",
  actionLabel: "Reconnect",
};

describe("AutomationList rows", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses the shared automation list skeleton while loading", () => {
    render(<AutomationList automations={[]} loading onStatusChange={async () => {}} />);

    expect(screen.getByLabelText("Loading automations")).toBeTruthy();
  });

  it("links the name to the automation's detail page", () => {
    render(<AutomationList automations={[v1Automation()]} loading={false} onStatusChange={async () => {}} />);

    expect(screen.getByRole("link", { name: "Legacy DM automation" }).getAttribute("href")).toBe("/automations/automation_v1");
  });

  it("does not offer Activity for a version-1 automation", () => {
    render(<AutomationList automations={[v1Automation()]} loading={false} onStatusChange={async () => {}} />);

    const menu = openMenu("Legacy DM automation");
    expect(within(menu).queryByRole("menuitem", { name: /view activity for/i })).toBeNull();
    expect(within(menu).getByRole("menuitem", { name: "Edit Legacy DM automation" }).getAttribute("href")).toBe("/automations/automation_v1/edit");
  });

  it("offers Activity for a version-2 (follow-gated) automation", () => {
    render(<AutomationList automations={[v2Automation()]} loading={false} onStatusChange={async () => {}} />);

    const menu = openMenu("Follow-gated Reel automation");
    expect(within(menu).getByRole("menuitem", { name: /view activity for/i }).getAttribute("href")).toBe("/automations/automation_v2/activity");
  });

  it("keeps the row to one switch and one menu, with management actions in the menu", () => {
    render(
      <AutomationList
        automations={[v2Automation()]}
        loading={false}
        onStatusChange={async () => {}}
        onDuplicate={async () => {}}
        onDelete={async () => {}}
      />,
    );

    const actions = screen.getByRole("group", { name: "Actions for Follow-gated Reel automation" });
    expect(actions.querySelectorAll(":scope > button, :scope > a, :scope > .auto-menu > button")).toHaveLength(2);
    const menu = openMenu("Follow-gated Reel automation");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Edit", "View activity", "Version history", "Duplicate", "Delete"]);
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

  it("gives a draft one Turn on action instead of a switch", async () => {
    const changes: string[] = [];
    render(
      <AutomationList
        automations={[v1Automation({ status: "DRAFT" })]}
        loading={false}
        onStatusChange={async (id, status) => { changes.push(`${id}:${status}`); }}
      />,
    );

    expect(screen.queryByRole("button", { name: /activate legacy/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Turn on Legacy DM automation" }));
    await waitFor(() => expect(changes).toEqual(["automation_v1:ACTIVE"]));
  });

  it("shows the trigger and keywords as chips, folding extra keywords into a count", () => {
    render(
      <AutomationList
        automations={[v1Automation({
          definition: {
            version: 1,
            trigger: { type: "message", match: "keyword", keywords: ["price", "rate", "cost", "kitna"] },
            conditions: [],
            actions: [{ type: "send_text", text: "Here" }],
          },
        } as Partial<AutomationRecord>)]}
        loading={false}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.getByText("DM")).toBeTruthy();
    expect(screen.getByText("price")).toBeTruthy();
    expect(screen.getByText("rate")).toBeTruthy();
    expect(screen.queryByText("cost")).toBeNull();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("reads the reply count for the selected range on the stats line", () => {
    render(
      <AutomationList
        automations={[v1Automation()]}
        loading={false}
        stats={new Map([["automation_v1", { sent: 126, failed: 2 }]])}
        rangeDays={14}
        onStatusChange={async () => {}}
      />,
    );

    expect(screen.getByText("126 replies in 14 days")).toBeTruthy();
    expect(screen.getByText("2 failed")).toBeTruthy();
  });

  it("names the Facebook Page only when the workspace has more than one", () => {
    const automation = v1Automation({ id: "automation_fb", name: "Page support", provider: "FACEBOOK", facebookPageId: "page_2" });
    const pages = [
      { id: "1", pageId: "page_1", pageName: "Main Page", status: "CONNECTED" as const, connectedAt: "" },
      { id: "2", pageId: "page_2", pageName: "Outlet Page", status: "CONNECTED" as const, connectedAt: "" },
    ];
    const { rerender } = render(
      <AutomationList automations={[automation]} loading={false} stats={new Map()} connections={{ instagram: [], facebook: pages }} onStatusChange={async () => {}} />,
    );
    expect(screen.getByText("Outlet Page")).toBeTruthy();
    expect(screen.getByText("Any page comment")).toBeTruthy();

    rerender(<AutomationList automations={[automation]} loading={false} stats={new Map()} connections={{ instagram: [], facebook: pages.slice(1) }} onStatusChange={async () => {}} />);
    expect(screen.queryByText("Outlet Page")).toBeNull();
  });
});

describe("AutomationList groups", () => {
  afterEach(() => {
    cleanup();
  });

  const list = [
    v1Automation({ id: "a_live", name: "Live one" }),
    v1Automation({ id: "a_broken", name: "Broken one" }),
    v1Automation({ id: "a_draft", name: "Draft one", status: "DRAFT" }),
    v1Automation({ id: "a_paused", name: "Paused one", status: "PAUSED" }),
  ];

  it("leads with Needs attention, then Live, Drafts and Paused, each with a count", () => {
    render(
      <AutomationList automations={list} loading={false} attention={new Map([["a_broken", expired]])} onStatusChange={async () => {}} />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Needs attention1", "Live1", "Drafts1", "Paused1"]);
    const attention = screen.getByRole("region", { name: "Needs attention (1)" });
    expect(within(attention).getByText("Broken one")).toBeTruthy();
    expect(within(attention).getByText("@studio needs reconnecting")).toBeTruthy();
    expect(within(attention).getByRole("link", { name: "Reconnect the account for Broken one" }).getAttribute("href")).toBe("/settings");
  });

  it("collapses a group from its heading", async () => {
    render(<AutomationList automations={list} loading={false} onStatusChange={async () => {}} />);

    const toggle = screen.getByRole("button", { name: /^Drafts/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() => expect(screen.queryByText("Draft one")).toBeNull());
  });

  it("shows just the selected tab's group, without a heading", () => {
    render(<AutomationList automations={list} loading={false} view="drafts" onStatusChange={async () => {}} />);

    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(screen.getByText("Draft one")).toBeTruthy();
    expect(screen.queryByText("Live one")).toBeNull();
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
    return openMenu("Follow-gated Reel automation");
  }

  it("names the action group for assistive tech", () => {
    renderWithDelete();
    expect(screen.getByRole("group", { name: "Actions for Follow-gated Reel automation" })).toBeTruthy();
  });

  it("asks with an explicit text item and deletes only on the second click", async () => {
    const deleted: string[] = [];
    renderWithDelete(async (id) => { deleted.push(id); });

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Follow-gated Reel automation" }));
    const confirm = screen.getByRole("menuitem", { name: "Confirm delete Follow-gated Reel automation" });
    expect(confirm.textContent).toBe("Confirm delete?");
    expect(document.activeElement).toBe(confirm);
    expect(deleted).toEqual([]);

    fireEvent.click(confirm);
    await waitFor(() => expect(deleted).toEqual(["automation_v2"]));
  });

  it("backs out of the confirmation on Escape and on blur", () => {
    renderWithDelete();

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Follow-gated Reel automation" }));
    fireEvent.keyDown(screen.getByRole("menuitem", { name: /confirm delete/i }), { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: /confirm delete/i })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete Follow-gated Reel automation" }));
    fireEvent.blur(screen.getByRole("menuitem", { name: /confirm delete/i }));
    expect(screen.queryByRole("menuitem", { name: /confirm delete/i })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete Follow-gated Reel automation" })).toBeTruthy();
  });
});

describe("triggerChips", () => {
  it("reads every trigger type in plain words", () => {
    const chip = (trigger: unknown, overrides: Partial<AutomationRecord> = {}) =>
      triggerChips(v1Automation({ definition: { version: 1, trigger, conditions: [], actions: [] }, ...overrides } as Partial<AutomationRecord>)).trigger;
    expect(chip({ type: "comment", match: "any", keywords: [], mediaIds: [] })).toBe("Any comment");
    expect(chip({ type: "comment", match: "any", keywords: [], mediaIds: [] }, { facebookPageId: "page" })).toBe("Any page comment");
    expect(chip({ type: "message", match: "any", keywords: [] })).toBe("Any DM");
    expect(chip({ type: "story_reply", match: "keyword", keywords: ["hi"] })).toBe("Story reply");
    expect(chip({ type: "first_contact" })).toBe("First message");
    expect(chip({ type: "story_mention" })).toBe("Story mention");
    expect(triggerChips(v2Automation()).trigger).toBe("Comment");
  });
});
