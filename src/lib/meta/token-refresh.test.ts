import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret, unsealSecret } from "../security/secrets";
import { refreshExpiringInstagramTokens } from "./token-refresh";
import { MetaOAuthError } from "./oauth";

describe("Instagram token refresh", () => {
  it("refreshes a connected token that expires within thirty days", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: sealSecret("old-token", key),
      tokenExpiresAt: "2026-09-01T00:00:00.000Z",
      status: "CONNECTED",
    });
    const refresher = vi.fn().mockResolvedValue({ accessToken: "new-token", expiresIn: 5_184_000 });

    await expect(refreshExpiringInstagramTokens(
      repository,
      key,
      refresher,
      new Date("2026-08-20T00:00:00.000Z"),
    )).resolves.toEqual({ refreshed: 1, failed: 0 });

    const [connection] = await repository.listConnections("workspace_a");
    expect(unsealSecret(connection.accessTokenEncrypted, key)).toBe("new-token");
    expect(connection.tokenExpiresAt).toBe("2026-10-19T00:00:00.000Z");
    expect(refresher).toHaveBeenCalledWith("old-token");
  });

  it("marks an already expired connection for reauthorization when refresh fails", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a", igUserId: "ig_expired", username: "creator",
      accessTokenEncrypted: sealSecret("expired-token", key), tokenExpiresAt: "2026-08-19T00:00:00.000Z", status: "CONNECTED",
    });
    await expect(refreshExpiringInstagramTokens(repository, key, vi.fn().mockRejectedValue(new Error("invalid token")), new Date("2026-08-20T00:00:00.000Z")))
      .resolves.toEqual({ refreshed: 0, failed: 1 });
    expect((await repository.listConnections("workspace_a"))[0]?.status).toBe("EXPIRED");
  });

  it("marks a connection expired immediately after a terminal Meta token error", async () => {
    const key = randomBytes(32).toString("hex");
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a", igUserId: "ig_revoked", username: "creator",
      accessTokenEncrypted: sealSecret("revoked-token", key), tokenExpiresAt: "2026-09-01T00:00:00.000Z", status: "CONNECTED",
    });
    await refreshExpiringInstagramTokens(repository, key, vi.fn().mockRejectedValue(new MetaOAuthError("invalid token", 400)), new Date("2026-08-20T00:00:00.000Z"));
    expect((await repository.listConnections("workspace_a"))[0]?.status).toBe("EXPIRED");
  });
});
