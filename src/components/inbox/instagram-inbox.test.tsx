// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstagramInbox } from "./instagram-inbox";

const aanya = {
  id: "contact_1", username: "aanya", avatarUrl: "/api/contacts/contact_1/avatar", preview: "Need the guide",
  lastMessageAt: "2026-09-04T10:00:00.000Z", canMessage: true, unread: true, leadStatus: "ENGAGED", tags: ["guide"],
  inboxStatus: "OPEN", favorite: false, reminderAt: undefined, assigneeUserId: undefined,
};
const arjun = { ...aanya, id: "contact_2", username: "arjun", preview: "Pricing", unread: false };

describe("InstagramInbox", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("keeps everyday filters visible and reveals advanced filters on demand", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 })));
    render(<InstagramInbox />);

    expect(await screen.findByRole("searchbox", { name: "Search contacts" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Conversation status" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Sort conversations" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Assignment" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    expect(screen.getByRole("combobox", { name: "Assignment" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide filters" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("loads another roster page without duplicating contacts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { contacts: [aanya], members: [], nextCursor: "page_2" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { contacts: [aanya, arjun], members: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);

    expect(await screen.findByRole("button", { name: /open conversation with @aanya/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more conversations" }));
    expect(await screen.findByRole("button", { name: /open conversation with @arjun/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /open conversation with @aanya/i })).toHaveLength(1);
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=page_2");
  });

  it("marks an unread conversation read and prepends older messages", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 });
      if (url === "/api/inbox/contact_1" && !init?.method) return new Response(JSON.stringify({ data: { messages: [{ id: "m2", direction: "inbound", text: "Newest", at: "2026-09-04T10:00:00.000Z", status: "received" }], nextCursor: "older" } }), { status: 200 });
      if (url.includes("cursor=older")) return new Response(JSON.stringify({ data: { messages: [{ id: "m1", direction: "inbound", text: "Oldest", at: "2026-09-03T10:00:00.000Z", status: "received" }] } }), { status: 200 });
      if (init?.method === "PATCH") return new Response(JSON.stringify({ data: { contact: { ...aanya, unread: false } } }), { status: 200 });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);

    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
    expect(await screen.findByText("Newest")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "mark_read" }) })));
    fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" }));
    expect(await screen.findByText("Oldest")).toBeTruthy();
  });

  it("updates favourite and open state with text-only controls", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [{ ...aanya, unread: false }], members: [] } }), { status: 200 });
      if (!init?.method) return new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 });
      return new Response(JSON.stringify({ data: { contact: aanya } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
    await screen.findByText("No messages with this contact yet.");
    fireEvent.click(screen.getByRole("button", { name: "Add to favourites" }));
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "set_favorite", favorite: true }) })));
    expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "set_status", status: "CLOSED" }) }));
    expect(screen.queryByLabelText(/attach|image|note/i)).toBeNull();
  });
});
