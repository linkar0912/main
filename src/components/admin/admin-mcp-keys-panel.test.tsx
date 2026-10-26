// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AdminMcpKeysPanel } from "./admin-mcp-keys-panel";

const MCP_URL = "https://admin.linkar.in/api/admin/mcp";
const TOKEN = `lkadm_${"B".repeat(43)}`;
const activeKey = { id: "mcpkey_1", label: "Work laptop", scope: "WRITE" as const, tokenPrefix: "lkadm_AAAAAA", createdAt: "2026-10-20T09:00:00.000Z", expiresAt: "2026-11-19T09:00:00.000Z", lastUsedAt: "2026-10-24T10:30:00.000Z", revokedAt: null, status: "ACTIVE" as const };
const revokedKey = { id: "mcpkey_0", label: "Old desktop", scope: "READ" as const, tokenPrefix: "lkadm_ZZZZZZ", createdAt: "2026-09-01T09:00:00.000Z", expiresAt: "2026-10-01T09:00:00.000Z", lastUsedAt: null, revokedAt: "2026-09-15T09:00:00.000Z", status: "REVOKED" as const };

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("AdminMcpKeysPanel", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("lists each key's label, access, prefix, expiry, last use and state", () => {
    render(<AdminMcpKeysPanel initialKeys={[activeKey, revokedKey]} mcpUrl={MCP_URL} />);

    const active = screen.getByText("Work laptop").closest("li")!;
    expect(within(active).getByText(/Read and write/)).toBeTruthy();
    expect(within(active).getByText(/lkadm_AAAAAA…/)).toBeTruthy();
    expect(within(active).getByText(/Expires/)).toBeTruthy();
    expect(within(active).getByText(/Last used/)).toBeTruthy();
    expect(within(active).getByText("Active")).toBeTruthy();
    expect(within(active).getByRole("button", { name: "Revoke Work laptop" })).toBeTruthy();
    expect(within(active).getByRole("link", { name: "Audit log for Work laptop" }).getAttribute("href")).toBe("/admin/audit?mcpKeyId=mcpkey_1");
    expect(within(screen.getByText("Old desktop").closest("li")!).getByRole("link", { name: "Audit log for Old desktop" })).toBeTruthy();

    const revoked = screen.getByText("Old desktop").closest("li")!;
    expect(within(revoked).getByText(/Read only/)).toBeTruthy();
    expect(within(revoked).getByText(/Never used/)).toBeTruthy();
    expect(within(revoked).getByText("Revoked")).toBeTruthy();
    expect(within(revoked).queryByRole("button", { name: /Revoke/ })).toBeNull();
  });

  it("creates a key with a reason and shows it once with the Claude Code command", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { key: { ...activeKey, id: "mcpkey_2", label: "Reporting", scope: "READ", tokenPrefix: TOKEN.slice(0, 12), lastUsedAt: null }, token: TOKEN } }, 201));
    global.fetch = fetchMock as typeof fetch;
    render(<AdminMcpKeysPanel initialKeys={[]} mcpUrl={MCP_URL} />);
    expect(screen.getByText(/No keys yet/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Create key" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Reporting" } });
    fireEvent.click(within(dialog).getByLabelText("Read only"));
    fireEvent.change(within(dialog).getByLabelText("Expires after"), { target: { value: "7" } });
    fireEvent.change(within(dialog).getByLabelText("Reason (saved to the audit log)"), { target: { value: "Weekly metrics in Claude" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText(TOKEN)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/mcp-keys");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ label: "Reporting", scope: "READ", ttlDays: 7 });
    expect(decodeURIComponent(String((init.headers as Record<string, string>)["x-admin-reason"]))).toBe("Weekly metrics in Claude");

    expect(screen.getByText(/won’t be shown again/)).toBeTruthy();
    expect(screen.getByText(`claude mcp add --transport http --scope user linkar-admin ${MCP_URL} --header "Authorization: Bearer ${TOKEN}"`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy key" })).toBeTruthy();
    expect(screen.getByText("Reporting").closest("li")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(TOKEN)).toBeNull();
  });

  it("explains the active key limit", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ error: "mcp_key_limit" }, 409)) as typeof fetch;
    render(<AdminMcpKeysPanel initialKeys={[]} mcpUrl={MCP_URL} />);

    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Another" } });
    fireEvent.change(within(dialog).getByLabelText("Reason (saved to the audit log)"), { target: { value: "One more client" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("You already have 10 active keys"));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("revokes a key with a reason and shows it as revoked", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { ...activeKey, status: "REVOKED", revokedAt: "2026-10-25T12:00:00.000Z" } }));
    global.fetch = fetchMock as typeof fetch;
    render(<AdminMcpKeysPanel initialKeys={[activeKey]} mcpUrl={MCP_URL} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke Work laptop" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (saved to the audit log)"), { target: { value: "Laptop replaced" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke key" }));

    await waitFor(() => expect(within(screen.getByText("Work laptop").closest("li")!).getByText("Revoked")).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/mcp-keys/mcpkey_1");
    expect(init.method).toBe("DELETE");
  });
});
