// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactDetailModal } from "./contact-detail-modal";

describe("ContactDetailModal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the resolved Instagram handle instead of an internal contact id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        contact: {
          id: "contact_fe5f55",
          instagramUsername: "tejastelkar9",
          state: "NONE",
          tags: [],
          score: 0,
          leadStatus: "NEW",
          lastSeenAt: "2026-09-02T08:07:00.000Z",
          createdAt: "2026-08-29T08:07:00.000Z",
        },
        timeline: [],
      },
    }))));

    render(<ContactDetailModal contactId="contact_fe5f55" onClose={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "@tejastelkar9" })).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Contact details" });
    expect(dialog.classList.contains("contact-detail-drawer")).toBe(true);
    expect(screen.getByRole("img", { name: "@tejastelkar9 profile photo" }).getAttribute("src")).toBe("/api/contacts/contact_fe5f55/avatar");
    expect(screen.queryByText("@fe5f55")).toBeNull();
  });

  it("assigns an owner from the team list, reports it to the table, and can resume paused automations", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (url === "/api/team/members") return new Response(JSON.stringify({ data: [{ userId: "user_2", email: "alex@team.com", role: "MEMBER" }] }));
      if (url.endsWith("/handoff") && init?.method === "DELETE") return new Response(JSON.stringify({ data: { resumedCount: 1 } }));
      if (init?.method === "PATCH") return new Response(JSON.stringify({ data: { leadStatus: "NEW", assigneeUserId: "user_2", score: 0 } }));
      return new Response(JSON.stringify({ data: {
        contact: { id: "contact_1", instagramUsername: "maya", state: "NONE", tags: [], score: 0, leadStatus: "NEW", lastSeenAt: "2026-09-02T08:07:00.000Z", createdAt: "2026-08-29T08:07:00.000Z", automationsPaused: true },
        timeline: [{ id: "participant:1", kind: "interaction", at: "2026-09-02T08:07:00.000Z", label: "Campaign interaction", detail: "OPENING_SENT" }],
      } }));
    }));
    const onUpdated = vi.fn();
    render(<ContactDetailModal contactId="contact_1" onClose={() => undefined} onUpdated={onUpdated} />);

    expect(await screen.findByText("Opening DM sent")).toBeTruthy();
    await screen.findByRole("option", { name: "alex@team.com" });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: "user_2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Profile saved");
    expect(JSON.parse(calls.find((call) => call.method === "PATCH")!.body!)).toMatchObject({ assigneeUserId: "user_2" });
    expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({ assigneeUserId: "user_2" }));

    fireEvent.click(screen.getByRole("button", { name: "Resume automations" }));
    await screen.findByText("Automations resumed");
    expect(calls.some((call) => call.url === "/api/contacts/contact_1/handoff" && call.method === "DELETE")).toBe(true);
    expect(screen.queryByRole("button", { name: "Resume automations" })).toBeNull();
  });
});
