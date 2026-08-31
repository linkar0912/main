// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { WorkspaceDetailScreen } = await import("./workspace-detail-screen");
afterEach(cleanup);
const workspace = { id: "w1", name: "Acme", slug: "acme", status: "ACTIVE" as const, createdAt: "2026-08-31T00:00:00Z", updatedAt: "2026-08-31T00:00:00Z", version: 2, planKey: "growth", planName: "Growth", memberCount: 1, automationCount: 4, instagramConnectionCount: 1, facebookConnectionCount: 0, members: [{ userId: "u1", email: "owner@acme.test", role: "OWNER" }] };

describe("WorkspaceDetailScreen", () => {
  it("renders exact workspace, plan, member, tabs, and safe export controls", () => {
    render(<WorkspaceDetailScreen workspace={workspace} />);
    expect(screen.getByRole("heading", { name: "Acme", level: 1 })).toBeTruthy();
    expect(screen.getByText("Growth")).toBeTruthy();
    expect(screen.getByText("owner@acme.test")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Exports" }).getAttribute("href")).toBe("#exports");
    expect(screen.getByRole("link", { name: "Download CSV" }).getAttribute("href")).toBe("/api/admin/workspaces/w1/export?format=csv");
  });

  it("keeps a visible error until the exact suspension phrase is entered", async () => {
    render(<WorkspaceDetailScreen workspace={workspace} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Operator reason" }), "Abuse investigation");
    await userEvent.type(screen.getByRole("textbox", { name: /Type SUSPEND acme/ }), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Suspend workspace" }));
    expect(screen.getByRole("alert").textContent).toContain("Type SUSPEND acme exactly");
  });
});
