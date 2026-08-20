import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { sealSecret, unsealSecret } from "../security/secrets";
import { refreshExpiringInstagramTokens } from "./token-refresh";

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
});
