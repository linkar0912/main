// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const { WorkspacesScreen } = await import("./workspaces-screen");
afterEach(cleanup);

describe("WorkspacesScreen", () => {
  it("renders selected account identity and updates search query", async () => {
    render(<WorkspacesScreen page={{ nextCursor: "next", items: [{ id: "w1", name: "Acme", slug: "acme", status: "ACTIVE", createdAt: "2026-08-31T00:00:00Z", updatedAt: "2026-08-31T00:00:00Z", version: 2, planKey: "free", planName: "Free", memberCount: 3, automationCount: 4, instagramConnectionCount: 1, facebookConnectionCount: 0 }] }} />);
    expect(screen.getByRole("link", { name: "Open Acme" }).getAttribute("href")).toBe("/admin/workspaces/w1");
    await userEvent.type(screen.getByRole("textbox", { name: "Search workspaces" }), "acme");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(push).toHaveBeenCalledWith("/admin/workspaces?search=acme");
  });
});
