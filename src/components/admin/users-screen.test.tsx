// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
const { UsersScreen } = await import("./users-screen"); afterEach(cleanup);
describe("UsersScreen", () => { it("renders and searches the exact selected identity", async () => { render(<UsersScreen page={{ nextCursor: null, items: [{ id: "u1", email: "person@acme.test", status: "ACTIVE", createdAt: "2026-08-31T00:00:00Z", lastSignInAt: null, workspaceCount: 2 }] }} />); expect(screen.getByRole("link", { name: "Open person@acme.test" }).getAttribute("href")).toBe("/admin/users/u1"); await userEvent.type(screen.getByRole("textbox", { name: "Search users" }), "person"); await userEvent.click(screen.getByRole("button", { name: "Search" })); expect(push).toHaveBeenCalledWith("/admin/users?search=person"); }); });
