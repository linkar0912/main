// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { AuditConsole } = await import("./audit-console");

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

const event = {
  id: "a1", requestId: "admin_req_1", phase: "SUCCESS", actorEmail: "owner@linkar.in", action: "workspace.suspend",
  targetType: "workspace", targetId: "workspace_1", workspaceId: "workspace_1", reason: "Spam reports", before: null, after: null,
  errorCode: null, origin: null, createdAt: "2026-10-10T10:00:00.000Z",
};

describe("AuditConsole", () => {
  it("filters by action in plain words while sending the same key to the server", async () => {
    render(<AuditConsole events={[event]} nextCursor={null} filters={{ actor: "", action: "", phase: "" }} />);
    const action = screen.getByRole("combobox", { name: "Action" });
    expect(within(action).getByRole("option", { name: "Suspended a workspace" })).toBeTruthy();
    expect(within(action).getByRole("option", { name: "Any workspace action" })).toBeTruthy();
    await userEvent.selectOptions(action, "Suspended a workspace");
    await userEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(push).toHaveBeenCalledWith("/admin/audit?action=workspace.suspend");
  });

  it("keeps a filter typed into the URL by hand as an option", () => {
    render(<AuditConsole events={[]} nextCursor={null} filters={{ actor: "", action: "suspend", phase: "" }} />);
    expect((screen.getByRole("combobox", { name: "Action" }) as HTMLSelectElement).value).toBe("suspend");
    expect(screen.getByText("No events match these filters.")).toBeTruthy();
  });

  it("exports the filtered log through a reason dialog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("id\n1\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
    render(<AuditConsole events={[event]} nextCursor={null} filters={{ actor: "", action: "workspace.", phase: "" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const dialog = screen.getByRole("dialog", { name: "Export the audit log" });
    const download = within(dialog).getByRole("button", { name: "Download CSV" }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    await userEvent.type(within(dialog).getByRole("textbox", { name: /^Reason/ }), "Quarterly review");
    await userEvent.click(download);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("/api/admin/audit/export");
    expect(JSON.parse(String(init.body))).toEqual({ actor: "", action: "workspace.", phase: "" });
    expect(decodeURIComponent(init.headers["x-admin-reason"])).toBe("Quarterly review");
    expect((await screen.findByRole("status")).textContent).toContain("Audit log CSV downloaded.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
