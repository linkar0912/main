// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityFeed } from "./activity-feed";

const contactsResponse = {
  data: {
    contacts: [
      { id: "contact_1", username: "aanya", avatarUrl: "/api/contacts/contact_1/avatar", preview: "Can you share the guide?", lastMessageAt: "2026-09-03T10:00:00.000Z", canMessage: true, leadStatus: "ENGAGED", tags: ["guide"] },
      { id: "contact_2", username: "arjun", avatarUrl: "/api/contacts/contact_2/avatar", preview: "No messages yet", lastMessageAt: "2026-08-01T10:00:00.000Z", canMessage: false, leadStatus: "NEW", tags: [] },
    ],
  },
};

describe("ActivityFeed", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows every contact in a searchable conversation desk", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input).includes("query=arjun")
      ? { data: { ...contactsResponse.data, contacts: [contactsResponse.data.contacts[1]] } }
      : contactsResponse), { status: 200 })));

    render(<ActivityFeed />);

    expect(await screen.findByRole("region", { name: "Instagram inbox conversations" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /open conversation with @aanya/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /open conversation with @arjun/i })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "arjun" } });
    await waitFor(() => expect(screen.queryByRole("button", { name: /@aanya/i })).toBeNull());
    expect(await screen.findByRole("button", { name: /open conversation with @arjun/i })).toBeTruthy();
  });

  it("opens a full conversation and sends a manual reply", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(contactsResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { messages: [{ id: "m1", direction: "inbound", text: "Can you share the guide?", at: "2026-09-03T10:00:00.000Z", status: "received" }] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { message: { id: "m2", direction: "outbound", text: "Sending it now!", at: "2026-09-03T10:02:00.000Z", status: "sent" } } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ActivityFeed />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
    expect(await screen.findByText("Can you share the guide?")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Message @aanya" }), { target: { value: "Sending it now!" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("Sending it now!")).toBeTruthy());
    const request = fetchMock.mock.calls[2];
    expect(request[0]).toBe("/api/inbox/contact_1");
    expect(request[1]).toMatchObject({ method: "POST", body: JSON.stringify({ text: "Sending it now!" }) });
  });

  it("keeps expired conversations visible and explains why reply is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(contactsResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 })));

    render(<ActivityFeed />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @arjun/i }));

    expect(await screen.findByText("The 24-hour Instagram reply window has closed. This contact can message you to reopen it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send message" }).hasAttribute("disabled")).toBe(true);
  });
});
