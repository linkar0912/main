// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const push = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const { OperationsConsole } = await import("./operations-console"); afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); refresh.mockReset(); });
const item = { id: "d1", kind: "delivery" as const, workspace: { id: "w1", name: "Acme" }, title: "AUTOMATION_DM", status: "FAILED", provider: "instagram" as const, version: 2, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:01:00.000Z", safeErrorCode: "PROVIDER_REJECTED" };
describe("OperationsConsole", () => {
  it("switches tabs and synchronizes filters to the URL", async () => { render(<OperationsConsole kind="delivery" page={{ items: [item], nextCursor: null }} filters={{ kind: "delivery" }} />); await userEvent.click(screen.getByRole("button", { name: "webhook" })); expect(push).toHaveBeenCalledWith("/admin/operations?kind=webhook"); await userEvent.type(screen.getByRole("textbox", { name: "Workspace ID" }), "w1"); await userEvent.click(screen.getByRole("button", { name: "Apply filters" })); expect(push).toHaveBeenLastCalledWith(expect.stringContaining("workspaceId=w1")); });
  it("opens a safe detail drawer and restores an explicit action surface", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ...item, attributes: { retryable: true, hasProviderReceipt: false }, allowedActions: ["retry", "cancel_pending"] } }) })); render(<OperationsConsole kind="delivery" page={{ items: [item], nextCursor: null }} filters={{ kind: "delivery" }} />); await userEvent.click(screen.getByRole("button", { name: "Inspect AUTOMATION_DM" })); expect(await screen.findByRole("dialog", { name: "Operation detail" })).toBeTruthy(); expect(screen.getByRole("button", { name: "retry" })).toBeTruthy(); expect(screen.queryByText("private message body")).toBeNull(); });
});
