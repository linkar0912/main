// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxContact } from "./types";
import { INBOX_LIVE_REFRESH_MS, InstagramInbox, mergeLiveContacts, mergeLiveMessages } from "./instagram-inbox";

const aanya = {
  id: "contact_1", username: "aanya", avatarUrl: "/api/contacts/contact_1/avatar", preview: "Need the guide",
  lastMessageAt: "2026-09-04T10:00:00.000Z", canMessage: true, unread: true, leadStatus: "ENGAGED", tags: ["guide"],
  inboxStatus: "OPEN", favorite: false, reminderAt: undefined, assigneeUserId: undefined,
};
const arjun = { ...aanya, id: "contact_2", username: "arjun", preview: "Pricing", unread: false };

describe("InstagramInbox", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows a new conversation and a new reply without a reload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let contacts = [{ ...aanya, unread: false }];
    let thread = [{ id: "m1", direction: "inbound", text: "Need the guide", at: "2026-09-04T10:00:00.000Z", status: "received" }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts, members: [] } }), { status: 200 });
      if (url === "/api/inbox/contact_1" && !init?.method) return new Response(JSON.stringify({ data: { messages: thread } }), { status: 200 });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<InstagramInbox />);
      fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
      await screen.findByText("Need the guide", { selector: "p" });

      contacts = [{ ...arjun, preview: "Hi there" }, { ...aanya, unread: false }];
      thread = [...thread, { id: "m2", direction: "inbound", text: "Still there?", at: "2026-09-04T10:05:00.000Z", status: "received" }];
      await act(async () => { await vi.advanceTimersByTimeAsync(INBOX_LIVE_REFRESH_MS); });

      expect(await screen.findByRole("button", { name: /open conversation with @arjun/i })).toBeTruthy();
      expect(await screen.findByText("Still there?")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      render(<InstagramInbox />);
      await screen.findByRole("button", { name: /open conversation with @aanya/i });
      const callsAfterLoad = fetchMock.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(INBOX_LIVE_REFRESH_MS * 3); });
      expect(fetchMock.mock.calls.length).toBe(callsAfterLoad);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

  it("merges live pages without duplicating an in-flight send or dropping older pages", () => {
    const received = { id: "m1", direction: "inbound" as const, text: "Hi", at: "2026-09-04T10:00:00.000Z", status: "received" as const };
    const pending = { id: "local_k1", direction: "outbound" as const, text: "On my way", at: "2026-09-04T10:01:00.000Z", status: "sending" as const, clientKey: "k1" };
    const serverCopy = { id: "m2", direction: "outbound" as const, text: "On my way", at: "2026-09-04T10:01:01.000Z", status: "sent" as const };
    const reply = { id: "m3", direction: "inbound" as const, text: "Great", at: "2026-09-04T10:02:00.000Z", status: "received" as const };

    expect(mergeLiveMessages([received, pending], [received, serverCopy, reply]).map((message) => message.id))
      .toEqual(["m1", "m3", "local_k1"]);
    expect(mergeLiveMessages([received, { ...serverCopy, clientKey: "k1" }], [received, serverCopy, reply]).map((message) => message.id))
      .toEqual(["m1", "m2", "m3"]);
    expect(mergeLiveContacts([aanya, arjun] as InboxContact[], [{ ...arjun, preview: "New" }] as InboxContact[]).map((contact) => [contact.id, contact.preview]))
      .toEqual([["contact_2", "New"], ["contact_1", "Need the guide"]]);
  });

  it("keeps everyday filters visible and reveals advanced filters on demand", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 })));
    render(<InstagramInbox />);

    expect(await screen.findByRole("searchbox", { name: "Search contacts" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Conversation status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Unread" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Assignment" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    expect(screen.getByRole("combobox", { name: "Assignment" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Sort conversations" })).toBeTruthy();
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
    const toolbar = screen.getByRole("toolbar", { name: "Conversation actions" });
    expect(toolbar.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "Assign conversation" })).toBeTruthy();
    expect(screen.getByLabelText("Conversation reminder")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add to favourites" }));
    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "set_favorite", favorite: true }) })));
    expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "set_status", status: "CLOSED" }) }));
    expect(screen.queryByLabelText(/attach|image|note/i)).toBeNull();
  });

  it("shows a sent message immediately and settles it when the server confirms", async () => {
    let confirm: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [arjun], members: [] } }), { status: 200 });
      if (init?.method === "POST") return new Promise<Response>((resolve) => { confirm = resolve; });
      return new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @arjun/i }));
    const composer = await screen.findByRole("textbox", { name: "Message @arjun" });
    fireEvent.change(composer, { target: { value: "Here is the link" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(screen.getByText("Here is the link")).toBeTruthy();
    expect(screen.getByText("Sending")).toBeTruthy();
    expect((composer as HTMLTextAreaElement).value).toBe("");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect((post?.[1]?.headers as Record<string, string>)["idempotency-key"]).toBeTruthy();

    confirm(new Response(JSON.stringify({ data: { message: { id: "sent_1", direction: "outbound", text: "Here is the link", at: "2026-09-04T10:05:00.000Z", status: "sent" } } }), { status: 201 }));
    expect(await screen.findByText("Sent")).toBeTruthy();
  });

  it("keeps a failed message on screen and retries it with the same idempotency key", async () => {
    const posts: RequestInit[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [arjun], members: [] } }), { status: 200 });
      if (init?.method === "POST") {
        posts.push(init);
        return posts.length === 1
          ? new Response(JSON.stringify({ error: "Meta is unavailable" }), { status: 502 })
          : new Response(JSON.stringify({ data: { message: { id: "sent_1", direction: "outbound", text: "Retry me", at: "2026-09-04T10:05:00.000Z", status: "sent" } } }), { status: 201 });
      }
      return new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @arjun/i }));
    const composer = await screen.findByRole("textbox", { name: "Message @arjun" });
    fireEvent.change(composer, { target: { value: "Retry me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Meta is unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sent")).toBeTruthy();
    const keys = posts.map((init) => (init.headers as Record<string, string>)["idempotency-key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
