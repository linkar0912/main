import { describe, expect, it } from "vitest";
import { createFacebookPageSelection, readFacebookPageSelection } from "./page-selection";

describe("Facebook Page selection state", () => {
  it("round-trips an encrypted, workspace-bound pending token", () => {
    const key = "a".repeat(64);
    const sealed = createFacebookPageSelection({
      workspaceId: "ws_1",
      facebookUserId: "fb_user_1",
      userAccessToken: "secret-user-token",
      tokenExpiresAt: "2026-09-01T00:00:00.000Z",
      selectionExpiresAt: "2026-08-30T10:00:00.000Z",
    }, key);
    expect(sealed).not.toContain("secret-user-token");
    expect(readFacebookPageSelection(sealed, key, "ws_1", Date.parse("2026-08-30T09:59:00.000Z"))).toMatchObject({
      facebookUserId: "fb_user_1",
      userAccessToken: "secret-user-token",
    });
  });

  it("rejects another workspace and expired state", () => {
    const key = "b".repeat(64);
    const sealed = createFacebookPageSelection({
      workspaceId: "ws_1", facebookUserId: "fb_1", userAccessToken: "tok",
      selectionExpiresAt: "2026-08-30T10:00:00.000Z",
    }, key);
    expect(readFacebookPageSelection(sealed, key, "ws_2", Date.parse("2026-08-30T09:00:00.000Z"))).toBeNull();
    expect(readFacebookPageSelection(sealed, key, "ws_1", Date.parse("2026-08-30T10:00:01.000Z"))).toBeNull();
  });
});
