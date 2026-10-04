// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { AdminOperationDetail } from "@/src/lib/admin/operations/types";
import { OperationActions } from "./operation-actions";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const detail: AdminOperationDetail = { id: "item", kind: "automation", title: "Welcome", workspace: { id: "w", name: "Workspace" }, status: "PAUSED", version: 4, createdAt: "", updatedAt: "", attributes: {}, allowedActions: ["restore_version"] };
it("requires a positive version and submits it with the displayed optimistic version", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }); vi.stubGlobal("fetch", fetch);
  const complete = vi.fn(); render(<OperationActions detail={detail} onComplete={complete} />);
  await userEvent.click(screen.getByRole("button", { name: "restore version" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Operator reason" }), "restore reviewed version");
  expect((screen.getByRole("button", { name: "Confirm action" }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.type(screen.getByRole("spinbutton", { name: "Version to restore" }), "2");
  await userEvent.click(screen.getByRole("button", { name: "Confirm action" }));
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: "restore_version", version: 4, input: { versionNumber: 2 } });
  expect(complete).toHaveBeenCalledWith("restore version completed");
});
it("keeps server errors visible inside the confirmation dialog", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "stale_version" }) }));
  render(<OperationActions detail={{ ...detail, allowedActions: ["pause"] }} onComplete={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "pause" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Operator reason" }), "pause for review");
  await userEvent.click(screen.getByRole("button", { name: "Confirm action" }));
  expect(screen.getByRole("dialog").contains(screen.getByRole("alert"))).toBe(true);
  expect(screen.getByRole("alert").textContent).toBe("Stale version");
});
