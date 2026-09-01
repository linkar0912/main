// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "./activity-feed";

vi.mock("./contact-detail-modal", () => ({
  ContactDetailModal: ({ contactId }: { contactId: string }) => <div role="dialog">Contact {contactId}</div>,
}));

describe("ActivityFeed", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders Facebook Page comment activity as a supported social event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "event_1",
        channel: "facebook",
        type: "facebook.comment.created",
        label: "Facebook Page comment",
        at: new Date().toISOString(),
        from: "Taylor",
        summary: "Interested",
      }],
    }), { status: 200 })));

    render(<ActivityFeed />);

    await waitFor(() => expect(screen.getByRole("region", { name: "Unified social inbox" })).toBeTruthy());
    expect(screen.getByText("Facebook Page comment")).toBeTruthy();
    expect(screen.getByText("Taylor")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Facebook comments" })).toBeTruthy();
  });

  it("opens contact history and handoff controls from Instagram activity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "event_2",
        channel: "instagram",
        contactId: "contact_1",
        type: "message.received",
        label: "Direct message",
        at: new Date().toISOString(),
        from: "@taylor",
        summary: "Can a person help me?",
      }],
    }), { status: 200 })));

    render(<ActivityFeed />);

    const conversation = await screen.findByRole("button", { name: /open conversation with @taylor/i });
    fireEvent.click(screen.getByRole("button", { name: "Instagram" }));
    expect(screen.getByRole("button", { name: "Instagram" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(conversation);
    expect(screen.getByRole("dialog").textContent).toContain("Contact contact_1");
  });
});
