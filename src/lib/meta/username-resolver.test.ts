import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetaClient } from "./client";
import type { InstagramConnectionRecord } from "../repository";
import { sealSecret } from "../security/secrets";
import { clearResolvedProfileCache, resolveInstagramUsernames } from "./username-resolver";

const key = "a".repeat(64);
const connection: InstagramConnectionRecord = {
  id: "connection_1",
  workspaceId: "workspace_1",
  igUserId: "ig_1",
  username: "brand",
  accessTokenEncrypted: sealSecret("token", key),
  status: "CONNECTED",
  connectedAt: "2026-09-01T00:00:00.000Z",
};

afterEach(() => clearResolvedProfileCache());

describe("resolveInstagramUsernames", () => {
  it("uses the handle stored on the contact without calling Meta", async () => {
    const getUserProfile = vi.fn();
    const usernames = await resolveInstagramUsernames({
      identities: [{ instagramAccountId: "ig_1", igScopedUserId: "person_1", instagramUsername: "aanya" }],
      events: [],
      connections: [connection],
      client: { getUserProfile } as unknown as MetaClient,
      tokenEncryptionKey: key,
    });

    expect(usernames.get("ig_1:person_1")).toBe("aanya");
    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it("hands handles fetched from Meta to the caller so they can be stored", async () => {
    const remember = vi.fn(async () => undefined);
    const usernames = await resolveInstagramUsernames({
      identities: [{ instagramAccountId: "ig_1", igScopedUserId: "person_1" }, { instagramAccountId: "ig_1", igScopedUserId: "person_2" }],
      events: [],
      connections: [connection],
      client: {
        getUserProfile: vi.fn(async (_connection: unknown, id: string) => {
          if (id === "person_2") throw new Error("(#230) Requires pages_messaging permission");
          return { username: "ravi" };
        }),
      } as unknown as MetaClient,
      tokenEncryptionKey: key,
      remember,
    });

    expect(usernames.get("ig_1:person_1")).toBe("ravi");
    expect(usernames.has("ig_1:person_2")).toBe(false);
    expect(remember).toHaveBeenCalledWith([{ instagramAccountId: "ig_1", igScopedUserId: "person_1", username: "ravi" }]);
  });
});
