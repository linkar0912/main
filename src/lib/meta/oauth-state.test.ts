import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createOAuthState, readOAuthState } from "./oauth-state";

describe("Meta OAuth state", () => {
  it("round-trips the authorized workspace and the person who started the connect", () => {
    const state = createOAuthState(
      "workspace_owner",
      "user_owner",
      "session-secret-with-at-least-32-characters",
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(
      readOAuthState(
        state,
        "session-secret-with-at-least-32-characters",
        new Date("2026-08-20T10:05:00.000Z"),
      ),
    ).toEqual({ workspaceId: "workspace_owner", userId: "user_owner" });
  });

  it("reads a state signed before it carried the user, without inventing one", () => {
    // Issued by the previous release (10 minute lifetime): the callback must
    // see that no user is bound and refuse it, not crash on it.
    const secret = "session-secret-with-at-least-32-characters";
    const payload = Buffer.from(JSON.stringify({
      workspaceId: "workspace_owner",
      expiresAt: Date.parse("2026-08-20T10:10:00.000Z"),
      nonce: "0".repeat(32),
    })).toString("base64url");
    const legacy = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;

    expect(readOAuthState(legacy, secret, new Date("2026-08-20T10:05:00.000Z"))).toEqual({ workspaceId: "workspace_owner" });
  });

  it("rejects a modified or expired state", () => {
    const secret = "session-secret-with-at-least-32-characters";
    const state = createOAuthState("workspace_owner", "user_owner", secret, new Date("2026-08-20T10:00:00.000Z"));

    // The last character is base64url and may already be "x"; pick a replacement
    // that is guaranteed to differ so the tampering is deterministic.
    const tampered = `${state.slice(0, -1)}${state.endsWith("x") ? "y" : "x"}`;
    expect(readOAuthState(tampered, secret, new Date("2026-08-20T10:05:00.000Z"))).toBeNull();
    expect(readOAuthState(state, secret, new Date("2026-08-20T10:11:00.000Z"))).toBeNull();
  });

  it("rejects every non-canonical spelling of the final signature character", () => {
    // The 32-byte HMAC encodes to 43 base64url characters; the last one carries
    // four padding bits, so a family of final characters decodes to the identical
    // buffer. Comparing decoded bytes accepted all of them. Exhaustive rather than
    // random: the previous single-flip assertion only caught this ~4% of runs.
    const secret = "session-secret-with-at-least-32-characters";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const state = createOAuthState("workspace_owner", "user_owner", secret, new Date("2026-08-20T10:00:00.000Z"));
    const at = new Date("2026-08-20T10:05:00.000Z");

    expect(readOAuthState(state, secret, at)).toEqual({ workspaceId: "workspace_owner", userId: "user_owner" });

    const last = state.slice(-1);
    for (const character of alphabet) {
      if (character === last) continue;
      expect(
        readOAuthState(`${state.slice(0, -1)}${character}`, secret, at),
        `final character "${character}" must not verify`,
      ).toBeNull();
    }
  });
});
