// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contacts" }));
const { ContactsScreen } = await import("./contacts-screen");

const contacts = [
  {
    id: "contact_1",
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

  it("uses the page-shaped Contacts loader while reconciliation is pending", () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input) === "/api/contacts") return new Promise<Response>(() => undefined);
      return Promise.resolve(new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } })));
    }));

    render(<ContactsScreen />);

    expect(screen.getByLabelText("Loading contacts")).toBeTruthy();
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

  it("reconciles historical activity before loading the contact list", async () => {
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
