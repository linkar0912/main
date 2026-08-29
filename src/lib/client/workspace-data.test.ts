import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceDataCache,
  getFacebookPages,
  getInstagramConnections,
  getWorkspaceBootstrap,
} from "./workspace-data";

describe("workspace client data cache", () => {
  afterEach(() => {
    clearWorkspaceDataCache();
    vi.unstubAllGlobals();
  });

  it("deduplicates workspace identity and connection requests across page remounts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/workspace/bootstrap") {
        return { ok: true, json: async () => ({ data: { email: "owner@example.com", role: "OWNER", plan: "free" } }) } as Response;
      }
      if (url === "/api/meta/connection") {
        return { ok: true, json: async () => ({ data: [{ igUserId: "ig_1", username: "creator" }] }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getWorkspaceBootstrap(), getWorkspaceBootstrap()]);
    await Promise.all([getInstagramConnections(), getInstagramConnections()]);
    await getWorkspaceBootstrap();
    await getInstagramConnections();

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/workspace/bootstrap")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/meta/connection")).toHaveLength(1);
  });

  it("can invalidate connection data after a disconnect", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getInstagramConnections();
    clearWorkspaceDataCache("connections");
    await getInstagramConnections();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates Facebook Page fetches and resets when the connections cache is cleared", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/facebook/connection") {
        return { ok: true, json: async () => ({ data: [{ id: "fb_rec_1", pageId: "12345", pageName: "Acme", status: "CONNECTED", connectedAt: "2026-08-29T10:00:00.000Z" }] }) } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([getFacebookPages(), getFacebookPages()]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/facebook/connection")).toHaveLength(1);

    clearWorkspaceDataCache("connections");
    await getFacebookPages();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/facebook/connection")).toHaveLength(2);
  });
});
