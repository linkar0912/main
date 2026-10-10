// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
const push = vi.fn(); const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const { OperationsConsole } = await import("./operations-console"); afterEach(() => { cleanup(); vi.unstubAllGlobals(); push.mockReset(); refresh.mockReset(); });
const item = { id: "d1", kind: "delivery" as const, workspace: { id: "w1", name: "Acme" }, title: "AUTOMATION_DM", status: "FAILED", provider: "instagram" as const, version: 2, createdAt: "2026-08-31T10:00:00.000Z", updatedAt: "2026-08-31T10:01:00.000Z", safeErrorCode: "PROVIDER_REJECTED" };
describe("OperationsConsole", () => {
  it("switches tabs and synchronizes filters to the URL", async () => { render(<OperationsConsole kind="delivery" page={{ items: [item], nextCursor: null }} filters={{ kind: "delivery" }} />); await userEvent.click(screen.getByRole("button", { name: "Incoming events" })); expect(push).toHaveBeenCalledWith("/admin/operations?kind=webhook"); await userEvent.type(screen.getByRole("textbox", { name: "Workspace ID" }), "w1"); await userEvent.click(screen.getByRole("button", { name: "Apply filters" })); expect(push).toHaveBeenLastCalledWith(expect.stringContaining("workspaceId=w1")); });
  it("opens a safe detail drawer and restores an explicit action surface", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ...item, attributes: { retryable: true, hasProviderReceipt: false }, allowedActions: ["retry", "cancel_pending"] } }) })); render(<OperationsConsole kind="delivery" page={{ items: [item], nextCursor: null }} filters={{ kind: "delivery" }} />); await userEvent.click(screen.getByRole("button", { name: "Open AUTOMATION_DM" })); expect(await screen.findByRole("dialog", { name: "Operation detail" })).toBeTruthy(); expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy(); expect(screen.queryByText("private message body")).toBeNull(); });
});

it("removes cleared filters and resets the form when URL filters change", async () => {
  const props = { kind: "delivery" as const, page: { items: [item], nextCursor: null } };
  const { rerender } = render(<OperationsConsole {...props} filters={{ kind: "delivery", text: "old", status: "FAILED" }} />);
  await userEvent.clear(screen.getByRole("textbox", { name: "Delivery kind" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "");
  await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
  expect(push).toHaveBeenLastCalledWith("/admin/operations?kind=delivery");
  rerender(<OperationsConsole {...props} filters={{ kind: "delivery", text: "new" }} />);
  expect((screen.getByRole("textbox", { name: "Delivery kind" }) as HTMLInputElement).value).toBe("new");
});
it("Escape closes a nested confirmation without closing its detail drawer", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { ...item, attributes: {}, allowedActions: ["retry"] } }) }));
  render(<OperationsConsole kind="delivery" page={{ items: [item], nextCursor: null }} filters={{}} />);
  await userEvent.click(screen.getByRole("button", { name: "Open AUTOMATION_DM" }));
  await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Operation detail" })).toBeTruthy();
});

it("drops the status filter when switching to a kind with different states", async () => {
  // FAILED exists for deliveries only; carrying it to automations made the list reject the filter.
  render(<OperationsConsole kind="delivery" page={{ items: [item], nextCursor: null }} filters={{ kind: "delivery", status: "FAILED", workspaceId: "w1", provider: "instagram" }} />);
  expect((screen.getByRole("combobox", { name: "Status" }) as HTMLSelectElement).value).toBe("FAILED");
  await userEvent.click(screen.getByRole("button", { name: "Automations" }));
  expect(push).toHaveBeenLastCalledWith("/admin/operations?kind=automation&workspaceId=w1&provider=instagram");
  await userEvent.click(screen.getByRole("button", { name: "Tracked links" }));
  expect(push).toHaveBeenLastCalledWith("/admin/operations?kind=tracked_link&workspaceId=w1");
});
