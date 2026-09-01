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

  it("searches and filters the customer contact workspace", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("scope=all")) return new Response(JSON.stringify({ data: { count: 2, counts: { NEW: 1, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 0 }, contacts } }));
      return new Response(JSON.stringify({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }));
    }));
    render(<ContactsScreen />);

    expect(await screen.findByText("maya@example.com")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "654321" } });
    expect(screen.queryByText("maya@example.com")).toBeNull();
    expect(screen.getByText("IG user ·654321")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search contacts" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Qualified 1" }));
    expect(screen.getByText("maya@example.com")).toBeTruthy();
    expect(screen.queryByText("IG user ·654321")).toBeNull();
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
