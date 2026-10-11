// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const { UsersScreen } = await import("./users-screen"); afterEach(cleanup);
describe("UsersScreen", () => { it("renders and searches the exact selected identity", async () => { render(<UsersScreen page={{ nextCursor: null, items: [{ id: "u1", email: "person@acme.test", status: "ACTIVE", createdAt: "2026-08-31T00:00:00Z", lastSignInAt: null, workspaceCount: 2 }] }} />); expect(screen.getByRole("link", { name: "Open person@acme.test" }).getAttribute("href")).toBe("/admin/users/u1"); await userEvent.type(screen.getByRole("textbox", { name: "Search users" }), "person"); await userEvent.click(screen.getByRole("button", { name: "Search" })); expect(push).toHaveBeenCalledWith("/admin/users?search=person"); }); });

it("adds a user from a dialog and sends the same payload as before", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    render(<UsersScreen page={{ nextCursor: null, items: [] }} />);
    expect(screen.queryByRole("textbox", { name: "Email address" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = screen.getByRole("dialog", { name: "Add a user" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Email address" }), "new@acme.test");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Create the account now" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /already confirmed/ }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Agency onboarding");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create user" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/users");
    expect(JSON.parse(String(init.body))).toEqual({ email: "new@acme.test", mode: "CREATE", confirmed: true });
    expect((await screen.findByRole("status")).textContent).toContain("Account created for new@acme.test.");
    expect(screen.queryByRole("dialog")).toBeNull();
  } finally {
    vi.unstubAllGlobals();
  }
});
