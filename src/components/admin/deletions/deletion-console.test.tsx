// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("./synthetic-cleanup-panel", () => ({ SyntheticCleanupPanel: () => null }));
vi.mock("./deletion-wizard", () => ({ DeletionWizard: () => null }));

import { DeletionConsole } from "./deletion-console";

const job = { id: "del_1", targetKind: "WORKSPACE", targetId: "workspace_abc", state: "RUNNING", currentStage: "CANCEL_WORK", progress: 14, irreversibleAt: null, terminalErrorCode: null, createdAt: "2026-10-10T10:00:00.000Z" };

describe("DeletionConsole", () => {
  beforeEach(() => { vi.useFakeTimers(); refresh.mockReset(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("names the job on each command button", () => {
    render(<DeletionConsole jobs={[job, { ...job, id: "del_2", targetKind: "USER", targetId: "user-1", state: "FAILED" }]} />);
    expect(screen.getByRole("button", { name: "Cancel deletion of workspace workspace_abc" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry deletion of user user-1" })).toBeTruthy();
  });

  it("polls only while a job is active", () => {
    const { rerender } = render(<DeletionConsole jobs={[job]} />);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<DeletionConsole jobs={[{ ...job, state: "COMPLETED" }]} />);
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("retries a failed deletion through its own reason dialog", async () => {
    vi.useRealTimers();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      render(<DeletionConsole jobs={[{ ...job, id: "del_2", targetKind: "USER", targetId: "user-1", state: "FAILED" }]} />);
      // No shared reason box: the row button is ready straight away.
      const retry = screen.getByRole("button", { name: "Retry deletion of user user-1" }) as HTMLButtonElement;
      expect(retry.disabled).toBe(false);
      fireEvent.click(retry);
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByRole("textbox", { name: /^Reason/ }), { target: { value: "Auth is back" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Retry deletion" }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/deletions/del_2", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "retry" }) })));
      expect((await screen.findByRole("status")).textContent).toContain("Deletion queued again.");
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("links back to earlier pages", () => {
    render(<DeletionConsole jobs={[{ ...job, state: "COMPLETED" }]} cursor="c2" history={["c1"]} nextCursor="c3" />);
    expect(screen.getByRole("link", { name: /First page/ }).getAttribute("href")).toBe("/admin/deletions");
    expect(screen.getByRole("link", { name: /Previous page/ }).getAttribute("href")).toBe("/admin/deletions?cursor=c1");
    expect(screen.getByRole("link", { name: /Next page/ }).getAttribute("href")).toBe("/admin/deletions?cursor=c3&prev=c1%2Cc2");
  });
});
