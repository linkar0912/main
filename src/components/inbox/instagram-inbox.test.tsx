// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboxContact } from "./types";
import { INBOX_LIVE_REFRESH_MAX_MS, INBOX_LIVE_REFRESH_MS, INBOX_LIVE_TIMEOUT_MS, InstagramInbox, liveRefreshDelay, mergeLiveContacts, mergeLiveMessages } from "./instagram-inbox";

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
      // Only the new inbound message is announced, through its own live
      // region; the thread itself no longer re-reads on every update.
      expect(document.querySelector(".ibx-messages")?.hasAttribute("aria-live")).toBe(false);
      await waitFor(() => expect(document.querySelector(".ibx-live-announcement")?.textContent).toBe("New message from @aanya: Still there?"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not announce the thread that was already on screen or messages you send", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const thread = [{ id: "m1", direction: "inbound", text: "Need the guide", at: "2026-09-04T10:00:00.000Z", status: "received" }];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [{ ...aanya, unread: false }], members: [] } }), { status: 200 });
      if (url === "/api/inbox/contact_1" && !init?.method) return new Response(JSON.stringify({ data: { messages: thread } }), { status: 200 });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }));
    try {
      render(<InstagramInbox />);
      fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
      await screen.findByText("Need the guide", { selector: "p" });
      await act(async () => { await vi.advanceTimersByTimeAsync(INBOX_LIVE_REFRESH_MS); });
      expect(document.querySelector(".ibx-live-announcement")?.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("mirrors stage and owner edits from the contact drawer into the conversation list", async () => {
    const members = [{ userId: "user_2", email: "maya@example.com", role: "MEMBER" }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [{ ...aanya, unread: false }], members } }), { status: 200 });
      if (url === "/api/inbox/contact_1" && !init?.method) return new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 });
      if (url === "/api/team/members") return new Response(JSON.stringify({ data: members }), { status: 200 });
      if (url.startsWith("/api/contacts/contact_1") && !init?.method) {
        return new Response(JSON.stringify({ data: { contact: { id: "contact_1", instagramUsername: "aanya", state: "NONE", tags: ["guide"], score: 3, leadStatus: "ENGAGED", lastSeenAt: aanya.lastMessageAt, createdAt: aanya.lastMessageAt }, timeline: [] } }), { status: 200 });
      }
      if (url === "/api/contacts/contact_1" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ data: { leadStatus: "QUALIFIED", assigneeUserId: "user_2", score: 5 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
    await screen.findByText("No messages with this contact yet.");
    fireEvent.click(screen.getByRole("button", { name: "View details for @aanya" }));

    const status = await screen.findByRole("combobox", { name: "Lead status" });
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Internal notes" }) as HTMLTextAreaElement).disabled).toBe(false));
    fireEvent.change(status, { target: { value: "QUALIFIED" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    // The roster row picks up the new owner without waiting for a refresh.
    const row = await screen.findByRole("button", { name: /open conversation with @aanya/i });
    await waitFor(() => expect(row.textContent).toContain("maya"));
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

  it("backs off live checks while the server answers 502, skips the thread, and recovers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    let failing = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (failing && !init?.method) return new Response("<html>Bad gateway</html>", { status: 502 });
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [{ ...aanya, unread: false }], members: [] } }), { status: 200 });
      if (url === "/api/inbox/contact_1" && !init?.method) return new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 });
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const listCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox" && !init?.method).length;
    const threadCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox/contact_1" && !init?.method).length;
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    try {
      render(<InstagramInbox />);
      fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
      await screen.findByText("No messages with this contact yet.");
      // Line the timer up: one healthy check, then the outage starts.
      await advance(INBOX_LIVE_REFRESH_MS);
      failing = true;
      const lists = listCalls();
      const threads = threadCalls();

      await advance(INBOX_LIVE_REFRESH_MS);
      expect(listCalls()).toBe(lists + 1);
      // The list failed, so the open thread is not asked for.
      expect(threadCalls()).toBe(threads);

      // The next check waits 16 s, then 32 s.
      await advance(15_000);
      expect(listCalls()).toBe(lists + 1);
      await advance(2_000);
      expect(listCalls()).toBe(lists + 2);
      await advance(30_000);
      expect(listCalls()).toBe(lists + 2);
      await advance(3_000);
      expect(listCalls()).toBe(lists + 3);
      expect(threadCalls()).toBe(threads);

      // Back to health: the next check (64 s on) works and the pace resets to 8 s.
      failing = false;
      await advance(65_000);
      expect(listCalls()).toBe(lists + 4);
      expect(threadCalls()).toBe(threads + 1);
      await advance(INBOX_LIVE_REFRESH_MS + 500);
      expect(listCalls()).toBe(lists + 5);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  describe("live checks against a server that hangs or refuses", () => {
    /** AbortSignal.timeout on the fake clock: the real one ignores vi.useFakeTimers. */
    function timeoutsOnFakeClock() {
      return vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
        return controller.signal;
      });
    }

    /** A request that only ends when it is aborted. */
    function hang(init?: RequestInit): Promise<Response> {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }

    const listOk = () => new Response(JSON.stringify({ data: { contacts: [{ ...aanya, unread: false }], members: [] } }), { status: 200 });
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("gives up on a hung list request after 15 s and backs off, instead of stalling every later check", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const timeouts = timeoutsOnFakeClock();
      let hanging = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/inbox" && !init?.method) return hanging ? hang(init) : listOk();
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      const listCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox" && !init?.method).length;

      render(<InstagramInbox />);
      await screen.findByRole("button", { name: /open conversation with @aanya/i });
      const lists = listCalls();
      hanging = true;

      // The check goes out and hangs.
      await advance(INBOX_LIVE_REFRESH_MS);
      expect(listCalls()).toBe(lists + 1);
      expect(timeouts).toHaveBeenLastCalledWith(INBOX_LIVE_TIMEOUT_MS);
      // It gives up after 15 s; the next check waits out the 16 s backoff, then goes out.
      await advance(INBOX_LIVE_TIMEOUT_MS + 14_000);
      expect(listCalls()).toBe(lists + 1);
      hanging = false;
      await advance(3_000);
      expect(listCalls()).toBe(lists + 2);
      // That one answered, so the pace is back to 8 s.
      await advance(INBOX_LIVE_REFRESH_MS + 500);
      expect(listCalls()).toBe(lists + 3);
    });

    it("keeps the 8 s pace when the open thread answers 404, marks the conversation and stops asking for it", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const timeouts = timeoutsOnFakeClock();
      let gone = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/inbox" && !init?.method) return listOk();
        if (url === "/api/inbox/contact_1" && !init?.method) {
          return gone
            ? new Response(JSON.stringify({ error: "Contact not found" }), { status: 404 })
            : new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      const listCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox" && !init?.method).length;
      const threadCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox/contact_1" && !init?.method).length;

      render(<InstagramInbox />);
      fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
      await screen.findByText("No messages with this contact yet.");
      await advance(INBOX_LIVE_REFRESH_MS);
      gone = true;
      const lists = listCalls();
      const threads = threadCalls();

      await advance(INBOX_LIVE_REFRESH_MS);
      expect(listCalls()).toBe(lists + 1);
      expect(threadCalls()).toBe(threads + 1);
      expect((await screen.findByRole("alert")).textContent).toContain("This conversation is no longer available.");

      // Not a failure: the list keeps its 8 s pace, and the missing thread is not asked for again.
      await advance(INBOX_LIVE_REFRESH_MS);
      expect(listCalls()).toBe(lists + 2);
      await advance(INBOX_LIVE_REFRESH_MS);
      expect(listCalls()).toBe(lists + 3);
      expect(threadCalls()).toBe(threads + 1);
      // Every live request, list and thread, had the 15 s limit (the first load and the open do not).
      expect(timeouts).toHaveBeenCalledTimes((listCalls() - 1) + (threadCalls() - 1));
      expect(new Set(timeouts.mock.calls.map(([ms]) => ms))).toEqual(new Set([INBOX_LIVE_TIMEOUT_MS]));
    });

    it("checks again within about 16 s when the tab comes back after an outage, not after the 2 minute backoff", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      timeoutsOnFakeClock();
      let visibility: DocumentVisibilityState = "visible";
      vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
      let failing = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/inbox" && !init?.method) return failing ? new Response("<html>Bad gateway</html>", { status: 502 }) : listOk();
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      const listCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox" && !init?.method).length;
      const show = (state: DocumentVisibilityState) => act(async () => {
        visibility = state;
        document.dispatchEvent(new Event("visibilitychange"));
      });

      render(<InstagramInbox />);
      await screen.findByRole("button", { name: /open conversation with @aanya/i });
      const lists = listCalls();
      failing = true;
      // Four failed checks (at 8, 24, 56 and 120 s): the next one is 2 minutes off.
      await advance(INBOX_LIVE_REFRESH_MS + 16_000 + 32_000 + 64_000);
      expect(listCalls()).toBe(lists + 4);

      // They leave the tab; the outage ends meanwhile.
      await show("hidden");
      failing = false;
      // Back 5 s after that last attempt: the check comes 16 s after it, not 2 minutes after.
      await advance(5_000);
      await show("visible");
      expect(listCalls()).toBe(lists + 4);
      await advance(9_000);
      expect(listCalls()).toBe(lists + 4);
      await advance(3_000);
      expect(listCalls()).toBe(lists + 5);
      // It worked, so the pace is back to 8 s.
      await advance(INBOX_LIVE_REFRESH_MS + 500);
      expect(listCalls()).toBe(lists + 6);
    });

    it("checks at once when the tab comes back long after the last failed attempt", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      timeoutsOnFakeClock();
      let visibility: DocumentVisibilityState = "visible";
      vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
      let failing = false;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/inbox" && !init?.method) return failing ? new Response("<html>Bad gateway</html>", { status: 502 }) : listOk();
        return new Response(JSON.stringify({ data: {} }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      const listCalls = () => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/inbox" && !init?.method).length;
      const show = (state: DocumentVisibilityState) => act(async () => {
        visibility = state;
        document.dispatchEvent(new Event("visibilitychange"));
      });

      render(<InstagramInbox />);
      await screen.findByRole("button", { name: /open conversation with @aanya/i });
      const lists = listCalls();
      failing = true;
      await advance(INBOX_LIVE_REFRESH_MS + 16_000 + 32_000 + 64_000);
      expect(listCalls()).toBe(lists + 4);

      await show("hidden");
      await advance(40_000);
      expect(listCalls()).toBe(lists + 4);
      await show("visible");
      await waitFor(() => expect(listCalls()).toBe(lists + 5));

      // Still failing: flipping back and forth right after does not send a burst...
      await show("hidden");
      await show("visible");
      await show("hidden");
      await show("visible");
      expect(listCalls()).toBe(lists + 5);
      // ...only one more check, 16 s after that attempt.
      failing = false;
      await advance(14_000);
      expect(listCalls()).toBe(lists + 5);
      await advance(3_000);
      expect(listCalls()).toBe(lists + 6);
    });
  });

  it("spaces failed live checks 16 s, 32 s, 64 s, then every 2 minutes", () => {
    const middle = () => 0.5;
    expect([0, 1, 2, 3, 4, 9].map((failures) => liveRefreshDelay(failures, middle))).toEqual([
      INBOX_LIVE_REFRESH_MS, 16_000, 32_000, 64_000, INBOX_LIVE_REFRESH_MAX_MS, INBOX_LIVE_REFRESH_MAX_MS,
    ]);
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

  it("opens the conversation named in a ?contact= link once the list loads", async () => {
    window.history.replaceState(null, "", "/activity?contact=contact_2");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [aanya, arjun], members: [] } }), { status: 200 });
      if (url === "/api/inbox/contact_2" && !init?.method) return new Response(JSON.stringify({ data: { messages: [{ id: "m9", direction: "inbound", text: "Linked thread", at: "2026-09-04T10:00:00.000Z", status: "received" }] } }), { status: 200 });
      if (init?.method === "PATCH") return new Response(JSON.stringify({ data: { contact: arjun } }), { status: 200 });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<InstagramInbox />);
      expect(await screen.findByText("Linked thread")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalledWith("/api/inbox/contact_1", expect.anything());
    } finally {
      window.history.replaceState(null, "", "/");
    }
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

  it("shows a load failure as an error with Try again, not as an empty inbox", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async () => fail
      ? new Response(JSON.stringify({ error: "Inbox is unavailable" }), { status: 500 })
      : new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 })));
    render(<InstagramInbox />);

    expect((await screen.findByRole("alert")).textContent).toContain("Inbox is unavailable");
    expect(screen.queryByText(/No messages yet/)).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /open conversation with @aanya/i })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("points a brand-new inbox at automations instead of asking to pick a conversation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [], members: [] } }), { status: 200 })));
    render(<InstagramInbox />);

    expect(await screen.findByRole("heading", { name: "No conversations yet" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Pick a conversation" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Set up an automation" })[0].getAttribute("href")).toBe("/automations");
  });

  it("groups conversations into Waiting on you, Open and Closed with counts", async () => {
    const closed = { ...arjun, id: "contact_3", username: "meera", inboxStatus: "CLOSED" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [aanya, arjun, closed], members: [] } }), { status: 200 })));
    render(<InstagramInbox />);

    const waiting = await screen.findByRole("list", { name: "Waiting on you" });
    expect(within(waiting).getByRole("button", { name: /open conversation with @aanya/i })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Open" })).getByRole("button", { name: /open conversation with @arjun/i })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Closed" })).getByRole("button", { name: /open conversation with @meera/i })).toBeTruthy();
    const headers = within(screen.getByRole("complementary", { name: "Contacts" })).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headers).toEqual(["Waiting on you 1 conversation", "Open 1 conversation", "Closed 1 conversation"]);

    // One action per row, only where it moves things on.
    expect(screen.getByRole("button", { name: "Reply to @aanya" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen @meera" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /reply to @arjun/i })).toBeNull();

    const toggle = screen.getByRole("button", { name: "Closed 1 conversation" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps a read conversation in Waiting on you until you reply", async () => {
    let confirm: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/inbox") return new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 });
      if (init?.method === "POST") return new Promise<Response>((resolve) => { confirm = resolve; });
      if (init?.method === "PATCH") return new Response(JSON.stringify({ data: {} }), { status: 200 });
      return new Response(JSON.stringify({ data: { messages: [{ id: "m1", direction: "inbound", text: "Need the guide", at: "2026-09-04T10:00:00.000Z", status: "received" }] } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);

    fireEvent.click(await screen.findByRole("button", { name: "Reply to @aanya" }));
    const composer = await screen.findByRole("textbox", { name: "Message @aanya" });
    await waitFor(() => expect(document.activeElement).toBe(composer));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_1", expect.objectContaining({ method: "PATCH" })));
    // Read now, but the person spoke last: still waiting on you.
    expect(within(screen.getByRole("list", { name: "Waiting on you" })).getByRole("button", { name: /open conversation with @aanya/i }).getAttribute("aria-current")).toBe("true");

    fireEvent.change(composer, { target: { value: "Here it is" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    expect(await screen.findByRole("list", { name: "Open" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Waiting on you" })).toBeNull();
    confirm(new Response(JSON.stringify({ data: { message: { id: "sent_1", direction: "outbound", text: "Here it is", at: "2026-09-04T10:05:00.000Z", status: "sent" } } }), { status: 201 }));
    expect(await screen.findByText("Sent")).toBeTruthy();
  });

  it("still puts a read conversation the person spoke last in Waiting on you after a reload", async () => {
    // A fresh page load: nothing opened in this visit, only what the list API says.
    const readWaiting = { ...aanya, unread: false, lastMessageDirection: "inbound" };
    const answered = { ...arjun, lastMessageDirection: "outbound" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { contacts: [readWaiting, answered], members: [] } }), { status: 200 })));
    render(<InstagramInbox />);

    const waiting = await screen.findByRole("list", { name: "Waiting on you" });
    expect(within(waiting).getByRole("button", { name: /open conversation with @aanya/i })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Open" })).getByRole("button", { name: /open conversation with @arjun/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply to @aanya" })).toBeTruthy();
  });

  it("reopens a closed conversation from its row", async () => {
    const closed = { ...arjun, inboxStatus: "CLOSED" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input) === "/api/inbox" && !init?.method
      ? new Response(JSON.stringify({ data: { contacts: [closed], members: [] } }), { status: 200 })
      : new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<InstagramInbox />);

    fireEvent.click(await screen.findByRole("button", { name: "Reopen @arjun" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/inbox/contact_2", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "set_status", status: "OPEN" }) }));
    expect(await screen.findByRole("list", { name: "Open" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Closed" })).toBeNull();
  });

  it("folds the owner, reminder and close controls behind one options button", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input) === "/api/inbox"
      ? new Response(JSON.stringify({ data: { contacts: [aanya], members: [] } }), { status: 200 })
      : new Response(JSON.stringify({ data: { messages: [] } }), { status: 200 })));
    render(<InstagramInbox />);
    fireEvent.click(await screen.findByRole("button", { name: /open conversation with @aanya/i }));
    const toggle = await screen.findByRole("button", { name: "Conversation options" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(screen.getByRole("toolbar", { name: "Conversation actions" }).id);
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide conversation options" }).getAttribute("aria-expanded")).toBe("true");
  });
});
