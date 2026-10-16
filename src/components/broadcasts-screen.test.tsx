// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BroadcastsScreen } from "./broadcasts-screen";

// En and em dashes, built from char codes so the branding check never sees the characters in source.
const LONG_DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

const running = { id: "broadcast_1", name: "Weekend offer", status: "RUNNING", segment: "all_contacts", total: 10, sent: 3, failed: 0, skipped: 0 };

describe("BroadcastsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows friendly status labels and cancels a sending broadcast after confirmation", async () => {
    let rows = [running, { ...running, id: "broadcast_2", name: "Launch", status: "PENDING" }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/broadcasts" && !init?.method) return new Response(JSON.stringify({ data: rows }), { status: 200 });
      if (url === "/api/broadcasts/broadcast_1" && init?.method === "PATCH") {
        rows = rows.map((row) => row.id === "broadcast_1" ? { ...row, status: "CANCELLED" } : row);
        return new Response(JSON.stringify({ data: rows[0] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastsScreen />);

    expect(await screen.findByText("Sending")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.queryByText("RUNNING")).toBeNull();
    // Only the live broadcast shows a progress bar.
    const progress = screen.getByRole("progressbar", { name: "Weekend offer progress" });
    expect(progress.getAttribute("aria-valuenow")).toBe("3");
    expect(progress.getAttribute("aria-valuemax")).toBe("10");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel Weekend offer" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/broadcasts/broadcast_1", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancelling Weekend offer" }));

    await waitFor(() => expect(screen.getByText("Cancelled")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/broadcasts/broadcast_1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "CANCELLED" }),
    }));
    expect(screen.queryByRole("button", { name: "Cancel Weekend offer" })).toBeNull();
  });

  it("says how many eligible people the per-broadcast cap left out", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/broadcasts" && init?.method === "POST") {
        return new Response(JSON.stringify({ data: running, audience: { eligible: 740, queued: 500, truncated: true } }), { status: 201 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    render(<BroadcastsScreen />);
    await screen.findByText("No broadcasts yet");
    fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
    fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));

    expect(await screen.findByText(/500 most recently active of 740/)).toBeTruthy();
  });

  it("notes under the message that one text sent to many people looks repetitive, without blocking the send", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/broadcasts" && init?.method === "POST") {
        return new Response(JSON.stringify({ data: running, audience: { eligible: 3, queued: 3, truncated: false } }), { status: 201 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastsScreen />);
    await screen.findByText("No broadcasts yet");

    const message = screen.getByPlaceholderText("Write the message everyone will get");
    const hint = screen.getByRole("note");
    expect(hint.textContent).toMatch(/same text to many people can look repetitive/i);
    expect(hint.textContent).toMatch(/relevant/i);
    expect(hint.textContent).toMatch(/now and then/i);
    expect(hint.textContent).not.toMatch(LONG_DASHES);
    // It sits with the message box it is about.
    expect(hint.closest("label")).toBe(message.closest("label"));

    fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
    fireEvent.change(message, { target: { value: "New stock" } });
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));

    expect(await screen.findByText(/for 3 people in the 24-hour window/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/broadcasts", expect.objectContaining({ method: "POST" }));
  });

  it("says the list could not load when the connection drops, not the browser's own error words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    render(<BroadcastsScreen />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not load broadcasts.");
    expect(alert.textContent).not.toContain("Failed to fetch");
  });

  it("explains a manager-only refusal instead of showing the error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/broadcasts" && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    render(<BroadcastsScreen />);
    await screen.findByText("No broadcasts yet");
    fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
    fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));

    expect(await screen.findByText(/Only workspace owners and admins/)).toBeTruthy();
  });

  describe("idempotency key", () => {
    // What fillAndSend posts. The route replays the stored row, so a replay
    // of the same send carries the same name, text and segment.
    const sentRow = { ...running, name: "Drop", text: "New stock", segment: "captured_email" };

    function postKeys(fetchMock: ReturnType<typeof vi.fn>): string[] {
      return fetchMock.mock.calls
        .filter(([input, init]) => String(input) === "/api/broadcasts" && (init as RequestInit | undefined)?.method === "POST")
        .map(([, init]) => ((init as RequestInit).headers as Record<string, string>)["idempotency-key"]);
    }

    async function fillAndSend() {
      fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    }

    function confirmAgain() {
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
    }

    it("reuses the same key when a send is retried after a 502, and says the retry was not sent again", async () => {
      const responses = [
        new Response(JSON.stringify({ error: "Some people could not be queued. Delivery is partial - check the queue.", data: sentRow }), { status: 502 }),
        new Response(JSON.stringify({ data: sentRow, replayed: true }), { status: 200 }),
      ];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") return responses.shift()!;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(/Some people could not be queued/)).toBeTruthy();

      confirmAgain();

      // Read from the broadcast the first try made: it is still going out.
      expect(await screen.findByText(/earlier try of this broadcast is already sending, so it was not sent again/)).toBeTruthy();
      const keys = postKeys(fetchMock);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/^[a-zA-Z0-9_-]{1,100}$/);
      expect(keys[1]).toBe(keys[0]);
      // The form clears once the server holds the broadcast.
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("");
    });

    it("keeps the key through an edit after a refusal, since the server holds nothing, and starts a new one after a confirmed send", async () => {
      const responses = [
        // A refusal: the server stored nothing, so reusing the key is harmless.
        new Response(JSON.stringify({ error: "Could not start this broadcast." }), { status: 400 }),
        new Response(JSON.stringify({ data: sentRow, audience: { eligible: 1, queued: 1, truncated: false } }), { status: 201 }),
        new Response(JSON.stringify({ data: sentRow, audience: { eligible: 1, queued: 1, truncated: false } }), { status: 201 }),
      ];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") return responses.shift()!;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText("Could not start this broadcast.")).toBeTruthy();

      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock, now" } });
      confirmAgain();
      expect(await screen.findByText(/for 1 person in the 24-hour window/)).toBeTruthy();

      await fillAndSend();
      await waitFor(() => expect(postKeys(fetchMock)).toHaveLength(3));

      const keys = postKeys(fetchMock);
      expect(keys[1]).toBe(keys[0]);
      expect(keys[2]).not.toBe(keys[0]);
    });

    it("does not report success when the replayed broadcast had been cancelled, and keeps the key while some got it", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          // Cancelled after 3 people already got it.
          return new Response(JSON.stringify({ data: { ...sentRow, status: "CANCELLED" }, replayed: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();

      const alert = await screen.findByText(/earlier try of this broadcast was cancelled after some messages went out/);
      expect(alert.textContent).not.toMatch(LONG_DASHES);
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("Drop");

      // Sending the same form again must not message those 3 people twice.
      confirmAgain();
      await waitFor(() => expect(postKeys(fetchMock)).toHaveLength(2));
      const keys = postKeys(fetchMock);
      expect(keys[1]).toBe(keys[0]);
    });

    it("keeps the key after a 502 retry when everyone failed, since a failed send may still have gone out", async () => {
      // Partial 502, then the retry with the kept key got the finished
      // broadcast back. `failed` includes deliveries whose outcome is unknown
      // (Meta may have sent them), so nothing proves nobody got it.
      const allFailed = { ...sentRow, status: "COMPLETED", total: 2, sent: 0, failed: 2, skipped: 0 };
      const responses = [
        new Response(JSON.stringify({ error: "Some people could not be queued. Delivery is partial - check the queue.", data: sentRow }), { status: 502 }),
        new Response(JSON.stringify({ data: allFailed, replayed: true }), { status: 200 }),
        new Response(JSON.stringify({ data: allFailed, replayed: true }), { status: 200 }),
        new Response(JSON.stringify({ data: sentRow, audience: { eligible: 2, queued: 2, truncated: false } }), { status: 201 }),
      ];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") return responses.shift()!;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(/Some people could not be queued/)).toBeTruthy();

      confirmAgain();

      const alert = await screen.findByText(/earlier try of this broadcast could not confirm whether its messages went out, so it was not sent again/);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).not.toMatch(LONG_DASHES);
      expect(screen.queryByText(/reached nobody/)).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      // The form stays, so nobody has to type it again.
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("Drop");
      expect((screen.getByPlaceholderText("Write the message everyone will get") as HTMLTextAreaElement).value).toBe("New stock");

      // Sending the same form again replays the same broadcast; it cannot
      // start a second one to the same people.
      confirmAgain();
      await waitFor(() => expect(postKeys(fetchMock)).toHaveLength(3));
      expect(await screen.findByText(/could not confirm whether its messages went out/)).toBeTruthy();

      // Only an edit starts a new broadcast.
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock, now" } });
      confirmAgain();
      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();

      const keys = postKeys(fetchMock);
      expect(keys).toHaveLength(4);
      expect(keys[1]).toBe(keys[0]);
      expect(keys[2]).toBe(keys[0]);
      expect(keys[3]).not.toBe(keys[0]);
    });

    it.each([
      ["some were recorded failed", { status: "CANCELLED", total: 3, sent: 0, failed: 1, skipped: 2 }],
      ["someone was still mid-send", { status: "CANCELLED", total: 3, sent: 0, failed: 0, skipped: 2 }],
      ["its counts were never updated", { status: "COMPLETED", total: 3, sent: 0, failed: 0, skipped: 0 }],
    ])("keeps the key on a replayed broadcast with nobody confirmed sent when %s", async (_label, counts) => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          return new Response(JSON.stringify({ data: { ...sentRow, ...counts }, replayed: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(/could not confirm whether its messages went out/)).toBeTruthy();
      expect(screen.queryByText(/reached nobody/)).toBeNull();
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("Drop");

      confirmAgain();
      await waitFor(() => expect(postKeys(fetchMock)).toHaveLength(2));
      const keys = postKeys(fetchMock);
      expect(keys[1]).toBe(keys[0]);
    });

    it.each([
      ["everyone was skipped", { status: "COMPLETED", total: 2, sent: 0, failed: 0, skipped: 2 }],
      ["it was cancelled before anyone was tried", { status: "CANCELLED", total: 2, sent: 0, failed: 0, skipped: 2 }],
      ["it was cancelled before anyone was added", { status: "CANCELLED", total: 0, sent: 0, failed: 0, skipped: 0 }],
    ])("says a replayed broadcast reached nobody when %s, and sends the next try fresh", async (_label, counts) => {
      const responses = [
        new Response(JSON.stringify({ data: { ...sentRow, ...counts }, replayed: true }), { status: 200 }),
        new Response(JSON.stringify({ data: sentRow, audience: { eligible: 2, queued: 2, truncated: false } }), { status: 201 }),
      ];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") return responses.shift()!;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();

      const alert = await screen.findByText(/earlier try of this broadcast reached nobody, so nothing went out/);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).not.toMatch(LONG_DASHES);
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("Drop");

      confirmAgain();

      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();
      const keys = postKeys(fetchMock);
      expect(keys).toHaveLength(2);
      // Nobody got the first try, so a fresh broadcast cannot message anyone twice.
      expect(keys[1]).not.toBe(keys[0]);
    });

    it("says a replayed broadcast with nobody in the window already went through, and clears the form", async () => {
      const empty = { ...sentRow, status: "COMPLETED", total: 0, sent: 0, failed: 0, skipped: 0 };
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          return new Response(JSON.stringify({ data: empty, replayed: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }));

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();

      const notice = await screen.findByRole("status");
      expect(notice.textContent).toBe("An earlier try of this broadcast already went through, with nobody in the 24-hour window to send it to.");
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("");
    });

    it("drops the key when the server says nobody was queued, so the next try is a fresh send", async () => {
      const responses = [
        new Response(JSON.stringify({
          error: "The send queue did not answer, so nobody was messaged. Try again in a minute.",
          data: { ...sentRow, status: "CANCELLED", sent: 0 },
          queued: 0,
        }), { status: 503 }),
        new Response(JSON.stringify({ data: sentRow, audience: { eligible: 2, queued: 2, truncated: false } }), { status: 201 }),
      ];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") return responses.shift()!;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(/send queue did not answer, so nobody was messaged/)).toBeTruthy();
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("Drop");

      confirmAgain();

      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();
      const keys = postKeys(fetchMock);
      expect(keys).toHaveLength(2);
      expect(keys[1]).not.toBe(keys[0]);
    });

    it("says a replayed broadcast that went out was not sent again, with how many could not be messaged", async () => {
      const finished = { ...sentRow, status: "COMPLETED", total: 5, sent: 4, failed: 1, skipped: 0 };
      vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          return new Response(JSON.stringify({ data: finished, replayed: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }));

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();

      const notice = await screen.findByRole("status");
      expect(notice.textContent).toBe("An earlier try of this broadcast already went out to 4 people, so it was not sent again. 1 person could not be messaged.");
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).value).toBe("");
    });

    const UNCONFIRMED = "We could not confirm whether this broadcast started. Check the list of your broadcasts before sending again.";

    it.each([
      ["a gateway 504 page", () => new Response("<html><body>504 Gateway Timeout</body></html>", { status: 504, headers: { "content-type": "text/html" } }), UNCONFIRMED],
      ["an empty server error", () => new Response(null, { status: 500 }), UNCONFIRMED],
      ["a dropped connection", () => { throw new TypeError("Failed to fetch"); }, UNCONFIRMED],
      [
        "a partial 502",
        () => new Response(JSON.stringify({ error: "Some people could not be queued. Delivery is partial - check the queue.", data: { ...sentRow, name: "Drop" } }), { status: 502 }),
        "Some people could not be queued. Delivery is partial - check the queue.",
      ],
    ])("keeps the key through an edit after %s once the server stored the broadcast, and shows it in the list", async (_label, firstAnswer, expected) => {
      // A stand-in for the route: the first POST stores and queues the
      // broadcast, then its answer is lost. A known key replays; a new key
      // makes a second broadcast to the same people.
      const stored = new Map<string, typeof sentRow>();
      let posts = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          posts += 1;
          const key = (init.headers as Record<string, string>)["idempotency-key"];
          const existing = stored.get(key);
          if (existing) return new Response(JSON.stringify({ data: existing, replayed: true }), { status: 200 });
          const body = JSON.parse(String(init.body)) as { name: string; text: string; segment: string };
          stored.set(key, { ...sentRow, id: `broadcast_${stored.size + 1}`, name: body.name, text: body.text, segment: body.segment, total: 2, sent: 0 });
          if (posts === 1) return firstAnswer();
          return new Response(JSON.stringify({ data: stored.get(key), audience: { eligible: 2, queued: 2, truncated: false } }), { status: 201 });
        }
        return new Response(JSON.stringify({ data: [...stored.values()] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();

      const alert = await screen.findByText(expected);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).not.toMatch(LONG_DASHES);
      expect(screen.queryByText("Failed to fetch")).toBeNull();
      expect(screen.queryByText("Could not start this broadcast.")).toBeNull();
      // The list refreshes, so the stored broadcast shows up.
      expect(await screen.findByText("Sending")).toBeTruthy();
      expect(screen.queryByText("No broadcasts yet")).toBeNull();

      // Believing nothing started, the person fixes the text and sends again.
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock is in" } });
      confirmAgain();

      // The same key replays the first broadcast, not the edited one. The
      // screen says so and keeps the edit instead of clearing it under an
      // "already sending" notice that fades.
      const notSent = await screen.findByText(/Your earlier send, “Drop”, is going out now, so this edited message was not sent/);
      expect(notSent.getAttribute("role")).toBe("alert");
      expect(notSent.textContent).not.toMatch(LONG_DASHES);
      expect((screen.getByPlaceholderText("Write the message everyone will get") as HTMLTextAreaElement).value).toBe("New stock is in");
      let keys = postKeys(fetchMock);
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
      expect(stored.size).toBe(1);

      // Told the first one is going out, the person sends the edited version
      // on purpose, which is a new broadcast with the edited text.
      confirmAgain();
      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();
      keys = postKeys(fetchMock);
      expect(keys).toHaveLength(3);
      expect(keys[2]).not.toBe(keys[0]);
      expect(stored.get(keys[2])?.text).toBe("New stock is in");
    });

    /**
     * A stand-in for the route: a known key replays the stored row; a new key
     * stores a row from what was posted. `answers` overrides the answer to
     * the Nth POST (1-based) after the row is stored.
     */
    function standInRoute(answers: Record<number, () => Response | Promise<Response>> = {}) {
      const stored = new Map<string, typeof sentRow & { segment: string; createdAt: string }>();
      let posts = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          posts += 1;
          const key = (init.headers as Record<string, string>)["idempotency-key"];
          const existing = stored.get(key);
          if (existing) return new Response(JSON.stringify({ data: existing, replayed: true }), { status: 200 });
          const body = JSON.parse(String(init.body)) as { name: string; text: string; segment: string; scheduleStart?: string };
          const row = { ...sentRow, id: `broadcast_${stored.size + 1}`, name: body.name, text: body.text, segment: body.segment, status: body.scheduleStart ? "PENDING" : "RUNNING", total: 2, sent: 0, createdAt: new Date().toISOString() };
          stored.set(key, row);
          const answer = answers[posts];
          if (answer) return answer();
          return new Response(JSON.stringify({ data: row, audience: { eligible: 2, queued: 2, truncated: false } }), { status: 201 });
        }
        return new Response(JSON.stringify({ data: [...stored.values()] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      return { fetchMock, stored };
    }

    const lost = () => { throw new TypeError("Failed to fetch"); };

    function pressSendAndConfirm() {
      fireEvent.click(screen.getByRole("button", { name: /^(Send|Schedule) broadcast$/ }));
      fireEvent.click(screen.getByRole("button", { name: /^Confirm (send|schedule)$/ }));
    }

    it("locks the fields while a send is in flight, and a lost answer keeps the key for the unchanged retry", async () => {
      let release: (() => void) | undefined;
      const { fetchMock, stored } = standInRoute({
        1: async () => {
          await new Promise<void>((resolve) => { release = resolve; });
          throw new TypeError("Failed to fetch");
        },
      });

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      await waitFor(() => expect(release).toBeDefined());
      // Nothing typed while "Starting…" shows can be lost or change what the key stands for.
      for (const field of [
        screen.getByPlaceholderText("e.g. Weekend offer"),
        screen.getByPlaceholderText("Write the message everyone will get"),
        screen.getByRole("combobox"),
        screen.getByLabelText(/Start at \(optional\)/),
      ]) expect((field as HTMLInputElement).disabled).toBe(true);
      release!();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();
      expect((screen.getByPlaceholderText("e.g. Weekend offer") as HTMLInputElement).disabled).toBe(false);
      expect(await screen.findByText("Sending")).toBeTruthy();

      // The retry replays what the server holds, so it is not warned about as a repeat.
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      expect(screen.queryByText(/You already sent this same message/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));

      expect(await screen.findByText(/earlier try of this broadcast is already sending, so it was not sent again/)).toBeTruthy();
      const keys = postKeys(fetchMock);
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
      expect(stored.size).toBe(1);
    });

    it.each([
      ["the name", () => fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop (retry)" } })],
      ["the audience", () => fireEvent.change(screen.getByRole("combobox"), { target: { value: "all_contacts" } })],
    ])("does not send the same message twice when only %s changed after a lost answer", async (_label, change) => {
      const { fetchMock, stored } = standInRoute({ 1: lost });

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();

      change();
      confirmAgain();

      const alert = await screen.findByText(/Your earlier send of this message, “Drop”, is going out now, so your changes to its name, audience or start time were not applied/);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).toContain("Sending it again would message the same people twice.");
      // It has started, so cancelling would not make a fresh send safe.
      expect(alert.textContent).toContain("To send something new, change the message.");
      expect(alert.textContent).not.toContain("cancel it in the list");
      expect(alert.textContent).not.toMatch(LONG_DASHES);
      // The form keeps the change, and pressing again replays instead of sending a second broadcast.
      expect((screen.getByPlaceholderText("Write the message everyone will get") as HTMLTextAreaElement).value).toBe("New stock");
      confirmAgain();
      await waitFor(() => expect(postKeys(fetchMock)).toHaveLength(3));
      expect(new Set(postKeys(fetchMock)).size).toBe(1);
      expect(stored.size).toBe(1);
    });

    it("does not drop a changed start time under a fading notice after a lost answer", async () => {
      const { fetchMock, stored } = standInRoute({ 1: lost });

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
      fireEvent.change(screen.getByLabelText(/Start at \(optional\)/), { target: { value: "2099-01-01T10:00" } });
      pressSendAndConfirm();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();

      fireEvent.change(screen.getByLabelText(/Start at \(optional\)/), { target: { value: "2099-01-02T10:00" } });
      pressSendAndConfirm();

      const alert = await screen.findByText(/Your earlier send of this message, “Drop”, is scheduled, so your changes to its name, audience or start time were not applied/);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(alert.textContent).toContain("cancel it in the list first");
      expect((screen.getByLabelText(/Start at \(optional\)/) as HTMLInputElement).value).toBe("2099-01-02T10:00");
      expect(new Set(postKeys(fetchMock)).size).toBe(1);
      expect(stored.size).toBe(1);
    });

    it("warns before the same message goes out again once the screen has forgotten the lost answer", async () => {
      const { stored } = standInRoute({ 1: lost });

      const first = render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();
      // Another tab and back (or a reload) starts the screen over.
      first.unmount();
      render(<BroadcastsScreen />);
      expect(await screen.findByText("Sending")).toBeTruthy();

      fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop again" } });
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));

      const warning = await screen.findByText(/You already sent this same message in the last 24 hours, as “Drop”. Sending it again would message anyone in both audiences twice./);
      expect(warning.textContent).not.toMatch(LONG_DASHES);
      // A second send stays possible, as a warned choice.
      fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));
      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();
      expect(stored.size).toBe(2);
    });

    it("warns before resending the first message after another send in between was also lost", async () => {
      const { stored } = standInRoute({ 1: lost, 3: lost });

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();

      const message = () => screen.getByPlaceholderText("Write the message everyone will get");
      fireEvent.change(message(), { target: { value: "New stock is in" } });
      confirmAgain();
      expect(await screen.findByText(/so this edited message was not sent/)).toBeTruthy();
      confirmAgain();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();
      expect(stored.size).toBe(2);

      // Back to the first message: the kept key replays the second send.
      fireEvent.change(message(), { target: { value: "New stock" } });
      confirmAgain();
      expect(await screen.findByText(/so this edited message was not sent/)).toBeTruthy();

      // Sending as the alert suggests would repeat the first message, so the confirm step says so.
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      expect(await screen.findByText(/You already sent this same message in the last 24 hours, as “Drop”/)).toBeTruthy();
    });

    it("warns about a repeat when an unknown outcome was for another message", async () => {
      // "New stock" goes out for real; a different message is then lost before
      // reaching the server, and the person edits back to "New stock".
      const { stored } = standInRoute();
      const fetchMock = vi.mocked(fetch);
      const route = fetchMock.getMockImplementation()!;
      let posts = 0;
      fetchMock.mockImplementation(async (input, init) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST" && ++posts === 2) throw new TypeError("Failed to fetch");
        return route(input, init);
      });

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();

      fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Promo" } });
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "Something else" } });
      confirmAgain();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();
      expect(stored.size).toBe(1);

      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
      fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
      expect(await screen.findByText(/You already sent this same message in the last 24 hours, as “Drop”/)).toBeTruthy();
    });

    it.each([
      ["moved back to the first time", "2099-01-01T10:00"],
      ["kept at the stored time", "2099-01-01T18:00"],
    ])("says the start time is not confirmed when it changed while answers were lost and is %s", async (_label, retryTime) => {
      // The first try never reached the server; the second stored 18:00 and its answer was lost.
      const stored = new Map<string, typeof sentRow & { createdAt: string }>();
      let posts = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          posts += 1;
          const key = (init.headers as Record<string, string>)["idempotency-key"];
          const existing = stored.get(key);
          if (existing) return new Response(JSON.stringify({ data: existing, replayed: true }), { status: 200 });
          if (posts === 1) throw new TypeError("Failed to fetch");
          const body = JSON.parse(String(init.body)) as { name: string; text: string; segment: string };
          stored.set(key, { ...sentRow, name: body.name, text: body.text, segment: body.segment, status: "PENDING", total: 2, sent: 0, createdAt: new Date().toISOString() });
          throw new TypeError("Failed to fetch");
        }
        return new Response(JSON.stringify({ data: [...stored.values()] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      const start = () => screen.getByLabelText(/Start at \(optional\)/);
      fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
      fireEvent.change(start(), { target: { value: "2099-01-01T10:00" } });
      pressSendAndConfirm();
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();
      fireEvent.change(start(), { target: { value: "2099-01-01T18:00" } });
      pressSendAndConfirm();
      await waitFor(() => expect(stored.size).toBe(1));
      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();

      fireEvent.change(start(), { target: { value: retryTime } });
      pressSendAndConfirm();

      const alert = await screen.findByText(/its start time changed while answers were lost, so the time it was stored with is not confirmed/);
      expect(alert.getAttribute("role")).toBe("alert");
      expect(screen.queryByText(/already scheduled, so it was not scheduled again/)).toBeNull();
      expect((start() as HTMLInputElement).value).toBe(retryTime);
      expect(new Set(postKeys(fetchMock)).size).toBe(1);
      expect(stored.size).toBe(1);
    });

    it("treats a success answer it cannot read as unconfirmed, and keeps the form and the key", async () => {
      const { fetchMock, stored } = standInRoute({ 1: () => new Response("{\"data\": {\"id\"", { status: 201 }) });

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();

      expect(await screen.findByText(UNCONFIRMED)).toBeTruthy();
      expect(screen.queryByText(/Broadcast started/)).toBeNull();
      expect((screen.getByPlaceholderText("Write the message everyone will get") as HTMLTextAreaElement).value).toBe("New stock");

      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "Completely different message" } });
      confirmAgain();

      expect(await screen.findByText(/so this edited message was not sent/)).toBeTruthy();
      expect((screen.getByPlaceholderText("Write the message everyone will get") as HTMLTextAreaElement).value).toBe("Completely different message");
      const keys = postKeys(fetchMock);
      expect(keys[1]).toBe(keys[0]);
      expect(stored.size).toBe(1);
    });

    it("starts a new broadcast straight away when the message changes after the server said some may have it", async () => {
      // Cancelled after 3 people got it: an unchanged retry replays, a new message is a new broadcast.
      const cancelled = { ...sentRow, status: "CANCELLED", total: 10, sent: 3 };
      const keysSeen: string[] = [];
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/broadcasts" && init?.method === "POST") {
          const key = (init.headers as Record<string, string>)["idempotency-key"];
          keysSeen.push(key);
          if (key === keysSeen[0]) return new Response(JSON.stringify({ data: cancelled, replayed: true }), { status: 200 });
          return new Response(JSON.stringify({ data: { ...sentRow, text: "Back in stock" }, audience: { eligible: 2, queued: 2, truncated: false } }), { status: 201 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<BroadcastsScreen />);
      await screen.findByText("No broadcasts yet");
      await fillAndSend();
      expect(await screen.findByText(/was cancelled after some messages went out, so it was not sent again. Change the message to send a new one./)).toBeTruthy();

      confirmAgain();
      await waitFor(() => expect(keysSeen).toHaveLength(2));
      expect(keysSeen[1]).toBe(keysSeen[0]);

      fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "Back in stock" } });
      confirmAgain();
      expect(await screen.findByText(/for 2 people in the 24-hour window/)).toBeTruthy();
      expect(keysSeen).toHaveLength(3);
      expect(keysSeen[2]).not.toBe(keysSeen[0]);
    });
  });
});
