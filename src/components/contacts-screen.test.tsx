// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts" }));
const { ContactsScreen, stagePageOffset } = await import("./contacts-screen");

const contacts = [
  {
    id: "contact_1",
    avatarUrl: "/api/contacts/contact_1/avatar",
    email: "maya@example.com",
    igScopedUserId: "person_123456",
    instagramAccountId: "ig_1",
    state: "CAPTURED",
    tags: ["email_captured"],
    score: 25,
    leadStatus: "QUALIFIED",
    lastSeenAt: "2026-09-01T06:00:00.000Z",
    createdAt: "2026-08-31T06:00:00.000Z",
  },
  {
    id: "contact_2",
    instagramUsername: "probablymansi",
    igScopedUserId: "person_654321",
    instagramAccountId: "ig_1",
    state: "NONE",
    tags: [],
    score: 5,
    leadStatus: "NEW",
    lastSeenAt: "2026-09-01T05:00:00.000Z",
    createdAt: "2026-08-31T05:00:00.000Z",
  },
];

describe("ContactsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uses the page-shaped Contacts loader while the contact list is pending", () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/contacts") return new Promise<Response>(() => undefined);
      return Promise.resolve(new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } })));
    }));

    render(<ContactsScreen />);

    expect(screen.getByLabelText("Loading contacts")).toBeTruthy();
  });

  it("shows a failed first load as an error with Try again, not as an empty list", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("scope=all")) {
        return fail
          ? new Response(JSON.stringify({ error: "Contacts are unavailable" }), { status: 500 })
          : new Response(JSON.stringify({ data: { count: 2, counts: { NEW: 1, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 0 }, contacts } }));
      }
      return new Response(JSON.stringify({ data: {} }));
    }));
    render(<ContactsScreen />);

    expect(await screen.findByRole("heading", { name: "Contacts didn’t load" })).toBeTruthy();
    expect(screen.getByText("Contacts are unavailable")).toBeTruthy();
    expect(screen.queryByText("No contacts yet")).toBeNull();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("maya@example.com")).toBeTruthy();
  });

  it("searches and filters the customer contact workspace", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("scope=all")) return new Response(JSON.stringify({ data: { count: 2, counts: { NEW: 1, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 0 }, contacts } }));
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }));
    render(<ContactsScreen />);

    expect(await screen.findByText("maya@example.com")).toBeTruthy();
    expect(screen.getByRole("img", { name: "maya@example.com profile photo" }).getAttribute("src")).toBe("/api/contacts/contact_1/avatar");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "probablymansi" } });
    expect(screen.queryByText("maya@example.com")).toBeNull();
    expect(screen.getByText("@probablymansi")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Qualified 1" }));
    expect(screen.getByText("maya@example.com")).toBeTruthy();
    expect(screen.queryByText("@probablymansi")).toBeNull();
  });

  it("loads the list first, then adds contacts from historical activity", async () => {
    let reconciled = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/contacts" && init?.method === "POST") {
        reconciled = true;
        return new Response(JSON.stringify({ data: { reconciled: 1 } }));
      }
      if (url.includes("scope=all")) {
        const rows = reconciled ? [contacts[1]] : [];
        return new Response(JSON.stringify({ data: {
          count: rows.length,
          counts: { NEW: rows.length, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 },
          contacts: rows,
        } }));
      }
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }));

    render(<ContactsScreen />);

    expect(await screen.findByText("@probablymansi")).toBeTruthy();
  });

  it("shows contacts while Instagram names are still resolving", async () => {
    let finishEnrichment: ((response: Response) => void) | undefined;
    const enrichment = new Promise<Response>((resolve) => { finishEnrichment = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("enrich=1")) return enrichment;
      if (url.includes("scope=all")) return new Response(JSON.stringify({ data: {
        contacts: [{ ...contacts[1], instagramUsername: undefined }],
        counts: { NEW: 1, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 },
        needsProfileEnrichment: true,
      } }));
      if (init?.method === "POST") return new Response(JSON.stringify({ data: { reconciled: 0 } }));
      return new Response(JSON.stringify({ data: {} }));
    }));

    render(<ContactsScreen />);
    expect(await screen.findByText("Instagram user")).toBeTruthy();
    expect(screen.queryByLabelText("Loading contacts")).toBeNull();

    finishEnrichment?.(new Response(JSON.stringify({ data: {
      contacts: [contacts[1]],
      counts: { NEW: 1, ENGAGED: 0, QUALIFIED: 0, CUSTOMER: 0 },
    } })));
    expect(await screen.findByText("@probablymansi")).toBeTruthy();
  });

  it("opens the existing contact history and handoff experience", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("scope=all")) return new Response(JSON.stringify({ data: { count: 2, counts: { NEW: 1, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 0 }, contacts } }));
      if (url.includes("/api/contacts/contact_1")) return new Response(JSON.stringify({ data: { contact: contacts[0], timeline: [] } }));
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }));
    render(<ContactsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Open maya@example.com" }));
    expect(await screen.findByRole("dialog", { name: "Contact details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hand off to team/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Export CSV/i })).toBeTruthy();
  });
});

describe("stagePageOffset", () => {
  const row = (id: string, leadStatus: string, lastSeenAt: string) => ({ id, leadStatus, lastSeenAt, createdAt: lastSeenAt, instagramAccountId: "ig_1", igScopedUserId: id, state: "NONE", tags: [], score: 0 }) as Parameters<typeof stagePageOffset>[0][number];

  it("counts the fetched rows of a stage when nothing moved", () => {
    const rows = [row("a", "QUALIFIED", "2026-09-05T00:00:00Z"), row("b", "QUALIFIED", "2026-09-04T00:00:00Z"), row("c", "NEW", "2026-09-03T00:00:00Z")];
    expect(stagePageOffset(rows, "QUALIFIED", new Map())).toBe(2);
  });

  it("does not skip a server row when an older contact was moved into the stage here", () => {
    // a, b were fetched as QUALIFIED; z (older than both) was just moved from NEW.
    // The server lists z after the next unfetched QUALIFIED row, so counting it
    // (offset 3) would skip that row.
    const rows = [row("a", "QUALIFIED", "2026-09-05T00:00:00Z"), row("b", "QUALIFIED", "2026-09-04T00:00:00Z"), row("z", "QUALIFIED", "2026-08-01T00:00:00Z")];
    expect(stagePageOffset(rows, "QUALIFIED", new Map([["z", "NEW"]]))).toBe(2);
  });

  it("counts a moved contact that sorts inside the fetched prefix, and drops one moved out", () => {
    const rows = [row("a", "QUALIFIED", "2026-09-05T00:00:00Z"), row("m", "QUALIFIED", "2026-09-04T12:00:00Z"), row("b", "QUALIFIED", "2026-09-04T00:00:00Z"), row("x", "CUSTOMER", "2026-09-03T00:00:00Z")];
    const moved = new Map([["m", "NEW"], ["x", "QUALIFIED"]] as const);
    expect(stagePageOffset(rows, "QUALIFIED", moved)).toBe(3);
    // x left QUALIFIED; the source stage offset no longer includes it.
    expect(stagePageOffset(rows, "CUSTOMER", moved)).toBe(0);
  });
});
