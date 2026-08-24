import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceDataCache,
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
});
