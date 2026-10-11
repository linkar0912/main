// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { UserDetailScreen } = await import("./user-detail-screen"); afterEach(cleanup);
const user = { id: "u1", email: "person@acme.test", status: "ACTIVE" as const, createdAt: "2026-08-31T00:00:00Z", lastSignInAt: null, workspaceCount: 1, workspaces: [{ id: "w1", name: "Acme", status: "ACTIVE" as const, role: "MEMBER" }] };
describe("UserDetailScreen", () => { it("keeps identity-specific membership and controls visible", () => { render(<UserDetailScreen user={user} />); expect(screen.getByRole("heading", { name: "person@acme.test" })).toBeTruthy(); expect(screen.getByText("Acme")).toBeTruthy(); expect(screen.getByRole("button", { name: "Send password reset" })).toBeTruthy(); }); it("requires exact email confirmation for suspension", async () => { const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<UserDetailScreen user={user} />); await userEvent.click(screen.getByRole("button", { name: "Suspend Linkar access" })); const dialog = screen.getByRole("dialog"); await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Security incident"); await userEvent.type(within(dialog).getByRole("textbox", { name: /to confirm/ }), "wrong"); await userEvent.click(within(dialog).getByRole("button", { name: "Suspend access" })); const alert = within(dialog).getByRole("alert"); expect(alert.textContent).toContain("Type person@acme.test exactly"); expect(fetchMock).not.toHaveBeenCalled(); vi.unstubAllGlobals(); }); });

it("sends sign-out everywhere through its own dialog without asking for the email", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
  vi.stubGlobal("fetch", fetchMock);
  render(<UserDetailScreen user={user} />);
  await userEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByRole("textbox", { name: /to confirm/ })).toBeNull();
  await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Lost laptop");
  await userEvent.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/u1/access", expect.objectContaining({ body: JSON.stringify({ action: "REVOKE_LINKAR_SESSIONS" }) })));
  expect((await screen.findByRole("status")).textContent).toContain("Signed out of every device.");
  expect(screen.queryByRole("dialog")).toBeNull();
  vi.unstubAllGlobals();
});

it("says so when an identity has no memberships instead of rendering an empty section", () => {
  render(<UserDetailScreen user={{ ...user, workspaceCount: 0, workspaces: [] }} />);
  expect(screen.getByText("This identity does not belong to any workspace.")).toBeTruthy();
});

it("shows the Auth ban separately and blocks restoring Linkar access until it is lifted", () => {
  render(<UserDetailScreen user={{ ...user, status: "SUSPENDED", authBannedUntil: "2126-08-31T00:00:00.000Z" }} />);
  expect(screen.getByText(/^Blocked until/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Restore Linkar access" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Allow sign-in" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Block sign-in" })).toBeNull();
  expect(screen.getByText(/Allow sign-in again before restoring Linkar access/)).toBeTruthy();
});
