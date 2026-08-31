// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { UserDetailScreen } = await import("./user-detail-screen"); afterEach(cleanup);
const user = { id: "u1", email: "person@acme.test", status: "ACTIVE" as const, createdAt: "2026-08-31T00:00:00Z", lastSignInAt: null, workspaceCount: 1, workspaces: [{ id: "w1", name: "Acme", status: "ACTIVE" as const, role: "MEMBER" }] };
describe("UserDetailScreen", () => { it("keeps identity-specific membership and controls visible", () => { render(<UserDetailScreen user={user} />); expect(screen.getByRole("heading", { name: "person@acme.test" })).toBeTruthy(); expect(screen.getByText("Acme")).toBeTruthy(); expect(screen.getByRole("button", { name: "Send password reset" })).toBeTruthy(); }); it("requires exact email confirmation for suspension", async () => { render(<UserDetailScreen user={user} />); await userEvent.type(screen.getByRole("textbox", { name: "Operator reason" }), "Security incident"); await userEvent.type(screen.getByRole("textbox", { name: /Confirm sensitive actions/ }), "wrong"); await userEvent.click(screen.getByRole("button", { name: "Suspend" })); expect(screen.getByRole("alert").textContent).toContain("Type person@acme.test exactly"); }); });
