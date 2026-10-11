// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

const { CommandPalette, SEARCH_DEBOUNCE_MS } = await import("./command-palette");
const { workspaceSources, searchContacts, automationItem } = await import("./command-palette-sources");
const { filterItems } = await import("./command-palette-items");

type ContactRow = { id: string; instagramUsername?: string; email?: string; leadStatus?: string };
const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 });

/**
 * A workspace with 3,785 contacts: the 200 newest are "recent_*", and Meera
 * is far older. The fake API answers like the real one - `q` searches every
 * contact, without it only the requested page comes back.
 */
function workspaceApi() {
  const contacts: ContactRow[] = [
    ...Array.from({ length: 3784 }, (_, index) => ({ id: `c${index}`, instagramUsername: `recent_${index}` })),
    { id: "c_meera", instagramUsername: "meera.styles", email: "meera@example.com", leadStatus: "CUSTOMER" },
  ];
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://app.linkar.in");
    calls.push(`${url.pathname}${url.search}`);
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (url.pathname === "/api/contacts") {
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const q = url.searchParams.get("q")?.toLowerCase();
      const rows = q ? contacts.filter((row) => `${row.instagramUsername ?? ""} ${row.email ?? ""}`.toLowerCase().includes(q)) : contacts;
      return json({ contacts: rows.slice(0, limit) });
    }
    if (url.pathname === "/api/automations") {
      return json([
        { id: "a1", name: "Diwali price list", status: "ACTIVE", provider: "INSTAGRAM", definition: { trigger: { type: "comment", keywords: ["PRICE", "RATE"] } } },
        { id: "a2", name: "Welcome", status: "DRAFT", definition: { trigger: { type: "first_contact" } } },
      ]);
    }
    if (url.pathname === "/api/inbox") return json({ contacts: [] });
    return json({});
  });
  return { fetchMock, calls };
}

describe("palette contacts search", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The old source loaded `/api/contacts?scope=all&limit=200` once and
  // filtered it in the browser, so Meera (contact 3,785) was never found.
  it("asks the server for each query and finds a contact older than the newest 200", async () => {
    const { fetchMock, calls } = workspaceApi();
    vi.stubGlobal("fetch", fetchMock);
    const items = await searchContacts("meera", new AbortController().signal);
    expect(items.map((item) => item.label)).toEqual(["@meera.styles"]);
    expect(items[0].href).toBe("/contacts?contact=c_meera");
    expect(calls).toEqual(["/api/contacts?scope=all&q=meera&limit=5"]);
    expect(calls.some((call) => call.includes("limit=200"))).toBe(false);

    const contacts = workspaceSources().sources.find((source) => source.section === "Contacts");
    expect(contacts?.minQuery).toBe(2);
    expect((await contacts!.load("meera", new AbortController().signal)).map((item) => item.label)).toEqual(["@meera.styles"]);
  });

  it("matches automations by trigger keyword, not only by name", () => {
    const items = [
      automationItem({ id: "a1", name: "Diwali price list", status: "ACTIVE", definition: { trigger: { keywords: ["PRICE", "RATE", "COST"] } } }),
      automationItem({ id: "a2", name: "Welcome", status: "DRAFT", definition: { trigger: {} } }),
    ];
    expect(items[0].hint).toBe("Live · Instagram · “PRICE”, “RATE” +1");
    expect(filterItems(items, "cost").map((item) => item.label)).toEqual(["Diwali price list"]);
    expect(filterItems(items, "rate").map((item) => item.label)).toEqual(["Diwali price list"]);
    expect(items[1].hint).toBe("Draft · Instagram");
  });
});

describe("CommandPalette live sections", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigation.push.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderPalette() {
    const sources = workspaceSources().sources;
    const onClose = vi.fn();
    render(
      <CommandPalette label="Search Linkar" placeholder="Search" pages={[]} actions={[]} sources={sources} recentKey="test.palette" onClose={onClose} />,
    );
    return { input: screen.getByRole("combobox"), onClose };
  }

  const flush = async (ms = SEARCH_DEBOUNCE_MS) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it("shows Searching… per section while it waits, then the server's results, and opens the contact drawer", async () => {
    const { fetchMock, calls } = workspaceApi();
    vi.stubGlobal("fetch", fetchMock);
    const { input, onClose } = renderPalette();

    fireEvent.change(input, { target: { value: "me" } });
    expect(screen.getByText("Searching contacts…")).toBeTruthy();
    expect(screen.getByText("Searching automations…")).toBeTruthy();

    // Each keystroke asks again; the earlier request is cancelled.
    fireEvent.change(input, { target: { value: "meera" } });
    await flush();
    await flush(0);
    expect(calls.filter((call) => call.startsWith("/api/contacts"))).toEqual(["/api/contacts?scope=all&q=meera&limit=5"]);
    expect(screen.getByRole("option", { name: /@meera\.styles/ })).toBeTruthy();
    // Automations answered, with nothing for "meera".
    expect(screen.getAllByText("No matches").length).toBeGreaterThan(0);

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onClose).toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith("/contacts?contact=c_meera");
  });

  it("finds an automation by one of its keywords", async () => {
    const { fetchMock } = workspaceApi();
    vi.stubGlobal("fetch", fetchMock);
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "rate" } });
    await flush();
    await flush(0);
    expect(screen.getByRole("option", { name: /Diwali price list/ })).toBeTruthy();
  });

  it("says No results once when nothing anywhere matches", async () => {
    const { fetchMock } = workspaceApi();
    vi.stubGlobal("fetch", fetchMock);
    const { input } = renderPalette();
    fireEvent.change(input, { target: { value: "zzzz" } });
    await flush();
    await flush(0);
    expect(screen.getByText("No results for “zzzz”")).toBeTruthy();
    expect(screen.queryByText("No matches")).toBeNull();
    expect(screen.queryByText(/Searching/)).toBeNull();
  });
});
