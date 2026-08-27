import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetaApiError } from "@/src/lib/meta/client";
import type { MetaMedia } from "@/src/lib/meta/types";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getRepository: vi.fn(),
  getServerEnv: vi.fn(),
  listConnections: vi.fn(),
  listMedia: vi.fn(),
  unsealSecret: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: mocks.getRepository,
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/src/lib/meta/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/meta/client")>();
  return {
    ...actual,
    MetaClient: class {
      listMedia = mocks.listMedia;
    },
  };
});

vi.mock("@/src/lib/security/secrets", () => ({
  unsealSecret: mocks.unsealSecret,
}));

const { GET } = await import("./route");

const connectedAccount = {
  id: "connection_1",
  workspaceId: "workspace_a",
  igUserId: "ig_123",
  username: "creator",
  accessTokenEncrypted: "sealed-token",
  status: "CONNECTED" as const,
  connectedAt: "2026-08-21T09:00:00.000Z",
};

const media: MetaMedia = {
  id: "media_1",
  caption: "A Reel",
  mediaType: "VIDEO",
  mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/media_1/",
  mediaUrl: "https://cdn.example/media_1.mp4",
  thumbnailUrl: "https://cdn.example/media_1.jpg",
  timestamp: "2026-08-21T08:00:00.000Z",
};

describe("GET /api/meta/media", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_a" });
    mocks.listConnections.mockReset();
    mocks.listConnections.mockResolvedValue([connectedAccount]);
    mocks.getRepository.mockReturnValue({ listConnections: mocks.listConnections });
    mocks.getServerEnv.mockReturnValue({ metaApiVersion: "v25.0", metaTokenEncryptionKey: "encryption-key" });
    mocks.listMedia.mockReset();
    mocks.unsealSecret.mockReset();
    mocks.unsealSecret.mockReturnValue("plain-token");
  });

  it("returns 401 when the owner session is missing", async () => {
    mocks.getValidatedSession.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/meta/media"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.getRepository).not.toHaveBeenCalled();
  });

  it("returns 409 when the workspace has no connected account", async () => {
    mocks.listConnections.mockResolvedValue([{ ...connectedAccount, status: "DISCONNECTED" }]);

    const response = await GET(new Request("http://localhost/api/meta/media"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Connect Instagram first" });
  });

  it("returns 503 when token encryption is not configured", async () => {
    mocks.getServerEnv.mockReturnValue({ metaApiVersion: "v25.0" });

    const response = await GET(new Request("http://localhost/api/meta/media"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Token encryption is not configured" });
    expect(mocks.listMedia).not.toHaveBeenCalled();
  });

  it("rejects empty, whitespace-only, and overlong cursors", async () => {
    for (const after of ["", "   ", "x".repeat(501)]) {
      const response = await GET(new Request(`http://localhost/api/meta/media?after=${after}`));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid cursor" });
    }
    expect(mocks.listMedia).not.toHaveBeenCalled();
  });

  it("returns normalized paginated media without token-shaped fields", async () => {
    mocks.listMedia.mockResolvedValue({
      data: [{ ...media, accessToken: "must-not-escape", accessTokenEncrypted: "must-not-escape" }],
      after: "next-cursor",
    });

    const response = await GET(new Request("http://localhost/api/meta/media?after=current-cursor"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: [media], paging: { after: "next-cursor" } });
    expect(mocks.listConnections).toHaveBeenCalledWith("workspace_a");
    expect(mocks.unsealSecret).toHaveBeenCalledWith("sealed-token", "encryption-key");
    expect(mocks.listMedia).toHaveBeenCalledWith({ igUserId: "ig_123", accessToken: "plain-token" }, "current-cursor");
    expect(JSON.stringify(body)).not.toContain("accessToken");
    expect(JSON.stringify(body)).not.toContain("accessTokenEncrypted");
  });

  it("maps provider failures to a controlled response", async () => {
    mocks.listMedia.mockRejectedValue(new Error("provider unavailable"));

    const response = await GET(new Request("http://localhost/api/meta/media"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Unable to load media" });
  });

  it("preserves a valid MetaApiError HTTP status", async () => {
    mocks.listMedia.mockRejectedValue(new MetaApiError("Meta rate limit", 429));

    const response = await GET(new Request("http://localhost/api/meta/media"));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Meta rate limit" });
  });
});
