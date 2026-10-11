// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationVersionsModal } from "./automation-versions-modal";

const version = {
  id: "version_1",
  automationId: "automation_1",
  workspaceId: "workspace_1",
  version: 3,
  name: "Guide sender",
  definition: {
    version: 1,
    trigger: { type: "message", match: "keyword", keywords: ["guide"] },
    conditions: [],
    actions: [{ type: "send_text", text: "Here you go" }],
  },
  status: "ACTIVE",
  snapshotAt: "2026-10-01T10:00:00.000Z",
};

describe("AutomationVersionsModal", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the version list on screen when a restore fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ error: "Restore is unavailable right now" }), { status: 500 });
      }
      return new Response(JSON.stringify({ data: [version] }), { status: 200 });
    }));

    render(<AutomationVersionsModal automationId="automation_1" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore this version" }));
    // Asks in place first, and says what restoring will do to the live automation.
    const confirmation = screen.getByRole("group", { name: "Restore v3" });
    expect(confirmation.textContent).toContain("switched on");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Restore is unavailable right now");
    expect(screen.getByRole("list", { name: "Automation version history" })).toBeTruthy();
    expect(screen.getByText("v3")).toBeTruthy();
  });

  it("backs out of a restore without calling the API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [version] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AutomationVersionsModal automationId="automation_1" onClose={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore this version" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("group", { name: "Restore v3" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders on body, traps focus, closes on Escape, and returns focus to the opener", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [version] }), { status: 200 })));
    const host = document.createElement("div");
    host.className = "automation-row";
    document.body.appendChild(host);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();

    const { unmount } = render(<AutomationVersionsModal automationId="automation_1" onClose={onClose} />, { container: host });
    const dialog = screen.getByRole("dialog", { name: "Automation history" });
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.closest("body")).toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close history" }));
    expect(document.body.style.overflow).toBe("hidden");

    await screen.findByRole("button", { name: "Restore this version" });
    const restore = screen.getByRole("button", { name: "Restore this version" });
    restore.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close history" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(document.body.style.overflow).toBe("");
    host.remove();
    opener.remove();
  });
});
